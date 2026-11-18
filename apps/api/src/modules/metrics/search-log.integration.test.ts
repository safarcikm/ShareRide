import { tripSearchAlternativesRoute, tripSearchRoute } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints, seedSampleTrips } from "@shareride/db/seed";
import { defaultSearchSettings, searchLogDeletedBefore, searchLogHour } from "@shareride/domain";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { retentionSteps, runRetention } from "../privacy/retention.ts";
import { createSearchService } from "../search/index.ts";
import { createSearchLog } from "./search-log.ts";

// The search log (spec 10, 3.4.5; R10.6; plan 4.5). The test clock is
// Friday 13 November 2026, noon; the sample trips are in the next days.

let api: TestApi;
const { searchLog } = schema;
const point = (key: string) => sampleId(`point:${key}`);
const place = (key: string) => sampleId(`place:${key}`);

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  await seedSampleTrips(api.connection.db, api.now());
});

afterAll(async () => {
  await api.close();
});

beforeEach(async () => {
  await api.searchLog.idle();
  await api.connection.db.delete(searchLog);
});

async function rows() {
  await api.searchLog.idle();
  return api.connection.db.select().from(searchLog);
}

describe("the search log", () => {
  it("notes a search: the two ends, the day, the results, the platform and the hour", async () => {
    api.advance(17 * 60 + 23);
    const hour = new Date(api.now());
    hour.setUTCMinutes(0, 0, 0);
    const response = await api.request(
      `/v1/trips/search?from=${place("capital-area")}&to=${point("kef")}&date=2026-11-14`,
      { headers: { "X-Client-Platform": "android" } },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: unknown[] };
    expect(body.results).toHaveLength(1);
    expect(await rows()).toEqual([
      {
        id: expect.any(String) as string,
        fromKind: "place",
        fromId: place("capital-area"),
        toKind: "meeting_point",
        toId: point("kef"),
        searchedDate: "2026-11-14",
        results: 1,
        platform: "android",
        searchedHour: hour,
      },
    ]);
  });

  it("notes a search for any day that shows nothing, from an app that names no platform", async () => {
    const found = await api.client.call(tripSearchRoute, {
      query: { from: point("vik"), to: point("kef") },
    });
    expect(found.ok && found.data.results).toEqual([]);
    expect(await rows()).toMatchObject([{ searchedDate: null, results: 0, platform: "unknown" }]);
  });

  it("holds no person, session, device or address of a signed-in search", async () => {
    const phone = api.newPhoneNumber();
    const session = await api.signIn(phone);
    const found = await api.client.call(tripSearchRoute, {
      query: { from: point("borgarnes"), to: point("blonduos") },
      accessToken: session.accessToken,
    });
    expect(found.ok).toBe(true);
    const [row] = await rows();
    if (row === undefined) throw new Error("No row.");
    // Only these columns exist: nothing to hold a person, a session or an address in.
    expect(
      getTableConfig(searchLog)
        .columns.map((column) => column.name)
        .sort(),
    ).toEqual([
      "fromId",
      "fromKind",
      "id",
      "platform",
      "results",
      "searchedDate",
      "searchedHour",
      "toId",
      "toKind",
    ]);
    const text = JSON.stringify(row);
    for (const secret of [session.userId, session.accessToken, phone, api.ip]) {
      expect(text).not.toContain(secret);
    }
    // The key is random, not one that holds the moment it was made.
    expect(row.id.charAt(14)).toBe("4");
    expect(row.searchedHour.getUTCMinutes()).toBe(0);
    expect(row.searchedHour.getUTCSeconds()).toBe(0);
  });

  it("notes no search that was refused, and none of the other lists", async () => {
    const same = await api.client.call(tripSearchRoute, {
      query: { from: point("kef"), to: point("kef") },
    });
    expect(same.ok).toBe(false);
    const unknown = await api.client.call(tripSearchRoute, {
      query: { from: sampleId("point:nowhere"), to: point("kef") },
    });
    expect(unknown.ok).toBe(false);
    const alternatives = await api.client.call(tripSearchAlternativesRoute, {
      query: { from: point("vik"), to: point("kef"), date: "2026-11-14" },
    });
    expect(alternatives.ok).toBe(true);
    expect(await rows()).toEqual([]);
  });

  it("answers the search when the log cannot be written, and says so in the server's log", async () => {
    const lines: string[] = [];
    const broken = createSearchLog({
      // A database that refuses the row.
      db: {
        insert: () => ({ values: () => Promise.reject(new Error("The database is away.")) }),
      } as unknown as typeof api.connection.db,
      clock: () => api.now(),
      logger: createLogger({
        level: "warn",
        destination: {
          write: (line: string) => {
            lines.push(line);
          },
        },
      }),
    });
    const service = createSearchService({
      db: api.connection.db,
      clock: () => api.now(),
      settings: () => Promise.resolve(defaultSearchSettings),
      searchLog: broken,
    });
    const found = await service.search(
      { from: point("borgarnes"), to: point("blonduos"), seats: 1 },
      null,
      "web",
    );
    expect(found.ok && found.value).toHaveLength(1);
    await broken.idle();
    expect(lines.join("")).toContain("A search could not be logged.");
    expect(await rows()).toEqual([]);
  });

  it("deletes rows after 14 months (rule search_log)", async () => {
    const now = api.now();
    const cutoff = searchLogHour(searchLogDeletedBefore(now)).getTime();
    const hour = 3_600_000;
    const at = (time: number) => ({
      fromKind: "place",
      fromId: place("capital-area"),
      toKind: "place",
      toId: place("selfoss-town"),
      results: 0,
      platform: "web",
      searchedHour: new Date(time),
    });
    await api.connection.db
      .insert(searchLog)
      .values([at(cutoff - hour), at(cutoff + hour), at(searchLogHour(now).getTime())]);
    const logger = createLogger({ level: "silent", destination: { write: () => undefined } });
    const result = await runRetention({
      db: api.connection.db,
      now,
      steps: retentionSteps({
        db: api.connection.db,
        erasure: { eraseDue: () => Promise.resolve({ erased: 0, failed: 0 }) },
        logger,
      }).filter((step) => step.rules.includes("search_log")),
      logger,
    });
    expect(result.failedRules).toEqual([]);
    expect(result.counts.search_log).toEqual({ erased: 1, anonymised: 0 });
    expect((await rows()).map((row) => row.searchedHour.getTime()).sort()).toEqual([
      cutoff + hour,
      searchLogHour(now).getTime(),
    ]);
  });
});
