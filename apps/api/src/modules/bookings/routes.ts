import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  acceptRequestRoute,
  bookingRoute,
  bookTripRoute,
  cancelBookingRoute,
  cancellationPreviewRoute,
  cancelTripRoute,
  declineRequestRoute,
  myBookingsRoute,
  tripBookingsRoute,
  withdrawRequestRoute,
} from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { accountSuspended } from "../account/standing.ts";
import type { TripService } from "../trips/drafts.ts";
import type {
  AcceptError,
  AnswerError,
  BookError,
  BookingService,
  CancelError,
  CancelTripError,
  PreviewError,
} from "./service.ts";

const invalid = (c: Context, path: string, issue: string, message: string) =>
  errorResponse(c, 400, "validation_failed", message, { details: [{ path, issue }] });

function bookError(c: Context, error: BookError) {
  switch (error.code) {
    case "not_found":
      return errorResponse(c, 404, "not_found", "There is no such trip.");
    case "account_incomplete":
      return errorResponse(
        c,
        403,
        "account_incomplete",
        "Verify your phone number and accept the terms first.",
      );
    case "own_trip":
      return errorResponse(c, 403, "own_trip", "This is your own trip.");
    case "account_suspended":
      return accountSuspended(c, error);
    case "account_deletion_pending":
      return errorResponse(
        c,
        403,
        "account_deletion_pending",
        "Your account is being deleted. Keep it to book or publish again.",
      );
    case "invalid_part":
      return invalid(
        c,
        error.end === "board" ? "fromStop" : "toStop",
        "invalid_part",
        "Choose two stops of the trip, in order.",
      );
    case "invalid_seats":
      return invalid(c, "seats", "invalid", "Choose at least one seat.");
    case "message_not_allowed":
      return invalid(c, "message", "not_allowed", "Instant booking has no message.");
    case "message_too_long":
      return invalid(c, "message", "too_long", "The message is too long.");
    case "message_has_contact_details":
      return invalid(c, "message", "contact_details", "Leave contact details out of the message.");
    case "seats_taken":
      return errorResponse(c, 409, "seats_taken", "Those seats are no longer free.", {
        freeSeats: error.freeSeats,
      });
    case "price_changed":
      return errorResponse(c, 409, "price_changed", "The price has changed.", {
        total: error.total,
      });
    case "overlapping_booking":
      return errorResponse(
        c,
        409,
        "overlapping_booking",
        "You have another booking at the same time.",
      );
    case "booking_closed":
      return errorResponse(c, 409, "booking_closed", "Booking has closed for this stop.");
    case "trip_not_bookable":
      return errorResponse(c, 409, "trip_not_bookable", "This trip cannot be booked.");
    case "stops_changed":
      return errorResponse(
        c,
        409,
        "stops_changed",
        "The trip's stops have changed. Choose the part again.",
      );
  }
}

const bookingNotFound = (c: Context) =>
  errorResponse(c, 404, "not_found", "There is no such booking of yours, or on your trip.");

function answerError(c: Context, error: AnswerError | AcceptError) {
  switch (error.code) {
    case "not_found":
      return bookingNotFound(c);
    case "booking_not_requested":
      return errorResponse(c, 409, "booking_not_requested", "The booking is no longer a request.");
    case "account_suspended":
      return accountSuspended(c, error);
  }
}

function cancelError(c: Context, error: CancelError | PreviewError) {
  switch (error.code) {
    case "not_found":
      return bookingNotFound(c);
    case "booking_not_cancellable":
      return errorResponse(
        c,
        409,
        "booking_not_cancellable",
        "Only an accepted or confirmed booking can be cancelled, until the time to get in.",
      );
    case "reason_not_offered":
      return invalid(c, "reason", "not_offered", "Choose one of the reasons offered to you.");
    case "note_not_offered":
      return invalid(c, "note", "not_offered", "Only the driver writes a note.");
    case "note_too_long":
      return invalid(c, "note", "too_long", "The note is too long.");
    case "note_has_contact_details":
      return invalid(c, "note", "contact_details", "Leave contact details out of the note.");
    case "terms_changed":
      return errorResponse(c, 409, "terms_changed", "What cancelling does has changed.", {
        terms: error.terms,
      });
  }
}

function cancelTripError(c: Context, error: CancelTripError) {
  switch (error.code) {
    case "not_found":
      return errorResponse(c, 404, "not_found", "There is no such trip of yours.");
    case "trip_not_cancellable":
      return errorResponse(
        c,
        409,
        "trip_not_cancellable",
        "Only a published trip can be cancelled, until its planned departure.",
      );
    case "terms_changed":
      return errorResponse(c, 409, "terms_changed", "What cancelling does has changed.", {
        countsOnReliability: error.countsOnReliability,
      });
    case "note_too_long":
      return invalid(c, "note", "too_long", "The note is too long.");
    case "note_has_contact_details":
      return invalid(c, "note", "contact_details", "Leave contact details out of the note.");
  }
}

/**
 * The booking routes, and cancelling a trip, which cancels its bookings;
 * `trips` shows the cancelled trip as its driver sees it.
 */
export function registerBookingRoutes(
  app: OpenAPIHono<AppEnv>,
  service: BookingService,
  requireAuth: MiddlewareHandler,
  trips: Pick<TripService, "myTrip">,
): void {
  app.openapi(toOpenApiRoute(cancelTripRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", cancelTripRoute.request.params);
    const body = validated(c, "json", cancelTripRoute.request.body);
    const { userId } = authOf(c);
    const result = await service.cancelTrip(userId, id, body);
    if (!result.ok) return cancelTripError(c, result.error);
    const trip = await trips.myTrip(userId, id);
    if (trip === undefined) throw new Error("The cancelled trip was not found.");
    return c.json(trip, 200);
  });

  app.openapi(toOpenApiRoute(bookTripRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", bookTripRoute.request.params);
    const body = validated(c, "json", bookTripRoute.request.body);
    const result = await service.book(authOf(c).userId, id, body);
    if (!result.ok) return bookError(c, result.error);
    return c.json(result.value.booking, result.value.created ? 201 : 200);
  });

  app.openapi(toOpenApiRoute(myBookingsRoute, requireAuth), async (c) => {
    const { when } = validated(c, "query", myBookingsRoute.request.query);
    return c.json({ bookings: await service.myBookings(authOf(c).userId, when) }, 200);
  });

  app.openapi(toOpenApiRoute(bookingRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", bookingRoute.request.params);
    const booking = await service.booking(authOf(c).userId, id);
    return booking === undefined ? bookingNotFound(c) : c.json(booking, 200);
  });

  app.openapi(toOpenApiRoute(withdrawRequestRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", withdrawRequestRoute.request.params);
    validated(c, "json", withdrawRequestRoute.request.body);
    const result = await service.withdraw(authOf(c).userId, id);
    return result.ok ? c.json(result.value, 200) : answerError(c, result.error);
  });

  app.openapi(toOpenApiRoute(cancellationPreviewRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", cancellationPreviewRoute.request.params);
    const result = await service.cancellationPreview(authOf(c).userId, id);
    return result.ok ? c.json(result.value, 200) : cancelError(c, result.error);
  });

  app.openapi(toOpenApiRoute(cancelBookingRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", cancelBookingRoute.request.params);
    const body = validated(c, "json", cancelBookingRoute.request.body);
    const result = await service.cancel(authOf(c).userId, id, body);
    return result.ok ? c.json(result.value, 200) : cancelError(c, result.error);
  });

  app.openapi(toOpenApiRoute(acceptRequestRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", acceptRequestRoute.request.params);
    validated(c, "json", acceptRequestRoute.request.body);
    const result = await service.accept(authOf(c).userId, id);
    return result.ok ? c.json(result.value, 200) : answerError(c, result.error);
  });

  app.openapi(toOpenApiRoute(declineRequestRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", declineRequestRoute.request.params);
    const { reason } = validated(c, "json", declineRequestRoute.request.body);
    const result = await service.decline(authOf(c).userId, id, reason);
    return result.ok ? c.json(result.value, 200) : answerError(c, result.error);
  });

  app.openapi(toOpenApiRoute(tripBookingsRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", tripBookingsRoute.request.params);
    const found = await service.tripBookings(authOf(c).userId, id);
    return found === undefined
      ? errorResponse(c, 404, "not_found", "There is no such published trip of yours.")
      : c.json(found, 200);
  });
}
