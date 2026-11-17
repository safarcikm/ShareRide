// A meeting point's future trips, and the status changes that come with
// time (spec 2, 3.6.4 and 3.6.5): a pause ends on its end date, and a
// retiring point retires once no trip is still to stop there. The minute
// job runs them, next to the trip day's.
import { schema, type Database } from "@shareride/db";
import { icelandDate } from "@shareride/domain";
import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";

const { meetingPoints, tripStops, trips } = schema;

/** Trips that may still stop somewhere: published, or under way. */
const runningStatuses = ["published", "departed"];

/**
 * The trips still to stop at the point: published or under way, with a
 * stop there not removed and not yet passed.
 */
export async function futureTripsAt(q: Queryable, pointId: string, now: Date): Promise<string[]> {
  const rows = await q
    .selectDistinct({ id: trips.id })
    .from(tripStops)
    .innerJoin(trips, eq(trips.id, tripStops.tripId))
    .where(
      and(
        eq(tripStops.meetingPointId, pointId),
        isNull(tripStops.removedAt),
        gt(tripStops.plannedAt, now),
        inArray(trips.status, runningStatuses),
      ),
    );
  return rows.map((row) => row.id);
}

export interface PointsMoved {
  /** Paused points back in use on their end date. */
  readonly resumed: number;
  /** Retiring points retired after their last trip. */
  readonly retired: number;
}

/**
 * Brings paused points back into use from their end date in Iceland, and
 * retires retiring points that no trip is still to stop at. A second run
 * changes nothing. Neither is an operator's action, so neither has an
 * audit entry: the pause's entry holds its end date, and the retirement's
 * entry the point's going to retiring.
 */
export async function moveMeetingPointsOn(db: Database, now: Date): Promise<PointsMoved> {
  // Later than any copy the console loaded, so a save from one is refused.
  const changedNow = sql`greatest(now(), ${meetingPoints.updatedAt} + interval '1 millisecond')`;
  const resumed = await db
    .update(meetingPoints)
    .set({
      status: "active",
      pauseReasonIs: null,
      pauseReasonEn: null,
      pausedUntil: null,
      updatedAt: changedNow,
    })
    .where(
      and(eq(meetingPoints.status, "paused"), lte(meetingPoints.pausedUntil, icelandDate(now))),
    )
    .returning({ id: meetingPoints.id });
  const stillUsed = db
    .select({ one: sql`1` })
    .from(tripStops)
    .innerJoin(trips, eq(trips.id, tripStops.tripId))
    .where(
      and(
        eq(tripStops.meetingPointId, meetingPoints.id),
        isNull(tripStops.removedAt),
        gt(tripStops.plannedAt, now),
        inArray(trips.status, runningStatuses),
      ),
    );
  const retired = await db
    .update(meetingPoints)
    .set({ status: "retired", reviewDueOn: null, updatedAt: changedNow })
    .where(and(eq(meetingPoints.status, "retiring"), sql`not exists (${stillUsed})`))
    .returning({ id: meetingPoints.id });
  return { resumed: resumed.length, retired: retired.length };
}
