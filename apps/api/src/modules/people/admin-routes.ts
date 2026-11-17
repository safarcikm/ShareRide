import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminExcusedCancellationsRoute,
  adminOverruleRoute,
  adminReliabilityWatchRoute,
} from "@shareride/contracts";
import type { ReliabilitySettings } from "@shareride/domain";
import type { Context, MiddlewareHandler } from "hono";
import { operatorOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { auditRequestOf } from "../admin/audit.ts";
import type { ReliabilityAdminService } from "./admin.ts";

export interface ReliabilityAdminRoutesDependencies {
  readonly reliability: ReliabilityAdminService;
  readonly settings: ReliabilitySettings;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
}

/** The console's Reliability routes under /admin/v1 (spec 8, 3.8; R8.11). */
export function registerReliabilityAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: ReliabilityAdminRoutesDependencies,
): void {
  const { reliability, settings, requireOperator, clientAddress } = dependencies;

  app.openapi(toOpenApiRoute(adminExcusedCancellationsRoute, requireOperator), async (c) => {
    return c.json({ cancellations: [...(await reliability.excusedCancellations())] }, 200);
  });

  app.openapi(toOpenApiRoute(adminOverruleRoute, requireOperator), async (c) => {
    const { kind, id } = validated(c, "param", adminOverruleRoute.request.params);
    const { userId, sessionId } = operatorOf(c);
    const overruled = await reliability.overrule(kind, id, {
      operator: { userId, sessionId },
      request: auditRequestOf(c, clientAddress),
    });
    if (overruled.ok) return c.json(overruled.value, 200);
    return overruled.error.code === "not_found"
      ? errorResponse(
          c,
          404,
          "not_found",
          "There is no such cancellation excused by a weather or road-closure reason.",
        )
      : errorResponse(c, 409, "already_overruled", "Its reason is already overruled.");
  });

  app.openapi(toOpenApiRoute(adminReliabilityWatchRoute, requireOperator), async (c) => {
    const people = await reliability.watched();
    return c.json({ watchPercent: settings.watchPercent, people: [...people] }, 200);
  });
}
