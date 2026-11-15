import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  soonestTripsRoute,
  tripDetailsRoute,
  tripSearchAlternativesRoute,
  tripSearchRoute,
} from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { every } from "hono/combine";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { RateLimiter } from "../../platform/memory-rate-limiter.ts";
import type { TripDetailsError, TripDetailsService } from "./details.ts";
import type { SearchError, SearchService } from "./service.ts";

export interface SearchRoutesDependencies {
  readonly search: SearchService;
  readonly details: TripDetailsService;
  readonly optionalAuth: MiddlewareHandler<AppEnv>;
  /** Per IP address, shared by the four routes; checked before the token. */
  readonly limiter: RateLimiter;
  /** What the limiter counts by: the caller's IP address, as a keyed hash. */
  readonly clientKey: (c: Context) => string;
}

function searchError(c: Context, error: SearchError) {
  if (error.code === "same_place") {
    return errorResponse(c, 400, "validation_failed", "Choose two different places.", {
      details: [{ path: "to", issue: "same_as_from" }],
    });
  }
  return errorResponse(c, 404, "not_found", "There is no such meeting point or place.", {
    details: error.ends.map((end) => ({ path: end, issue: "not_found" })),
  });
}

function detailsError(c: Context, error: TripDetailsError) {
  if (error.code === "not_found") {
    return errorResponse(c, 404, "not_found", "There is no such trip.");
  }
  return errorResponse(c, 400, "validation_failed", "Choose two stops of the trip, in order.", {
    details: [{ path: error.end === "board" ? "fromStop" : "toStop", issue: error.code }],
  });
}

export function registerSearchRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: SearchRoutesDependencies,
): void {
  const { search, details, optionalAuth, limiter, clientKey } = dependencies;

  const limited = createMiddleware<AppEnv>(async (c, next) => {
    const check = limiter.hit(clientKey(c));
    if (!check.ok) {
      return errorResponse(c, 429, "rate_limited", "Too many searches. Try again shortly.", {
        retryAfterSeconds: check.error.retryAfterSeconds,
      });
    }
    await next();
    return undefined;
  });
  app.use(tripSearchRoute.path, limited);
  app.use(tripSearchAlternativesRoute.path, limited);
  app.use(soonestTripsRoute.path, limited);

  app.openapi(toOpenApiRoute(tripSearchRoute, optionalAuth), async (c) => {
    const query = validated(c, "query", tripSearchRoute.request.query);
    const found = await search.search(query, c.get("auth")?.userId ?? null);
    if (!found.ok) return searchError(c, found.error);
    return c.json({ results: found.value }, 200);
  });

  app.openapi(toOpenApiRoute(tripSearchAlternativesRoute, optionalAuth), async (c) => {
    const query = validated(c, "query", tripSearchAlternativesRoute.request.query);
    const found = await search.alternatives(query, c.get("auth")?.userId ?? null);
    if (!found.ok) return searchError(c, found.error);
    return c.json(found.value, 200);
  });

  // Before /v1/trips/{id}, which would otherwise take the path.
  app.openapi(toOpenApiRoute(soonestTripsRoute, optionalAuth), async (c) => {
    const { limit } = validated(c, "query", soonestTripsRoute.request.query);
    const results = await search.soonest(limit, c.get("auth")?.userId ?? null);
    return c.json({ results }, 200);
  });

  // Registered as the GET of /v1/trips/{id} only, so a draft's changes are not counted.
  app.openapi(toOpenApiRoute(tripDetailsRoute, every(limited, optionalAuth)), async (c) => {
    const { id } = validated(c, "param", tripDetailsRoute.request.params);
    const query = validated(c, "query", tripDetailsRoute.request.query);
    const found = await details.details(
      id,
      { board: query.fromStop, alight: query.toStop, seats: query.seats },
      c.get("auth")?.userId ?? null,
    );
    if (!found.ok) return detailsError(c, found.error);
    return c.json(found.value, 200);
  });
}
