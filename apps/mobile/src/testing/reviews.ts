// Completed bookings and their reviews, for screen tests. Not used by the
// app itself.
import type { Booking, BookingReview, Review } from "@shareride/contracts";
import { paidBooking } from "./bookings";
import { onTheDay, rider } from "./trip-day";

/** Reviews of the north trip close 14 days after it completed, at 16:00 on 15 November. */
export const reviewsCloseAt = "2026-11-29T16:00:00.000Z";

/** A review as the API sends it. */
export function aReview(rating: number, comment = ""): Review {
  return { rating, comment, sentAt: "2026-11-16T09:00:00.000Z" };
}

/** Reviews of a completed booking, none written yet unless `changes` says so. */
export function reviewsOf(changes: Partial<BookingReview> = {}): BookingReview {
  return { closesAt: reviewsCloseAt, mine: null, theirs: null, ...changes };
}

/** Gunna's booking once the north trip completed, as she sees it. */
export function completedBooking(review: Partial<BookingReview> = {}): Booking {
  return onTheDay(
    { phase: "completed" },
    { status: "completed", review: reviewsOf(review), id: paidBooking.id },
  );
}

/** A passenger of the completed north trip, as Anna, its driver, sees them. */
export function completedRider(
  id: string,
  firstName: string,
  review: Partial<BookingReview> = {},
): Booking {
  const booking = rider(id, firstName, { board: 1, alight: 2 }, "here", "completed", {
    phase: "completed",
  });
  return { ...booking, review: reviewsOf(review) };
}
