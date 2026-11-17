// Ratings and reviews (spec 8, 3.7; R8.8 and R8.9): after a completed
// booking, the passenger rates the driver and the driver the passenger, once
// each. A review stays hidden until both have written theirs, or 14 days
// have passed (reveal.ts), so neither can answer the other's.
import type { BookingReview } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  checkReview,
  err,
  ok,
  tidyReviewComment,
  type BookingStatus,
  type Result,
  type ReviewProblem,
  type ReviewSettings,
} from "@shareride/domain";
import { and, eq, isNull, or } from "drizzle-orm";
import { lockTrip } from "../bookings/seats.ts";
import { recordEvents } from "../notifications/outbox.ts";
import { isHidden } from "../privacy/hidden.ts";
import { disputesOf } from "../trip-day/disputes.ts";
import { reviewsOf, shownReview } from "./view.ts";

const { bookings, reviews, trips, users } = schema;

export type ReviewError =
  | { readonly code: "not_found" }
  /** The other person has left ShareRide, or is leaving: nothing new is written about them. */
  | { readonly code: "person_left" }
  | ReviewProblem;

export interface ReviewService {
  /** Rates and reviews the other person on one of the person's completed bookings. */
  review(
    userId: string,
    bookingId: string,
    input: { readonly rating: number; readonly comment?: string | undefined },
  ): Promise<Result<BookingReview, ReviewError>>;
}

export function createReviewService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings: ReviewSettings;
}): ReviewService {
  const { db, clock, settings } = dependencies;

  return {
    async review(userId, bookingId, input) {
      const [mine] = await db
        .select({
          tripId: bookings.tripId,
          passengerId: bookings.passengerId,
          driverId: trips.driverId,
        })
        .from(bookings)
        .innerJoin(trips, eq(trips.id, bookings.tripId))
        .where(
          and(
            eq(bookings.id, bookingId),
            or(eq(bookings.passengerId, userId), eq(trips.driverId, userId)),
          ),
        );
      if (mine === undefined) return err({ code: "not_found" });
      const role = mine.passengerId === userId ? "passenger" : "driver";
      const subjectId = role === "passenger" ? mine.driverId : mine.passengerId;
      return db.transaction(async (tx) => {
        // A report's outcome changes the booking and removes its reviews
        // under the trip's lock, so a review waits for it.
        const trip = await lockTrip(tx, mine.tripId);
        if (trip === undefined) return err({ code: "not_found" });
        const now = clock();
        const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
        if (booking === undefined) return err({ code: "not_found" });
        const shown = async () =>
          shownReview(
            await reviewsOf(tx, [bookingId]),
            booking,
            booking.status as BookingStatus,
            userId,
            settings,
          );
        const earlier = await reviewsOf(tx, [bookingId]);
        const own = earlier.find((row) => row.authorId === userId);
        // Sent again, as a retry is: the same review, tidied as `checkReview`
        // tidies it, changes nothing.
        const comment = tidyReviewComment(input.comment ?? "");
        if (own !== undefined && own.rating === input.rating && own.comment === comment) {
          const view = await shown();
          if (view !== null) return ok(view);
        }
        const [subject] = await tx
          .select({ id: users.id, deleteAfter: users.deleteAfter })
          .from(users)
          .where(eq(users.id, subjectId));
        if (subject === undefined || isHidden(subject)) return err({ code: "person_left" });
        const [report] = await disputesOf(tx, [bookingId]);
        const checked = checkReview(
          {
            bookingStatus: booking.status as BookingStatus,
            completedAt: booking.completedAt,
            alreadyReviewed: own !== undefined,
            openReport: report !== undefined && report.outcome === null,
            rating: input.rating,
            comment: input.comment ?? "",
          },
          now,
          settings,
        );
        if (!checked.ok) return checked;
        await tx.insert(reviews).values({
          bookingId,
          authorId: userId,
          subjectId,
          authorRole: role,
          rating: checked.value.rating,
          comment: checked.value.comment,
          createdAt: now,
          updatedAt: now,
        });
        // Both have reviewed: each shows now, and each person is told (R8.9).
        if (earlier.some((row) => row.authorId === subjectId)) {
          const revealed = await tx
            .update(reviews)
            .set({ revealedAt: now, updatedAt: now })
            .where(and(eq(reviews.bookingId, bookingId), isNull(reviews.revealedAt)))
            .returning({ id: reviews.id });
          await recordEvents(
            tx,
            revealed.map((row) => ({ type: "ReviewRevealed", bookingId, reviewId: row.id })),
            now,
          );
        }
        const view = await shown();
        if (view === null) throw new Error("A booking just reviewed is completed.");
        return ok(view);
      });
    },
  };
}
