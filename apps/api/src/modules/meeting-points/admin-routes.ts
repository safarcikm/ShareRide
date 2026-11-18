import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminAddMeetingPointPhotoRoute,
  adminCreateMeetingPointRoute,
  adminDescribeMeetingPointPhotoRoute,
  adminImportMeetingPointsRoute,
  adminLegsStatusRoute,
  adminMeetingPointIssuesRoute,
  adminMeetingPointPhotosRoute,
  adminMeetingPointRoute,
  adminMeetingPointsRoute,
  adminOrderMeetingPointPhotosRoute,
  adminPauseMeetingPointRoute,
  adminRecomputeLegsRoute,
  adminRemoveMeetingPointPhotoRoute,
  adminResolveMeetingPointIssueRoute,
  adminResumeMeetingPointRoute,
  adminRetireMeetingPointRoute,
  adminUpdateMeetingPointRoute,
} from "@shareride/contracts";
import type { DraftProblem, ImportFileProblem, PauseProblem } from "@shareride/domain";
import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { operatorOf, type AppEnv } from "../../context.ts";
import { errorBody, errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { auditRequestOf } from "../admin/audit.ts";
import type { ConsoleActor, MeetingPointAdminService, StatusProblem } from "./admin-service.ts";
import type { MeetingPointIssueService } from "./issues.ts";
import type { LegService } from "./legs.ts";
import type { MeetingPointPhotoService, PhotoFieldProblem, PhotoProblem } from "./photos.ts";

export interface MeetingPointsAdminRoutesDependencies {
  readonly meetingPoints: MeetingPointAdminService;
  readonly photos: MeetingPointPhotoService;
  readonly issues: MeetingPointIssueService;
  readonly legs: LegService;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
}

/**
 * An import's JSON: a file of at most 1 MB (`importLimits`), with room for
 * the quotes and line breaks JSON escapes.
 */
const importBodyLimit = 2 * 1024 * 1024;

/** Why a file cannot be read, by the column or line it is about. */
const fileProblemDetail = ({ issue, column, position, line }: ImportFileProblem) => ({
  path:
    column !== undefined
      ? `columns.${column}`
      : position !== undefined
        ? `columns.${String(position)}`
        : line !== undefined
          ? `lines.${String(line)}`
          : "file",
  issue,
});

/** Each field and its problem, so the form can show them by the fields. */
const invalid = (problems: readonly (DraftProblem | PauseProblem | PhotoFieldProblem)[]) =>
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

  app.use(
    adminImportMeetingPointsRoute.path,
    bodyLimit({
      maxSize: importBodyLimit,
      onError: (c) =>
        c.json(errorBody("payload_too_large", "An import file is at most 1 MB."), 413),
    }),
  );

  app.openapi(toOpenApiRoute(adminImportMeetingPointsRoute, requireOperator), async (c) => {
    const { file, save } = validated(c, "json", adminImportMeetingPointsRoute.request.body);
    const result = await meetingPoints.importFile(file, save, actorOf(c));
    if (!result.ok) {
      return c.json(
        errorBody(
          "validation_failed",
          "The file cannot be read.",
          result.error.map(fileProblemDetail),
        ),
        400,
      );
    }
    return c.json({ rows: [...result.value.rows], added: result.value.added }, 200);
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

  /** The answer to a refused status change. */
  const refused = (c: Context<AppEnv>, problem: StatusProblem) => {
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
      case "status_change_not_allowed":
        return errorResponse(
          c,
          409,
          "status_change_not_allowed",
          "The meeting point's status does not allow this change.",
        );
    }
  };

  app.openapi(toOpenApiRoute(adminPauseMeetingPointRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminPauseMeetingPointRoute.request.params);
    const body = validated(c, "json", adminPauseMeetingPointRoute.request.body);
    const result = await meetingPoints.pause(id, body, actorOf(c));
    return result.ok ? c.json(result.value, 200) : refused(c, result.error);
  });

  app.openapi(toOpenApiRoute(adminResumeMeetingPointRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminResumeMeetingPointRoute.request.params);
    const body = validated(c, "json", adminResumeMeetingPointRoute.request.body);
    const result = await meetingPoints.resume(id, body, actorOf(c));
    return result.ok ? c.json(result.value, 200) : refused(c, result.error);
  });

  app.openapi(toOpenApiRoute(adminRetireMeetingPointRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminRetireMeetingPointRoute.request.params);
    const body = validated(c, "json", adminRetireMeetingPointRoute.request.body);
    const result = await meetingPoints.retire(id, body, actorOf(c));
    return result.ok ? c.json(result.value, 200) : refused(c, result.error);
  });
}

/** A photo's JSON: its file in base64 is at most 2.8 MB (`photoLimits`), with room for the rest. */
const photoBodyLimit = 3 * 1024 * 1024;

/** The queue of problem reports about meeting points under /admin/v1 (spec 2, 3.5). */
export function registerMeetingPointIssueAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: MeetingPointsAdminRoutesDependencies,
): void {
  const { issues, requireOperator, clientAddress } = dependencies;

  app.openapi(toOpenApiRoute(adminMeetingPointIssuesRoute, requireOperator), async (c) =>
    c.json({ issues: await issues.queue() }, 200),
  );

  app.openapi(toOpenApiRoute(adminResolveMeetingPointIssueRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminResolveMeetingPointIssueRoute.request.params);
    const body = validated(c, "json", adminResolveMeetingPointIssueRoute.request.body);
    const { userId, sessionId } = operatorOf(c);
    const result = await issues.resolve(id, body, {
      operator: { userId, sessionId },
      request: auditRequestOf(c, clientAddress),
    });
    if (result.ok) return c.body(null, 204);
    switch (result.error.code) {
      case "not_found":
        return errorResponse(c, 404, "not_found", "There is no such report.");
      case "issue_resolved":
        return errorResponse(c, 409, "issue_resolved", "The report was resolved since.");
      case "required":
      case "too_long":
        return errorResponse(c, 400, "validation_failed", "The report cannot be resolved.", {
          details: [{ path: "note", issue: result.error.code }],
        });
    }
  });
}

/** A meeting point's photos under /admin/v1 (spec 2, 3.6.3). */
export function registerMeetingPointPhotoAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: MeetingPointsAdminRoutesDependencies,
): void {
  const { photos, requireOperator, clientAddress } = dependencies;
  const actorOf = (c: Context<AppEnv>): ConsoleActor => {
    const { userId, sessionId } = operatorOf(c);
    return { operator: { userId, sessionId }, request: auditRequestOf(c, clientAddress) };
  };

  const answer = (
    c: Context<AppEnv>,
    result: Awaited<ReturnType<MeetingPointPhotoService["order"]>>,
    status: 200 | 201 = 200,
  ) => (result.ok ? c.json({ photos: result.value }, status) : refused(c, result.error));

  /** The answer to a refused change of the photos. */
  const refused = (c: Context<AppEnv>, problem: PhotoProblem) => {
    switch (problem.code) {
      case "validation_failed":
        return c.json(invalid(problem.problems), 400);
      case "not_found":
        return errorResponse(c, 404, "not_found", "There is no such meeting point or photo.");
      case "meeting_point_retired":
        return errorResponse(
          c,
          409,
          "meeting_point_retired",
          "A retired meeting point stays as it was.",
        );
      case "too_many_photos":
        return errorResponse(c, 409, "too_many_photos", "A meeting point has at most five photos.");
      case "photo_changed":
        return errorResponse(
          c,
          409,
          "photo_changed",
          "The photo was changed since this copy was loaded.",
        );
      case "photos_changed":
        return errorResponse(
          c,
          409,
          "photos_changed",
          "A photo was added or removed since this copy was loaded.",
        );
      case "photo_storage_off":
        return errorResponse(c, 503, "photo_storage_off", "No photo storage is set up here.");
      case "photo_storage_unavailable":
        return errorResponse(
          c,
          503,
          "photo_storage_unavailable",
          "Photo storage did not take the file. Try again later.",
        );
    }
  };

  app.use(
    "/admin/v1/meeting-points/:id/photos",
    bodyLimit({
      maxSize: photoBodyLimit,
      onError: (c) =>
        c.json(errorBody("payload_too_large", "A photo's file is at most 2 MB."), 413),
    }),
  );

  app.openapi(toOpenApiRoute(adminMeetingPointPhotosRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminMeetingPointPhotosRoute.request.params);
    const list = await photos.list(id);
    if (list === undefined) {
      return errorResponse(c, 404, "not_found", "There is no such meeting point.");
    }
    return c.json({ photos: list }, 200);
  });

  app.openapi(toOpenApiRoute(adminAddMeetingPointPhotoRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminAddMeetingPointPhotoRoute.request.params);
    const { file, ...descriptions } = validated(
      c,
      "json",
      adminAddMeetingPointPhotoRoute.request.body,
    );
    const bytes = new Uint8Array(Buffer.from(file, "base64"));
    return answer(c, await photos.add(id, { ...descriptions, file: bytes }, actorOf(c)), 201);
  });

  app.openapi(toOpenApiRoute(adminDescribeMeetingPointPhotoRoute, requireOperator), async (c) => {
    const { id, photoId } = validated(
      c,
      "param",
      adminDescribeMeetingPointPhotoRoute.request.params,
    );
    const body = validated(c, "json", adminDescribeMeetingPointPhotoRoute.request.body);
    return answer(c, await photos.describe(id, photoId, body, actorOf(c)));
  });

  app.openapi(toOpenApiRoute(adminOrderMeetingPointPhotosRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminOrderMeetingPointPhotosRoute.request.params);
    const { order } = validated(c, "json", adminOrderMeetingPointPhotosRoute.request.body);
    return answer(c, await photos.order(id, order, actorOf(c)));
  });

  app.openapi(toOpenApiRoute(adminRemoveMeetingPointPhotoRoute, requireOperator), async (c) => {
    const { id, photoId } = validated(c, "param", adminRemoveMeetingPointPhotoRoute.request.params);
    return answer(c, await photos.remove(id, photoId, actorOf(c)));
  });
}

/** The legs between meeting points under /admin/v1 (spec 2, 3.7). */
export function registerLegAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: MeetingPointsAdminRoutesDependencies,
): void {
  const { legs, requireOperator, clientAddress } = dependencies;

  app.openapi(toOpenApiRoute(adminLegsStatusRoute, requireOperator), async (c) =>
    c.json(await legs.status(), 200),
  );

  app.openapi(toOpenApiRoute(adminRecomputeLegsRoute, requireOperator), async (c) => {
    validated(c, "json", adminRecomputeLegsRoute.request.body);
    const { userId, sessionId } = operatorOf(c);
    const status = await legs.recomputeAll({
      operator: { userId, sessionId },
      request: auditRequestOf(c, clientAddress),
    });
    return c.json(status, 200);
  });
}
