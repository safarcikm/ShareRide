import { schema } from "@shareride/db";
import { checkInWindow, type TripDaySettings } from "@shareride/domain";
import { inArray } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";

const { checkIns } = schema;

export interface CheckInRow {
  readonly stopId: string;
  /** The passenger's booking; null for the driver's. */
  readonly bookingId: string | null;
  readonly at: Date;
}

/** "I'm here" at these stops: whose, and when (spec 8, 3.2). */
export async function checkInsAt(
  q: Queryable,
  stopIds: readonly string[],
): Promise<readonly CheckInRow[]> {
  if (stopIds.length === 0) return [];
  return q
    .select({
      stopId: checkIns.tripStopId,
      bookingId: checkIns.bookingId,
      at: checkIns.checkedInAt,
    })
    .from(checkIns)
    .where(inArray(checkIns.tripStopId, [...new Set(stopIds)]));
}

/** When the passenger said "I'm here" for this booking, or null. */
export function passengerCheckedInAt(rows: readonly CheckInRow[], bookingId: string): Date | null {
  return rows.find((row) => row.bookingId === bookingId)?.at ?? null;
}

/** When the driver said "I'm here" at this stop, or null: only the driver's has no booking. */
export function driverCheckedInAt(rows: readonly CheckInRow[], stopId: string): Date | null {
  return rows.find((row) => row.stopId === stopId && row.bookingId === null)?.at ?? null;
}

/** When "I'm here" at a stop opens and closes (R8.3), as the contracts give times. */
export function shownWindow(
  stopAt: Date,
  settings: TripDaySettings,
): { readonly opensAt: string; readonly closesAt: string } {
  const { opensAt, closesAt } = checkInWindow(stopAt, settings);
  return { opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() };
}
