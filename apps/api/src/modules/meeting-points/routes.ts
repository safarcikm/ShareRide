import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  meetingPointRoute,
  meetingPointsRoute,
  nearestMeetingPointsRoute,
  placeSearchRoute,
} from "@shareride/contracts";
import type { AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { MeetingPointService } from "./service.ts";

/** The catalogue changes rarely; a few minutes' cache spares the database. */
const catalogueCache = "public, max-age=300";

export function registerMeetingPointRoutes(
  app: OpenAPIHono<AppEnv>,
  meetingPoints: MeetingPointService,
): void {
  app.openapi(toOpenApiRoute(meetingPointsRoute), async (c) => {
    c.header("Cache-Control", catalogueCache);
    return c.json({ meetingPoints: await meetingPoints.list() }, 200);
  });

  app.openapi(toOpenApiRoute(meetingPointRoute), async (c) => {
    const { id } = validated(c, "param", meetingPointRoute.request.params);
    const details = await meetingPoints.details(id);
    if (details === undefined) {
      return errorResponse(c, 404, "not_found", "There is no such meeting point.");
    }
    c.header("Cache-Control", catalogueCache);
    return c.json(details, 200);
  });

  app.openapi(toOpenApiRoute(placeSearchRoute), async (c) => {
    const { q } = validated(c, "query", placeSearchRoute.request.query);
    return c.json({ results: await meetingPoints.searchPlaces(q) }, 200);
  });

  app.openapi(toOpenApiRoute(nearestMeetingPointsRoute), async (c) => {
    const { id } = validated(c, "param", nearestMeetingPointsRoute.request.params);
    const nearest = await meetingPoints.nearest(id);
    if (nearest === undefined) return errorResponse(c, 404, "not_found", "There is no such place.");
    return c.json(nearest, 200);
  });
}
