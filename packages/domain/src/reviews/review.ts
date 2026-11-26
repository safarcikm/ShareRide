// Ratings and reviews (spec 8, 3.7; rules R8.8 and R8.9): after a completed
// booking, the passenger rates the driver and the driver the passenger. A
// review stays hidden until both have written theirs, or 14 days have
// passed, so neither can answer the other's.
import type { BookingStatus } from "../bookings/lifecycle.ts";
import { err, ok, type Result } from "../result.ts";
import { contactDetailsIn, type ContactKind } from "../trips/note.ts";

/** The values the operator will set (spec 8, section 6; feature H4). */
export interface ReviewSettings {
  /** Reviews are written within this many days of completion (`review_window`). */
  readonly reviewWindowDays: number;
  /** The one reminder to review comes this many days after completion (3.7.6). */
  readonly reminderAfterDays: number;
}

export const defaultReviewSettings: ReviewSettings = { reviewWindowDays: 14, reminderAfterDays: 3 };

/** A review's comment, in characters (R8.8). */
export const reviewMaxLength = 500;

export interface ReviewToCheck {
  readonly bookingStatus: BookingStatus;
  /** When the booking completed; null if it never did. */
  readonly completedAt: Date | null;
  /** Whether this author has already reviewed this booking. */
  readonly alreadyReviewed: boolean;
  /**
   * Whether the passenger has reported that the driver didn't come and that
   * is still open: if it stands, the booking's reviews are removed (3.4).
   */
  readonly openReport: boolean;
  readonly rating: number;
  readonly comment: string;
}

export type ReviewProblem =
  | { readonly code: "not_completed" }
  | { readonly code: "review_window_closed" }
  | { readonly code: "already_reviewed" }
  | { readonly code: "report_open" }
  | { readonly code: "rating_invalid" }
  | { readonly code: "comment_too_long" }
  | { readonly code: "comment_has_contact_details"; readonly kinds: readonly ContactKind[] };

const dayMs = 86_400_000;

function windowEnd(completedAt: Date, settings: ReviewSettings): Date {
  return new Date(completedAt.getTime() + settings.reviewWindowDays * dayMs);
}

/** Reviews of a booking completed then can be written until this moment, and not at it (R8.8). */
export function reviewClosesAt(completedAt: Date, settings: ReviewSettings): Date {
  return windowEnd(completedAt, settings);
}

/**
 * At `now`, reviews can still be written of bookings completed after this
 * moment, and not of one completed at it (R8.8): for finding them, as
 * `checkReview` decides each.
 */
export function reviewsOpenSince(now: Date, settings: ReviewSettings): Date {
  return new Date(now.getTime() - settings.reviewWindowDays * dayMs);
}

/**
 * When to remind people to review a booking completed then (3.7.6), or null
 * when that moment has already passed: a ride the operator found happened
 * days later gets "How was your trip?" once, not twice in a row.
 */
export function reviewReminderAt(
  completedAt: Date,
  now: Date,
  settings: ReviewSettings,
): Date | null {
  const at = new Date(completedAt.getTime() + settings.reminderAfterDays * dayMs);
  return at > now ? at : null;
}

/**
 * A comment as it is kept and counted: in characters as people see them,
 * without space around it, as the trip note is (R3.10). A review sent again
 * is the same one when its tidied comment is.
 */
export function tidyReviewComment(comment: string): string {
  return comment.normalize("NFC").trim();
}

/**
 * What is wrong with a comment, tidied (R8.8): too long, or with contact
 * details or links; null when nothing is. The app checks it as it is typed.
 */
export function reviewCommentProblem(
  comment: string,
): Extract<ReviewProblem, { code: "comment_too_long" | "comment_has_contact_details" }> | null {
  const tidy = tidyReviewComment(comment);
  if (Array.from(tidy).length > reviewMaxLength) return { code: "comment_too_long" };
  const kinds = contactDetailsIn(tidy);
  return kinds.length > 0 ? { code: "comment_has_contact_details", kinds } : null;
}

/**
 * R8.8: one review per author per completed booking, within 14 days, 1 to 5
 * whole stars and an optional comment of up to 500 characters without
 * contact details or links. It cannot be changed once sent. No-shows,
 * cancellations and open reports go through reliability and the operator
 * instead, so they are never reviewed: a completed booking whose driver is
 * reported absent waits until that is decided.
 */
export function checkReview(
  review: ReviewToCheck,
  now: Date,
  settings: ReviewSettings,
): Result<{ readonly rating: number; readonly comment: string }, ReviewProblem> {
  if (review.bookingStatus !== "completed" || review.completedAt === null) {
    return err({ code: "not_completed" });
  }
  if (now >= windowEnd(review.completedAt, settings)) return err({ code: "review_window_closed" });
  if (review.alreadyReviewed) return err({ code: "already_reviewed" });
  if (review.openReport) return err({ code: "report_open" });
  if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
    return err({ code: "rating_invalid" });
  }
  const problem = reviewCommentProblem(review.comment);
  if (problem !== null) return err(problem);
  return ok({ rating: review.rating, comment: tidyReviewComment(review.comment) });
}

/** R8.9: shown once both sides have reviewed, or 14 days after completion. */
export function isRevealed(
  pair: { readonly completedAt: Date; readonly bothReviewed: boolean },
  now: Date,
  settings: ReviewSettings,
): boolean {
  return pair.bothReviewed || now >= windowEnd(pair.completedAt, settings);
}

export interface RatedReview {
  readonly rating: number;
  readonly revealed: boolean;
  /** Hidden by the operator for breaking the community rules (spec 9). */
  readonly hidden: boolean;
}

/**
 * The rating on a profile: the average of the reviews anyone can read, to
 * one decimal, and how many there are. A review not yet revealed never
 * counts, or the average would give it away.
 */
export function ratingOf(reviews: readonly RatedReview[]): {
  readonly average: number | null;
  readonly count: number;
} {
  const shown = reviews.filter((review) => review.revealed && !review.hidden);
  if (shown.length === 0) return { average: null, count: 0 };
  const sum = shown.reduce((total, review) => total + review.rating, 0);
  return { average: Math.round((sum / shown.length) * 10) / 10, count: shown.length };
}

/**
 * A rating of 1 or 2 asks "Did something go wrong?" and offers a report
 * (spec 8, 3.7.4; spec 9).
 */
export function asksWhatWentWrong(rating: number): boolean {
  return rating <= 2;
}
