// Reports nobody answered in time stand (R8.6): the API's minute job, next
// to the trips moving on. Each is decided once, with its trip locked as a
// booking change locks it.
import { schema } from "@shareride/db";
import { completesAt, settlesUnanswered, type TripDaySettings } from "@shareride/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";
import { asRule } from "./disputes.ts";
import { applyOutcome } from "./outcome.ts";

const { bookings, disputes, trips } = schema;

/**
 * Lets every unanswered report whose time to answer has passed stand.
 * A trip already locked is left for the next run, so instances never wait
 * on each other or on a booking. A second run changes nothing. A report
 * that cannot be settled is left as it was and never holds back the others:
 * the run settles them, then fails with the first error, to be reported.
 */
export async function settleUnansweredReports(
  db: Queryable,
  now: Date,
  settings: TripDaySettings,
): Promise<number> {
  const open = await db
    .select({ id: disputes.id, tripId: bookings.tripId })
    .from(disputes)
    .innerJoin(bookings, eq(bookings.id, disputes.bookingId))
    .where(and(isNull(disputes.outcome), isNull(disputes.answer)))
    .orderBy(asc(disputes.raisedAt));
  let settled = 0;
  const failed: unknown[] = [];
  for (const { id, tripId } of open) {
    const done = await db
      .transaction(async (tx) => {
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
      })
      .catch((error: unknown) => {
        failed.push(error);
        return false;
      });
    if (done) settled += 1;
  }
  if (failed.length > 0) {
    throw new Error(
      `${String(failed.length)} of ${String(open.length)} reports could not be settled.`,
      { cause: failed[0] },
    );
  }
  return settled;
}
