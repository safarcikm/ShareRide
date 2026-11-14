import type { OpenAPIHono } from "@hono/zod-openapi";
import { tripSearchAlternativesRoute, tripSearchRoute } from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { RateLimiter } from "../../platform/memory-rate-limiter.ts";
import type { SearchError, SearchService } from "./service.ts";

export interface SearchRoutesDependencies {
  readonly search: SearchService;
  readonly optionalAuth: MiddlewareHandler<AppEnv>;
  /** Per IP address, shared by both routes; checked before the token. */
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

export function registerSearchRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: SearchRoutesDependencies,
): void {
  const { search, optionalAuth, limiter, clientKey } = dependencies;

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
}
