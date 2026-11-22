import { reviewMaxLength } from "@shareride/domain";
import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { accountSuspendedResponse, errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// Ratings and reviews (spec 8, 3.7): after a completed booking, the
// passenger rates the driver and the driver rates the passenger.

const errors = { schema: errorResponseSchema } as const;

/** A review as sent: 1 to 5 stars and a comment, empty for none. */
export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
  sentAt: timestampSchema,
});

export type Review = z.infer<typeof reviewSchema>;

/**
 * The reviews of a completed booking, as one side sees them (R8.8, R8.9):
 * until when they can review, their own review once sent, and the other
 * person's review of them once it shows.
 */
export const bookingReviewSchema = z.object({
  /** Reviews can be written until then, and not at it: 14 days after the booking completed. */
  closesAt: timestampSchema,
  /**
   * The viewer's review of the other person; `revealed` once it shows, when
   * both have reviewed or the 14 days have passed.
   */
  mine: reviewSchema.extend({ revealed: z.boolean() }).nullable(),
  /** The other person's review of the viewer, once it shows; never one the operator hid. */
  theirs: reviewSchema.nullable(),
});

export type BookingReview = z.infer<typeof bookingReviewSchema>;

export const reviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  // Twice the limit, as the API counts characters as people see them.
  comment: z
    .string()
    .max(reviewMaxLength * 2)
    .optional(),
});

export type ReviewBody = z.input<typeof reviewBodySchema>;

export const reviewBookingRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/review",
  summary:
    "Rate and review the other person on a completed booking; it shows once both have reviewed, or after 14 days (R8.8, R8.9)",
  tags: ["reviews"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: reviewBodySchema },
  responses: {
    200: {
      description:
        "The booking's reviews with this one; sending the same review again changes nothing",
      schema: bookingReviewSchema,
    },
    400: {
      description:
        "validation_failed: the rating, or the comment (`too_long`, `contact_details`: no phone numbers, email addresses or links)",
      ...errors,
    },
    401: { description: "unauthenticated", ...errors },
    403: accountSuspendedResponse,
    404: { description: "not_found: no such booking of yours", ...errors },
    409: {
      description:
        "not_completed: only completed bookings are reviewed; review_window_closed: 14 days have passed; already_reviewed: with another review, which cannot be changed; report_open: the passenger has said the driver didn't come, and that is not decided yet; person_left: the other person has left PuffinRide, or is leaving",
      ...errors,
    },
  },
});
