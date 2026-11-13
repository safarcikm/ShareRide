import { z } from "zod";

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
