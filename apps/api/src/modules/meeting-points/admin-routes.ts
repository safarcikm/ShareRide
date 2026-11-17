import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminCreateMeetingPointRoute,
  adminMeetingPointRoute,
  adminMeetingPointsRoute,
  adminUpdateMeetingPointRoute,
} from "@shareride/contracts";
import type { DraftProblem } from "@shareride/domain";
import type { Context, MiddlewareHandler } from "hono";
import { operatorOf, type AppEnv } from "../../context.ts";
import { errorBody, errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { auditRequestOf } from "../admin/audit.ts";
import type { ConsoleActor, MeetingPointAdminService } from "./admin-service.ts";

export interface MeetingPointsAdminRoutesDependencies {
  readonly meetingPoints: MeetingPointAdminService;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
}

/** Each field and its problem, so the form can show them by the fields. */
const invalid = (problems: readonly DraftProblem[]) =>
  errorBody(
    "validation_failed",
    "The request is not valid.",
    problems.map(({ field, issue }) => ({ path: field, issue })),
  );

/** The console's meeting point routes under /admin/v1 (spec 2, 3.6). */
export function registerMeetingPointsAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: MeetingPointsAdminRoutesDependencies,
): void {
  const { meetingPoints, requireOperator, clientAddress } = dependencies;
  const actorOf = (c: Context<AppEnv>): ConsoleActor => {
    const { userId, sessionId } = operatorOf(c);
    return { operator: { userId, sessionId }, request: auditRequestOf(c, clientAddress) };
  };

  app.openapi(toOpenApiRoute(adminMeetingPointsRoute, requireOperator), async (c) => {
    const query = validated(c, "query", adminMeetingPointsRoute.request.query);
    return c.json({ meetingPoints: await meetingPoints.list(query) }, 200);
  });

  app.openapi(toOpenApiRoute(adminMeetingPointRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminMeetingPointRoute.request.params);
    const point = await meetingPoints.get(id);
    if (point === undefined) {
      return errorResponse(c, 404, "not_found", "There is no such meeting point.");
    }
    return c.json(point, 200);
  });

  app.openapi(toOpenApiRoute(adminCreateMeetingPointRoute, requireOperator), async (c) => {
    const body = validated(c, "json", adminCreateMeetingPointRoute.request.body);
    const result = await meetingPoints.create(body, actorOf(c));
    if (!result.ok) return c.json(invalid(result.error), 400);
    return c.json(result.value, 201);
  });

  app.openapi(toOpenApiRoute(adminUpdateMeetingPointRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminUpdateMeetingPointRoute.request.params);
    const body = validated(c, "json", adminUpdateMeetingPointRoute.request.body);
    const result = await meetingPoints.update(id, body, actorOf(c));
    if (result.ok) return c.json(result.value, 200);
    const problem = result.error;
    switch (problem.code) {
      case "validation_failed":
        return c.json(invalid(problem.problems), 400);
      case "not_found":
        return errorResponse(c, 404, "not_found", "There is no such meeting point.");
      case "meeting_point_changed":
        return errorResponse(
          c,
          409,
          "meeting_point_changed",
          "The meeting point was saved since this copy was loaded.",
        );
      case "meeting_point_retired":
        return errorResponse(
          c,
          409,
          "meeting_point_retired",
          "A retired meeting point stays as it was.",
        );
      case "move_needed":
        return errorResponse(
          c,
          409,
          "move_needed",
          "Only a draft's spot is edited here; a point in use is moved on its own.",
        );
    }
  });
}
