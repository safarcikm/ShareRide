// For the browser tests only (milestone 7 plan, 4.2): the e2e API's route
// that brings one trip's day closer. It moves one trip's times, never the
// clock, because the journeys run in parallel against one API and moving
// everyone's clock would expire other journeys' requests. Never used by the
// real server.
import { schema, type Database } from "@shareride/db";
import { defaultTripDaySettings } from "@shareride/domain";
import { eq, inArray, sql } from "drizzle-orm";
import { expireAllDueBookings, lockTrip } from "../bookings/seats.ts";
import { moveTripsOn } from "../trips/completion.ts";
import { settleUnansweredReports } from "./settle.ts";

const { bookings, checkIns, disputes, trips, tripStops } = schema;

/**
 * Moves every time of the trip so that its first stop is `minutes` from
 * `now`, as if it had always been planned then: its stops, its departure
 * and arrival, the departure its bookings were made for, and the "I'm
 * here" and reports already made on it. Then runs the booking deadlines and
 * the trip day job once, as the server does every minute, so a trip moved
 * far enough into the past completes and a report nobody answered stands.
 *
 * Those jobs leave a trip that another transaction holds for their next
 * run, and the test API has no next run. Its notification worker holds a
 * trip for a moment whenever it writes that trip's notifications (a row
 * that points at a trip shares the trip's key), as it does just after a
 * seat is confirmed. So they run here inside the transaction that holds
 * this trip, where they cannot pass it by.
 */
export async function moveTripForTests(
  db: Database,
  tripId: string,
  minutes: number,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const trip = await lockTrip(tx, tripId);
    if (trip === undefined || trip.departsAt === null) throw new Error("No such published trip.");
    const byMs = now.getTime() + minutes * 60_000 - trip.departsAt.getTime();
    const by = sql`${`${String(byMs)} milliseconds`}::interval`;
    await tx
      .update(trips)
      .set({
        departsAt: sql`${trips.departsAt} + ${by}`,
        arrivesAt: sql`${trips.arrivesAt} + ${by}`,
      })
      .where(eq(trips.id, tripId));
    await tx
      .update(tripStops)
      .set({ plannedAt: sql`${tripStops.plannedAt} + ${by}` })
      .where(eq(tripStops.tripId, tripId));
    await tx
      .update(bookings)
      .set({ departsAtWhenBooked: sql`${bookings.departsAtWhenBooked} + ${by}` })
      .where(eq(bookings.tripId, tripId));
    const stops = tx
      .select({ id: tripStops.id })
      .from(tripStops)
      .where(eq(tripStops.tripId, tripId));
    await tx
      .update(checkIns)
      .set({ checkedInAt: sql`${checkIns.checkedInAt} + ${by}` })
      .where(inArray(checkIns.tripStopId, stops));
    const booked = tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.tripId, tripId));
    await tx
      .update(disputes)
      .set({
        raisedAt: sql`${disputes.raisedAt} + ${by}`,
        answeredAt: sql`${disputes.answeredAt} + ${by}`,
        decidedAt: sql`${disputes.decidedAt} + ${by}`,
      })
      .where(inArray(disputes.bookingId, booked));
    await expireAllDueBookings(tx, now);
    await moveTripsOn(tx, now, defaultTripDaySettings);
    await settleUnansweredReports(tx, now, defaultTripDaySettings);
  });
}
