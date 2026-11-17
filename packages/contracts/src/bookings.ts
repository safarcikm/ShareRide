import {
  arrivals,
  bookingModes,
  bookingStatuses,
  cancelReasons,
  carColours,
  dayPhases,
  declineReasons,
  defaultTripSettings,
  noteMaxLength,
} from "@shareride/domain";
import { z } from "zod";
import { cancellationTermsSchema, moneySchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { localisedTextSchema, meetingPointSummarySchema } from "./meeting-points.ts";
import { bookingReviewSchema } from "./reviews.ts";
import { peopleColourSchema, yearMonthSchema } from "./people.ts";
import { defineRoute } from "./route.ts";
import { disputeSchema } from "./trip-day.ts";

// Booking and requests (spec 5): a passenger books or requests seats on a
// part of a trip; the driver decides on requests; both see their bookings.
// Cancelling a booking (spec 6, 3.4 and 3.5).

/** A car as passengers see it: make, model and colour, never its number plate. */
export const carSummarySchema = z.object({
  make: z.string(),
  model: z.string(),
  colour: z.enum(carColours),
});

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "unauthenticated", ...errors } as const;
const notFound = {
  description: "not_found: no such booking of yours, or on your trip",
  ...errors,
} as const;

/** A request's message is checked by the domain (300 characters, R5.6); this only bounds the body. */
const maxMessageInRequest = 2000;

export const bookTripBodySchema = z.object({
  /** Stop positions on the trip, as trip details gives them. */
  fromStop: z.int().nonnegative(),
  toStop: z.int().positive(),
  /**
   * The meeting points shown at those positions. When sent, a trip whose
   * stops changed since (a stop added, spec 6, 3.2) gives `stops_changed`.
   */
  fromPoint: z.uuid().optional(),
  toPoint: z.uuid().optional(),
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
  /**
   * A cancelled request the passenger withdrew before the driver answered,
   * which never counts against them (R5.8); false for every other booking.
   */
  withdrawn: z.boolean(),
  /**
   * A cancelled booking's cancellation (spec 6), and a request declined
   * because the driver cancelled the trip (3.3); null for any other, and for
   * a withdrawn request.
   */
  cancellation: z
    .object({
      by: z.enum(["passenger", "driver", "operator"]),
      /** Null when the operator cancelled. */
      reason: z.enum(cancelReasons).nullable(),
      /** The driver's note to the passenger, as written; empty for none (spec 6, 3.3 and 3.4). */
      note: z.string(),
      /** The driver cancelled the whole trip (spec 6, 3.3), not this booking alone. */
      wholeTrip: z.boolean(),
      /** What went back to the passenger (rule M2): all they paid, or nothing. */
      refund: moneySchema,
      /** Whether it shows on the viewer's profile, for their own cancellation; null for the other person's. */
      countsOnReliability: z.boolean().nullable(),
    })
    .nullable(),
  /**
   * The trip's changes since the booking was made, oldest first (spec 6,
   * 3.2): for a moved departure, the passenger's boarding time before and
   * after; for a new car, the car; for a new stop, its name and time; for
   * a stop removed, its name.
   */
  changes: z.array(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("departure"),
        from: timestampSchema,
        to: timestampSchema,
        changedAt: timestampSchema,
      }),
      z.object({ kind: z.literal("vehicle"), car: carSummarySchema, changedAt: timestampSchema }),
      z.object({
        kind: z.literal("addStop"),
        stop: localisedTextSchema,
        plannedAt: timestampSchema,
        changedAt: timestampSchema,
      }),
      z.object({
        kind: z.literal("removeStop"),
        stop: localisedTextSchema,
        changedAt: timestampSchema,
      }),
    ]),
  ),
  /**
   * The departure is more than 30 minutes from where it was when the
   * booking was made, so a confirmed passenger may cancel with a full
   * refund, without it counting against them (R6.3).
   */
  movedFar: z.boolean(),
  /**
   * A problem with this booking can still be reported: it ran or is to run
   * (confirmed, completed or no-show), until 24 hours after its trip
   * completed (R9.1).
   */
  problemReportable: z.boolean(),
  /** `firstName` is null for a former member, whose data was erased (spec 11, 3.5). */
  driver: z.object({ firstName: z.string().nullable(), colour: peopleColourSchema }),
  /** Ratings and reliability come with spec 8; until then every member is new. */
  passenger: z.object({
    /** Null for a former member, whose data was erased (spec 11, 3.5). */
    firstName: z.string().nullable(),
    colour: peopleColourSchema,
    /** The year and month they joined. */
    memberSince: yearMonthSchema,
  }),
  car: carSummarySchema.nullable(),
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
  /**
   * The trip day at the passenger's boarding stop (spec 8, 3.1 and 3.2), for
   * a booking that is confirmed, or since completed or a no-show; null for
   * any other.
   */
  tripDay: z
    .object({
      /** From 3 hours before boarding until the trip completes. */
      phase: z.enum(dayPhases),
      /** "I'm here" at the boarding stop opens and closes at these times (R8.3). */
      checkInOpensAt: timestampSchema,
      checkInClosesAt: timestampSchema,
      /** When the passenger said "I'm here" there; null until then. */
      passengerCheckedInAt: timestampSchema.nullable(),
      /** When the driver said "I'm here" there; null until then. */
      driverCheckedInAt: timestampSchema.nullable(),
      /**
       * From then on, 10 minutes after the boarding time, the driver can mark
       * a no-show (R8.4) and the passenger can say the driver didn't come
       * (R8.5).
       */
      reportOpensAt: timestampSchema,
      /** A no-show can be marked until then, when the trip completes, and not at it. */
      noShowClosesAt: timestampSchema,
      /** "The driver didn't come" until then, 24 hours after the trip completes. */
      driverAbsentClosesAt: timestampSchema,
      /**
       * Whether the passenger is at their stop, as the driver sees it on the
       * trip day; after it, the status says how the ride went.
       */
      arrival: z.enum(arrivals),
    })
    .nullable(),
  /**
   * The report on this booking (spec 8, 3.3 to 3.5): a no-show the driver
   * marked or "The driver didn't come", once one is made; null with none.
   */
  dispute: disputeSchema.nullable(),
  /**
   * Its reviews (spec 8, 3.7), for a completed booking; null for any other,
   * as only completed bookings are reviewed (R8.8).
   */
  review: bookingReviewSchema.nullable(),
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
        "account_incomplete: verify the phone number and accept the current terms first (R5.1); own_trip; account_deletion_pending: the passenger is deleting their account (spec 11, 3.4)",
      ...errors,
    },
    404: { description: "not_found: no such published trip", ...errors },
    409: {
      description:
        "seats_taken (with `freeSeats`), price_changed (with the current `total`), stops_changed (`fromPoint` or `toPoint` is no longer at its position), overlapping_booking, booking_closed or trip_not_bookable",
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

export type CancellationTerms = z.infer<typeof cancellationTermsSchema>;

export const cancellationPreviewSchema = z.object({
  /**
   * The reasons the viewer can give, in the order to offer them, each with
   * what cancelling for it does now: weather and road closures never count
   * (R6.7, R6.8).
   */
  reasons: z.array(cancellationTermsSchema.extend({ reason: z.enum(cancelReasons) })),
});

export type CancellationPreview = z.infer<typeof cancellationPreviewSchema>;

const notCancellable = {
  description:
    "booking_not_cancellable: only an accepted or confirmed booking can be cancelled; a request is withdrawn instead",
  ...errors,
} as const;

export const cancellationPreviewRoute = defineRoute({
  method: "get",
  path: "/v1/bookings/{id}/cancellation-preview",
  summary:
    "The reasons to choose from, each with the refund and reliability effect of cancelling now",
  tags: ["bookings"],
  auth: true,
  request: { params: bookingParams },
  responses: {
    200: { description: "What cancelling now does", schema: cancellationPreviewSchema },
    401: unauthenticated,
    404: notFound,
    409: notCancellable,
  },
});

export const cancelBookingBodySchema = z.object({
  reason: z.enum(cancelReasons),
  /** The driver's note to the passenger (spec 6, 3.4); a passenger gives none. */
  // Twice the limit, as the API counts characters as the database does (code points).
  note: z
    .string()
    .max(noteMaxLength * 2)
    .optional(),
  /** The terms the person was shown; others give `terms_changed`, with the terms now. */
  terms: cancellationTermsSchema,
});

export type CancelBookingBody = z.input<typeof cancelBookingBodySchema>;

export const cancelBookingRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/cancel",
  summary:
    "The passenger or the driver cancels a booking: the seats are freed, the refund starts and the other is told (spec 6, 3.4 and 3.5)",
  tags: ["bookings"],
  auth: true,
  request: { params: bookingParams, body: cancelBookingBodySchema },
  responses: {
    200: {
      description: "The cancelled booking; asked again, the same booking, refunded once",
      schema: bookingSchema,
    },
    400: {
      description:
        "validation_failed: a reason not offered to you (details name `reason`), or a note from the passenger, over 500 characters or with contact details (`note`)",
      ...errors,
    },
    401: unauthenticated,
    404: notFound,
    409: {
      description:
        "booking_not_cancellable; terms_changed (with the current `refund` and `countsOnReliability`), as a time limit passed or the trip moved since the preview",
      ...errors,
    },
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
