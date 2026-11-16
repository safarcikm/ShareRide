import { z } from "zod";

/** The app languages (ADR 0011). */
export const localeSchema = z.enum(["is", "en"]);

export const platformSchema = z.enum(["ios", "android", "web"]);

/** A point in time in ISO 8601, always in UTC (for example 2026-11-13T12:00:00.000Z). */
export const timestampSchema = z.iso.datetime();

/** Money as a whole number in the currency's smallest unit; ISK has none, so 2500 is 2 500 kr. */
export const moneySchema = z.object({ amount: z.int(), currency: z.enum(["ISK"]) });

/** What cancelling a booking does now (spec 6, 3.5.2), by the same rules as confirming. */
export const cancellationTermsSchema = z.object({
  /** All the passenger paid, or nothing (rule M2); nothing for a booking not yet paid. */
  refund: moneySchema,
  /** Whether it shows on the canceller's profile (R6.7, R6.8). */
  countsOnReliability: z.boolean(),
});
