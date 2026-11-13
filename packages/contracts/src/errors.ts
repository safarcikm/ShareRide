import { z } from "zod";

/**
 * Every error response has this shape (engineering conventions, "API").
 * `code` is stable and machine-readable; the apps translate it. `message` is
 * English, for developers. Details never echo submitted values.
 */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), issue: z.string() })).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Error codes shared by every endpoint. Each module adds its own. */
export const commonErrorCodes = ["validation_failed", "not_found", "internal_error"] as const;
