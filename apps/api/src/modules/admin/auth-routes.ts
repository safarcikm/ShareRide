import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminAddPasskeyOptionsRoute,
  adminAddPasskeyRoute,
  adminConfirmOptionsRoute,
  adminConfirmRoute,
  adminPasskeysRoute,
  adminRemovePasskeyRoute,
  adminSetupOptionsRoute,
  adminSetupRoute,
  adminSignInOptionsRoute,
  adminSignInRoute,
} from "@shareride/contracts";
import type { Database } from "@shareride/db";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { schema } from "@shareride/db";
import type { Context, MiddlewareHandler } from "hono";
import { operatorOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import type { Logger } from "../../logger.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { RateLimiter } from "../../platform/memory-rate-limiter.ts";
import { auditRequestOf } from "./audit.ts";
import type { PasskeyService, SignedInOperator } from "./passkeys.ts";
import { setOperatorCookie } from "./require-operator.ts";

export interface AdminAuthRoutesDependencies {
  readonly db: Database;
  readonly passkeys: PasskeyService;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
  /** Per-address limits on signing in and setup links, keyed without the plain address. */
  readonly limiter: RateLimiter;
  readonly clientKey: (c: Context) => string;
  readonly secureCookies: boolean;
  readonly logger: Logger;
}

/**
 * Passkey sign-in and the operator's passkeys (ADR 0028). The four routes
 * under /admin/v1/auth are the only console routes open without a session
 * (`openAdminRoutes`).
 */
export function registerAdminAuthRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: AdminAuthRoutesDependencies,
): void {
  const {
    db,
    passkeys,
    requireOperator,
    clientAddress,
    limiter,
    clientKey,
    secureCookies,
    logger,
  } = dependencies;

  function limited(c: Context) {
    const check = limiter.hit(clientKey(c));
    if (check.ok) return null;
    return errorResponse(c, 429, "rate_limited", "Too many tries. Wait a little.", {
      retryAfterSeconds: check.error.retryAfterSeconds,
    });
  }

  const confirmFirst = (c: Context) =>
    errorResponse(
      c,
      403,
      "confirmation_required",
      "Confirm it is you with a passkey, then try again.",
    );

  /** Sets the session cookie and answers with the operator, as GET /admin/v1/me does. */
  async function signedIn(c: Context, { userId, session }: SignedInOperator) {
    setOperatorCookie(c, session.token, secureCookies);
    const [user] = await db
      .select({ firstName: schema.users.firstName, locale: schema.users.locale })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    return c.json(
      {
        userId,
        firstName: user?.firstName ?? null,
        locale: user?.locale === "is" ? ("is" as const) : ("en" as const),
        sessionEndsAt: session.endsAt.toISOString(),
      },
      200,
    );
  }

  app.openapi(toOpenApiRoute(adminSetupOptionsRoute), async (c) => {
    const refused = limited(c);
    if (refused !== null) return refused;
    const { token } = validated(c, "json", adminSetupOptionsRoute.request.body);
    const result = await passkeys.setupOptions(token);
    if (!result.ok) {
      return errorResponse(
        c,
        400,
        "setup_link_invalid",
        "This setup link has expired or was used.",
      );
    }
    return c.json({ options: result.value }, 200);
  });

  app.openapi(toOpenApiRoute(adminSetupRoute), async (c) => {
    const refused = limited(c);
    if (refused !== null) return refused;
    const body = validated(c, "json", adminSetupRoute.request.body);
    const result = await passkeys.setup({
      token: body.token,
      credential: body.credential as unknown as RegistrationResponseJSON,
      name: body.name,
      request: auditRequestOf(c, clientAddress),
    });
    if (!result.ok) {
      logger.warn(
        { requestId: c.get("requestId"), code: result.error.code },
        "console setup refused",
      );
      return result.error.code === "setup_link_invalid"
        ? errorResponse(c, 400, "setup_link_invalid", "This setup link has expired or was used.")
        : errorResponse(c, 400, "passkey_invalid", "The passkey could not be saved. Try again.");
    }
    return signedIn(c, result.value);
  });

  app.openapi(toOpenApiRoute(adminSignInOptionsRoute), async (c) => {
    const refused = limited(c);
    if (refused !== null) return refused;
    return c.json({ options: await passkeys.signInOptions() }, 200);
  });

  app.openapi(toOpenApiRoute(adminSignInRoute), async (c) => {
    const refused = limited(c);
    if (refused !== null) return refused;
    const { credential } = validated(c, "json", adminSignInRoute.request.body);
    const result = await passkeys.signIn({
      credential: credential as unknown as AuthenticationResponseJSON,
      request: auditRequestOf(c, clientAddress),
    });
    if (!result.ok) {
      logger.warn(
        { requestId: c.get("requestId"), code: result.error.code },
        "console sign-in refused",
      );
      return result.error.code === "operator_unavailable"
        ? errorResponse(c, 403, "operator_unavailable", "This account cannot use the console.")
        : errorResponse(c, 401, "passkey_invalid", "That passkey did not work. Try again.");
    }
    return signedIn(c, result.value);
  });

  app.openapi(toOpenApiRoute(adminPasskeysRoute, requireOperator), async (c) => {
    return c.json({ passkeys: await passkeys.list(operatorOf(c).userId) }, 200);
  });

  app.openapi(toOpenApiRoute(adminConfirmOptionsRoute, requireOperator), async (c) => {
    return c.json({ options: await passkeys.confirmOptions(operatorOf(c).userId) }, 200);
  });

  app.openapi(toOpenApiRoute(adminConfirmRoute, requireOperator), async (c) => {
    const { credential } = validated(c, "json", adminConfirmRoute.request.body);
    const result = await passkeys.confirm({
      operator: operatorOf(c),
      credential: credential as unknown as AuthenticationResponseJSON,
      request: auditRequestOf(c, clientAddress),
    });
    if (!result.ok) {
      return errorResponse(c, 400, "passkey_invalid", "That passkey did not work. Try again.");
    }
    return c.json({ confirmedUntil: result.value.confirmedUntil.toISOString() }, 200);
  });

  app.openapi(toOpenApiRoute(adminAddPasskeyOptionsRoute, requireOperator), async (c) => {
    const result = await passkeys.addOptions(operatorOf(c));
    return result.ok ? c.json({ options: result.value }, 200) : confirmFirst(c);
  });

  app.openapi(toOpenApiRoute(adminAddPasskeyRoute, requireOperator), async (c) => {
    const body = validated(c, "json", adminAddPasskeyRoute.request.body);
    const result = await passkeys.add({
      operator: operatorOf(c),
      credential: body.credential as unknown as RegistrationResponseJSON,
      name: body.name,
      request: auditRequestOf(c, clientAddress),
    });
    if (!result.ok) {
      return errorResponse(c, 400, "passkey_invalid", "The passkey could not be saved. Try again.");
    }
    return c.json(result.value, 201);
  });

  app.openapi(toOpenApiRoute(adminRemovePasskeyRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminRemovePasskeyRoute.request.params);
    const result = await passkeys.remove({
      operator: operatorOf(c),
      passkeyId: id,
      request: auditRequestOf(c, clientAddress),
    });
    if (!result.ok) {
      switch (result.error.code) {
        case "confirmation_required":
          return confirmFirst(c);
        case "not_found":
          return errorResponse(c, 404, "not_found", "There is no such passkey.");
        case "last_passkey":
          return errorResponse(
            c,
            409,
            "last_passkey",
            "Add another passkey before removing this one.",
          );
      }
    }
    return c.body(null, 204);
  });
}
