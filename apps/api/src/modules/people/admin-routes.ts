import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminChangeCountingRoute,
  adminExcusedCancellationsRoute,
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
    // Read before the list: the list is of this period.
    const { periodMonths } = settings;
    return c.json(
      { periodMonths, cancellations: [...(await reliability.excusedCancellations())] },
      200,
    );
  });

  app.openapi(toOpenApiRoute(adminChangeCountingRoute, requireOperator), async (c) => {
    const { kind, id } = validated(c, "param", adminChangeCountingRoute.request.params);
    const { counts, note } = validated(c, "json", adminChangeCountingRoute.request.body);
    const { userId, sessionId } = operatorOf(c);
    const changed = await reliability.changeCounting(
      { kind, id, counts, note },
      { operator: { userId, sessionId }, request: auditRequestOf(c, clientAddress) },
    );
    if (changed.ok) return c.json(changed.value, 200);
    switch (changed.error.code) {
      case "note_missing":
        return errorResponse(c, 400, "validation_failed", "Say why in a note.", {
          details: [{ path: "note", issue: "missing" }],
        });
      case "note_too_long":
        return errorResponse(c, 400, "validation_failed", "The note is too long.", {
          details: [{ path: "note", issue: "too_long" }],
        });
      case "not_found":
        return errorResponse(
          c,
          404,
          "not_found",
          "There is no such cancellation excused by a weather or road-closure reason.",
        );
      case "unchanged":
        return errorResponse(
          c,
          409,
          "unchanged",
          counts ? "It counts already." : "It doesn't count already.",
        );
    }
  });

  app.openapi(toOpenApiRoute(adminReliabilityWatchRoute, requireOperator), async (c) => {
    const people = await reliability.watched();
    return c.json(
      {
        watchPercent: settings.watchPercent,
        periodMonths: settings.periodMonths,
        people: [...people],
      },
      200,
    );
  });
}
