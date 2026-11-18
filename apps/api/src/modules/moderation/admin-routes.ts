import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminAnswerAppealRoute,
  adminAppealsRoute,
  adminCancelTripRoute,
  adminCloseReportRoute,
  adminHideContentRoute,
  adminReinstateRoute,
  adminReportConversationRoute,
  adminReportRoute,
  adminReportsRoute,
  adminSuspendRoute,
  adminWarnRoute,
} from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { operatorOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { auditRequestOf } from "../admin/audit.ts";
import type { ConsoleActor, ModerationConsoleService } from "./console.ts";

export interface ModerationAdminRoutesDependencies {
  readonly moderation: ModerationConsoleService;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
}

const notFound = (c: Context, what: string) => errorResponse(c, 404, "not_found", what);

/** The operator acting in a console request, for the audit log. */
export function consoleActorOf(
  c: Context<AppEnv>,
  clientAddress: (c: Context) => string,
): ConsoleActor {
  const { userId, sessionId } = operatorOf(c);
  return { operator: { userId, sessionId }, request: auditRequestOf(c, clientAddress) };
}

/** A reason, note or answer the domain refused, on the field it came in. */
const textRefused = (c: Context, path: string, issue: string) =>
  errorResponse(c, 400, "validation_failed", "The text cannot be sent.", {
    details: [{ path, issue }],
  });

/**
 * The console's reports, actions and appeals under /admin/v1 (spec 9, 3.4
 * to 3.6). Each action writes its audit entry with the person's notice.
 */
export function registerModerationAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: ModerationAdminRoutesDependencies,
): void {
  const { moderation, requireOperator, clientAddress } = dependencies;
  const actorOf = (c: Context<AppEnv>) => consoleActorOf(c, clientAddress);

  /** What every action can be refused for: an empty or long reason, or what it names is gone. */
  const refused = (
    c: Context,
    error: { readonly code: "not_found" | "reason_missing" | "too_long" },
    what: string,
  ) => (error.code === "not_found" ? notFound(c, what) : textRefused(c, "reason", error.code));

  app.openapi(toOpenApiRoute(adminReportsRoute, requireOperator), async (c) => {
    const { state } = validated(c, "query", adminReportsRoute.request.query);
    return c.json({ reports: [...(await moderation.reports(state))] }, 200);
  });

  app.openapi(toOpenApiRoute(adminReportRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminReportRoute.request.params);
    const report = await moderation.report(id);
    if (report === undefined) return notFound(c, "There is no such report.");
    return c.json(report, 200);
  });

  app.openapi(toOpenApiRoute(adminReportConversationRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminReportConversationRoute.request.params);
    const read = await moderation.conversation(id, actorOf(c));
    if (read.ok) return c.json({ messages: [...read.value] }, 200);
    if (read.error.code === "not_found") return notFound(c, "There is no such report.");
    return errorResponse(
      c,
      409,
      "not_covered",
      "Only a report about a message opens its conversation.",
    );
  });

  app.openapi(toOpenApiRoute(adminCloseReportRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminCloseReportRoute.request.params);
    const { outcome } = validated(c, "json", adminCloseReportRoute.request.body);
    const closed = await moderation.closeReport(id, outcome, actorOf(c));
    if (closed.ok) return c.json(closed.value, 200);
    if (closed.error.code === "not_found") return notFound(c, "There is no such report.");
    return errorResponse(c, 409, "already_closed", "The report is closed already.");
  });

  app.openapi(toOpenApiRoute(adminWarnRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminWarnRoute.request.params);
    const body = validated(c, "json", adminWarnRoute.request.body);
    const warned = await moderation.warn(id, body, actorOf(c));
    if (warned.ok) return c.json({ action: warned.value }, 201);
    return refused(c, warned.error, "There is no such person or report.");
  });

  app.openapi(toOpenApiRoute(adminSuspendRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminSuspendRoute.request.params);
    const body = validated(c, "json", adminSuspendRoute.request.body);
    const suspended = await moderation.suspend(id, body, actorOf(c));
    if (suspended.ok) return c.json(suspended.value, 201);
    const { error } = suspended;
    switch (error.code) {
      case "already_suspended":
        return errorResponse(
          c,
          409,
          error.code,
          "They are suspended already: reinstate them first.",
        );
      case "until_past":
        return textRefused(c, "until", error.code);
      default:
        return refused(c, error, "There is no such person or report.");
    }
  });

  app.openapi(toOpenApiRoute(adminReinstateRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminReinstateRoute.request.params);
    const body = validated(c, "json", adminReinstateRoute.request.body);
    const reinstated = await moderation.reinstate(id, body, actorOf(c));
    if (reinstated.ok) return c.json({ action: reinstated.value }, 201);
    const { code } = reinstated.error;
    switch (code) {
      case "not_found":
        return notFound(c, "There is no such person.");
      case "not_suspended":
        return errorResponse(c, 409, code, "They are not suspended.");
      case "reason_missing":
      case "too_long":
        return textRefused(c, "note", code);
    }
  });

  app.openapi(toOpenApiRoute(adminHideContentRoute, requireOperator), async (c) => {
    const body = validated(c, "json", adminHideContentRoute.request.body);
    const hidden = await moderation.hideContent(body, actorOf(c));
    if (hidden.ok) return c.json({ action: hidden.value }, 201);
    const { error } = hidden;
    if (error.code === "already_hidden") {
      return errorResponse(c, 409, error.code, "It is hidden already.");
    }
    return refused(c, error, "There is no such content that others can read, or no such report.");
  });

  app.openapi(toOpenApiRoute(adminCancelTripRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminCancelTripRoute.request.params);
    const body = validated(c, "json", adminCancelTripRoute.request.body);
    const cancelled = await moderation.cancelTrip(id, body, actorOf(c));
    if (cancelled.ok) return c.json({ action: cancelled.value }, 201);
    const { error } = cancelled;
    switch (error.code) {
      case "already_cancelled":
        return errorResponse(c, 409, error.code, "The trip is cancelled already.");
      case "trip_not_cancellable":
        return errorResponse(c, 409, error.code, "The trip has left or completed.");
      default:
        return refused(c, error, "There is no such trip or report.");
    }
  });

  app.openapi(toOpenApiRoute(adminAppealsRoute, requireOperator), async (c) => {
    const { state } = validated(c, "query", adminAppealsRoute.request.query);
    return c.json({ appeals: [...(await moderation.appeals(state))] }, 200);
  });

  app.openapi(toOpenApiRoute(adminAnswerAppealRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminAnswerAppealRoute.request.params);
    const body = validated(c, "json", adminAnswerAppealRoute.request.body);
    const answered = await moderation.answerAppeal(id, body, actorOf(c));
    if (answered.ok) return c.json(answered.value, 200);
    const { code } = answered.error;
    switch (code) {
      case "not_found":
        return notFound(c, "There is no such action.");
      case "not_appealed":
        return errorResponse(c, 409, code, "It has not been appealed.");
      case "already_answered":
        return errorResponse(c, 409, code, "The appeal is answered already.");
      case "reason_missing":
      case "too_long":
        return textRefused(c, "answer", code);
    }
  });
}
