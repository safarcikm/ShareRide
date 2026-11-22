import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  blockFromBookingRoute,
  blockFromProfileRoute,
  fileReportRoute,
  myBlocksRoute,
  myReportsRoute,
  unblockRoute,
} from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { BlockService } from "./blocks.ts";
import type { ReportError, ReportService } from "./reports.ts";

export function registerSafetyRoutes(
  app: OpenAPIHono<AppEnv>,
  services: { readonly blocks: BlockService; readonly reports: ReportService },
  requireAuth: MiddlewareHandler,
): void {
  const { blocks, reports } = services;
  app.openapi(toOpenApiRoute(blockFromBookingRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", blockFromBookingRoute.request.params);
    validated(c, "json", blockFromBookingRoute.request.body);
    const result = await blocks.blockFromBooking(authOf(c).userId, id);
    if (result.ok) return c.json({ together: result.value }, 200);
    return errorResponse(c, 404, "not_found", "There is no such booking of yours.");
  });

  app.openapi(toOpenApiRoute(blockFromProfileRoute, requireAuth), async (c) => {
    const { profileId } = validated(c, "param", blockFromProfileRoute.request.params);
    validated(c, "json", blockFromProfileRoute.request.body);
    const result = await blocks.blockFromProfile(authOf(c).userId, profileId);
    if (result.ok) return c.json({ together: result.value }, 200);
    return errorResponse(c, 404, "not_found", "There is no such person.");
  });

  app.openapi(toOpenApiRoute(unblockRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", unblockRoute.request.params);
    await blocks.unblock(authOf(c).userId, id);
    return c.body(null, 204);
  });

  app.openapi(toOpenApiRoute(myBlocksRoute, requireAuth), async (c) =>
    c.json({ blocked: await blocks.blocked(authOf(c).userId) }, 200),
  );

  app.openapi(toOpenApiRoute(fileReportRoute, requireAuth), async (c) => {
    const body = validated(c, "json", fileReportRoute.request.body);
    const result = await reports.file(authOf(c).userId, body);
    if (result.ok) return c.json(result.value, 201);
    return reportError(c, result.error);
  });

  app.openapi(toOpenApiRoute(myReportsRoute, requireAuth), async (c) =>
    c.json({ reports: await reports.mine(authOf(c).userId) }, 200),
  );
}

function reportError(c: Context, error: ReportError) {
  switch (error.code) {
    case "not_found":
      return errorResponse(c, 404, "not_found", "There is no such thing for you to report.");
    case "own":
      return errorResponse(c, 409, "cannot_report_own", "You cannot report your own.");
    case "not_reportable":
      return errorResponse(c, 409, "not_reportable", "PuffinRide's own lines cannot be reported.");
    case "window_closed":
      return errorResponse(
        c,
        409,
        "report_window_closed",
        "A booking can be reported until 24 hours after its trip completed.",
      );
    case "too_long":
      return errorResponse(c, 400, "validation_failed", "The report cannot be sent.", {
        details: [{ path: "description", issue: "too_long" }],
      });
    case "too_many_reports":
      return errorResponse(c, 429, "too_many_reports", "Too many reports in 24 hours.", {
        retryAfterSeconds: error.retryAfterSeconds,
      });
  }
}
