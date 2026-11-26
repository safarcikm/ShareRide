import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  addPasskeyRoute,
  passkeySetupOptionsRoute,
  passkeySignInOptionsRoute,
  passkeySignInRoute,
  removePasskeyRoute,
} from "@shareride/contracts";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { RateLimiter } from "../../platform/memory-rate-limiter.ts";
import type { AccountService } from "../account/index.ts";
import type { MemberPasskeyService } from "./member-passkeys.ts";
import { confirmCodeError, tokensBodyFor } from "./routes.ts";

export interface PasskeyRoutesDependencies {
  readonly passkeys: MemberPasskeyService;
  readonly account: AccountService;
  readonly requireAuth: MiddlewareHandler;
  /** Sign-in options per address block, in memory like the console's. */
  readonly limiter: RateLimiter;
  readonly clientKey: (c: Context) => string;
  readonly secureCookies: boolean;
}

const tooManyMessage = "Face ID or fingerprint is set up on 10 devices already.";
const invalidMessage = "That didn't work. Try again, or use the email code.";

/** Members' Face ID or fingerprint on the website (spec 27, ADR 0048). */
export function registerPasskeyRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: PasskeyRoutesDependencies,
): void {
  const { passkeys, account, requireAuth, limiter, clientKey, secureCookies } = dependencies;

  app.openapi(toOpenApiRoute(passkeySignInOptionsRoute), async (c) => {
    const check = limiter.hit(clientKey(c));
    if (!check.ok) {
      return errorResponse(c, 429, "rate_limited", "Too many tries. Wait a little.", {
        retryAfterSeconds: check.error.retryAfterSeconds,
      });
    }
    return c.json({ options: await passkeys.signInOptions() }, 200);
  });

  app.openapi(toOpenApiRoute(passkeySignInRoute), async (c) => {
    const body = validated(c, "json", passkeySignInRoute.request.body);
    const result = await passkeys.signIn({
      credential: body.credential as unknown as AuthenticationResponseJSON,
      device: body.device,
    });
    if (!result.ok) {
      switch (result.error.code) {
        case "account_unavailable":
          return errorResponse(c, 403, "account_unavailable", "This account cannot sign in.");
        case "passkey_expired":
          return errorResponse(c, 400, "passkey_expired", "That took too long. Try again.");
        case "passkey_invalid":
          return errorResponse(c, 400, "passkey_invalid", invalidMessage);
        case "passkey_unknown":
          return errorResponse(c, 400, "passkey_unknown", invalidMessage);
      }
    }
    const { userId, tokens } = result.value;
    return c.json(
      {
        status: "signedIn" as const,
        ...tokensBodyFor(c, tokens, body.device.platform, secureCookies),
        user: await account.me(userId),
        isNewUser: false,
      },
      200,
    );
  });

  app.openapi(toOpenApiRoute(passkeySetupOptionsRoute, requireAuth), async (c) => {
    const { code, quiet } = validated(c, "json", passkeySetupOptionsRoute.request.body);
    const { userId, sessionId } = authOf(c);
    const result = await passkeys.setupOptions({
      userId,
      sessionId,
      ...(code === undefined ? {} : { code }),
      ...(quiet === undefined ? {} : { quiet }),
    });
    if (result.ok) return c.json({ options: result.value }, 200);
    const { error } = result;
    switch (error.code) {
      case "confirm_required":
        return errorResponse(
          c,
          403,
          error.code,
          quiet === true ? "Only straight after signing in." : "Send a confirm code first.",
        );
      case "too_many":
        return errorResponse(c, 409, error.code, tooManyMessage);
      default:
        return confirmCodeError(c, error);
    }
  });

  app.openapi(toOpenApiRoute(addPasskeyRoute, requireAuth), async (c) => {
    const { credential } = validated(c, "json", addPasskeyRoute.request.body);
    const result = await passkeys.add({
      userId: authOf(c).userId,
      credential: credential as unknown as RegistrationResponseJSON,
      userAgent: c.req.header("user-agent") ?? "",
    });
    if (result.ok) return c.json(result.value, 201);
    return result.error.code === "too_many"
      ? errorResponse(c, 409, "too_many", tooManyMessage)
      : errorResponse(c, 400, "passkey_invalid", invalidMessage);
  });

  app.openapi(toOpenApiRoute(removePasskeyRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", removePasskeyRoute.request.params);
    const removed = await passkeys.remove(authOf(c).userId, id);
    if (!removed) return errorResponse(c, 404, "not_found", "No such device.");
    return c.body(null, 204);
  });
}
