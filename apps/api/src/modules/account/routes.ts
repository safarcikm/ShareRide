import type { OpenAPIHono } from "@hono/zod-openapi";
import { acceptLegalRoute, getMeRoute, updateMeRoute } from "@shareride/contracts";
import type { MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
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
