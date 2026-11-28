// The CO2 totals carried over (spec 34, 3.11; R34.9): 3 years after a trip,
// its records move to the shared former member (spec 11, 3.7), so before
// they do, what its completed bookings saved is added to each passenger's
// and to the driver's carried totals. A member's totals then stay as they
// were; only the member reads them, and they go with the account.
import { schema } from "@shareride/db";
import type { Co2Totals } from "@shareride/domain";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Queryable, Transaction } from "../bookings/seats.ts";

const { bookings, co2Carried, formerMemberId, trips } = schema;

interface Carried {
  passengerGrams: number;
  passengerRides: number;
  driverGrams: number;
  driverRides: number;
  driverPassengers: number;
}

const nothing = (): Carried => ({
  passengerGrams: 0,
  passengerRides: 0,
  driverGrams: 0,
  driverRides: 0,
  driverPassengers: 0,
});

/** Grams to the nearest whole kilogram. */
function toWholeKilograms(grams: number): number {
  return Math.round(grams / 1000) * 1000;
}

/**
 * Adds the trip's completed bookings with grams to their passengers' and
 * their driver's carried totals: grams and one ride per booking for a
 * passenger; the grams, one ride and one passenger per booking for the
 * driver; the grams each to the nearest kilogram. Someone already the
 * former member is left out. Runs in the
 * transaction that makes the trip anonymous, before its people move.
 */
export async function carryCo2(tx: Transaction, tripId: string, now: Date): Promise<void> {
  const counted = await tx
    .select({ passengerId: bookings.passengerId, grams: bookings.co2Grams })
    .from(bookings)
    .where(
      and(
        eq(bookings.tripId, tripId),
        eq(bookings.status, "completed"),
        isNotNull(bookings.co2Grams),
      ),
    );
  if (counted.length === 0) return;
  const [trip] = await tx
    .select({ driverId: trips.driverId })
    .from(trips)
    .where(eq(trips.id, tripId));

  const people = new Map<string, Carried>();
  const of = (userId: string) => {
    const found = people.get(userId) ?? nothing();
    people.set(userId, found);
    return found;
  };
  for (const { passengerId, grams } of counted) {
    const passenger = of(passengerId);
    passenger.passengerGrams += grams ?? 0;
    passenger.passengerRides += 1;
  }
  if (trip !== undefined) {
    const driver = of(trip.driverId);
    driver.driverGrams += counted.reduce((total, { grams }) => total + (grams ?? 0), 0);
    driver.driverRides += 1;
    driver.driverPassengers += counted.length;
  }
  people.delete(formerMemberId);
  if (people.size === 0) return;
  // Whole kilograms only, to the nearest: exact sums would give a single
  // ride's grams and so hint at the trip made anonymous.
  for (const carried of people.values()) {
    carried.passengerGrams = toWholeKilograms(carried.passengerGrams);
    carried.driverGrams = toWholeKilograms(carried.driverGrams);
  }
  // Only the month: the moment would match the trip's, made anonymous at
  // the same instant, and point back at it (A51).
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // The schema names its columns in snake case (`casing`), so `excluded`
  // takes the SQL names.
  const added = (column: keyof Carried, name: string) =>
    sql`${co2Carried[column]} + excluded.${sql.identifier(name)}`;
  await tx
    .insert(co2Carried)
    .values(
      [...people].map(([userId, carried]) => ({
        userId,
        ...carried,
        createdAt: month,
        updatedAt: month,
      })),
    )
    .onConflictDoUpdate({
      target: co2Carried.userId,
      set: {
        passengerGrams: added("passengerGrams", "passenger_grams"),
        passengerRides: added("passengerRides", "passenger_rides"),
        driverGrams: added("driverGrams", "driver_grams"),
        driverRides: added("driverRides", "driver_rides"),
        driverPassengers: added("driverPassengers", "driver_passengers"),
        updatedAt: month,
      },
    });
}

/** The member's carried totals, or null when none of their trips was made anonymous. */
export async function co2CarriedOf(q: Queryable, userId: string): Promise<Co2Totals | null> {
  const [row] = await q.select().from(co2Carried).where(eq(co2Carried.userId, userId));
  if (row === undefined) return null;
  return {
    asPassenger: { grams: row.passengerGrams, rides: row.passengerRides },
    asDriver: { grams: row.driverGrams, rides: row.driverRides, passengers: row.driverPassengers },
  };
}
