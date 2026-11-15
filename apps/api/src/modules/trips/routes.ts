import type { OpenAPIHono } from "@hono/zod-openapi";
import { quoteRoute, stopsAlongRoute } from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { RouteService, StopUnavailable } from "./service.ts";

/** The legs job works out new distances within minutes (spec 2, 3.7; spec 3, 3.9). */
const distancesRetryAfterSeconds = 60;

const pending = (c: Context) =>
  errorResponse(c, 503, "distances_pending", "The distances are being worked out.", {
    retryAfterSeconds: distancesRetryAfterSeconds,
  });

const unavailable = (c: Context, error: StopUnavailable, paths: (stop: number) => string) =>
  errorResponse(c, 400, error.code, "A meeting point is not in use for new trips.", {
    details: error.stops.map((stop) => ({ path: paths(stop), issue: "unavailable" })),
  });

export function registerTripRoutes(
  app: OpenAPIHono<AppEnv>,
  routes: RouteService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(stopsAlongRoute, requireAuth), async (c) => {
    const { from, to, date } = validated(c, "query", stopsAlongRoute.request.query);
    if (from === to) {
      return errorResponse(c, 400, "validation_failed", "The two ends are the same point.", {
        details: [{ path: "to", issue: "same_as_from" }],
      });
    }
    const found = await routes.stopsAlong(from, to, date);
    if (found.ok) return c.json({ meetingPoints: found.value }, 200);
    return found.error.code === "stop_unavailable"
      ? unavailable(c, found.error, (stop) => (stop === 0 ? "from" : "to"))
      : pending(c);
  });

  app.openapi(toOpenApiRoute(quoteRoute, requireAuth), async (c) => {
    const body = validated(c, "json", quoteRoute.request.body);
    const quote = await routes.quote(body);
    if (quote.ok) return c.json(quote.value, 200);
    switch (quote.error.code) {
      case "stop_unavailable":
        return unavailable(c, quote.error, (stop) =>
          stop === body.stops.length ? "add" : `stops.${String(stop)}`,
        );
      case "price_level_invalid":
        return errorResponse(
          c,
          400,
          "price_level_invalid",
          "The price level is not a whole step.",
          {
            details: [{ path: "priceLevel", issue: "invalid" }],
          },
        );
      case "distances_missing":
        return pending(c);
    }
  });
}
