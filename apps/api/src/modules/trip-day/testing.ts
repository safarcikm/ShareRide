// For the browser tests only (milestone 7 plan, 4.2): the e2e API's route
// that brings one trip's day closer. It moves one trip's times, never the
// clock, because the journeys run in parallel against one API and moving
// everyone's clock would expire other journeys' requests. Never used by the
// real server.
import { schema, type Database } from "@shareride/db";
import { defaultTripDaySettings } from "@shareride/domain";
import { eq, sql } from "drizzle-orm";
import { expireAllDueBookings, lockTrip } from "../bookings/seats.ts";
import { moveTripsOn } from "../trips/completion.ts";

const { bookings, trips, tripStops } = schema;

/**
 * Moves every time of the trip so that its first stop is `minutes` from
 * `now`, as if it had always been planned then: its stops, its departure
 * and arrival, and the departure its bookings were made for. Then runs the
 * booking deadlines and the trip day job once, as the server does every
 * minute.
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
  });
  await expireAllDueBookings(db, now);
  await moveTripsOn(db, now, defaultTripDaySettings);
}
