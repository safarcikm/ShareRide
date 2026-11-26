import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  soonestTripsRoute,
  tripDetailsRoute,
  tripSearchAlternativesRoute,
  tripSearchRoute,
} from "@shareride/contracts";
import {
  clientPlatformHeader,
  searchLogPlatform,
  type AccountSuspended,
  type Result,
} from "@shareride/domain";
import { isLocale } from "@shareride/i18n";
import type { Context, MiddlewareHandler } from "hono";
import { every } from "hono/combine";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { RateLimiter } from "../../platform/memory-rate-limiter.ts";
import { accountSuspended } from "../account/standing.ts";
import type { TripDetailsError, TripDetailsService } from "./details.ts";
import { rideOf, stopPosition } from "./link-preview.ts";
import { createRidePictures, storyFileName, type RidePictures } from "./ride-picture.ts";
import type { SearchError, SearchService } from "./service.ts";

export interface SearchRoutesDependencies {
  readonly search: SearchService;
  readonly details: TripDetailsService;
  readonly optionalAuth: MiddlewareHandler<AppEnv>;
  /** Per IP address, shared by the four routes; checked before the token. */
  readonly limiter: RateLimiter;
  /** What the limiter counts by: the caller's IP address, as a keyed hash. */
  readonly clientKey: (c: Context) => string;
  /** Refuses a suspended person: they cannot search (spec 9, 3.6.2). */
  readonly standing: (userId: string) => Promise<Result<void, AccountSuspended>>;
  /**
   * Per IP address, for a ride's pictures alone (spec 23, 3.10, item 4):
   * link previews come from a few sites' readers, where a refused picture
   * stays missing from their copy of the card, and stories from drivers'
   * browsers, one fetch each (spec 28, 3.5), where a refused one can be
   * fetched again.
   */
  readonly pictureLimiter: RateLimiter;
  /** The pictures the API keeps; a new set by default. */
  readonly pictures?: RidePictures;
}

/**
 * The addresses of a shared ride's pictures, for Hono: its link preview
 * (spec 23, 3.10, item 4) and its story (spec 28, 3.5). Any site may show them.
 */
export const tripPicturePaths = {
  preview: "/v1/trips/:id/preview.png",
  story: "/v1/trips/:id/story.png",
} as const;

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
  const { search, details, optionalAuth, limiter, clientKey, standing, pictureLimiter } =
    dependencies;
  const pictures = dependencies.pictures ?? createRidePictures();

  /** Searching signed in, as anyone but a suspended person. Trip details stay open to read. */
  const searching = every(
    optionalAuth,
    createMiddleware<AppEnv>(async (c, next) => {
      const userId = c.get("auth")?.userId;
      if (userId !== undefined) {
        const active = await standing(userId);
        if (!active.ok) return accountSuspended(c, active.error);
      }
      await next();
      return undefined;
    }),
  );

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
  const pictureLimited = createMiddleware<AppEnv>(async (c, next) => {
    const check = pictureLimiter.hit(clientKey(c));
    if (!check.ok) {
      return errorResponse(c, 429, "rate_limited", "Too many pictures. Try again shortly.", {
        retryAfterSeconds: check.error.retryAfterSeconds,
      });
    }
    await next();
    return undefined;
  });
  app.use(tripSearchRoute.path, limited);
  app.use(tripSearchAlternativesRoute.path, limited);
  app.use(soonestTripsRoute.path, limited);

  app.openapi(toOpenApiRoute(tripSearchRoute, searching), async (c) => {
    const query = validated(c, "query", tripSearchRoute.request.query);
    const found = await search.search(
      query,
      c.get("auth")?.userId ?? null,
      searchLogPlatform(c.req.header(clientPlatformHeader)),
    );
    if (!found.ok) return searchError(c, found.error);
    return c.json({ results: found.value }, 200);
  });

  app.openapi(toOpenApiRoute(tripSearchAlternativesRoute, searching), async (c) => {
    const query = validated(c, "query", tripSearchAlternativesRoute.request.query);
    const found = await search.alternatives(query, c.get("auth")?.userId ?? null);
    if (!found.ok) return searchError(c, found.error);
    return c.json(found.value, 200);
  });

  // Before /v1/trips/{id}, which would otherwise take the path.
  app.openapi(toOpenApiRoute(soonestTripsRoute, searching), async (c) => {
    const { limit } = validated(c, "query", soonestTripsRoute.request.query);
    const results = await search.soonest(limit, c.get("auth")?.userId ?? null);
    return c.json({ results }, 200);
  });

  // A shared ride's pictures, for its link preview (spec 23, 3.10, item 4)
  // and for a story (spec 28, 3.5): files, so not in the OpenAPI document.
  // Before /v1/trips/{id}, as above.
  for (const kind of ["preview", "story"] as const) {
    app.get(tripPicturePaths[kind], pictureLimited, async (c) => {
      const id = c.req.param("id");
      const isId = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);
      const lang = c.req.query("lang");
      const locale = lang !== undefined && isLocale(lang) ? lang : "en";
      const found = isId
        ? await details.details(
            id,
            {
              board: stopPosition(c.req.query("fromStop")),
              alight: stopPosition(c.req.query("toStop")),
              seats: 1,
            },
            null,
          )
        : undefined;
      const ride = found?.ok === true ? rideOf(found.value) : undefined;
      if (ride === undefined) return errorResponse(c, 404, "not_found", "There is no such trip.");
      const png = await pictures.picture(ride, locale, kind);
      if (png === undefined) {
        return errorResponse(c, 503, "busy", "Busy drawing other pictures. Try again shortly.", {
          retryAfterSeconds: 2,
        });
      }
      return c.body(new Uint8Array(png), 200, {
        "Content-Type": "image/png",
        // Sites read a card's picture once; the address changes with what it
        // shows. A story is fetched when the driver shares it, as it is now.
        "Cache-Control": kind === "preview" ? "public, max-age=3600" : "no-cache",
        "X-Content-Type-Options": "nosniff",
        ...(kind === "story" && c.req.query("download") === "1"
          ? { "Content-Disposition": `attachment; filename="${storyFileName(ride, locale)}"` }
          : {}),
      });
    });
  }

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
