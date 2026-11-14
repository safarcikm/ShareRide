import {
  meetingPointRoute,
  meetingPointsRoute,
  nearestMeetingPointsRoute,
  placeSearchRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints } from "@shareride/db/seed";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  // One of each status the list must handle, beside the sample points.
  const base = {
    location: { latitude: 64.14, longitude: -21.93 },
    region: "capital",
    municipality: "Reykjavík",
    type: "other",
  } as const;
  await api.connection.db.insert(schema.meetingPoints).values([
    {
      ...base,
      id: sampleId("test:paused"),
      nameIs: "Lokaður staður",
      nameEn: "Closed place",
      status: "paused",
      pauseReasonIs: "Vegaframkvæmdir",
      pauseReasonEn: "Road works",
      searchText: "lokadur stadur closed place",
    },
    { ...base, id: sampleId("test:draft"), nameIs: "Drög", status: "draft", searchText: "drog" },
    {
      ...base,
      id: sampleId("test:retired"),
      nameIs: "Hætt",
      status: "retired",
      searchText: "haett",
    },
  ]);
});

afterAll(async () => {
  await api.close();
});

async function search(q: string) {
  const result = await api.client.call(placeSearchRoute, { query: { q } });
  if (!result.ok) throw new Error(result.error.code);
  return result.data.results.map((item) =>
    item.kind === "meetingPoint"
      ? `point:${item.meetingPoint.name.en}`
      : `place:${item.place.name.en}`,
  );
}

describe("GET /v1/meeting-points", () => {
  it("lists active, paused and retiring points, never drafts or retired ones", async () => {
    const result = await api.client.call(meetingPointsRoute, {});
    if (!result.ok) throw new Error(result.error.code);
    const names = result.data.meetingPoints.map((point) => point.name.is);
    expect(names).toContain("BSÍ");
    expect(names).toContain("Lokaður staður");
    expect(names).not.toContain("Drög");
    expect(names).not.toContain("Hætt");
    const paused = result.data.meetingPoints.find((point) => point.status === "paused");
    expect(paused?.pauseReason).toEqual({ is: "Vegaframkvæmdir", en: "Road works" });
  });

  it("gives names in both languages and marks sample points", async () => {
    const result = await api.client.call(meetingPointsRoute, {});
    if (!result.ok) throw new Error(result.error.code);
    const hlemmur = result.data.meetingPoints.find((point) => point.name.is === "Hlemmur");
    expect(hlemmur).toMatchObject({
      name: { is: "Hlemmur", en: "Hlemmur" },
      region: "capital",
      municipality: "Reykjavík",
      type: "bus-hub",
      season: null,
      sample: true,
    });
  });

  it("can be cached for a few minutes", async () => {
    const response = await api.request("/v1/meeting-points");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
  });
});

describe("GET /v1/meeting-points/{id}", () => {
  it("gives the details, with where to stand in both languages", async () => {
    const result = await api.client.call(meetingPointRoute, {
      params: { id: sampleId("point:kef") },
    });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data).toMatchObject({
      name: { is: "Keflavíkurflugvöllur", en: "Keflavík Airport" },
      aliases: ["KEF", "Leifsstöð"],
      type: "airport",
      whereToStand: { en: expect.stringContaining("arrivals") as unknown },
    });
  });

  it("answers 404 for a draft or retired point, or no point", async () => {
    for (const id of [sampleId("test:draft"), sampleId("test:retired"), sampleId("test:none")]) {
      const result = await api.client.call(meetingPointRoute, { params: { id } });
      expect(result).toMatchObject({ ok: false, status: 404, error: { code: "not_found" } });
    }
  });
});

describe("GET /v1/places/search (spec 2, 3.4)", () => {
  it("finds places typed without Icelandic letters", async () => {
    expect((await search("thorlakshofn")).slice(0, 2)).toEqual([
      "place:Þorlákshöfn",
      "point:N1 Þorlákshöfn",
    ]);
    expect(await search("egilsstadir")).toEqual([]);
  });

  it("puts exact and prefix matches before aliases and close matches", async () => {
    const results = await search("akureyri");
    expect(results[0]).toBe("place:Akureyri");
    expect(results).toContain("point:Hof bus stop, Akureyri");
    expect(results).toContain("point:Akureyri Airport");
  });

  it("finds an alias", async () => {
    expect((await search("KEF"))[0]).toBe("point:Keflavík Airport");
    expect(await search("thingvellir")).toEqual(["place:Thingvellir National Park"]);
  });

  it("tolerates a small typo", async () => {
    expect(await search("Akureyi")).toContain("place:Akureyri");
    expect(await search("Borgarnex")).toEqual(["point:N1 Borgarnes", "place:Borgarnes"]);
  });

  it("keeps the best matches when many names match loosely", async () => {
    const streets = Array.from({ length: 60 }, (_, index) => ({
      id: sampleId(`test:street-${String(index)}`),
      nameIs: `Víkurbraut ${String(index)}`,
      location: { latitude: 63.42, longitude: -19.0 },
      kind: "landmark",
      region: "south",
      matchRadiusM: 5000,
      searchText: `vikurbraut ${String(index)}`,
    }));
    await api.connection.db.insert(schema.places).values(streets);
    try {
      expect((await search("vik"))[0]).toBe("place:Vík");
    } finally {
      await api.connection.db.delete(schema.places).where(
        inArray(
          schema.places.id,
          streets.map((street) => street.id),
        ),
      );
    }
  });

  it("needs two characters and leaves out drafts and retired points", async () => {
    expect(await search("a")).toEqual([]);
    expect(await search("drog")).toEqual([]);
    expect(await search("haett")).toEqual([]);
  });
});

describe("GET /v1/places/{id}/nearest-meeting-points", () => {
  async function nearest(key: string) {
    const result = await api.client.call(nearestMeetingPointsRoute, {
      params: { id: sampleId(`place:${key}`) },
    });
    if (!result.ok) throw new Error(result.error.code);
    return result.data;
  }

  it("covers the whole capital area for Reykjavík, nearest first", async () => {
    const result = await nearest("capital-area");
    expect(result.withinReach).toBe(true);
    const municipalities = new Set(
      result.meetingPoints.map((item) => item.meetingPoint.municipality),
    );
    expect(municipalities).toEqual(
      new Set(["Reykjavík", "Kópavogur", "Hafnarfjörður", "Mosfellsbær"]),
    );
    const distances = result.meetingPoints.map((item) => item.distanceM);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(result.meetingPoints.map((item) => item.meetingPoint.status)).not.toContain("paused");
  });

  it("keeps a capital area town to itself", async () => {
    const result = await nearest("kopavogur");
    expect(result.meetingPoints.map((item) => item.meetingPoint.name.is)).toEqual(["Smáralind"]);
  });

  it("covers a town's radius", async () => {
    const result = await nearest("akureyri-town");
    expect(result.withinReach).toBe(true);
    expect(result.meetingPoints.map((item) => item.meetingPoint.name.en)).toEqual([
      "Hof bus stop, Akureyri",
      "Akureyri Airport",
    ]);
  });

  it("offers the three nearest when none are within reach", async () => {
    const result = await nearest("thingvellir");
    expect(result.withinReach).toBe(false);
    expect(result.meetingPoints).toHaveLength(3);
    expect(["N1 Mosfellsbær", "N1 Hveragerði"]).toContain(
      result.meetingPoints[0]?.meetingPoint.name.en,
    );
    expect(result.meetingPoints[0]?.distanceM).toBeGreaterThan(20_000);
  });

  it("answers 404 for no such place", async () => {
    const result = await api.client.call(nearestMeetingPointsRoute, {
      params: { id: sampleId("place:none") },
    });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });
});
