import { tripSearchAlternativesRoute, tripSearchRoute } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints, seedSampleTrips } from "@shareride/db/seed";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon): Anna
// drives Reykjavík to Akureyri on Saturday at 09:00 and back on Monday at
// 15:00, Jón Hlemmur to the airport on Saturday at 05:30 (instant booking)
// and Selfoss to Vík on Sunday, Sigga Mjódd to Selfoss on Saturday at 17:15.

let api: TestApi;

const point = (key: string) => sampleId(`point:${key}`);
const place = (key: string) => sampleId(`place:${key}`);
const trip = (key: string) => sampleId(`trip:${key}`);

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  await seedSampleTrips(api.connection.db, api.now());
});

afterAll(async () => {
  await api.close();
});

async function search(query: Parameters<typeof api.client.call<typeof tripSearchRoute>>[1]) {
  const result = await api.client.call(tripSearchRoute, query);
  if (!result.ok) throw new Error(`${String(result.status)} ${result.error.code}`);
  return result.data.results;
}

describe("GET /v1/trips/search (spec 4, R4.1)", () => {
  it("finds Reykjavík to Akureyri for Borgarnes to Blönduós, without an account", async () => {
    const results = await search({ query: { from: point("borgarnes"), to: point("blonduos") } });
    expect(results).toHaveLength(1);
    const [found] = results;
    expect(found).toMatchObject({
      tripId: trip("anna-akureyri"),
      board: { position: 1, meetingPoint: { id: point("borgarnes") }, nearbyM: null },
      alight: { position: 2, meetingPoint: { id: point("blonduos") }, nearbyM: null },
      tripFrom: { is: "BSÍ" },
      tripTo: { en: "Hof bus stop, Akureyri" },
      freeSeats: 3,
      driver: { firstName: "Anna" },
      bookingMode: "approval",
    });
    expect(found?.pricePerSeat.amount).toBeGreaterThan(0);
    expect(found?.total).toEqual(found?.pricePerSeat);
    expect(found?.board.plannedAt.slice(0, 10)).toBe("2026-11-14");
  });

  it("does not find a trip going the other way, and finds the one that does", async () => {
    const results = await search({ query: { from: point("blonduos"), to: point("borgarnes") } });
    expect(results.map((result) => result.tripId)).toEqual([trip("anna-home")]);
  });

  it("keeps to the date of the passenger's own departure, in Iceland", async () => {
    const query = { from: point("borgarnes"), to: point("blonduos") };
    expect(await search({ query: { ...query, date: "2026-11-14" } })).toHaveLength(1);
    expect(await search({ query: { ...query, date: "2026-11-15" } })).toEqual([]);
  });

  it("covers the whole capital area for Reykjavík, and nearby points for a meeting point", async () => {
    const fromCapital = await search({ query: { from: place("capital-area"), to: point("kef") } });
    expect(fromCapital).toMatchObject([
      { tripId: trip("jon-airport"), board: { meetingPoint: { id: point("hlemmur") } } },
    ]);
    expect(fromCapital[0]?.board.nearbyM).toBeNull();

    // Kringlan is under 2 km from Hlemmur.
    const fromKringlan = await search({ query: { from: point("kringlan"), to: point("kef") } });
    expect(fromKringlan[0]?.board.meetingPoint.id).toBe(point("hlemmur"));
    expect(fromKringlan[0]?.board.nearbyM).toBeGreaterThan(1000);
    expect(fromKringlan[0]?.board.nearbyM).toBeLessThan(3000);
  });

  it("finds a stop at a point being retired, whose trips still stop there, but not a paused one", async () => {
    const hlemmurIs = (status: "active" | "paused" | "retiring") =>
      api.connection.db
        .update(schema.meetingPoints)
        .set({ status })
        .where(eq(schema.meetingPoints.id, point("hlemmur")));
    const boardsAt = async (from: string) =>
      (await search({ query: { from, to: point("kef") } })).map(
        (result) => result.board.meetingPoint.id,
      );
    try {
      await hlemmurIs("retiring");
      expect(await boardsAt(point("kringlan"))).toEqual([point("hlemmur")]);
      expect(await boardsAt(place("capital-area"))).toEqual([point("hlemmur")]);
      // Paused, nobody boards at Hlemmur: the trip's next stop in the
      // capital area, Fjörður, is still found.
      await hlemmurIs("paused");
      expect(await boardsAt(point("kringlan"))).toEqual([]);
      expect(await boardsAt(place("capital-area"))).toEqual([point("fjordur")]);
    } finally {
      await hlemmurIs("active");
    }
  });

  it("filters by instant booking and time of day, and sorts by time or price", async () => {
    const fromCapital = { from: place("capital-area"), to: place("selfoss-town") };
    expect(await search({ query: { ...fromCapital, instant: true } })).toEqual([]);
    const evening = await search({ query: { ...fromCapital, timeOfDay: "afternoon" } });
    expect(evening.map((result) => result.tripId)).toEqual([trip("sigga-selfoss")]);
    expect(await search({ query: { ...fromCapital, timeOfDay: "morning" } })).toEqual([]);

    const north = { from: place("capital-area"), to: point("borgarnes") };
    const byTime = await search({ query: north });
    const byPrice = await search({ query: { ...north, sort: "price" } });
    expect(byTime.map((result) => result.tripId)).toEqual([trip("anna-akureyri")]);
    expect(byPrice).toEqual(byTime);
  });

  it("prices the seats asked for and leaves out trips without them free", async () => {
    const query = { from: point("borgarnes"), to: point("blonduos") };
    const [two] = await search({ query: { ...query, seats: 2 } });
    expect(two?.total.amount).toBe((two?.pricePerSeat.amount ?? 0) * 2);
    expect(await search({ query: { ...query, seats: 4 } })).toEqual([]);

    // Two seats held from Borgarnes on: one is left on that part.
    await api.connection.db
      .update(schema.segments)
      .set({ occupancy: 2 })
      .where(eq(schema.segments.tripId, trip("anna-akureyri")));
    try {
      const [held] = await search({ query });
      expect(held?.freeSeats).toBe(1);
      expect(await search({ query: { ...query, seats: 2 } })).toEqual([]);
    } finally {
      await api.connection.db
        .update(schema.segments)
        .set({ occupancy: 0 })
        .where(eq(schema.segments.tripId, trip("anna-akureyri")));
    }
  });

  it("leaves out a signed-in driver's own trips", async () => {
    const { accessToken, userId } = await api.signIn(api.newPhoneNumber());
    const query = { from: point("borgarnes"), to: point("blonduos") };
    expect(await search({ accessToken, query })).toHaveLength(1);
    await api.connection.db
      .update(schema.trips)
      .set({ driverId: userId })
      .where(eq(schema.trips.id, trip("anna-akureyri")));
    try {
      expect(await search({ accessToken, query })).toEqual([]);
      expect(await search({ query })).toHaveLength(1);
    } finally {
      await api.connection.db
        .update(schema.trips)
        .set({ driverId: sampleId("user:anna") })
        .where(eq(schema.trips.id, trip("anna-akureyri")));
    }
  });

  it("stops finding a trip 15 minutes before the boarding stop", async () => {
    const query = { from: point("hlemmur"), to: point("kef") };
    const [found] = await search({ query });
    const boarding = new Date(found?.board.plannedAt ?? 0).getTime();
    const untilCutoff = (boarding - api.now().getTime()) / 1000 - 15 * 60;
    api.advance(untilCutoff);
    try {
      expect(await search({ query })).toHaveLength(1);
      api.advance(1);
      expect(await search({ query })).toEqual([]);
    } finally {
      api.advance(-untilCutoff - 1);
    }
  });

  it("refuses unknown places, the same place twice and a token that is not valid", async () => {
    const unknown = await api.client.call(tripSearchRoute, {
      query: { from: sampleId("nowhere"), to: point("kef") },
    });
    expect(unknown).toMatchObject({
      status: 404,
      error: { code: "not_found", details: [{ path: "from", issue: "not_found" }] },
    });
    const same = await api.client.call(tripSearchRoute, {
      query: { from: point("kef"), to: point("kef") },
    });
    expect(same).toMatchObject({ status: 400, error: { code: "validation_failed" } });
    const stale = await api.client.call(tripSearchRoute, {
      accessToken: "sr_at_not-a-real-token",
      query: { from: point("borgarnes"), to: point("blonduos") },
    });
    expect(stale).toMatchObject({ status: 401, error: { code: "unauthenticated" } });
  });
});

describe("GET /v1/trips/search/alternatives (spec 4, 3.5; R4.7)", () => {
  it("counts trips on the three days either side of the date", async () => {
    const result = await api.client.call(tripSearchAlternativesRoute, {
      query: { from: point("borgarnes"), to: point("blonduos"), date: "2026-11-15" },
    });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.days).toEqual([
      { date: "2026-11-12", count: 0 },
      { date: "2026-11-13", count: 0 },
      { date: "2026-11-14", count: 1 },
      { date: "2026-11-16", count: 0 },
      { date: "2026-11-17", count: 0 },
      { date: "2026-11-18", count: 0 },
    ]);
  });

  it("finds trips from meeting points within 20 km, with how far they are", async () => {
    // Nothing leaves from Mosfellsbær; BSÍ is about 12 km away.
    const result = await api.client.call(tripSearchAlternativesRoute, {
      query: { from: point("mosfellsbaer"), to: point("blonduos") },
    });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.days).toEqual([]);
    const [nearby] = result.data.nearby;
    expect(nearby).toMatchObject({
      tripId: trip("anna-akureyri"),
      board: { meetingPoint: { id: point("bsi") } },
      alight: { meetingPoint: { id: point("blonduos") }, nearbyM: null },
    });
    expect(nearby?.board.nearbyM).toBeGreaterThan(10_000);
    expect(nearby?.board.nearbyM).toBeLessThan(20_000);
  });
});

describe("search rate limit", () => {
  it("refuses searches from one address past the limit, and says when to try again", async () => {
    api.ip = "198.51.100.7";
    const query = { from: point("borgarnes"), to: point("blonduos") };
    let refused: Awaited<ReturnType<typeof api.client.call<typeof tripSearchRoute>>> | undefined;
    for (let attempt = 0; attempt < 80 && refused === undefined; attempt += 1) {
      const result = await api.client.call(tripSearchRoute, { query });
      if (!result.ok) refused = result;
    }
    expect(refused).toMatchObject({ status: 429, error: { code: "rate_limited" } });
    if (refused?.ok === false) expect(refused.error.retryAfterSeconds).toBeGreaterThan(0);
    // Another address is not affected.
    api.ip = "198.51.100.8";
    expect(await search({ query })).toHaveLength(1);
  });
});
