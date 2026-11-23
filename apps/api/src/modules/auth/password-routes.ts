import type { OpenAPIHono } from "@hono/zod-openapi";
import { passwordSignInRoute, removePasswordRoute, setPasswordRoute } from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { AccountService } from "../account/index.ts";
import type { PasswordService } from "./passwords.ts";
import { confirmCodeError, tokensBodyFor } from "./routes.ts";

export interface PasswordRoutesDependencies {
  readonly passwords: PasswordService;
  readonly account: AccountService;
  readonly requireAuth: MiddlewareHandler;
  readonly clientAddress: (c: Context) => string;
  readonly secureCookies: boolean;
}

const setMessages = {
  password_too_short: "Use at least 10 characters.",
  password_too_long: "Use at most 128 characters.",
  password_too_common: "That password is too common.",
  password_is_email: "Don't use the email as the password.",
} as const;

/** Members' passwords (spec 27, ADR 0047): signing in with one, and Settings. */
export function registerPasswordRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: PasswordRoutesDependencies,
): void {
  const { passwords, account, requireAuth, clientAddress, secureCookies } = dependencies;

  app.openapi(toOpenApiRoute(passwordSignInRoute), async (c) => {
    const body = validated(c, "json", passwordSignInRoute.request.body);
    const result = await passwords.signIn({ ...body, ipAddress: clientAddress(c) });
    if (!result.ok) {
      const { error } = result;
      switch (error.code) {
        case "rate_limited":
          return errorResponse(c, 429, error.code, "Too many wrong tries. Use the email code.", {
            retryAfterSeconds: error.retryAfterSeconds,
          });
        case "account_unavailable":
          return errorResponse(c, 403, error.code, "This account cannot sign in.");
        default:
          return errorResponse(c, 400, error.code, "Wrong email or password.");
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

  app.openapi(toOpenApiRoute(setPasswordRoute, requireAuth), async (c) => {
    const body = validated(c, "json", setPasswordRoute.request.body);
    const { userId, sessionId } = authOf(c);
    const result = await passwords.set({ userId, sessionId, ...body });
    if (result.ok) return c.json({ setAt: result.value.setAt.toISOString() }, 200);
    const { error } = result;
    switch (error.code) {
      case "password_too_short":
      case "password_too_long":
      case "password_too_common":
      case "password_is_email":
        return errorResponse(c, 400, error.code, setMessages[error.code]);
      case "email_required":
        return errorResponse(c, 409, error.code, "A password needs a verified email first.");
      case "confirm_required":
        return errorResponse(c, 403, error.code, "Send a confirm code with the password.");
      default:
        return confirmCodeError(c, error);
    }
  });

  app.openapi(toOpenApiRoute(removePasswordRoute, requireAuth), async (c) => {
    const removed = await passwords.remove(authOf(c).userId);
    if (!removed) return errorResponse(c, 404, "not_found", "The account has no password.");
    return c.body(null, 204);
  });
}
