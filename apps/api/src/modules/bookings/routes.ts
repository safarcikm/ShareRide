import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  acceptRequestRoute,
  bookingRoute,
  bookTripRoute,
  declineRequestRoute,
  myBookingsRoute,
  tripBookingsRoute,
  withdrawRequestRoute,
} from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { AnswerError, BookError, BookingService } from "./service.ts";

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
  }
}

const bookingNotFound = (c: Context) =>
  errorResponse(c, 404, "not_found", "There is no such booking of yours, or on your trip.");

function answerError(c: Context, error: AnswerError) {
  return error.code === "not_found"
    ? bookingNotFound(c)
    : errorResponse(c, 409, "booking_not_requested", "The booking is no longer a request.");
}

export function registerBookingRoutes(
  app: OpenAPIHono<AppEnv>,
  service: BookingService,
  requireAuth: MiddlewareHandler,
): void {
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
