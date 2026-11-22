// How a report ends (spec 8, 3.3 to 3.5; R8.7; decisions 4 and 5): the
// report is decided once, and the booking moves as `disputeEffect` says,
// freeing its seats if it still held them, with a full refund when the
// driver was at fault. Payouts (spec 13) will read the outcome too.
import { schema } from "@shareride/db";
import {
  disputeEffect,
  holdsSeats,
  nextStatus,
  type BookingStatus,
  type DisputeKind,
  type DisputeOutcome,
  paidInApp,
} from "@shareride/domain";
import { and, eq, isNull } from "drizzle-orm";
import { changeOccupancy, methodOf, partOf, stopsOf, type Transaction } from "../bookings/seats.ts";
import { recordEvents } from "../notifications/outbox.ts";
import { oweRefund } from "../payments/refunds.ts";
import { refitToTripLimit } from "../trips/limit.ts";
import type { DisputeRow } from "./disputes.ts";

const { bookings, disputes, reviews, trips } = schema;

export interface Decision {
  readonly outcome: DisputeOutcome;
  readonly by: "system" | "operator";
  /** The operator's reasons; empty for the system's decisions. */
  readonly note: string;
}

/**
 * Decides the open report and applies its effect to the booking. Call it
 * with the booking's trip locked and the report read under that lock, after
 * checking the decision is allowed (`checkAnswer`, `settlesUnanswered` or
 * `checkDecision`).
 */
export async function applyOutcome(
  tx: Transaction,
  dispute: DisputeRow,
  decision: Decision,
  now: Date,
): Promise<void> {
  const decided = await tx
    .update(disputes)
    .set({
      outcome: decision.outcome,
      decidedBy: decision.by,
      decidedAt: now,
      decisionNote: decision.note,
      updatedAt: now,
    })
    .where(and(eq(disputes.id, dispute.id), isNull(disputes.outcome)))
    .returning({ id: disputes.id });
  if (decided.length !== 1) throw new Error("The report was decided already.");

  const [found] = await tx
    .select({ booking: bookings, tripStatus: trips.status, tripCompletedAt: trips.completedAt })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .where(eq(bookings.id, dispute.bookingId));
  if (found === undefined) throw new Error("A report's booking is missing.");
  const { booking } = found;
  const status = booking.status as BookingStatus;
  const effect = disputeEffect(dispute.kind as DisputeKind, decision.outcome, {
    status,
    tripCompleted: found.tripStatus === "completed",
  });
  // A booking the driver never drove, or the passenger never rode, has
  // nothing to review (spec 8, 3.4).
  if (effect.removesReviews) await tx.delete(reviews).where(eq(reviews.bookingId, booking.id));
  if (effect.bookingEvent === null) return;
  const next = nextStatus(status, effect.bookingEvent);
  if (!next.ok) throw new Error(`A ${status} booking cannot take "${effect.bookingEvent}".`);
  // All the passenger paid goes back, or nothing (rules M2, M3); paid to
  // the driver in person, nothing was paid in the app (rule M6).
  const refund =
    effect.refund === "full"
      ? paidInApp({ amount: booking.totalPrice, currency: "ISK" }, methodOf(booking)).amount
      : 0;
  await tx
    .update(bookings)
    .set({
      status: next.value,
      ...(effect.cancellation === null
        ? {}
        : {
            cancelledAt: now,
            cancelledBy: effect.cancellation.by,
            cancelReason: effect.cancellation.reason,
            cancelNote: "",
            refundAmount: refund,
            countsOnReliability: effect.cancellation.countsOnReliability,
          }),
      // A ride found to have happened completes as of its trip, or now if
      // the trip is still under way.
      ...(next.value === "completed" ? { completedAt: found.tripCompletedAt ?? now } : {}),
      updatedAt: now,
    })
    .where(eq(bookings.id, booking.id));
  // A confirmed booking held its seats until now (rule S1); its stops are
  // still on the trip, which no longer changes once departed.
  if (holdsSeats(status)) {
    const part = partOf(await stopsOf(tx, booking.tripId), booking);
    await changeOccupancy(tx, booking.tripId, part, -booking.seats);
    // A no-show decided while the trip still has stops ahead keeps its
    // money while its seats are free again (spec 17).
    await refitToTripLimit(tx, booking.tripId, now);
  }
  if (refund > 0) await oweRefund(tx, booking.id, { amount: refund, currency: "ISK" }, now);
  if (next.value === "completed") {
    await recordEvents(tx, [{ type: "BookingCompleted", bookingId: booking.id }], now);
  }
}
