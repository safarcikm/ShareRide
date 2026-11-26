import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints, seedSampleTrips } from "@shareride/db/seed";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.ts";
import { createLogger } from "../../logger.ts";
import { startTestApi, type TestApi } from "../../testing.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon): Anna
// drives BSÍ, Reykjavík to Hof, Akureyri on Saturday at 09:00, through
// N1 Borgarnes and Olís Blönduós.

let api: TestApi;

const site = "https://puffinride.is";
const north = sampleId("trip:anna-akureyri");
const home = sampleId("trip:anna-home");

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  await seedSampleTrips(api.connection.db, api.now());
  // A cancelled trip keeps the general preview (spec 23, 3.10, item 1).
  await api.connection.db
    .update(schema.trips)
    .set({ status: "cancelled" })
    .where(eq(schema.trips.id, home));
});

afterAll(async () => {
  await api.close();
});

/** An exported web app with only its page. */
function webApp(): string {
  const dir = mkdtempSync(join(tmpdir(), "puffinride-web-"));
  writeFileSync(
    join(dir, "index.html"),
    '<!DOCTYPE html><html lang="en"><head><title>PuffinRide</title></head><body><div id="root"></div></body></html>',
  );
  return dir;
}

function website() {
  return createApp({
    logger: createLogger({ level: "silent" }),
    checkDatabase: () => Promise.resolve(),
    features: api.features,
    searchEngines: { indexable: true, siteOrigin: site },
    webAppDir: webApp(),
  });
}

const meta = (page: string, property: string) =>
  new RegExp(`<meta data-rh="true" property="${property}" content="([^"]*)">`).exec(page)?.[1];

describe("a shared ride's card on its trip page (spec 23, 3.10)", () => {
  it("names the part's route and when it leaves, and points at its picture", async () => {
    const page = await (await website().request(`/trips/${north}?from=1&to=2&lang=en`)).text();
    expect(meta(page, "og:title")).toBe("N1 Borgarnes → Olís Blönduós · Sat 14 Nov at 10:00");
    expect(meta(page, "og:description")).toBe(
      "A shared ride on PuffinRide, carpooling across Iceland. See the ride and book a seat.",
    );
    expect(meta(page, "og:image")).toMatch(
      new RegExp(
        `^${site}/v1/trips/${north}/preview\\.png\\?fromStop=1&amp;toStop=2&amp;lang=en&amp;v=[0-9a-f]{12}$`,
      ),
    );
    expect(meta(page, "og:image:alt")).toMatch(
      /^N1 Borgarnes → Olís Blönduós, Saturday 14 November at/,
    );
  });

  it("answers Facebook in the reader's language", async () => {
    const response = await website().request(`/trips/${north}`, {
      headers: { "x-facebook-locale": "is_IS" },
    });
    expect(meta(await response.text(), "og:title")).toBe(
      "BSÍ → Hof, Akureyri · lau. 14. nóv. kl. 09:00",
    );
  });

  it("names nobody: not the driver, not the car (R23.8)", async () => {
    const page = await (await website().request(`/trips/${north}?lang=en`)).text();
    for (const word of ["Anna", "Toyota", "Yaris"]) expect(page).not.toContain(word);
  });

  it("keeps the general card for a cancelled or unknown trip, or a part that does not run", async () => {
    for (const path of [
      `/trips/${home}?lang=en`,
      `/trips/${sampleId("trip:nobody")}?lang=en`,
      `/trips/${north}?from=2&to=1&lang=en`,
      "/trips/not-an-id?lang=en",
    ]) {
      const page = await (await website().request(path)).text();
      expect(meta(page, "og:image"), path).toBe(`${site}/share.png`);
    }
  });
});

describe("GET /v1/trips/{id}/preview.png (spec 23, 3.10, item 4)", () => {
  it("draws the part's picture as a PNG that may be kept an hour", async () => {
    const response = await api.request(
      `/v1/trips/${north}/preview.png?fromStop=1&toStop=2&lang=is`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    const png = new Uint8Array(await response.arrayBuffer());
    expect([...png.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
  });

  it("has no picture where the trip page keeps the general card", async () => {
    for (const path of [
      `/v1/trips/${home}/preview.png`,
      `/v1/trips/${sampleId("trip:nobody")}/preview.png`,
      `/v1/trips/${north}/preview.png?fromStop=2&toStop=1`,
      "/v1/trips/not-an-id/preview.png",
    ]) {
      expect((await api.request(path)).status, path).toBe(404);
    }
  });
});

describe("GET /v1/trips/{id}/story.png (spec 28, 3.5)", () => {
  it("draws the part's story, 1080 by 1920, as it is now", async () => {
    const response = await api.request(`/v1/trips/${north}/story.png?fromStop=1&toStop=2&lang=is`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("content-disposition")).toBeNull();
    const png = Buffer.from(await response.arrayBuffer());
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);
  });

  it("answers a file to save, named after the route", async () => {
    const response = await api.request(
      `/v1/trips/${north}/story.png?fromStop=0&toStop=3&lang=en&download=1`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="puffinride-[a-z0-9-]+\.png"$/,
    );
  });

  it("has no story where the trip page keeps the general card", async () => {
    for (const path of [
      `/v1/trips/${home}/story.png`,
      `/v1/trips/${sampleId("trip:nobody")}/story.png`,
      `/v1/trips/${north}/story.png?fromStop=2&toStop=1`,
      "/v1/trips/not-an-id/story.png",
    ]) {
      expect((await api.request(path)).status, path).toBe(404);
    }
  });
});

describe("a trip's pictures on other sites (spec 28, 3.5)", () => {
  it("lets any site show them, and nothing else the API answers", async () => {
    for (const kind of ["preview", "story"]) {
      const path = `/v1/trips/${north}/${kind}.png?fromStop=1&toStop=2`;
      const response = await api.request(path);
      expect(response.headers.get("cross-origin-resource-policy"), path).toBe("cross-origin");
    }
    for (const path of [`/v1/trips/${home}/story.png`, `/v1/trips/${north}`, "/v1/health"]) {
      const response = await api.request(path);
      expect(response.headers.get("cross-origin-resource-policy"), path).toBe("same-origin");
    }
  });
});
