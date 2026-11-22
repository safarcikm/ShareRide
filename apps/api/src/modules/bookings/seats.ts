// The seats bookings hold (rule S1): every change to a trip's bookings locks
// the trip, changes the booking's status and its segments' occupancy in the
// same transaction, and first stores the expiry of bookings past their
// deadlines. Reads that cannot wait for that correct the stored occupancy.
import { schema, type Database } from "@shareride/db";
import {
  limitRoom,
  takingsOf,
  type BookingStatus,
  type PaymentMethod,
  type Money,
  type TakingsBooking,
} from "@shareride/domain";
import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, not, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recordEvents } from "../notifications/outbox.ts";

const { bookings, segments, trips, tripStops } = schema;

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Queryable = Database | Transaction;

/** Requests and unpaid bookings whose deadline has come (R5.5, rule M1), stored or not. */
export const pastDeadline = (now: Date) =>
  or(
    and(eq(bookings.status, "requested"), lte(bookings.expiresAt, now)),
    and(eq(bookings.status, "accepted"), lte(bookings.paymentDueAt, now)),
  );

/** The trip's stops in order, with where each one is; a stop removed is not one (spec 6, 3.2). */
export async function stopsOf(q: Queryable, tripId: string) {
  return q
    .select({
      id: tripStops.id,
      meetingPointId: tripStops.meetingPointId,
      position: tripStops.position,
      plannedAt: tripStops.plannedAt,
    })
    .from(tripStops)
    .where(and(eq(tripStops.tripId, tripId), isNull(tripStops.removedAt)))
    .orderBy(asc(tripStops.position));
}

/**
 * Adds `by` seats to every segment from one stop to another: positive when
 * a booking starts holding seats, negative when it stops (rule S1).
 */
export async function changeOccupancy(
  tx: Transaction,
  tripId: string,
  part: { readonly board: number; readonly alight: number },
  by: number,
) {
  await tx
    .update(segments)
    .set({ occupancy: sql`${segments.occupancy} + ${by}` })
    .where(
      and(
        eq(segments.tripId, tripId),
        gte(segments.position, part.board),
        lt(segments.position, part.alight),
      ),
    );
}

/** Where a booking gets in and out, as stop positions on the trip now. */
export function partOf(
  stops: readonly { readonly id: string; readonly position: number }[],
  booking: { readonly fromStopId: string; readonly toStopId: string },
) {
  const position = (id: string) => {
    const stop = stops.find((candidate) => candidate.id === id);
    if (stop === undefined) throw new Error("A booking names a stop the trip does not have.");
    return stop.position;
  };
  return { board: position(booking.fromStopId), alight: position(booking.toStopId) };
}

/** Locks the trip until the transaction ends: every change to its bookings does this first (R5.2). */
export async function lockTrip(tx: Transaction, tripId: string) {
  const [trip] = await tx
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), ne(trips.status, "draft")))
    .for("update");
  return trip;
}

/**
 * What the trip can still take (rule P3, spec 17; the domain's `limitRoom`):
 * its stretches' stored caps and every booking it has. Call it with the trip
 * locked and its due expiries stored, so it counts every booking.
 */
export async function limitRoomOf(tx: Transaction, tripId: string): Promise<Money> {
  const stretches = await tx
    .select({ capacity: segments.capacity, cap: segments.cap })
    .from(segments)
    .where(eq(segments.tripId, tripId));
  return limitRoom(stretches, (await takingsBookings(tx, [tripId], null)).get(tripId) ?? []);
}

/**
 * What the trip's bookings pay or paid the driver (rule P3; the domain's
 * `takingsOf`). Call it with the trip locked and its due expiries stored.
 */
export async function takingsOfTrip(tx: Transaction, tripId: string): Promise<Money> {
  return takingsOf((await takingsBookings(tx, [tripId], null)).get(tripId) ?? []);
}

/** How a stored booking is paid (rules M1 and M6): the column holds one of the two. */
export function methodOf(booking: { readonly paymentMethod: string }): PaymentMethod {
  return booking.paymentMethod as PaymentMethod;
}

/**
 * Each trip's bookings as the takings see them (rule P3). With `now`, a
 * request or an unpaid booking whose deadline has passed reads as expired,
 * as the trip shows it, though not yet stored.
 */
export async function takingsBookings(
  q: Queryable,
  tripIds: readonly string[],
  now: Date | null,
): Promise<Map<string, TakingsBooking[]>> {
  const rows =
    tripIds.length === 0
      ? []
      : await q
          .select({
            tripId: bookings.tripId,
            status: bookings.status,
            totalPrice: bookings.totalPrice,
            refundAmount: bookings.refundAmount,
            confirmedAt: bookings.confirmedAt,
            paymentMethod: bookings.paymentMethod,
          })
          .from(bookings)
          .where(
            and(
              inArray(bookings.tripId, [...tripIds]),
              now === null ? undefined : not(pastDeadline(now) ?? sql`false`),
            ),
          );
  const byTrip = new Map<string, TakingsBooking[]>();
  for (const { tripId, ...booking } of rows) {
    byTrip.set(tripId, [
      ...(byTrip.get(tripId) ?? []),
      { ...booking, status: booking.status as BookingStatus, paymentMethod: methodOf(booking) },
    ]);
  }
  return byTrip;
}

/**
 * Stores the expiry of the trip's requests and unpaid bookings whose
 * deadline has come, and frees their seats; returns how many. Call it with
 * the trip locked: every change to a trip's bookings locks it, so this sees
 * all of them.
 */
export async function expireDueBookings(
  tx: Transaction,
  tripId: string,
  now: Date,
): Promise<number> {
  const due = await tx
    .select({
      id: bookings.id,
      status: bookings.status,
      seats: bookings.seats,
      fromStopId: bookings.fromStopId,
      toStopId: bookings.toStopId,
    })
    .from(bookings)
    .where(and(eq(bookings.tripId, tripId), pastDeadline(now)));
  if (due.length === 0) return 0;
  const stops = await stopsOf(tx, tripId);
  for (const booking of due) {
    await tx
      .update(bookings)
      .set({ status: "expired", expiredAt: now, updatedAt: now })
      .where(eq(bookings.id, booking.id));
    await changeOccupancy(tx, tripId, partOf(stops, booking), -booking.seats);
  }
  await recordEvents(
    tx,
    due.map((booking) => ({
      type: "BookingExpired",
      bookingId: booking.id,
      reason: booking.status === "requested" ? "unanswered" : "unpaid",
    })),
    now,
  );
  return due.length;
}

const boards = alias(tripStops, "boards");
const alights = alias(tripStops, "alights");

/**
 * The trips' occupancy as of now, for reads that do not lock the trips:
 * the stored occupancy less the seats of bookings past their deadline whose
 * expiry is not stored yet (rule S1). Search, trip details and the driver's
 * view then agree with each other and with the next booking.
 */
export async function occupancyNow(
  q: Queryable,
  tripIds: readonly string[],
  now: Date,
): Promise<(tripId: string, position: number, stored: number) => number> {
  const due =
    tripIds.length === 0
      ? []
      : await q
          .select({
            tripId: bookings.tripId,
            seats: bookings.seats,
            board: boards.position,
            alight: alights.position,
          })
          .from(bookings)
          .innerJoin(boards, eq(boards.id, bookings.fromStopId))
          .innerJoin(alights, eq(alights.id, bookings.toStopId))
          .where(and(inArray(bookings.tripId, [...tripIds]), pastDeadline(now)));
  return (tripId, position, stored) => stored - seatsOn(due, tripId, position);
}

/** Bookings that went with their trip: completed, or a passenger who didn't come. */
const wentStatuses = ["completed", "no_show"] as const;

/**
 * The seats taken on the trips' stretches as their driver sees them: the
 * occupancy as of now, plus the seats of bookings that went with the trip.
 * Those hold none any more (rule S1), but a past trip still shows the seats
 * its passengers took.
 */
export async function seatsTakenNow(
  q: Queryable,
  tripIds: readonly string[],
  now: Date,
): Promise<(tripId: string, position: number, stored: number) => number> {
  const [asOfNow, went] = await Promise.all([
    occupancyNow(q, tripIds, now),
    tripIds.length === 0
      ? []
      : q
          .select({
            tripId: bookings.tripId,
            seats: bookings.seats,
            board: boards.position,
            alight: alights.position,
          })
          .from(bookings)
          .innerJoin(boards, eq(boards.id, bookings.fromStopId))
          .innerJoin(alights, eq(alights.id, bookings.toStopId))
          .where(
            and(
              inArray(bookings.tripId, [...tripIds]),
              inArray(bookings.status, [...wentStatuses]),
            ),
          ),
  ]);
  return (tripId, position, stored) =>
    asOfNow(tripId, position, stored) + seatsOn(went, tripId, position);
}

/** The seats `rows` take on the trip's segment at `position`. */
function seatsOn(
  rows: readonly { tripId: string; seats: number; board: number; alight: number }[],
  tripId: string,
  position: number,
): number {
  return rows
    .filter((row) => row.tripId === tripId && row.board <= position && position < row.alight)
    .reduce((sum, row) => sum + row.seats, 0);
}

/**
 * The deadline job (R5.5, rule M1): stores the expiry of every request and
 * unpaid booking past its deadline and frees their seats; returns how many.
 * Each trip is locked as booking locks it, and one already locked is left
 * for the next run, so instances never wait on each other or on a booking.
 */
export async function expireAllDueBookings(db: Database, now: Date): Promise<number> {
  const due = await db
    .selectDistinct({ tripId: bookings.tripId })
    .from(bookings)
    .where(pastDeadline(now));
  let expired = 0;
  for (const { tripId } of due) {
    expired += await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.id, tripId))
        .for("update", { skipLocked: true });
      return locked === undefined ? 0 : expireDueBookings(tx, tripId, now);
    });
  }
  return expired;
}
