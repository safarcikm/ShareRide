import { schema } from "@shareride/db";
import { checkInWindow, type TripDaySettings } from "@shareride/domain";
import { inArray } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";

const { checkIns } = schema;

export interface CheckInRow {
  readonly stopId: string;
  readonly userId: string;
  readonly at: Date;
}

/** "I'm here" at these stops: who said it at which stop, and when (spec 8, 3.2). */
export async function checkInsAt(
  q: Queryable,
  stopIds: readonly string[],
): Promise<readonly CheckInRow[]> {
  if (stopIds.length === 0) return [];
  return q
    .select({ stopId: checkIns.tripStopId, userId: checkIns.userId, at: checkIns.checkedInAt })
    .from(checkIns)
    .where(inArray(checkIns.tripStopId, [...new Set(stopIds)]));
}

/** When this person said "I'm here" at this stop, or null. */
export function checkedInAt(
  rows: readonly CheckInRow[],
  stopId: string,
  userId: string,
): Date | null {
  return rows.find((row) => row.stopId === stopId && row.userId === userId)?.at ?? null;
}

/** When "I'm here" at a stop opens and closes (R8.3), as the contracts give times. */
export function shownWindow(
  stopAt: Date,
  settings: TripDaySettings,
): { readonly opensAt: string; readonly closesAt: string } {
  const { opensAt, closesAt } = checkInWindow(stopAt, settings);
  return { opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() };
}
