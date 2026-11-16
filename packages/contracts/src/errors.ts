import { z } from "zod";
import { cancellationTermsSchema, moneySchema, timestampSchema } from "./common.ts";

/**
 * Every error response has this shape (engineering conventions, "API").
 * `code` is stable and machine-readable; the apps translate it. `message` is
 * English, for developers. Details never echo submitted values. A few errors
 * add a number the app shows, such as the wait before trying again.
 */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), issue: z.string() })).optional(),
    /** Seconds until trying again can work (also sent as `Retry-After`). */
    retryAfterSeconds: z.int().nonnegative().optional(),
    /** Guesses left for a sign-in code. */
    attemptsLeft: z.int().nonnegative().optional(),
    /** Seats free on the part now, when there are too few (`seats_taken`). */
    freeSeats: z.int().nonnegative().optional(),
    /** The total now, when it is not the one shown (`price_changed`, R5.3). */
    total: moneySchema.optional(),
    /** A cancellation's terms now, when they are not the ones shown (`terms_changed`). */
    terms: cancellationTermsSchema.optional(),
    /** Whether cancelling a trip counts on the driver's reliability now (`terms_changed`, R6.7). */
    countsOnReliability: z.boolean().optional(),
    /** The departures a trip's bookings allow, when a move is too far (`move_too_far`, R6.4). */
    departureWindow: z.object({ earliest: timestampSchema, latest: timestampSchema }).optional(),
    /** The bookings and requests that get in or out at a stop to remove (`stop_in_use`, R6.5). */
    bookingsAtStop: z.int().positive().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Error codes shared by every endpoint. Each module adds its own. */
export const commonErrorCodes = [
  "validation_failed",
  "not_found",
  "unsupported_media_type",
  "internal_error",
] as const;
