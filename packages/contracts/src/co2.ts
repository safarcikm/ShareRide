import { z } from "zod";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// The CO2 a shared ride saves (spec 34; ADR 0054): one car not driven per
// booking, compared with driving alone, at the operator's grams per car km.

const errors = { schema: errorResponseSchema } as const;

/** A part's or a ride's figure: its road metres and the grams it saves. */
export const co2FigureSchema = z.object({
  distanceM: z.int().nonnegative(),
  grams: z.int().nonnegative(),
});

export type Co2Figure = z.infer<typeof co2FigureSchema>;

/**
 * My own totals (spec 34, 3.8), as a passenger and as a driver: the
 * bookings completed, with the grams each kept, and those carried past the
 * 3-year anonymisation. A role is null with no rides in it; both are null,
 * and `grams` 0, while the operator's value is 0, which hides every figure.
 */
export const co2TotalsSchema = z.object({
  /** Both roles together. */
  grams: z.int().nonnegative(),
  asPassenger: z.object({ grams: z.int().nonnegative(), rides: z.int().positive() }).nullable(),
  asDriver: z
    .object({
      grams: z.int().nonnegative(),
      /** Trips with at least one booking counted. */
      rides: z.int().positive(),
      /** The bookings counted on them. */
      passengers: z.int().positive(),
    })
    .nullable(),
});

export type Co2Totals = z.infer<typeof co2TotalsSchema>;

export const myCo2Route = defineRoute({
  method: "get",
  path: "/v1/me/co2",
  summary: "The CO2 my shared rides saved, as a passenger and as a driver; only I see it",
  tags: ["co2"],
  auth: true,
  responses: {
    200: { description: "My totals", schema: co2TotalsSchema },
    401: { description: "unauthenticated", ...errors },
  },
});
