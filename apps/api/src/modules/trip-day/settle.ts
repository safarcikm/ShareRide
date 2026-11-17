// Reports nobody answered in time stand (R8.6): the API's minute job, next
// to the trips moving on. Each is decided once, with its trip locked as a
// booking change locks it.
import { schema, type Database } from "@shareride/db";
import { completesAt, settlesUnanswered, type TripDaySettings } from "@shareride/domain";
import { and, eq, isNull } from "drizzle-orm";
import { asRule } from "./disputes.ts";
import { applyOutcome } from "./outcome.ts";

const { bookings, disputes, trips } = schema;

/**
 * Lets every unanswered report whose time to answer has passed stand.
 * A trip already locked is left for the next run, so instances never wait
 * on each other or on a booking. A second run changes nothing.
 */
export async function settleUnansweredReports(
  db: Database,
  now: Date,
  settings: TripDaySettings,
): Promise<number> {
  const open = await db
    .select({ id: disputes.id, tripId: bookings.tripId })
    .from(disputes)
    .innerJoin(bookings, eq(bookings.id, disputes.bookingId))
    .where(and(isNull(disputes.outcome), isNull(disputes.answer)));
  let settled = 0;
  for (const { id, tripId } of open) {
    const done = await db.transaction(async (tx) => {
      const [trip] = await tx
        .select({ arrivesAt: trips.arrivesAt })
        .from(trips)
        .where(eq(trips.id, tripId))
        .for("update", { skipLocked: true });
      // Locked by a booking or another run: the next run settles it.
      if (trip === undefined || trip.arrivesAt === null) return false;
      const [dispute] = await tx.select().from(disputes).where(eq(disputes.id, id));
      if (
        dispute === undefined ||
        !settlesUnanswered(asRule(dispute), completesAt(trip.arrivesAt, settings), now, settings)
      ) {
        return false;
      }
      await applyOutcome(tx, dispute, { outcome: "stands", by: "system", note: "" }, now);
      return true;
    });
    if (done) settled += 1;
  }
  return settled;
}
