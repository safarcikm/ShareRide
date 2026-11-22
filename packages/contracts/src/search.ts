import {
  bookingModes,
  bookingStatuses,
  carColours,
  defaultTripSettings,
  partStates,
  peopleColourCount,
  timesOfDay,
} from "@shareride/domain";
import { z } from "zod";
import { moneySchema, timestampSchema } from "./common.ts";
import { accountSuspendedResponse, errorResponseSchema } from "./errors.ts";
import { dateSchema, localisedTextSchema, meetingPointSummarySchema } from "./meeting-points.ts";
import { personPhotoSchema, ratingSchema, standingSchema } from "./people.ts";
import { defineRoute } from "./route.ts";
import { tripPreferencesSchema } from "./trips.ts";

// Searching for trips (spec 4, 3.1 to 3.5). Anyone can search; a signed-in
// passenger's own trips are left out.

/** Query values arrive as text; these read them as numbers and yes or no. */
const seatsSchema = z.coerce.number<number>().int().min(1).max(defaultTripSettings.maxSeats);
const flagSchema = z.union([z.boolean(), z.stringbool()]);

export const tripSearchQuerySchema = z.object({
  /** A meeting point or a place, from the place search (spec 2). */
  from: z.uuid(),
  to: z.uuid(),
  /** The passenger's own departure day in Iceland; every upcoming trip without it (R4.3). */
  date: dateSchema.optional(),
  seats: seatsSchema.default(1),
  /** Only trips with instant booking. */
  instant: flagSchema.optional(),
  /** By the time at the boarding stop: before noon, until six, or later. */
  timeOfDay: z.enum(timesOfDay).optional(),
  /** By the time at the boarding stop, or by price and then time. */
  sort: z.enum(["departure", "price"]).default("departure"),
});

export type TripSearchQuery = z.input<typeof tripSearchQuerySchema>;

const searchStopSchema = z.object({
  /** The stop's position on the trip, to open the trip for this part. */
  position: z.int().nonnegative(),
  meetingPoint: meetingPointSummarySchema,
  plannedAt: timestampSchema,
  /**
   * How far the stop is from the meeting point searched, when it is a
   * nearby one ("Mjódd, 2.1 km from Kringlan"); null for the point itself
   * and for points inside a searched place.
   */
  nearbyM: z.int().nonnegative().nullable(),
});

/** One trip found, for the passenger's part of it (spec 4, 3.4.1). */
export const tripSearchResultSchema = z.object({
  tripId: z.uuid(),
  board: searchStopSchema,
  alight: searchStopSchema,
  /** The whole trip's first and last stops, as "Reykjavík → Akureyri". */
  tripFrom: localisedTextSchema,
  tripTo: localisedTextSchema,
  /** For one seat, and for the seats searched (rule P1); prices as they are now (R4.4). */
  pricePerSeat: moneySchema,
  total: moneySchema,
  /** Seats free on every stretch of the part (rule S3). */
  freeSeats: z.int().nonnegative(),
  /** The rating, or a new driver before the first (spec 4, 3.4.1), and their photo (spec 1). */
  driver: z.object({ firstName: z.string(), rating: ratingSchema, photo: personPhotoSchema }),
  bookingMode: z.enum(bookingModes),
});

export type TripSearchResult = z.infer<typeof tripSearchResultSchema>;

const searchErrors = {
  400: {
    description: "validation_failed: the same place twice, or a bad value (details name it)",
    schema: errorResponseSchema,
  },
  401: {
    description: "unauthenticated: a token was sent but is not valid; refresh it or send none",
    schema: errorResponseSchema,
  },
  403: accountSuspendedResponse,
  404: {
    description: "not_found: `from` or `to` is no meeting point or place (details name it)",
    schema: errorResponseSchema,
  },
  429: {
    description: "rate_limited, with retryAfterSeconds: too many searches from this address",
    schema: errorResponseSchema,
  },
} as const;

export const tripSearchRoute = defineRoute({
  method: "get",
  path: "/v1/trips/search",
  summary: "Trips that pass through both places in order, for the passenger's part (R4.1)",
  tags: ["search"],
  auth: "optional",
  request: { query: tripSearchQuerySchema },
  responses: {
    200: {
      description: "Matching trips, sorted; trips full on the part are left out",
      schema: z.object({ results: z.array(tripSearchResultSchema) }),
    },
    ...searchErrors,
  },
});

export const tripSearchAlternativesQuerySchema = tripSearchQuerySchema.pick({
  from: true,
  to: true,
  date: true,
  seats: true,
});

/** When nothing matches (spec 4, 3.5; R4.7). */
export const tripSearchAlternativesRoute = defineRoute({
  method: "get",
  path: "/v1/trips/search/alternatives",
  summary: "Trips on the days around the date, and from or to meeting points nearby",
  tags: ["search"],
  auth: "optional",
  request: { query: tripSearchAlternativesQuerySchema },
  responses: {
    200: {
      description: "Counts on the three days either side, and trips from points within 20 km",
      schema: z.object({
        /** Empty without a date; days in order, each with the trips matching on it. */
        days: z.array(z.object({ date: dateSchema, count: z.int().nonnegative() })),
        /** Trips from or to other active points near the searched places, with distances. */
        nearby: z.array(tripSearchResultSchema),
      }),
    },
    ...searchErrors,
  },
});

/** At most this many rides leaving soon in one answer (spec 4, 3.8). */
export const soonestTripsMaxLimit = 50;

export const soonestTripsQuerySchema = z.object({
  limit: z.coerce.number<number>().int().min(1).max(soonestTripsMaxLimit).default(20),
});

/** The front page's rides (spec 4, 3.8). */
export const soonestTripsRoute = defineRoute({
  method: "get",
  path: "/v1/trips/soonest",
  summary: "The rides leaving soonest, each for its whole route and one seat",
  tags: ["search"],
  auth: "optional",
  request: { query: soonestTripsQuerySchema },
  responses: {
    200: {
      description:
        "Published trips soonest first, with booking open, a seat free on every stretch and not the caller's own",
      schema: z.object({ results: z.array(tripSearchResultSchema) }),
    },
    400: { description: "validation_failed: a limit outside 1 to 50", schema: errorResponseSchema },
    401: searchErrors[401],
    403: searchErrors[403],
    429: searchErrors[429],
  },
});

const stopPositionSchema = z.coerce.number<number>().int().min(0);

export const tripDetailsQuerySchema = z.object({
  /** Stop positions; left out, the part runs from the first stop or to the last. */
  fromStop: stopPositionSchema.optional(),
  toStop: stopPositionSchema.optional(),
  seats: seatsSchema.default(1),
});

export type TripDetailsQuery = z.input<typeof tripDetailsQuerySchema>;

/**
 * A trip opened for one part of it (spec 4, 3.6), public by link (R4.6):
 * what a passenger needs to decide, and nothing about other passengers but
 * the seats free on the part (section 7).
 */
export const tripDetailsSchema = z.object({
  id: z.uuid(),
  /**
   * Every stop in travel order; any can become the boarding or alighting
   * stop. A finished trip's points may have been retired since.
   */
  stops: z.array(
    z.object({
      position: z.int().nonnegative(),
      meetingPoint: meetingPointSummarySchema.extend({
        status: z.enum(["active", "paused", "retiring", "retired"]),
      }),
      plannedAt: timestampSchema,
    }),
  ),
  part: z.object({
    board: z.int().nonnegative(),
    alight: z.int().positive(),
    seats: z.int().positive(),
    /** Seats free on every stretch of the part (rule S3). */
    freeSeats: z.int().nonnegative(),
    /** For one seat, and for the seats asked for (rule P1); prices as they are now (R4.4). */
    pricePerSeat: moneySchema,
    total: moneySchema,
    /**
     * What the passenger can do (3.6.9): cancelled, departed (the trip has
     * passed the boarding stop), own (the signed-in driver's trip), closed
     * (past the booking cut-off), full (fewer seats free than asked for) or
     * open.
     */
    state: z.enum(partStates),
  }),
  /** Seats the driver offers on the trip (R3.9). */
  seatsOffered: z.int().positive(),
  /**
   * With their rating, and for members signed in their reliability figure
   * (spec 4, 3.6.3), null for visitors; their photo for everyone (spec 1,
   * 3.5). `colour` picks one of spec 15's five people colours, the same on
   * every trip of this driver.
   */
  driver: standingSchema.extend({
    firstName: z.string(),
    photo: personPhotoSchema,
    colour: z
      .int()
      .min(0)
      .max(peopleColourCount - 1),
    /** Their public profile, for members signed in (spec 1, 3.5); null otherwise. */
    profileId: z.uuid().nullable(),
  }),
  /** Make, model and colour; the number plate only after booking (spec 3, decision 7). */
  car: z.object({ make: z.string(), model: z.string(), colour: z.enum(carColours) }).nullable(),
  preferences: tripPreferencesSchema,
  /** To passengers, without contact details (R3.10); empty for none. */
  note: z.string(),
  bookingMode: z.enum(bookingModes),
  /** The signed-in viewer's booking on this trip that holds seats, if any (spec 5). */
  myBooking: z.object({ id: z.uuid(), status: z.enum(bookingStatuses) }).nullable(),
  /** Whether the signed-in viewer drives this trip, whatever its state (spec 9: not theirs to report). */
  drivenByMe: z.boolean(),
});

export type TripDetails = z.infer<typeof tripDetailsSchema>;

export const tripDetailsRoute = defineRoute({
  method: "get",
  path: "/v1/trips/{id}",
  summary: "A published trip for one part of it, with that part's price and free seats",
  tags: ["search"],
  auth: "optional",
  request: { params: z.object({ id: z.uuid() }), query: tripDetailsQuerySchema },
  responses: {
    200: { description: "The trip, for the part asked for", schema: tripDetailsSchema },
    400: {
      description:
        "validation_failed: a bad value, or a part that does not run forwards between two stops (details name `fromStop` or `toStop`)",
      schema: errorResponseSchema,
    },
    401: searchErrors[401],
    404: {
      description: "not_found: no such trip, a draft, or a week past its last stop (Q17)",
      schema: errorResponseSchema,
    },
    429: searchErrors[429],
  },
});
