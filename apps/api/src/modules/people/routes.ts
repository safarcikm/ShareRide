import type { OpenAPIHono } from "@hono/zod-openapi";
import { profileReviewsRoute, publicProfileRoute } from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { PeopleService } from "./service.ts";

const notFound = (c: Context) => errorResponse(c, 404, "not_found", "There is no such profile.");

/** Public profiles, with their rating, reviews and reliability figure (spec 1, 3.5; spec 8). */
export function registerPeopleRoutes(
  app: OpenAPIHono<AppEnv>,
  service: PeopleService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(publicProfileRoute, requireAuth), async (c) => {
    const { profileId } = validated(c, "param", publicProfileRoute.request.params);
    const result = await service.profile(profileId);
    return result.ok ? c.json(result.value, 200) : notFound(c);
  });

  app.openapi(toOpenApiRoute(profileReviewsRoute, requireAuth), async (c) => {
    const { profileId } = validated(c, "param", profileReviewsRoute.request.params);
    const query = validated(c, "query", profileReviewsRoute.request.query);
    const result = await service.reviews(profileId, query);
    return result.ok ? c.json(result.value, 200) : notFound(c);
  });
}
