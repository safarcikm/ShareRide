import { soonestTripsRoute } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints, seedSampleTrips } from "@shareride/db/seed";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon), soonest
// first: Jón Hlemmur to the airport on Saturday at 05:30, Anna Reykjavík to
// Akureyri at 09:00, Sigga Mjódd to Selfoss at 17:15, Jón Selfoss to Vík on
// Sunday and Anna back from Akureyri on Monday.

let api: TestApi;

const trip = (key: string) => sampleId(`trip:${key}`);
const soonestFirst = ["jon-airport", "anna-akureyri", "sigga-selfoss", "jon-vik", "anna-home"].map(
  trip,
);

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  await seedSampleTrips(api.connection.db, api.now());
});

afterAll(async () => {
  await api.close();
});

async function soonest(input: Parameters<typeof api.client.call<typeof soonestTripsRoute>>[1]) {
  const result = await api.client.call(soonestTripsRoute, input);
  if (!result.ok) throw new Error(`${String(result.status)} ${result.error.code}`);
  return result.data.results;
}

const ids = (results: { tripId: string }[]) => results.map((result) => result.tripId);

async function stopsOf(tripId: string) {
  return api.connection.db
    .select({ position: schema.tripStops.position, point: schema.tripStops.meetingPointId })
    .from(schema.tripStops)
    .where(eq(schema.tripStops.tripId, tripId))
    .orderBy(asc(schema.tripStops.position));
}

describe("GET /v1/trips/soonest (spec 4, 3.8)", () => {
  it("lists the rides leaving soonest, each for its whole route and one seat, without an account", async () => {
    const results = await soonest({ query: {} });
    expect(ids(results)).toEqual(soonestFirst);

    const [airport] = results;
    const stops = await stopsOf(trip("jon-airport"));
    expect(airport).toMatchObject({
      board: { position: 0, meetingPoint: { id: stops[0]?.point }, nearbyM: null },
      alight: { position: stops.length - 1, meetingPoint: { id: stops.at(-1)?.point } },
      driver: { firstName: "Jón" },
      bookingMode: "instant",
    });
    expect(airport?.alight.nearbyM).toBeNull();
    expect(airport?.total).toEqual(airport?.pricePerSeat);
    for (const result of results) {
      expect(result.tripFrom).toEqual(result.board.meetingPoint.name);
      expect(result.tripTo).toEqual(result.alight.meetingPoint.name);
    }

    expect(ids(await soonest({ query: { limit: 2 } }))).toEqual(soonestFirst.slice(0, 2));
  });

  it("leaves out the signed-in person's own trips", async () => {
    const { accessToken, userId } = await api.signIn(api.newPhoneNumber());
    await api.connection.db
      .update(schema.trips)
      .set({ driverId: userId })
      .where(eq(schema.trips.id, trip("anna-akureyri")));
    try {
      expect(ids(await soonest({ accessToken, query: {} }))).not.toContain(trip("anna-akureyri"));
      expect(ids(await soonest({ query: {} }))).toContain(trip("anna-akureyri"));
    } finally {
      await api.connection.db
        .update(schema.trips)
        .set({ driverId: sampleId("user:anna") })
        .where(eq(schema.trips.id, trip("anna-akureyri")));
    }
  });

  it("leaves out a ride full on one stretch, though its other stretches have seats", async () => {
    // Anna's trip is full from Borgarnes to Blönduós (its second stretch) only.
    const secondStretch = and(
      eq(schema.segments.tripId, trip("anna-akureyri")),
      eq(schema.segments.position, 1),
    );
    await api.connection.db.update(schema.segments).set({ occupancy: 3 }).where(secondStretch);
    try {
      expect(ids(await soonest({ query: {} }))).not.toContain(trip("anna-akureyri"));
    } finally {
      await api.connection.db.update(schema.segments).set({ occupancy: 0 }).where(secondStretch);
    }
  });

  it("fills the list past rides that are full, however many come first", async () => {
    // The three soonest are full on every stretch.
    const full = inArray(schema.segments.tripId, soonestFirst.slice(0, 3));
    await api.connection.db
      .update(schema.segments)
      .set({ occupancy: sql`${schema.segments.capacity}` })
      .where(full);
    try {
      expect(ids(await soonest({ query: { limit: 1 } }))).toEqual([trip("jon-vik")]);
      expect(ids(await soonest({ query: {} }))).toEqual(soonestFirst.slice(3));
    } finally {
      await api.connection.db.update(schema.segments).set({ occupancy: 0 }).where(full);
    }
  });

  it("leaves out a ride whose last meeting point is paused, and lists one at a point being retired", async () => {
    const stops = await stopsOf(trip("jon-airport"));
    const lastIs = (status: "active" | "paused" | "retiring") =>
      api.connection.db
        .update(schema.meetingPoints)
        .set({ status })
        .where(eq(schema.meetingPoints.id, stops.at(-1)?.point ?? ""));
    try {
      await lastIs("paused");
      expect(ids(await soonest({ query: {} }))).not.toContain(trip("jon-airport"));
      await lastIs("retiring");
      expect(ids(await soonest({ query: {} }))).toContain(trip("jon-airport"));
    } finally {
      await lastIs("active");
    }
  });

  it("leaves out a cancelled ride and one whose first meeting point is paused", async () => {
    const [first] = await stopsOf(trip("sigga-selfoss"));
    const pause = (status: "active" | "paused") =>
      api.connection.db
        .update(schema.meetingPoints)
        .set({ status })
        .where(eq(schema.meetingPoints.id, first?.point ?? ""));
    await api.connection.db
      .update(schema.trips)
      .set({ status: "cancelled" })
      .where(eq(schema.trips.id, trip("jon-vik")));
    await pause("paused");
    try {
      const found = ids(await soonest({ query: {} }));
      expect(found).not.toContain(trip("jon-vik"));
      expect(found).not.toContain(trip("sigga-selfoss"));
    } finally {
      await pause("active");
      await api.connection.db
        .update(schema.trips)
        .set({ status: "published" })
        .where(eq(schema.trips.id, trip("jon-vik")));
    }
  });

  it("stops listing a ride 15 minutes before its first stop", async () => {
    const [first] = await soonest({ query: { limit: 1 } });
    const leaves = new Date(first?.board.plannedAt ?? 0).getTime();
    const untilCutoff = (leaves - api.now().getTime()) / 1000 - 15 * 60;
    api.advance(untilCutoff - 1);
    try {
      expect(ids(await soonest({ query: { limit: 1 } }))).toEqual([trip("jon-airport")]);
      api.advance(1);
      expect(ids(await soonest({ query: { limit: 1 } }))).toEqual([trip("anna-akureyri")]);
    } finally {
      api.advance(-untilCutoff);
    }
  });

  it("refuses a limit outside 1 to 50", async () => {
    for (const limit of [0, 51]) {
      const result = await api.client.call(soonestTripsRoute, { query: { limit } });
      expect(result).toMatchObject({ status: 400, error: { code: "validation_failed" } });
    }
  });

  it("counts against the search limit, per address", async () => {
    api.ip = "198.51.100.9";
    let refused: Awaited<ReturnType<typeof api.client.call<typeof soonestTripsRoute>>> | undefined;
    for (let attempt = 0; attempt < 80 && refused === undefined; attempt += 1) {
      const result = await api.client.call(soonestTripsRoute, { query: { limit: 1 } });
      if (!result.ok) refused = result;
    }
    expect(refused).toMatchObject({ status: 429, error: { code: "rate_limited" } });
    api.ip = "198.51.100.10";
    expect(await soonest({ query: { limit: 1 } })).toHaveLength(1);
  });
});
