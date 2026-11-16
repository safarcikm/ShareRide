import {
  bookingModes,
  chatOptions,
  defaultTripSettings,
  luggageOptions,
  noteMaxLength,
  petOptions,
  smokingOptions,
  tripCancelReasons,
} from "@shareride/domain";
import { z } from "zod";
import { moneySchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { dateSchema, meetingPointSummarySchema } from "./meeting-points.ts";
import { defineRoute } from "./route.ts";

const unauthenticated = { description: "unauthenticated", schema: errorResponseSchema } as const;

/** Trips have no stop limit (spec 3, decision 6); this only bounds a request. */
const maxStopsInRequest = 100;

/**
 * A point is on the way when going through it adds at most 5% and at most
 * 3 km to the direct distance (spec 3, 3.4.2). Only active points; with a
 * date, only those in season then.
 */
export const stopsAlongRoute = defineRoute({
  method: "get",
  path: "/v1/routes/stops-along",
  summary: "The meeting points on the way between two others, in route order",
  tags: ["trips"],
  auth: true,
  request: {
    query: z.object({ from: z.uuid(), to: z.uuid(), date: dateSchema.optional() }),
  },
  responses: {
    200: {
      description: "The points between, without the two ends",
      schema: z.object({ meetingPoints: z.array(meetingPointSummarySchema) }),
    },
    400: {
      description:
        "validation_failed: the same point twice; stop_unavailable: a point not in use (details name it)",
      schema: errorResponseSchema,
    },
    401: unauthenticated,
    503: {
      description: "distances_pending: the distances are being worked out; try again soon",
      schema: errorResponseSchema,
    },
  },
});

export const quoteRequestSchema = z.object({
  /** Meeting point IDs in route order, from the first stop to the last. */
  stops: z.array(z.uuid()).min(2).max(maxStopsInRequest),
  /**
   * A point the driver adds: it goes between the two stops where it adds the
   * least distance (spec 3, 3.4.3), and the quote's `stops` show where.
   */
  add: z.uuid().optional(),
  seats: z.int().min(1).max(defaultTripSettings.maxSeats),
  /** Percent of the suggested prices; 100 when left out (rule P4). */
  priceLevel: z.int().min(0).optional(),
  /** Departure from the first stop; planned times and time checks need it. */
  departure: timestampSchema.optional(),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const quoteSchema = z.object({
  /** The stops quoted, in route order: those asked for, with an added one in its place. */
  stops: z.array(z.uuid()),
  /** One per stretch between two stops; prices are per seat. */
  segments: z.array(
    z.object({
      from: z.uuid(),
      to: z.uuid(),
      distanceM: z.int().nonnegative(),
      /** Typical driving time. */
      durationS: z.int().nonnegative(),
      suggestedPrice: moneySchema,
      cap: moneySchema,
      price: moneySchema,
    }),
  ),
  distanceM: z.int().nonnegative(),
  durationS: z.int().nonnegative(),
  directDistanceM: z.int().nonnegative(),
  /** The level the prices use: the one asked for, or the highest allowed if that was higher. */
  priceLevel: z.int().nonnegative(),
  highestPriceLevel: z.int().nonnegative(),
  priceLevelStep: z.int().positive(),
  /** What a passenger for the whole route pays for one seat. */
  wholeRoutePrice: moneySchema,
  /** One per stop, from the typical times; null without a departure. */
  plannedTimes: z.array(timestampSchema).nullable(),
  /** Rules the trip would break (R3.2, R3.4 to R3.6); it cannot be published so. */
  problems: z.array(
    z.object({
      code: z.enum([
        "too_few_stops",
        "stop_repeated",
        "route_too_long",
        "stop_out_of_season",
        "times_missing",
        "departure_too_soon",
        "departure_too_far",
        "times_not_increasing",
        "stretch_too_fast",
      ]),
      /** The stop's position in `stops`, where the problem is about one. */
      stop: z.int().nonnegative().optional(),
      /** The stretch's position in `segments`, where the problem is about one. */
      segment: z.int().nonnegative().optional(),
    }),
  ),
  /** Allowed, but worth telling the driver. */
  warnings: z.array(
    z.discriminatedUnion("code", [
      /** A stop adds more than 20% and 20 km to the stretch between its neighbours. */
      z.object({
        code: z.literal("stop_adds_distance"),
        stop: z.int().nonnegative(),
        addedM: z.int().nonnegative(),
      }),
      /** The level asked for was above the highest for these seats (spec 3, 3.6.4). */
      z.object({ code: z.literal("price_level_lowered") }),
    ]),
  ),
});

export type Quote = z.infer<typeof quoteSchema>;

/**
 * For stops in order, seats, a price level and a departure: each stretch's
 * distance, typical time and price (rules P2 to P4), the highest level,
 * planned times, and what is wrong or worth a warning.
 */
export const quoteRoute = defineRoute({
  method: "post",
  path: "/v1/routes/quote",
  summary: "Distances, typical times, prices and checks for a route",
  tags: ["trips"],
  auth: true,
  request: { body: quoteRequestSchema },
  responses: {
    200: { description: "The quote", schema: quoteSchema },
    400: {
      description:
        "validation_failed, price_level_invalid (not a whole step), or stop_unavailable (details name the stop, `stops.N` or `add`)",
      schema: errorResponseSchema,
    },
    401: unauthenticated,
    503: {
      description: "distances_pending: the distances are being worked out; try again soon",
      schema: errorResponseSchema,
    },
  },
});

/** Luggage, pets, smoking, child seat and chat (spec 3, 3.7.3). */
export const tripPreferencesSchema = z.object({
  luggage: z.enum(luggageOptions),
  pets: z.enum(petOptions),
  smoking: z.enum(smokingOptions),
  childSeat: z.boolean(),
  chat: z.enum(chatOptions),
});

/**
 * What a driver sets on a draft. Left out, a value stays as it is; a new
 * draft starts from the driver's previous trip (spec 3, 3.6.3 and 3.7).
 */
export const tripDraftBodySchema = z.object({
  /** Meeting point IDs in route order; each once. */
  stops: z.array(z.uuid()).min(2).max(maxStopsInRequest),
  /**
   * Departure from the first stop. The times at the other stops follow from
   * the typical driving times, again whenever the stops or departure change.
   */
  departure: timestampSchema.nullable(),
  /** One per stop, when the driver changes the planned times (spec 3, 3.5.3). */
  plannedTimes: z.array(timestampSchema).min(2).max(maxStopsInRequest),
  seats: z.int().min(1).max(defaultTripSettings.maxSeats),
  /** Percent of the suggested prices, in whole steps (rule P4). */
  priceLevel: z.int().min(0),
  bookingMode: z.enum(bookingModes),
  /** One of my cars; null for none yet. */
  vehicleId: z.uuid().nullable(),
  preferences: tripPreferencesSchema,
  /** No contact details (R3.10); checked when publishing. */
  note: z.string().max(noteMaxLength * 2),
});

export const createTripBodySchema = tripDraftBodySchema
  .partial()
  .required({ stops: true })
  .refine((body) => body.plannedTimes === undefined || body.departure === undefined, {
    message: "Give the departure or every planned time, not both.",
    path: ["plannedTimes"],
  });
export const updateTripBodySchema = tripDraftBodySchema
  .partial()
  .refine((body) => body.plannedTimes === undefined || body.departure === undefined, {
    message: "Give the departure or every planned time, not both.",
    path: ["plannedTimes"],
  });

export type TripDraftBody = z.infer<typeof updateTripBodySchema>;

/** A trip of mine, a draft, published or cancelled (spec 3; spec 6, 3.3). */
export const myTripSchema = z.object({
  id: z.uuid(),
  status: z.enum(["draft", "published", "cancelled"]),
  stops: z.array(
    z.object({
      meetingPoint: meetingPointSummarySchema,
      /** Null in a draft until the departure is chosen. */
      plannedAt: timestampSchema.nullable(),
    }),
  ),
  seats: z.int().min(1),
  priceLevel: z.int().nonnegative(),
  bookingMode: z.enum(bookingModes),
  vehicleId: z.uuid().nullable(),
  preferences: tripPreferencesSchema,
  note: z.string(),
  departsAt: timestampSchema.nullable(),
  arrivesAt: timestampSchema.nullable(),
  publishedAt: timestampSchema.nullable(),
  updatedAt: timestampSchema,
  /** A published trip's stretches with their prices for new bookings; empty for a draft. */
  segments: z.array(
    z.object({
      distanceM: z.int().nonnegative(),
      durationS: z.int().nonnegative(),
      suggestedPrice: moneySchema,
      cap: moneySchema,
      price: moneySchema,
      /** Seats bookings hold on this stretch now (rule S1), for the seats booked and free. */
      seatsTaken: z.int().nonnegative(),
    }),
  ),
  /** Requests waiting for the driver's answer, their deadline still to come (spec 5, 3.3). */
  openRequests: z.int().nonnegative(),
  /** The first deadline among those requests, for "Answer by" (spec 16, 3.3); null for none. */
  requestsCloseAt: timestampSchema.nullable(),
  /** Why the driver cancelled it, with their note; null unless cancelled (spec 6, 3.3). */
  cancellation: z
    .object({
      reason: z.enum(tripCancelReasons),
      note: z.string(),
      /** Once for the trip (R6.7; spec 8, 3.8). */
      countsOnReliability: z.boolean(),
    })
    .nullable(),
});

export type MyTrip = z.infer<typeof myTripSchema>;

const tripParams = z.object({ id: z.uuid() });
const errors = { schema: errorResponseSchema } as const;
const draftInvalid = {
  description:
    "validation_failed (a stop twice, planned times not one per stop), stop_unavailable (details name the stop) or vehicle_unavailable",
  ...errors,
} as const;
const notMine = { description: "not_found: no such trip of mine", ...errors } as const;
const notDraft = { description: "trip_not_draft: already published", ...errors } as const;
const distancesPending = {
  description: "distances_pending: the distances are being worked out; try again soon",
  ...errors,
} as const;

/**
 * Upcoming (the default): drafts, then published trips whose last stop is
 * still to come, a trip under way included. Past: published trips whose
 * last stop has passed (spec 16, section 6).
 */
export const myTripsQuerySchema = z.object({
  when: z.enum(["upcoming", "past"]).default("upcoming"),
});

export const myTripsRoute = defineRoute({
  method: "get",
  path: "/v1/me/trips",
  summary:
    "My trips: upcoming, my drafts most recently changed first then my published trips soonest first, or past (ended or cancelled), latest first",
  tags: ["trips"],
  auth: true,
  request: { query: myTripsQuerySchema },
  responses: {
    200: { description: "My trips", schema: z.object({ trips: z.array(myTripSchema) }) },
    401: unauthenticated,
  },
});

export const myTripRoute = defineRoute({
  method: "get",
  path: "/v1/me/trips/{id}",
  summary: "One of my trips",
  tags: ["trips"],
  auth: true,
  request: { params: tripParams },
  responses: {
    200: { description: "The trip", schema: myTripSchema },
    401: unauthenticated,
    404: notMine,
  },
});

export const createTripRoute = defineRoute({
  method: "post",
  path: "/v1/trips",
  summary: "Start a draft from a route",
  tags: ["trips"],
  auth: true,
  request: { body: createTripBodySchema },
  responses: {
    201: { description: "The draft", schema: myTripSchema },
    400: draftInvalid,
    401: unauthenticated,
    503: distancesPending,
  },
});

export const updateTripRoute = defineRoute({
  method: "patch",
  path: "/v1/trips/{id}",
  summary: "Change a draft",
  tags: ["trips"],
  auth: true,
  request: { params: tripParams, body: updateTripBodySchema },
  responses: {
    200: { description: "The draft", schema: myTripSchema },
    400: draftInvalid,
    401: unauthenticated,
    404: notMine,
    409: notDraft,
    503: distancesPending,
  },
});

export const deleteTripRoute = defineRoute({
  method: "delete",
  path: "/v1/trips/{id}",
  summary: "Delete a draft",
  tags: ["trips"],
  auth: true,
  request: { params: tripParams },
  responses: {
    204: { description: "Deleted" },
    401: unauthenticated,
    404: notMine,
    409: notDraft,
  },
});

/**
 * Runs every check of spec 3, section 4, again with the server's legs,
 * settings and clock, and publishes the draft. Each broken rule is a
 * detail: its code as the issue, and the stop (`stops.N`), stretch
 * (`segments.N`) or field it is about as the path.
 */
export const publishTripRoute = defineRoute({
  method: "post",
  path: "/v1/trips/{id}/publish",
  summary: "Publish a draft",
  tags: ["trips"],
  auth: true,
  // An empty JSON body: every POST is JSON, which keeps other sites out.
  request: { params: tripParams, body: z.object({}) },
  responses: {
    200: { description: "The published trip", schema: myTripSchema },
    401: unauthenticated,
    404: notMine,
    409: notDraft,
    422: { description: "trip_not_publishable: what to fix, in details", ...errors },
    503: distancesPending,
  },
});

/** Why the driver cancels the trip, and an optional note to everyone on it (spec 6, 3.3). */
export const cancelTripBodySchema = z.object({
  reason: z.enum(tripCancelReasons),
  // Twice the limit, as the API counts characters as the database does (code points).
  note: z
    .string()
    .max(noteMaxLength * 2)
    .optional(),
  /** What the screen showed: whether it shows on the driver's profile (R6.7). */
  countsOnReliability: z.boolean(),
});

export type CancelTripBody = z.infer<typeof cancelTripBodySchema>;

export const cancelTripRoute = defineRoute({
  method: "post",
  path: "/v1/trips/{id}/cancel",
  summary:
    "The driver cancels a published trip before it leaves: each booking is cancelled with a full refund of what was paid, requests are declined, and everyone is told (spec 6, 3.3)",
  tags: ["trips"],
  auth: true,
  request: { params: tripParams, body: cancelTripBodySchema },
  responses: {
    200: { description: "The cancelled trip; asked again, the same trip", schema: myTripSchema },
    400: {
      description: "validation_failed: a note over 500 characters or with contact details (`note`)",
      ...errors,
    },
    401: unauthenticated,
    404: {
      ...errors,
      description: "not_found: no such trip of mine, or a draft (deleted instead)",
    },
    409: {
      description:
        "trip_not_cancellable: the planned departure has come; terms_changed (with `countsOnReliability` now): someone paid or left since the screen showed it",
      ...errors,
    },
  },
});

/**
 * One change to a published trip, as the driver saves it from Edit trip
 * (spec 6, 3.2): a new departure, which every stop moves with (R6.2); the
 * seats offered; the price level, for new bookings; the booking mode; or
 * the preferences and note together; another of the driver's cars, or a
 * stop, which booked passengers are told of. Removing a stop follows in
 * milestone 6's PR 6b.
 */
export const tripChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("departure"), departsAt: timestampSchema }),
  z.object({ kind: z.literal("seats"), seats: z.int().min(1).max(defaultTripSettings.maxSeats) }),
  /** A level the seats allow (rule P4), or 422 `price_level_invalid`. */
  z.object({ kind: z.literal("priceLevel"), priceLevel: z.int().min(0) }),
  z.object({ kind: z.literal("bookingMode"), bookingMode: z.enum(bookingModes) }),
  /** One of my cars, not removed, or 422 `car_missing`. */
  z.object({ kind: z.literal("vehicle"), vehicleId: z.uuid() }),
  z.object({
    kind: z.literal("details"),
    preferences: tripPreferencesSchema,
    /** Characters are counted as code points by the rules (422 `note_too_long`). */
    note: z.string().max(noteMaxLength * 2),
  }),
  /**
   * An active meeting point, in season and not on the trip, which goes
   * where it adds the least distance (spec 3, 3.4.3) at a time between its
   * neighbours, which keep theirs; or 422 with why.
   */
  z.object({ kind: z.literal("addStop"), meetingPointId: z.uuid() }),
]);

export type TripChangeBody = z.infer<typeof tripChangeSchema>;

/** What a change does, before it is saved (a preview) or once it is. */
export const tripChangeEffectSchema = z.object({
  /** The trip's departure and arrival as they will be. */
  departsAt: timestampSchema,
  arrivesAt: timestampSchema,
  /** Each stop's meeting point as it will be, in route order. */
  stops: z.array(z.uuid()),
  /** Each stop's planned time as it will be, in route order. */
  plannedTimes: z.array(timestampSchema),
  /** The passengers told: accepted and confirmed bookings (spec 7, 3.3). */
  told: z.int().nonnegative(),
  /**
   * Of those, the ones who paid and may now cancel with a full refund,
   * without it counting against them: the departure is more than 30
   * minutes from when they booked (R6.3), by this change or an earlier one.
   */
  freeCancellations: z.int().nonnegative(),
  /** Requests waiting for the driver, not told; they see the change on the trip (spec 7, 3.3). */
  requests: z.int().nonnegative(),
  /**
   * Requests whose deadline to answer, worked out again from the new boarding
   * time (R5.5), has passed: they expire with the change.
   */
  expiring: z.int().nonnegative(),
  /** The seats offered as they will be. */
  seats: z.int().positive(),
  /** The price level as it will be: more seats may lower it (rule P4). */
  priceLevel: z.int().nonnegative(),
  /** More seats lowered the price level to the highest they allow (spec 3, 3.6.4). */
  priceLevelLowered: z.boolean(),
  /**
   * Each stretch's price per seat for new bookings, as it will be; bookings
   * keep the prices they booked at (rule P1).
   */
  prices: z.array(moneySchema),
});

export type TripChangeEffect = z.infer<typeof tripChangeEffectSchema>;

const flagSchema = z.union([z.boolean(), z.stringbool()]);

export const changeTripRoute = defineRoute({
  method: "post",
  path: "/v1/trips/{id}/changes",
  summary:
    "Change a published trip before it leaves, one change at a time; with `preview`, what the change would do, without saving it (spec 6, 3.2)",
  tags: ["trips"],
  auth: true,
  request: {
    params: tripParams,
    query: z.object({ preview: flagSchema.default(false) }),
    body: tripChangeSchema,
  },
  responses: {
    200: { description: "What the change does", schema: tripChangeEffectSchema },
    401: unauthenticated,
    404: {
      ...errors,
      description: "not_found: no such trip of mine, or a draft (changed with PATCH instead)",
    },
    409: {
      description: "trip_not_changeable: the planned departure has come, or the trip is cancelled",
      ...errors,
    },
    422: {
      description:
        "change_not_allowed: each rule the change breaks is a detail, its code as the issue and `departsAt`, `stops.N`, `segments.N`, `seats`, `priceLevel`, `vehicleId`, `meetingPointId` or `note` as the path; with `move_too_far`, `departureWindow` gives the departures the bookings allow (R6.4). A new stop that does not fit names the stretch it would split (`segments.N`)",
      ...errors,
    },
    503: distancesPending,
  },
});
