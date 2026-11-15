import { quoteRoute, stopsAlongRoute } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, samplePoints, seedSampleMeetingPoints } from "@shareride/db/seed";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";

let api: TestApi;
let accessToken: string;

const id = (key: string) => sampleId(`point:${key}`);
const kr = (amount: number) => ({ amount, currency: "ISK" });

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  ({ accessToken } = await api.signIn(api.newPhoneNumber()));
});

afterAll(async () => {
  await api.close();
});

/** The sample points' keys, such as "bsi", for their IDs. */
const keys = new Map(samplePoints.map((point) => [id(point.key), point.key]));
const keysOf = (ids: readonly string[]) => ids.map((known) => keys.get(known) ?? known);

describe("GET /v1/routes/stops-along (spec 3, 3.4.2)", () => {
  it("lists the points on the way from Reykjavík to Akureyri in route order", async () => {
    const result = await api.client.call(stopsAlongRoute, {
      accessToken,
      query: { from: id("bsi"), to: id("akureyri") },
    });
    if (!result.ok) throw new Error(result.error.code);
    // Mjódd, Smáralind and Norðlingaholt add 9 to 10 km, Akranes 20 km and
    // Akureyri airport 6 km: over 3 km, so not on the way.
    expect(keysOf(result.data.meetingPoints.map((point) => point.id))).toEqual([
      "hlemmur",
      "kringlan",
      "artun",
      "mosfellsbaer",
      "borgarnes",
      "stadarskali",
      "blonduos",
      "varmahlid",
    ]);
  });

  it("leaves out points out of season on the date", async () => {
    await api.connection.db
      .update(schema.meetingPoints)
      .set({ seasonStartMonth: 5, seasonEndMonth: 9 })
      .where(eq(schema.meetingPoints.id, id("stadarskali")));
    try {
      const inWinter = await api.client.call(stopsAlongRoute, {
        accessToken,
        query: { from: id("bsi"), to: id("akureyri"), date: "2026-12-01" },
      });
      if (!inWinter.ok) throw new Error(inWinter.error.code);
      expect(keysOf(inWinter.data.meetingPoints.map((point) => point.id))).not.toContain(
        "stadarskali",
      );
    } finally {
      await api.connection.db
        .update(schema.meetingPoints)
        .set({ seasonStartMonth: null, seasonEndMonth: null })
        .where(eq(schema.meetingPoints.id, id("stadarskali")));
    }
  });

  it("refuses the same point twice, and points not in use", async () => {
    const same = await api.client.call(stopsAlongRoute, {
      accessToken,
      query: { from: id("bsi"), to: id("bsi") },
    });
    expect(same).toMatchObject({ status: 400, error: { code: "validation_failed" } });
    const unknown = await api.client.call(stopsAlongRoute, {
      accessToken,
      query: { from: id("bsi"), to: sampleId("not a point") },
    });
    expect(unknown).toMatchObject({
      status: 400,
      error: { code: "stop_unavailable", details: [{ path: "to", issue: "unavailable" }] },
    });
  });

  it("needs a signed-in person", async () => {
    const result = await api.client.call(stopsAlongRoute, {
      query: { from: id("bsi"), to: id("akureyri") },
    });
    expect(result.status).toBe(401);
  });
});

describe("POST /v1/routes/quote (spec 3, 3.4 to 3.6)", () => {
  // The worked example in pricing and seats, on the sample roads.
  const stops = [id("bsi"), id("borgarnes"), id("blonduos"), id("akureyri")];

  it("prices Reykjavík to Akureyri as the worked example, summing to the whole route", async () => {
    const result = await api.client.call(quoteRoute, { accessToken, body: { stops, seats: 3 } });
    if (!result.ok) throw new Error(result.error.code);
    const quote = result.data;
    expect(quote.segments.map((segment) => segment.distanceM)).toEqual([71_000, 171_000, 143_000]);
    expect(quote.segments.map((segment) => segment.price)).toEqual([kr(1100), kr(2600), kr(2100)]);
    expect(quote.wholeRoutePrice).toEqual(kr(5800));
    expect(quote).toMatchObject({
      distanceM: 385_000,
      directDistanceM: 385_000,
      priceLevel: 100,
      highestPriceLevel: 250,
      priceLevelStep: 10,
      plannedTimes: null,
      problems: [],
      warnings: [],
    });
    expect(quote.segments[0]).toMatchObject({ suggestedPrice: kr(1100), cap: kr(2700) });
  });

  it("uses the price level, and lowers one above the highest", async () => {
    const lower = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops, seats: 3, priceLevel: 80 },
    });
    expect(lower).toMatchObject({ status: 200, data: { wholeRoutePrice: kr(4700) } });
    const tooHigh = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops, seats: 8, priceLevel: 150 },
    });
    expect(tooHigh).toMatchObject({
      status: 200,
      data: {
        priceLevel: 110,
        highestPriceLevel: 110,
        warnings: [{ code: "price_level_lowered" }],
      },
    });
    const between = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops, seats: 3, priceLevel: 85 },
    });
    expect(between).toMatchObject({ status: 400, error: { code: "price_level_invalid" } });
  });

  it("plans the times from the departure and checks the notice", async () => {
    const departure = new Date(api.now().getTime() + 24 * 3600 * 1000);
    departure.setUTCHours(9, 0, 0, 0);
    const result = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops, seats: 3, departure: departure.toISOString() },
    });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.plannedTimes).toHaveLength(4);
    expect(result.data.plannedTimes?.[0]).toBe(departure.toISOString());
    expect(result.data.problems).toEqual([]);

    const soon = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops, seats: 3, departure: new Date(api.now().getTime() + 600_000).toISOString() },
    });
    expect(soon).toMatchObject({ data: { problems: [{ code: "departure_too_soon" }] } });
  });

  it("finds a route too long, a stop out of season and a stop that adds a lot", async () => {
    const roundabout = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops: [id("bsi"), id("vik"), id("akureyri")], seats: 3 },
    });
    expect(roundabout).toMatchObject({ data: { problems: [{ code: "route_too_long" }] } });

    // Sauðárkrókur adds 50 km to the 143 km from Blönduós to Akureyri.
    const detour = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops: [id("bsi"), id("blonduos"), id("saudarkrokur"), id("akureyri")], seats: 3 },
    });
    expect(detour).toMatchObject({
      data: { problems: [], warnings: [{ code: "stop_adds_distance", stop: 2, addedM: 50_000 }] },
    });

    await api.connection.db
      .update(schema.meetingPoints)
      .set({ seasonStartMonth: 5, seasonEndMonth: 9 })
      .where(eq(schema.meetingPoints.id, id("blonduos")));
    try {
      const winter = await api.client.call(quoteRoute, {
        accessToken,
        body: { stops, seats: 3, departure: "2026-12-01T09:00:00.000Z" },
      });
      expect(winter).toMatchObject({
        data: { problems: [{ code: "stop_out_of_season", stop: 2 }] },
      });
    } finally {
      await api.connection.db
        .update(schema.meetingPoints)
        .set({ seasonStartMonth: null, seasonEndMonth: null })
        .where(eq(schema.meetingPoints.id, id("blonduos")));
    }
  });

  it("puts an added stop where it adds the least distance", async () => {
    const result = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops: [id("bsi"), id("blonduos"), id("akureyri")], add: id("borgarnes"), seats: 3 },
    });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.stops).toEqual(stops);
    expect(result.data.wholeRoutePrice).toEqual(kr(5800));
    const again = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops, add: id("borgarnes"), seats: 3 },
    });
    expect(again).toMatchObject({ status: 200, data: { stops } });
  });

  it("quotes the stops found on the way, each stretch priced on its own", async () => {
    const along = await api.client.call(stopsAlongRoute, {
      accessToken,
      query: { from: id("bsi"), to: id("akureyri") },
    });
    if (!along.ok) throw new Error(along.error.code);
    const found = [id("bsi"), ...along.data.meetingPoints.map((point) => point.id), id("akureyri")];
    const full = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops: found, seats: 3 },
    });
    if (!full.ok) throw new Error(full.error.code);
    expect(full.data.stops).toEqual(found);
    expect(full.data.segments).toHaveLength(9);
    // The stops in town add 2 km to the 385 km direct.
    expect(full.data).toMatchObject({ distanceM: 387_000, problems: [], warnings: [] });
    // Each stretch rounds to 100 kr on its own, so the whole route differs a
    // little from the worked example's 5 800 kr and 4 700 kr.
    expect(full.data.wholeRoutePrice).toEqual(kr(5600));
    const lower = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops: found, seats: 3, priceLevel: 80 },
    });
    expect(lower).toMatchObject({ status: 200, data: { wholeRoutePrice: kr(4600) } });
  });

  it("names a stop not in use, and waits for distances not worked out yet", async () => {
    const unknown = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops: [id("bsi"), sampleId("not a point"), id("akureyri")], seats: 3 },
    });
    expect(unknown).toMatchObject({
      status: 400,
      error: { code: "stop_unavailable", details: [{ path: "stops.1", issue: "unavailable" }] },
    });
    const unknownAdded = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops, add: sampleId("not a point"), seats: 3 },
    });
    expect(unknownAdded).toMatchObject({
      status: 400,
      error: { code: "stop_unavailable", details: [{ path: "add", issue: "unavailable" }] },
    });

    // A new point, whose legs the legs job has not worked out yet.
    const [bsi] = await api.connection.db
      .select()
      .from(schema.meetingPoints)
      .where(eq(schema.meetingPoints.id, id("bsi")));
    if (bsi === undefined) throw new Error("The sample points are missing.");
    await api.connection.db
      .insert(schema.meetingPoints)
      .values({ ...bsi, id: sampleId("test:new"), nameIs: "Nýr staður" });
    const pending = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops: [id("bsi"), sampleId("test:new")], seats: 3 },
    });
    expect(pending).toMatchObject({
      status: 503,
      error: { code: "distances_pending", retryAfterSeconds: 60 },
    });
    const pendingAdded = await api.client.call(quoteRoute, {
      accessToken,
      body: { stops, add: sampleId("test:new"), seats: 3 },
    });
    expect(pendingAdded).toMatchObject({ status: 503, error: { code: "distances_pending" } });
  });

  it("needs a signed-in person", async () => {
    const result = await api.client.call(quoteRoute, { body: { stops, seats: 3 } });
    expect(result.status).toBe(401);
  });
});
