import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  acceptLegalRoute,
  getMeRoute,
  putEmailRoute,
  updateMeRoute,
  verifyEmailRoute,
} from "@shareride/contracts";
import type { MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { EmailService } from "./email.ts";
import type { AccountService } from "./service.ts";

export function registerAccountRoutes(
  app: OpenAPIHono<AppEnv>,
  account: AccountService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(getMeRoute, requireAuth), async (c) =>
    c.json(await account.me(authOf(c).userId), 200),
  );

  app.openapi(toOpenApiRoute(updateMeRoute, requireAuth), async (c) => {
    const changes = validated(c, "json", updateMeRoute.request.body);
    const result = await account.updateMe(authOf(c).userId, changes);
    if (!result.ok) {
      return errorResponse(c, 400, "profile_invalid", "A profile field is not valid.", {
        details: [{ path: result.error.field, issue: "invalid" }],
      });
    }
    return c.json(result.value, 200);
  });

  app.openapi(toOpenApiRoute(acceptLegalRoute, requireAuth), async (c) => {
    const body = validated(c, "json", acceptLegalRoute.request.body);
    const result = await account.accept(authOf(c).userId, body);
    if (!result.ok) {
      const details = [{ path: "documents", issue: result.error.type }];
      return result.error.code === "legal_version_outdated"
        ? errorResponse(c, 409, result.error.code, "A newer version exists. Ask again.", {
            details,
          })
        : errorResponse(c, 400, result.error.code, "A document is listed twice.", { details });
    }
    return c.json(result.value, 200);
  });
}

/** Adding an email (plan 4.6): the link is asked for signed in, and opened signed in or not. */
export function registerEmailRoutes(
  app: OpenAPIHono<AppEnv>,
  email: EmailService,
  account: AccountService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(putEmailRoute, requireAuth), async (c) => {
    const body = validated(c, "json", putEmailRoute.request.body);
    const { userId } = authOf(c);
    const asked = await email.ask(userId, body.email);
    if (asked.ok) return c.json(await account.me(userId), 200);
    switch (asked.error.code) {
      case "email_invalid":
        return errorResponse(c, 400, "email_invalid", "This is not an email address.");
      case "rate_limited":
        return errorResponse(c, 429, "rate_limited", "A link was sent just now. Wait a little.", {
          retryAfterSeconds: asked.error.retryAfterSeconds,
        });
      case "email_failed":
        return errorResponse(c, 502, "email_failed", "The email could not be sent. Try again.");
      case "email_unavailable":
        return errorResponse(c, 503, "email_unavailable", "This server sends no email.");
    }
  });

  app.openapi(toOpenApiRoute(verifyEmailRoute), async (c) => {
    const body = validated(c, "json", verifyEmailRoute.request.body);
    const verified = await email.verify(body.token);
    if (verified.ok) return c.json(verified.value, 200);
    return verified.error.code === "email_taken"
      ? errorResponse(c, 409, "email_taken", "Another account has this email address.")
      : errorResponse(c, 400, "link_invalid", "This link no longer works. Ask for a new one.");
  });
}
