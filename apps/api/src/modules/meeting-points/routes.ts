import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  meetingPointRoute,
  meetingPointsRoute,
  nearestMeetingPointsRoute,
  placeSearchRoute,
  reportMeetingPointIssueRoute,
} from "@shareride/contracts";
import type { MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { MeetingPointIssueService } from "./issues.ts";
import type { MeetingPointPhotoService } from "./photos.ts";
import type { MeetingPointService } from "./service.ts";

/** The catalogue changes rarely; a few minutes' cache spares the database. */
const catalogueCache = "public, max-age=300";

export function registerMeetingPointRoutes(
  app: OpenAPIHono<AppEnv>,
  meetingPoints: MeetingPointService,
  photos: MeetingPointPhotoService,
  issues: MeetingPointIssueService,
  requireAuth: MiddlewareHandler,
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
    // The photos' links last an hour at least, longer than the cache.
    c.header("Cache-Control", catalogueCache);
    return c.json({ ...details, photos: await photos.forApp(id) }, 200);
  });

  app.openapi(toOpenApiRoute(reportMeetingPointIssueRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", reportMeetingPointIssueRoute.request.params);
    const body = validated(c, "json", reportMeetingPointIssueRoute.request.body);
    const result = await issues.report(authOf(c).userId, id, body);
    if (result.ok) return c.body(null, 204);
    switch (result.error.code) {
      case "not_found":
        return errorResponse(c, 404, "not_found", "There is no such meeting point.");
      case "too_long":
        return errorResponse(c, 400, "validation_failed", "The report cannot be sent.", {
          details: [{ path: "note", issue: "too_long" }],
        });
      case "too_many_reports":
        return errorResponse(c, 429, "too_many_reports", "Too many reports in 24 hours.", {
          retryAfterSeconds: result.error.retryAfterSeconds,
        });
    }
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
