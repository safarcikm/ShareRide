import type { OpenAPIHono } from "@hono/zod-openapi";
import { profileReviewsRoute, publicProfileRoute } from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { PeopleError, PeopleService } from "./service.ts";

function peopleError(c: Context, error: PeopleError) {
  switch (error.code) {
    case "not_found":
      return errorResponse(c, 404, "not_found", "There is no such profile.");
    case "before_unknown":
      return errorResponse(c, 400, "validation_failed", "Start the page at one of their reviews.", {
        details: [{ path: "before", issue: "unknown" }],
      });
  }
}

/** Public profiles, with their rating, reviews and reliability figure (spec 1, 3.5; spec 8). */
export function registerPeopleRoutes(
  app: OpenAPIHono<AppEnv>,
  service: PeopleService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(publicProfileRoute, requireAuth), async (c) => {
    const { profileId } = validated(c, "param", publicProfileRoute.request.params);
    const result = await service.profile(profileId);
    return result.ok ? c.json(result.value, 200) : peopleError(c, result.error);
  });

  app.openapi(toOpenApiRoute(profileReviewsRoute, requireAuth), async (c) => {
    const { profileId } = validated(c, "param", profileReviewsRoute.request.params);
    const query = validated(c, "query", profileReviewsRoute.request.query);
    const result = await service.reviews(profileId, query, authOf(c).userId);
    return result.ok ? c.json(result.value, 200) : peopleError(c, result.error);
  });
}
