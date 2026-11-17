import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  answerDisputeRoute,
  driverCheckInRoute,
  markNoShowRoute,
  passengerCheckInRoute,
  reportDriverAbsentRoute,
} from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { AnswerError, DriverAbsentError, NoShowError, ReportService } from "./reports.ts";
import type { CheckInError, TripDayService } from "./service.ts";

function checkInError(c: Context, error: CheckInError, notFound: string) {
  switch (error.code) {
    case "not_found":
      return errorResponse(c, 404, "not_found", notFound);
    case "check_in_not_open":
      return errorResponse(c, 409, "check_in_not_open", '"I\'m here" is not open yet.', {
        opensAt: error.opensAt.toISOString(),
      });
    case "check_in_closed":
      return errorResponse(c, 409, "check_in_closed", '"I\'m here" has closed for this stop.');
    case "not_confirmed":
      return errorResponse(c, 409, "not_confirmed", "The booking is not confirmed.");
    case "trip_not_running":
      return errorResponse(c, 409, "trip_not_running", "The trip is not running.");
  }
}

const noteTooLong = (c: Context) =>
  errorResponse(c, 400, "validation_failed", "The note is too long.", {
    details: [{ path: "note", issue: "too_long" }],
  });

function reportError(c: Context, error: NoShowError | DriverAbsentError, notFound: string) {
  switch (error.code) {
    case "not_found":
      return errorResponse(c, 404, "not_found", notFound);
    case "note_too_long":
      return noteTooLong(c);
    case "not_confirmed":
      return errorResponse(c, 409, "not_confirmed", "The booking is not confirmed.");
    case "not_boarding":
      return errorResponse(c, 409, "not_boarding", "The booking is not confirmed or completed.");
    case "already_reported":
      return errorResponse(
        c,
        409,
        "already_reported",
        "The other side has already reported this booking; answer that instead.",
      );
    case "trip_completed":
      return errorResponse(c, 409, "trip_completed", "The trip has completed.");
    case "no_show_too_early":
    case "report_too_early":
      return errorResponse(c, 409, error.code, "The wait after the stop's time has not passed.", {
        allowedAt: error.allowedAt.toISOString(),
      });
    case "driver_not_checked_in":
      return errorResponse(
        c,
        409,
        "driver_not_checked_in",
        "Say \"I'm here\" at the passenger's stop first.",
      );
    case "report_too_late":
      return errorResponse(
        c,
        409,
        "report_too_late",
        "It is more than 24 hours since the trip completed.",
      );
  }
}

function answerError(c: Context, error: AnswerError) {
  switch (error.code) {
    case "not_found":
      return errorResponse(c, 404, "not_found", "There is no such report for you to answer.");
    case "note_too_long":
      return noteTooLong(c);
    case "already_answered":
      return errorResponse(c, 409, "already_answered", "The report has been answered.");
    case "already_decided":
      return errorResponse(c, 409, "already_decided", "The report has been decided.");
    case "answer_window_closed":
      return errorResponse(c, 409, "answer_window_closed", "The time to answer has passed.");
  }
}

/**
 * "I'm here" for the passenger and the driver (spec 8, 3.2), and the reports
 * when one of them didn't come, with the other side's answer (3.3, 3.4).
 */
export function registerTripDayRoutes(
  app: OpenAPIHono<AppEnv>,
  service: TripDayService,
  reports: ReportService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(passengerCheckInRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", passengerCheckInRoute.request.params);
    validated(c, "json", passengerCheckInRoute.request.body);
    const result = await service.passengerCheckIn(authOf(c).userId, id);
    return result.ok
      ? c.json(result.value, 200)
      : checkInError(c, result.error, "There is no such booking of yours.");
  });

  app.openapi(toOpenApiRoute(driverCheckInRoute, requireAuth), async (c) => {
    const { id, stopId } = validated(c, "param", driverCheckInRoute.request.params);
    validated(c, "json", driverCheckInRoute.request.body);
    const result = await service.driverCheckIn(authOf(c).userId, id, stopId);
    return result.ok
      ? c.json(result.value, 200)
      : checkInError(c, result.error, "There is no such stop on a trip of yours.");
  });

  app.openapi(toOpenApiRoute(markNoShowRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", markNoShowRoute.request.params);
    const { note } = validated(c, "json", markNoShowRoute.request.body);
    const result = await reports.markNoShow(authOf(c).userId, id, note);
    return result.ok
      ? c.json(result.value, 200)
      : reportError(c, result.error, "There is no such booking on a trip of yours.");
  });

  app.openapi(toOpenApiRoute(reportDriverAbsentRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", reportDriverAbsentRoute.request.params);
    const { note } = validated(c, "json", reportDriverAbsentRoute.request.body);
    const result = await reports.reportDriverAbsent(authOf(c).userId, id, note);
    return result.ok
      ? c.json(result.value, 200)
      : reportError(c, result.error, "There is no such booking of yours.");
  });

  app.openapi(toOpenApiRoute(answerDisputeRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", answerDisputeRoute.request.params);
    const body = validated(c, "json", answerDisputeRoute.request.body);
    const result = await reports.answer(authOf(c).userId, id, body);
    return result.ok ? c.json(result.value, 200) : answerError(c, result.error);
  });
}
