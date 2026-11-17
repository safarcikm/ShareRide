import { schema } from "@shareride/db";
import {
  err,
  holdsSeats,
  ok,
  operatorBookingRefund,
  operatorTripCancellation,
  type BookingStatus,
  type Money,
  type Result,
  type TripCancellation,
  type TripCancelReason,
} from "@shareride/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import { addSystemLine } from "../chat/conversations.ts";
import { recordEvents } from "../notifications/outbox.ts";
import { oweRefund } from "../payments/refunds.ts";
import {
  changeOccupancy,
  expireDueBookings,
  lockTrip,
  partOf,
  stopsOf,
  type Transaction,
} from "./seats.ts";

// Cancelling a whole trip (spec 6, 3.3), by its driver or by ShareRide
// (spec 9, 3.4.3 and 3.6), and ShareRide cancelling one booking for a
// suspension. ShareRide never says why: the person affected reads it in
// their notice, and the others only that it was cancelled.

const { bookings, trips } = schema;

/** Statuses a booking can hold seats in, before its deadline is checked (rule S1). */
export const heldStatuses: BookingStatus[] = ["requested", "accepted", "confirmed"];

const isk = (amount: number): Money => ({ amount, currency: "ISK" });

/** Who cancels a trip: its driver, with their reason and note, or ShareRide. */
export type TripCanceller =
  | { readonly by: "driver"; readonly reason: TripCancelReason; readonly note: string }
  | { readonly by: "operator" };

/** The trip's requests and bookings that hold seats, oldest first. */
export async function heldBookingsOf(tx: Transaction, tripId: string) {
  return tx
    .select()
    .from(bookings)
    .where(and(eq(bookings.tripId, tripId), inArray(bookings.status, heldStatuses)))
    .orderBy(asc(bookings.createdAt), asc(bookings.id));
}

/** What the domain's trip cancellation needs of each held booking. */
export function toCancelWithTrip(held: readonly (typeof bookings.$inferSelect)[]) {
  return held.map((booking) => ({
    id: booking.id,
    status: booking.status as "requested" | "accepted" | "confirmed",
    total: isk(booking.totalPrice),
  }));
}

/**
 * Stores a trip's cancellation, with the trip locked and `outcome` worked
 * out from `held`: each booking cancelled with its refund, each request
 * declined, their seats freed, a line in each conversation, and everyone
 * told.
 */
export async function applyTripCancellation(
  tx: Transaction,
  tripId: string,
  held: readonly (typeof bookings.$inferSelect)[],
  outcome: TripCancellation,
  canceller: TripCanceller,
  now: Date,
): Promise<void> {
  const reason = canceller.by === "driver" ? canceller.reason : null;
  const note = canceller.by === "driver" ? canceller.note : "";
  await tx
    .update(trips)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: canceller.by,
      cancelReason: reason,
      cancelNote: note,
      countsOnReliability: outcome.countsOnReliability,
      updatedAt: now,
    })
    .where(eq(trips.id, tripId));
  const stops = await stopsOf(tx, tripId);
  for (const { id, outcome: what, refund } of outcome.bookings) {
    const booking = held.find((row) => row.id === id);
    if (booking === undefined) continue;
    // So the passenger reads who ended it, and the driver's reason and note.
    const ended = {
      cancelledAt: now,
      cancelledBy: canceller.by,
      cancelReason: reason,
      cancelNote: note,
      updatedAt: now,
    };
    await tx
      .update(bookings)
      .set(
        what === "declined"
          ? { ...ended, status: "declined", decidedAt: now, expiresAt: null }
          : {
              ...ended,
              status: "cancelled",
              refundAmount: refund.amount,
              // The trip counts once, not each of its bookings (spec 8, 3.8).
              countsOnReliability: false,
            },
      )
      .where(eq(bookings.id, id));
    // Requests hold their seats too (rule S1).
    await changeOccupancy(tx, tripId, partOf(stops, booking), -booking.seats);
    if (refund.amount > 0) await oweRefund(tx, id, refund, now);
    if (what === "cancelled") {
      await addSystemLine(
        tx,
        id,
        canceller.by === "driver"
          ? { key: "cancelled", by: "driver", reason: canceller.reason, note, wholeTrip: true }
          : { key: "cancelled_by_shareride", wholeTrip: true },
        now,
      );
    }
  }
  await recordEvents(
    tx,
    outcome.bookings.map(({ id }) => ({ type: "TripCancelled", tripId, bookingId: id })),
    now,
  );
}

export type OperatorCancelProblem = { readonly code: "not_found" | "trip_not_cancellable" };

/**
 * ShareRide cancels a published trip before it leaves (spec 9, 3.4.3 and
 * 3.6): full refunds, as any trip cancellation, and it counts on the driver
 * only when the operator says so. Done already, it changes nothing.
 */
export async function cancelTripAsOperator(
  tx: Transaction,
  tripId: string,
  countsOnReliability: boolean,
  clock: () => Date,
): Promise<Result<void, OperatorCancelProblem>> {
  const trip = await lockTrip(tx, tripId);
  if (trip === undefined) return err({ code: "not_found" });
  if (trip.status === "cancelled") return ok(undefined);
  // After the lock, which may have waited while a deadline passed.
  const now = clock();
  await expireDueBookings(tx, tripId, now);
  const held = await heldBookingsOf(tx, tripId);
  const outcome = operatorTripCancellation(
    { status: trip.status as "published", departsAt: trip.departsAt ?? new Date(0) },
    toCancelWithTrip(held),
    countsOnReliability,
    now,
  );
  if (!outcome.ok) return err({ code: "trip_not_cancellable" });
  await applyTripCancellation(tx, tripId, held, outcome.value, { by: "operator" }, now);
  return ok(undefined);
}

/**
 * ShareRide cancels a suspended passenger's request or booking before they
 * board (spec 9, 3.6; R9.10): its seats freed, a full refund of what was
 * paid (milestone 9 decision 3), and the driver told it was cancelled, never
 * why. One that no longer holds seats is left as it is: false.
 */
export async function cancelBookingAsOperator(
  tx: Transaction,
  bookingId: string,
  clock: () => Date,
): Promise<boolean> {
  const [found] = await tx
    .select({ tripId: bookings.tripId })
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  if (found === undefined) return false;
  await lockTrip(tx, found.tripId);
  const now = clock();
  await expireDueBookings(tx, found.tripId, now);
  const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
  if (booking === undefined || !holdsSeats(booking.status as BookingStatus)) return false;
  const refund = operatorBookingRefund(booking.status as BookingStatus, isk(booking.totalPrice));
  await tx
    .update(bookings)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: "operator",
      cancelReason: null,
      cancelNote: "",
      refundAmount: refund.amount,
      countsOnReliability: false,
      updatedAt: now,
    })
    .where(eq(bookings.id, bookingId));
  const part = partOf(await stopsOf(tx, found.tripId), booking);
  await changeOccupancy(tx, found.tripId, part, -booking.seats);
  if (refund.amount > 0) await oweRefund(tx, bookingId, refund, now);
  await addSystemLine(tx, bookingId, { key: "cancelled_by_shareride", wholeTrip: false }, now);
  await recordEvents(tx, [{ type: "BookingCancelled", bookingId, by: "operator" }], now);
  return true;
}
