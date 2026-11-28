// A member's own CO2 record (spec 34, 3.8 and 3.11): the completed
// bookings themselves, each with the grams it kept, as a passenger and as
// the driver of their trips, plus what was carried over from those made
// anonymous 3 years after. Only the member reads it (R34.6).
import type { Co2Totals as Co2TotalsView } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { addCo2Totals, co2TotalGrams, noCo2, type Co2Totals } from "@shareride/domain";
import { and, count, countDistinct, eq, isNotNull, sum } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";
import { co2CarriedOf } from "./carried.ts";

const { bookings, trips } = schema;

const countedBooking = and(eq(bookings.status, "completed"), isNotNull(bookings.co2Grams));

/** The member's totals from their completed bookings, as a passenger and as a driver. */
export async function co2TotalsOf(q: Queryable, userId: string): Promise<Co2Totals> {
  const [[rode], [drove], carried] = await Promise.all([
    q
      .select({ grams: sum(bookings.co2Grams).mapWith(Number), rides: count() })
      .from(bookings)
      .where(and(eq(bookings.passengerId, userId), countedBooking)),
    q
      .select({
        grams: sum(bookings.co2Grams).mapWith(Number),
        rides: countDistinct(bookings.tripId),
        passengers: count(),
      })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .where(and(eq(trips.driverId, userId), countedBooking)),
    co2CarriedOf(q, userId),
  ]);
  const live: Co2Totals = {
    asPassenger: { grams: rode?.grams ?? 0, rides: rode?.rides ?? 0 },
    asDriver: {
      grams: drove?.grams ?? 0,
      rides: drove?.rides ?? 0,
      passengers: drove?.passengers ?? 0,
    },
  };
  // With what was carried over from their trips made anonymous (3.11).
  return addCo2Totals([live, carried ?? noCo2]);
}

/** The totals as the member sees them: a role with no rides is null; at 0 nothing shows. */
export function co2TotalsView(totals: Co2Totals, gramsPerCarKm: number): Co2TotalsView {
  if (gramsPerCarKm === 0) return { grams: 0, asPassenger: null, asDriver: null };
  const { asPassenger, asDriver } = totals;
  return {
    grams: co2TotalGrams(totals),
    asPassenger: asPassenger.rides === 0 ? null : asPassenger,
    asDriver: asDriver.rides === 0 ? null : asDriver,
  };
}
