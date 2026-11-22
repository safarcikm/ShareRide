import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints } from "@shareride/db/seed";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createLogger } from "./logger.ts";
import { startTestApi, type TestApi } from "./testing.ts";

let api: TestApi;

const site = "https://puffinride.is";
const point = (name: string) => sampleId(`sitemap:${name}`);

beforeAll(async () => {
  api = await startTestApi();
  // Sample points are in the seed only, never on production: not listed.
  await seedSampleMeetingPoints(api.connection.db, api.now());
  const base = {
    location: { latitude: 63.94, longitude: -21.0 },
    region: "south",
    municipality: "Árborg",
    type: "fuel-station",
  } as const;
  await api.connection.db.insert(schema.meetingPoints).values([
    { ...base, id: point("active"), nameIs: "N1 Selfossi", status: "active", searchText: "n1" },
    { ...base, id: point("paused"), nameIs: "Lokað", status: "paused", searchText: "lokad" },
    { ...base, id: point("draft"), nameIs: "Drög", status: "draft", searchText: "drog" },
  ]);
  await api.connection.db.insert(schema.places).values([
    {
      id: point("place"),
      nameIs: "Selfoss",
      location: base.location,
      kind: "town",
      region: "south",
      matchRadiusM: 5000,
      searchText: "selfoss",
    },
    {
      id: point("sample-place"),
      nameIs: "Sýnisbær",
      location: base.location,
      kind: "town",
      region: "south",
      matchRadiusM: 5000,
      searchText: "synisbaer",
      sample: true,
    },
  ]);
});

afterAll(async () => {
  await api.close();
});

function sitemap(indexable: boolean) {
  const app = createApp({
    logger: createLogger({ level: "silent" }),
    checkDatabase: () => Promise.resolve(),
    features: api.features,
    searchEngines: { indexable, siteOrigin: site },
  });
  return app.request("/sitemap.xml");
}

describe("the sitemap on production (spec 23, 3.7)", () => {
  it("lists the public pages, each active meeting point and each place", async () => {
    const response = await sitemap(true);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    const xml = await response.text();
    const listed = [...xml.matchAll(/<loc>([^<]+)\?lang=is<\/loc>/g)].map((match) =>
      (match[1] ?? "").replace(site, ""),
    );
    expect(listed).toEqual(
      expect.arrayContaining([
        "/",
        "/meeting-points",
        `/meeting-points/${point("active")}`,
        `/places/${point("place")}`,
        "/legal",
        "/legal/terms",
        "/legal/community-rules",
        "/legal/privacy",
      ]),
    );
    for (const left of ["paused", "draft", "sample-place"]) {
      expect(xml, left).not.toContain(point(left));
    }
    // The seed's sample points are not the real ones.
    expect(listed.filter((path) => path.startsWith("/meeting-points/"))).toEqual([
      `/meeting-points/${point("active")}`,
    ]);
  });

  it("is not there off production", async () => {
    expect((await sitemap(false)).status).toBe(404);
  });
});
