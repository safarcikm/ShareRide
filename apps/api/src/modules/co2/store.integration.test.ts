import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { schema } from "@shareride/db";
import { co2GramsFor, defaultTripDaySettings as settings, partDistanceM } from "@shareride/domain";
import { asc, eq, max, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
} from "../bookings/testing.ts";
import { applyOutcome } from "../trip-day/outcome.ts";
import { moveTripsOn } from "../trips/completion.ts";

// When a booking completes it keeps the grams one car not driven saves on
// its part, at the setting in force then (spec 34, 3.2; R34.2, R34.3).
// The airport trip at the test clock: Jón, Hlemmur to Keflavík Airport on
// Saturday at 05:30, 2 seats, instant.

let api: TestApi;
let operatorId: string;
const { airport } = sampleTrip;
const hourMs = 3_600_000;
const { bookings, disputes, segments, settingChanges, trips } = schema;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
  operatorId = (await api.signInOperator()).userId;
});

beforeEach(async () => {
  await freshSampleTrips(api);
});

afterEach(async () => {
  rewind();
  // The history is append-only: the next test starts from 150 again.
  await setCo2(150);
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, booked, paid } = bookingHelpers(() => api);
const run = () => moveTripsOn(api.connection.db, api.now(), settings);

/** The operator changes the CO2 per car km, as the console does. */
async function setCo2(grams: number) {
  const [last] = await api.connection.db
    .select({ version: max(settingChanges.version) })
    .from(settingChanges);
  await api.connection.db.insert(settingChanges).values({
    version: (last?.version ?? 0) + 1,
    key: "co2_grams_per_car_km",
    oldValue: 150,
    newValue: grams,
    reason: "For a test",
    changedBy: operatorId,
    createdAt: api.now(),
    updatedAt: api.now(),
  });
}

/** The grams a part of the airport trip saves at a setting, from its stretches as stored. */
async function gramsOf(board: number, alight: number, gramsPerCarKm: number) {
  const rows = await api.connection.db
    .select({ distanceM: segments.distanceM })
    .from(segments)
    .where(eq(segments.tripId, airport))
    .orderBy(asc(segments.position));
  const distances = rows.map((row) => row.distanceM);
  return co2GramsFor(partDistanceM(distances, board, alight), gramsPerCarKm);
}

async function stored(bookingId: string) {
  const [row] = await api.connection.db
    .select({ status: bookings.status, co2Grams: bookings.co2Grams })
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  return row;
}

/** Runs the clock to just after the airport trip completes, and completes it. */
async function completeTheTrip() {
  const [trip] = await api.connection.db
    .select({ arrivesAt: trips.arrivesAt })
    .from(trips)
    .where(eq(trips.id, airport));
  const completesAt = (trip?.arrivesAt?.getTime() ?? 0) + 2 * hourMs;
  await later(Math.round((completesAt - api.now().getTime()) / 1000) + 1);
  await run();
}

/** Gunna's two seats from the first stop to the third, paid, and Sigga's unpaid seat after. */
async function twoRides() {
  const gunna = await newMember("Gunna");
  const ride = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 2, seats: 2 });
  await paid(gunna.accessToken, ride.id);
  const sigga = await newMember("Sigga");
  const unpaid = await booked(sigga.accessToken, airport, { fromStop: 2, toStop: 3 });
  return { ride, unpaid };
}

async function report(bookingId: string, kind: "no_show" | "driver_absent") {
  const [made] = await api.connection.db
    .insert(disputes)
    .values({ bookingId, kind, raisedAt: api.now(), createdAt: api.now(), updatedAt: api.now() })
    .returning();
  if (made === undefined) throw new Error("The report was not saved.");
  return made;
}

describe("a booking keeps its grams from when it completed (spec 34, 3.2)", () => {
  it("stores one car's grams on a completed booking, whatever its seats, and none on one that expired", async () => {
    const { ride, unpaid } = await twoRides();
    await completeTheTrip();
    const grams = await gramsOf(0, 2, 150);
    expect(grams).toBeGreaterThan(0);
    expect(await stored(ride.id)).toEqual({ status: "completed", co2Grams: grams });
    expect(await stored(unpaid.id)).toEqual({ status: "expired", co2Grams: null });
  });

  it("keeps the grams when the setting changes after, and counts at the setting in force when it completes", async () => {
    await setCo2(120);
    const { ride } = await twoRides();
    await completeTheTrip();
    expect((await stored(ride.id))?.co2Grams).toBe(await gramsOf(0, 2, 120));

    await setCo2(200);
    await run();
    expect((await stored(ride.id))?.co2Grams).toBe(await gramsOf(0, 2, 120));
  });

  it("stores the grams in force when the operator finds a no-show rode", async () => {
    const { ride } = await twoRides();
    await completeTheTrip();
    await api.connection.db
      .update(bookings)
      .set({ status: "no_show", co2Grams: null })
      .where(eq(bookings.id, ride.id));
    await setCo2(120);
    const dispute = await report(ride.id, "no_show");
    await api.connection.db.transaction((tx) =>
      applyOutcome(tx, dispute, { outcome: "rode", by: "operator", note: "" }, api.now()),
    );
    expect(await stored(ride.id)).toEqual({
      status: "completed",
      co2Grams: await gramsOf(0, 2, 120),
    });
  });

  it("stops counting a booking whose driver's absence stands after the ride (R34.3)", async () => {
    const { ride } = await twoRides();
    await completeTheTrip();
    const dispute = await report(ride.id, "driver_absent");
    await api.connection.db.transaction((tx) =>
      applyOutcome(tx, dispute, { outcome: "stands", by: "system", note: "" }, api.now()),
    );
    expect(await stored(ride.id)).toEqual({ status: "cancelled", co2Grams: null });
  });
});

describe("the migration that added the grams", () => {
  it("gives bookings completed before it their grams at 150 g", async () => {
    const { ride } = await twoRides();
    await completeTheTrip();
    await api.connection.db
      .update(bookings)
      .set({ co2Grams: null })
      .where(eq(bookings.id, ride.id));

    const folder = join(import.meta.dirname, "../../../../../packages/db/migrations");
    const file = readdirSync(folder).find((name) => /^\d{4}_co2_saved\.sql$/.test(name));
    if (file === undefined) throw new Error("No CO2 migration.");
    const backfill = readFileSync(join(folder, file), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .find((statement) => statement.includes('UPDATE "bookings" SET "co2_grams"'));
    if (backfill === undefined) throw new Error("The migration fills in no grams.");
    await api.connection.db.execute(sql.raw(backfill));

    expect((await stored(ride.id))?.co2Grams).toBe(await gramsOf(0, 2, 150));
  });
});
