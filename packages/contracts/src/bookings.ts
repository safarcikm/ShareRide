import {
  bookingModes,
  bookingStatuses,
  carColours,
  declineReasons,
  defaultTripSettings,
  peopleColourCount,
} from "@shareride/domain";
import { z } from "zod";
import { moneySchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { localisedTextSchema, meetingPointSummarySchema } from "./meeting-points.ts";
import { defineRoute } from "./route.ts";

// Booking and requests (spec 5): a passenger books or requests seats on a
// part of a trip; the driver decides on requests; both see their bookings.

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "unauthenticated", ...errors } as const;
const notFound = {
  description: "not_found: no such booking of yours, or on your trip",
  ...errors,
} as const;
const peopleColourSchema = z
  .int()
  .min(0)
  .max(peopleColourCount - 1);

/** A request's message is checked by the domain (300 characters, R5.6); this only bounds the body. */
const maxMessageInRequest = 2000;

export const bookTripBodySchema = z.object({
  /** Stop positions on the trip, as trip details gives them. */
  fromStop: z.int().nonnegative(),
  toStop: z.int().positive(),
  seats: z.int().min(1).max(defaultTripSettings.maxSeats),
  /** The total the passenger was shown; another total gives `price_changed` (R5.3). */
  total: moneySchema,
  /** To the driver with a request; empty for none, and always empty for instant booking. */
  message: z.string().max(maxMessageInRequest).default(""),
  /** One per attempt: a retry with the same key gets the same booking (R5.4). */
  attemptKey: z.uuid(),
});

export type BookTripBody = z.input<typeof bookTripBodySchema>;

const bookingStopSchema = z.object({
  position: z.int().nonnegative(),
  meetingPoint: meetingPointSummarySchema,
  plannedAt: timestampSchema,
});

/**
 * A booking as its passenger or the trip's driver sees it. Nobody sees a
 * phone number; the decline reason stays with the operator (R5.7).
 */
export const bookingSchema = z.object({
  id: z.uuid(),
  /** As of now: a request or unpaid booking past its deadline reads as expired. */
  status: z.enum(bookingStatuses),
  /** Whose view this is. */
  viewer: z.enum(["passenger", "driver"]),
  trip: z.object({ id: z.uuid(), bookingMode: z.enum(bookingModes) }),
  board: bookingStopSchema,
  alight: bookingStopSchema,
  seats: z.int().positive(),
  /** The price snapshot for every seat (rule P1, R5.3). */
  total: moneySchema,
  /** The passenger's message with a request; empty for none. */
  message: z.string(),
  createdAt: timestampSchema,
  /**
   * When the driver must answer a request by (R5.5); on an expired request,
   * the deadline that passed.
   */
  requestExpiresAt: timestampSchema.nullable(),
  /**
   * When an accepted booking must be paid by (rule M1); on a booking that
   * expired unpaid, the deadline that passed.
   */
  paymentDueAt: timestampSchema.nullable(),
  driver: z.object({ firstName: z.string(), colour: peopleColourSchema }),
  /** Ratings and reliability come with spec 8; until then every member is new. */
  passenger: z.object({
    firstName: z.string(),
    colour: peopleColourSchema,
    /** The year and month they joined, such as 2026-11. */
    memberSince: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  }),
  car: z.object({ make: z.string(), model: z.string(), colour: z.enum(carColours) }).nullable(),
  /**
   * Only once the booking is confirmed (R5.12): the number plate, if added
   * yet, and where to stand at the boarding stop.
   */
  confirmed: z
    .object({
      registration: z.string().nullable(),
      whereToStand: localisedTextSchema.nullable(),
    })
    .nullable(),
});

export type Booking = z.infer<typeof bookingSchema>;

const bookingParams = z.object({ id: z.uuid() });

export const bookTripRoute = defineRoute({
  method: "post",
  path: "/v1/trips/{id}/bookings",
  summary: "Book seats on a part of a trip, or request them (spec 5, 3.2)",
  tags: ["bookings"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: bookTripBodySchema },
  responses: {
    200: { description: "The booking this attempt key already made", schema: bookingSchema },
    201: {
      description:
        "Requested (approval), accepted and awaiting payment (instant), or confirmed (free and instant)",
      schema: bookingSchema,
    },
    400: {
      description:
        "validation_failed: a part that does not run forwards (details name `fromStop` or `toStop`), the seats, or the message (`too_long`, `contact_details` or `not_allowed` with instant booking)",
      ...errors,
    },
    401: unauthenticated,
    403: {
      description:
        "account_incomplete: verify the phone number and accept the current terms first (R5.1); own_trip",
      ...errors,
    },
    404: { description: "not_found: no such published trip", ...errors },
    409: {
      description:
        "seats_taken (with `freeSeats`), price_changed (with the current `total`), overlapping_booking, booking_closed or trip_not_bookable",
      ...errors,
    },
  },
});

export const myBookingsQuerySchema = z.object({ when: z.enum(["upcoming", "past"]) });

export const myBookingsRoute = defineRoute({
  method: "get",
  path: "/v1/me/bookings",
  summary:
    "My bookings: upcoming (requested, awaiting payment, confirmed) soonest first, or past, latest first",
  tags: ["bookings"],
  auth: true,
  request: { query: myBookingsQuerySchema },
  responses: {
    200: { description: "My bookings", schema: z.object({ bookings: z.array(bookingSchema) }) },
    401: unauthenticated,
  },
});

export const bookingRoute = defineRoute({
  method: "get",
  path: "/v1/bookings/{id}",
  summary: "A booking, for its passenger or the trip's driver",
  tags: ["bookings"],
  auth: true,
  request: { params: bookingParams },
  responses: {
    200: { description: "The booking", schema: bookingSchema },
    401: unauthenticated,
    404: notFound,
  },
});

const notRequested = {
  description: "booking_not_requested: no longer a request (answered, withdrawn or expired)",
  ...errors,
} as const;

export const withdrawRequestRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/withdraw",
  summary: "The passenger withdraws a request; it never counts against them (R5.8)",
  tags: ["bookings"],
  auth: true,
  request: { params: bookingParams, body: z.object({}) },
  responses: {
    200: { description: "The withdrawn booking", schema: bookingSchema },
    401: unauthenticated,
    404: notFound,
    409: notRequested,
  },
});

export const acceptRequestRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/accept",
  summary: "The driver accepts a request; the passenger pays next, or a free ride is confirmed",
  tags: ["bookings"],
  auth: true,
  request: { params: bookingParams, body: z.object({}) },
  responses: {
    200: { description: "The accepted booking", schema: bookingSchema },
    401: unauthenticated,
    404: notFound,
    409: notRequested,
  },
});

export const declineRequestRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/decline",
  summary: "The driver declines a request, with a reason only the operator sees (R5.7)",
  tags: ["bookings"],
  auth: true,
  request: {
    params: bookingParams,
    body: z.object({ reason: z.enum(declineReasons).nullable().default(null) }),
  },
  responses: {
    200: { description: "The declined booking", schema: bookingSchema },
    401: unauthenticated,
    404: notFound,
    409: notRequested,
  },
});

export const tripBookingsSchema = z.object({
  /** Requests first, oldest first; then bookings, by where passengers get in. */
  bookings: z.array(bookingSchema),
  /** Seats held on each stretch, from the first stop on (rule S1). */
  segments: z.array(
    z.object({ position: z.int().nonnegative(), occupancy: z.int().nonnegative() }),
  ),
  capacity: z.int().positive(),
});

export type TripBookings = z.infer<typeof tripBookingsSchema>;

export const tripBookingsRoute = defineRoute({
  method: "get",
  path: "/v1/me/trips/{id}/bookings",
  summary:
    "The requests and bookings on my trip, with the seats held on each stretch (spec 5, 3.7)",
  tags: ["bookings"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: { description: "Requests and bookings", schema: tripBookingsSchema },
    401: unauthenticated,
    404: { description: "not_found: no such published trip of mine", ...errors },
  },
});
