// What the CO2 figures are read with (spec 34, section 6): the operator's
// grams per car km as they are now, and a part's road metres in SQL, for
// lists of bookings read in one statement.
import { schema } from "@shareride/db";
import {
  co2SettingsFrom,
  defaultSettingValues,
  type BookingStatus,
  type Co2Booking,
  type Co2Settings,
} from "@shareride/domain";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { Queryable } from "../bookings/seats.ts";

const { bookings, segments, tripStops } = schema;

/** The CO2 value now, as `current()` gives it: a few seconds old at most. */
export type Co2SettingsSource = () => Promise<Co2Settings>;

/** The starting value, for a test of one module. */
export const defaultCo2Settings: Co2SettingsSource = () =>
  Promise.resolve(co2SettingsFrom(defaultSettingValues));

/**
 * The road metres of a part: the trip's stretches from the boarding stop's
 * position up to the alighting stop's, which is not counted.
 */
export function partDistanceSql(
  tripId: AnyPgColumn | SQL,
  boardPosition: AnyPgColumn | SQL,
  alightPosition: AnyPgColumn | SQL,
): SQL<number> {
  return sql<number>`(
    select coalesce(sum(${segments.distanceM}), 0)::integer from ${segments}
    where ${segments.tripId} = ${tripId}
      and ${segments.position} >= ${boardPosition}
      and ${segments.position} < ${alightPosition}
  )`.mapWith(Number);
}

const counted: BookingStatus[] = ["confirmed", "completed"];

/** The bookings on these trips that can count (spec 34, 3.7), each with what its figure is made from. */
export async function countedBookingsOn(
  q: Queryable,
  tripIds: readonly string[],
): Promise<(Co2Booking & { readonly tripId: string })[]> {
  if (tripIds.length === 0) return [];
  const boardStops = alias(tripStops, "co2_board_stops");
  const alightStops = alias(tripStops, "co2_alight_stops");
  const rows = await q
    .select({
      tripId: bookings.tripId,
      status: bookings.status,
      storedGrams: bookings.co2Grams,
      distanceM: partDistanceSql(bookings.tripId, boardStops.position, alightStops.position),
    })
    .from(bookings)
    .innerJoin(boardStops, eq(boardStops.id, bookings.fromStopId))
    .innerJoin(alightStops, eq(alightStops.id, bookings.toStopId))
    .where(and(inArray(bookings.tripId, [...tripIds]), inArray(bookings.status, counted)));
  return rows.map((row) => ({ ...row, status: row.status as BookingStatus }));
}
