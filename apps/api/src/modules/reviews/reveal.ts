// A review nobody answered shows 14 days after its booking completed (R8.9):
// the API's minute job, next to the trip day's. One whose booking has an
// open report waits for it, as a driver absence that stands removes it.
import { schema, type Database } from "@shareride/db";
import { isRevealed, reviewClosesAt, type ReviewSettings } from "@shareride/domain";
import { and, eq, isNull, lte } from "drizzle-orm";
import { recordEvents } from "../notifications/outbox.ts";

const { bookings, disputes, reviews } = schema;

const dayMs = 86_400_000;

/**
 * Reveals every review whose 14 days have passed, as of that moment however
 * late the job runs, and tells each person a review is about. Rows another
 * transaction holds are left for the next run, so it never waits on a
 * review being sent. A second run changes nothing.
 */
export async function revealDueReviews(
  db: Database,
  now: Date,
  settings: ReviewSettings,
): Promise<number> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: reviews.id, bookingId: reviews.bookingId, completedAt: bookings.completedAt })
      .from(reviews)
      .innerJoin(bookings, eq(bookings.id, reviews.bookingId))
      .leftJoin(disputes, and(eq(disputes.bookingId, reviews.bookingId), isNull(disputes.outcome)))
      .where(
        and(
          isNull(reviews.revealedAt),
          eq(bookings.status, "completed"),
          lte(bookings.completedAt, new Date(now.getTime() - settings.reviewWindowDays * dayMs)),
          isNull(disputes.id),
        ),
      )
      .for("update", { of: reviews, skipLocked: true });
    let revealed = 0;
    for (const row of due) {
      const { completedAt } = row;
      if (completedAt === null) continue;
      if (!isRevealed({ completedAt, bothReviewed: false }, now, settings)) continue;
      await tx
        .update(reviews)
        .set({ revealedAt: reviewClosesAt(completedAt, settings), updatedAt: now })
        .where(eq(reviews.id, row.id));
      await recordEvents(
        tx,
        [{ type: "ReviewRevealed", bookingId: row.bookingId, reviewId: row.id }],
        now,
      );
      revealed += 1;
    }
    return revealed;
  });
}
