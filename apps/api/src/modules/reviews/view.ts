import type { BookingReview, Review } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { reviewClosesAt, type BookingStatus, type ReviewSettings } from "@shareride/domain";
import { asc, inArray } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";

const { reviews } = schema;

export type ReviewRow = typeof reviews.$inferSelect;

/** The reviews of these bookings: at most one by each side of each. */
export async function reviewsOf(
  q: Queryable,
  bookingIds: readonly string[],
): Promise<readonly ReviewRow[]> {
  if (bookingIds.length === 0) return [];
  return q
    .select()
    .from(reviews)
    .where(inArray(reviews.bookingId, [...new Set(bookingIds)]))
    .orderBy(asc(reviews.createdAt));
}

const sent = (row: ReviewRow): Review => ({
  rating: row.rating,
  comment: row.comment,
  sentAt: row.createdAt.toISOString(),
});

/**
 * A completed booking's reviews as one side sees them (R8.8, R8.9): their
 * own once sent, and the other's about them only once it shows and unless
 * the operator hid it. Null for a booking that is not completed, as only
 * those are reviewed.
 */
export function shownReview(
  rows: readonly ReviewRow[],
  booking: { readonly id: string; readonly completedAt: Date | null },
  status: BookingStatus,
  viewerId: string,
  settings: ReviewSettings,
): BookingReview | null {
  if (status !== "completed" || booking.completedAt === null) return null;
  const own = rows.filter((row) => row.bookingId === booking.id);
  const mine = own.find((row) => row.authorId === viewerId);
  const theirs = own.find(
    (row) => row.subjectId === viewerId && row.revealedAt !== null && row.hiddenAt === null,
  );
  return {
    closesAt: reviewClosesAt(booking.completedAt, settings).toISOString(),
    mine: mine === undefined ? null : { ...sent(mine), revealed: mine.revealedAt !== null },
    theirs: theirs === undefined ? null : sent(theirs),
  };
}
