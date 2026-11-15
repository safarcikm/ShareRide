import { defaultTripSettings } from "@shareride/domain";
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
