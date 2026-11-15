import { bookingModes, defaultTripSettings, timesOfDay } from "@shareride/domain";
import { z } from "zod";
import { moneySchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { dateSchema, localisedTextSchema, meetingPointSummarySchema } from "./meeting-points.ts";
import { defineRoute } from "./route.ts";

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
  /** Photos and ratings come with specs 1 and 8; until then every driver is new. */
  driver: z.object({ firstName: z.string() }),
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
