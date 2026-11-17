// Trips depart and complete on their own (spec 8, 3.6; rules R8.1 and R8.2):
// the API's minute job, next to the booking deadlines. A trip departs at its
// first stop's planned time and completes 2 hours after its last, with its
// confirmed bookings, which then hold no seats (rule S1).
import { schema, type Database } from "@shareride/db";
import {
  completesAt,
  completesWithTrip,
  tripStatusAt,
  type BookingStatus,
  type TripDaySettings,
  type TripStatus,
} from "@shareride/domain";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import {
  changeOccupancy,
  expireDueBookings,
  partOf,
  stopsOf,
  type Transaction,
} from "../bookings/seats.ts";
import { recordEvents } from "../notifications/outbox.ts";

const { bookings, disputes, trips } = schema;

/** The trips time moves on: published or departed. */
const runningStatuses: TripStatus[] = ["published", "departed"];

export interface TripsMoved {
  readonly departed: number;
  readonly completed: number;
}

/**
 * Departs and completes every trip whose time has come. Each trip is locked
 * as a booking or a change locks it, and one already locked is left for the
 * next run, so instances never wait on each other or on a booking. A second
 * run changes nothing.
 */
export async function moveTripsOn(
  db: Database,
  now: Date,
  settings: TripDaySettings,
): Promise<TripsMoved> {
  const due = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(inArray(trips.status, runningStatuses), lte(trips.departsAt, now)));
  let departed = 0;
  let completed = 0;
  for (const { id } of due) {
    const moved = await db.transaction(async (tx) => {
      const [trip] = await tx
        .select()
        .from(trips)
        .where(and(eq(trips.id, id), inArray(trips.status, runningStatuses)))
        .for("update", { skipLocked: true });
      if (trip === undefined || trip.departsAt === null || trip.arrivesAt === null) return null;
      const status = trip.status as TripStatus;
      const next = tripStatusAt(
        { status, firstStopAt: trip.departsAt, lastStopAt: trip.arrivesAt },
        now,
        settings,
      );
      if (next === status) return null;
      if (next === "departed") {
        await tx.update(trips).set({ status: next, updatedAt: now }).where(eq(trips.id, id));
        return next;
      }
      await complete(tx, id, completesAt(trip.arrivesAt, settings), now);
      return next;
    });
    if (moved === "departed") departed += 1;
    if (moved === "completed") completed += 1;
  }
  return { departed, completed };
}

/**
 * Completes the locked trip with its confirmed bookings (R8.2), as of the
 * moment the rule says, however late the job runs. Requests and unpaid
 * bookings were due before boarding, so their expiry is stored first.
 */
async function complete(tx: Transaction, tripId: string, completedAt: Date, now: Date) {
  await expireDueBookings(tx, tripId, now);
  await tx
    .update(trips)
    .set({ status: "completed", completedAt, updatedAt: now })
    .where(eq(trips.id, tripId));
  const confirmed = await tx
    .select({
      id: bookings.id,
      status: bookings.status,
      seats: bookings.seats,
      fromStopId: bookings.fromStopId,
      toStopId: bookings.toStopId,
    })
    .from(bookings)
    .where(and(eq(bookings.tripId, tripId), eq(bookings.status, "confirmed")));
  // A passenger who said the driver didn't come waits for that to be
  // decided (spec 8, 3.4); a no-show is no longer confirmed.
  const open =
    confirmed.length === 0
      ? []
      : await tx
          .select({ bookingId: disputes.bookingId })
          .from(disputes)
          .where(
            and(
              inArray(
                disputes.bookingId,
                confirmed.map((booking) => booking.id),
              ),
              isNull(disputes.outcome),
            ),
          );
  const reported = new Set(open.map((row) => row.bookingId));
  const completing = confirmed.filter((booking) =>
    completesWithTrip({
      status: booking.status as BookingStatus,
      openReport: reported.has(booking.id),
    }),
  );
  if (completing.length === 0) return;
  const stops = await stopsOf(tx, tripId);
  for (const booking of completing) {
    await tx
      .update(bookings)
      .set({ status: "completed", completedAt, updatedAt: now })
      .where(eq(bookings.id, booking.id));
    await changeOccupancy(tx, tripId, partOf(stops, booking), -booking.seats);
  }
  // "How was your trip?" (spec 8, 3.7.6).
  await recordEvents(
    tx,
    completing.map((booking) => ({ type: "BookingCompleted", bookingId: booking.id })),
    now,
  );
}
