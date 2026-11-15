// Sample trips for local development and staging (milestone 3, plan 4.4):
// a few upcoming trips by fictional drivers, so search has something to
// find. Their times, prices and segments come from the domain's rules.
import {
  checkTripForPublishing,
  defaultTripSettings,
  firstTripChoices,
  lookUpLegs,
  plannedTimes,
  type BookingMode,
} from "@shareride/domain";
import { inArray } from "drizzle-orm";
import type { Database } from "../index.ts";
import { legs, segments, trips, tripStops, users, vehicles } from "../schema/index.ts";
import { sampleId } from "./seed.ts";

interface SampleDriver {
  readonly key: string;
  readonly firstName: string;
  readonly car: { readonly make: string; readonly model: string; readonly colour: string };
}

const drivers: readonly SampleDriver[] = [
  { key: "anna", firstName: "Anna", car: { make: "Toyota", model: "Yaris", colour: "white" } },
  { key: "jon", firstName: "Jón", car: { make: "Kia", model: "Ceed", colour: "blue" } },
  { key: "sigga", firstName: "Sigga", car: { make: "Škoda", model: "Octavia", colour: "grey" } },
];

interface SampleTrip {
  readonly key: string;
  readonly driver: string;
  /** Sample meeting point keys, in route order. */
  readonly stops: readonly string[];
  /** Days after the seed runs, and the departure in Iceland time (UTC). */
  readonly daysAhead: number;
  readonly departure: string;
  readonly seats: number;
  readonly priceLevel: number;
  readonly bookingMode: BookingMode;
}

export const sampleTrips: readonly SampleTrip[] = [
  {
    key: "anna-akureyri",
    driver: "anna",
    stops: ["bsi", "borgarnes", "blonduos", "akureyri"],
    daysAhead: 1,
    departure: "09:00",
    seats: 3,
    priceLevel: 100,
    bookingMode: "approval",
  },
  {
    key: "anna-home",
    driver: "anna",
    stops: ["akureyri", "varmahlid", "blonduos", "borgarnes", "bsi"],
    daysAhead: 3,
    departure: "15:00",
    seats: 3,
    priceLevel: 100,
    bookingMode: "approval",
  },
  {
    key: "jon-airport",
    driver: "jon",
    stops: ["hlemmur", "fjordur", "fitjar", "kef"],
    daysAhead: 1,
    departure: "05:30",
    seats: 2,
    priceLevel: 100,
    bookingMode: "instant",
  },
  {
    key: "jon-vik",
    driver: "jon",
    stops: ["selfoss", "hella", "hvolsvollur", "vik"],
    daysAhead: 2,
    departure: "10:00",
    seats: 2,
    priceLevel: 80,
    bookingMode: "instant",
  },
  {
    key: "sigga-selfoss",
    driver: "sigga",
    stops: ["mjodd", "hveragerdi", "selfoss"],
    daysAhead: 1,
    departure: "17:15",
    seats: 4,
    priceLevel: 90,
    bookingMode: "approval",
  },
];

const pointId = (key: string) => sampleId(`point:${key}`);

/**
 * Replaces the sample trips with the same trips from `now` on, so staging
 * always has trips in the next days. Needs the sample meeting points and
 * legs first. Local development and staging only (see seed-guard.ts).
 */
export async function seedSampleTrips(db: Database, now: Date): Promise<void> {
  const legRows = await db.select().from(legs);
  const lookup = lookUpLegs(
    legRows.map((row) => ({
      from: row.fromMeetingPointId,
      to: row.toMeetingPointId,
      distanceM: row.distanceM,
      durationS: row.durationS,
    })),
  );
  await db.transaction(async (tx) => {
    for (const driver of drivers) {
      const id = sampleId(`user:${driver.key}`);
      await tx
        .insert(users)
        .values({
          id,
          firstName: driver.firstName,
          locale: "is",
          ageConfirmedAt: now,
          licenceDeclaredAt: now,
        })
        .onConflictDoNothing();
      await tx
        .insert(vehicles)
        .values({ id: sampleId(`car:${driver.key}`), ownerId: id, ...driver.car })
        .onConflictDoNothing();
    }
    await tx.delete(trips).where(
      inArray(
        trips.id,
        sampleTrips.map((trip) => sampleId(`trip:${trip.key}`)),
      ),
    );

    for (const sample of sampleTrips) {
      const day = new Date(now.getTime() + sample.daysAhead * 24 * 3600 * 1000);
      const departure = new Date(`${day.toISOString().slice(0, 10)}T${sample.departure}:00Z`);
      const stops = sample.stops.map(pointId);
      const typicalS = stops.slice(1).map((to, index) => {
        const leg = lookup(stops[index] ?? "", to);
        if (leg === undefined) throw new Error(`The sample trip ${sample.key} has no legs.`);
        return leg.durationS;
      });
      const times = plannedTimes(departure, typicalS, defaultTripSettings);
      const checked = checkTripForPublishing(
        {
          stops: stops.map((stop) => ({
            id: stop,
            offered: true,
            season: { seasonStartMonth: null, seasonEndMonth: null },
          })),
          plannedTimes: times,
          seats: sample.seats,
          priceLevel: sample.priceLevel,
          note: "",
          hasCar: true,
          driverReady: true,
          otherTrips: [],
        },
        lookup,
        now,
        defaultTripSettings,
      );
      if (!checked.ok || checked.value.problems.length > 0) {
        throw new Error(`The sample trip ${sample.key} breaks a rule.`);
      }
      const tripId = sampleId(`trip:${sample.key}`);
      await tx.insert(trips).values({
        id: tripId,
        driverId: sampleId(`user:${sample.driver}`),
        vehicleId: sampleId(`car:${sample.driver}`),
        status: "published",
        capacity: sample.seats,
        priceLevel: sample.priceLevel,
        bookingMode: sample.bookingMode,
        ...firstTripChoices.preferences,
        departsAt: checked.value.departsAt,
        arrivesAt: checked.value.arrivesAt,
        publishedAt: now,
        sample: true,
        createdAt: now,
        updatedAt: now,
      });
      const stopRows = await tx
        .insert(tripStops)
        .values(
          stops.map((meetingPointId, position) => ({
            tripId,
            meetingPointId,
            position,
            plannedAt: times[position] ?? null,
          })),
        )
        .returning({ id: tripStops.id });
      await tx.insert(segments).values(
        checked.value.segments.map((segment, position) => ({
          tripId,
          position,
          fromStopId: stopRows[position]?.id ?? "",
          toStopId: stopRows[position + 1]?.id ?? "",
          distanceM: segment.distanceM,
          durationS: segment.durationS,
          suggestedPrice: segment.suggestedPrice.amount,
          cap: segment.cap.amount,
          price: segment.price.amount,
          capacity: sample.seats,
        })),
      );
    }
  });
}
