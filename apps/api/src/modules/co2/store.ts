// A booking's grams of CO2 saved (spec 34, 3.2): one car not driven for
// its part, at the operator's grams per car kilometre. Stored on the
// booking when it becomes completed, at the value in force then (R34.2).
import { schema } from "@shareride/db";
import { co2GramsFor, co2SettingsFrom, partDistanceM } from "@shareride/domain";
import { asc, eq } from "drizzle-orm";
import { partOf, stopsOf, type Queryable } from "../bookings/seats.ts";
import { settingValuesIn } from "../settings/rule-settings.ts";

const { segments } = schema;

export interface BookedPart {
  readonly tripId: string;
  readonly fromStopId: string;
  readonly toStopId: string;
}

/** The grams per car km in force, read from the database itself, as a stored figure needs. */
export async function gramsPerCarKmIn(q: Queryable): Promise<number> {
  return co2SettingsFrom(await settingValuesIn(q)).gramsPerCarKm;
}

/** The road metres of a booking's part, from its trip's stretches as stored. */
export async function partDistanceOf(q: Queryable, booking: BookedPart): Promise<number> {
  const [stops, stretches] = await Promise.all([
    stopsOf(q, booking.tripId),
    q
      .select({ distanceM: segments.distanceM })
      .from(segments)
      .where(eq(segments.tripId, booking.tripId))
      .orderBy(asc(segments.position)),
  ]);
  const { board, alight } = partOf(stops, booking);
  return partDistanceM(
    stretches.map((stretch) => stretch.distanceM),
    board,
    alight,
  );
}

/** The grams one car not driven saves on a booking's part. */
export async function co2GramsOf(
  q: Queryable,
  booking: BookedPart,
  gramsPerCarKm: number,
): Promise<number> {
  return co2GramsFor(await partDistanceOf(q, booking), gramsPerCarKm);
}
