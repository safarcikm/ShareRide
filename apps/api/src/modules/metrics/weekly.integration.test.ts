import { randomUUID } from "node:crypto";
import { adminMetricsCsvPath, adminMetricsRoute, type AdminMetrics } from "@shareride/contracts";
import { schema } from "@shareride/db";
import {
  sampleId,
  seedSampleCorridors,
  seedSampleMeetingPoints,
  seedSampleTrips,
} from "@shareride/db/seed";
import { metricKeys } from "@shareride/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { runMetricsCommand } from "./command.ts";
import { createWeeklyMetricsService, type WeeklyMetricsService } from "./weekly.ts";

// The weekly figures (spec 10, 3.4; plan 4.6). The test clock starts on
// Friday 13 November 2026 at noon, in ISO week 46 (9 to 15 November). The
// sample trips are published then: Jón drives Hlemmur to the airport on
// Saturday (the airport corridor), Sigga Mjódd to Selfoss on Saturday (the
// south corridor), Anna to Akureyri on Saturday and home on Monday, and Jón
// Selfoss to Vík on Sunday (no corridor).

let api: TestApi;
let metrics: WeeklyMetricsService;
let cookie: string;
let bookingId: string;
const { weeklyMetrics, bookings, tripStops } = schema;
const point = (key: string) => sampleId(`point:${key}`);
const place = (key: string) => sampleId(`place:${key}`);
const corridor = (key: string) => sampleId(`corridor:${key}`);
const week46 = { year: 2026, week: 46 };

beforeAll(async () => {
  api = await startTestApi();
  const { db } = api.connection;
  await seedSampleMeetingPoints(db, api.now());
  await seedSampleCorridors(db, api.now());
  await seedSampleTrips(db, api.now());
  metrics = createWeeklyMetricsService({ db, clock: () => api.now() });

  // Two searches: Reykjavík to the airport shows Jón's trip, Vík to the airport nothing.
  for (const [from, to] of [
    [place("capital-area"), point("kef")],
    [point("vik"), point("kef")],
  ]) {
    const response = await api.request(`/v1/trips/search?from=${from ?? ""}&to=${to ?? ""}`);
    expect(response.status).toBe(200);
  }
  await api.searchLog.idle();

  // A passenger with a confirmed booking on Jón's trip to the airport.
  const passenger = await api.signIn(api.newPhoneNumber());
  const stops = await db
    .select()
    .from(tripStops)
    .where(eq(tripStops.tripId, sampleId("trip:jon-airport")))
    .orderBy(asc(tripStops.position));
  const [first, last] = [stops[0], stops.at(-1)];
  if (first === undefined || last === undefined) throw new Error("No stops.");
  const now = api.now();
  const [made] = await db
    .insert(bookings)
    .values({
      tripId: first.tripId,
      passengerId: passenger.userId,
      fromStopId: first.id,
      toStopId: last.id,
      seats: 2,
      status: "confirmed",
      totalPrice: 3000,
      attemptKey: randomUUID(),
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: bookings.id });
  if (made === undefined) throw new Error("No booking.");
  bookingId = made.id;
});

afterAll(async () => {
  await api.close();
});

async function stored(week: { year: number; week: number }, corridorId: string | null) {
  const rows = await api.connection.db
    .select()
    .from(weeklyMetrics)
    .where(
      and(
        corridorId === null
          ? isNull(weeklyMetrics.corridorId)
          : eq(weeklyMetrics.corridorId, corridorId),
        eq(weeklyMetrics.isoYear, week.year),
        eq(weeklyMetrics.isoWeek, week.week),
      ),
    );
  return Object.fromEntries(
    rows.map((row) => [row.metric, [row.numerator, row.denominator] as const]),
  );
}

describe("counting the weekly figures", () => {
  it("stores every metric of a week, for everything and for each active corridor", async () => {
    await metrics.compute([week46]);
    const total = await stored(week46, null);
    expect(Object.keys(total).sort()).toEqual([...metricKeys].sort());
    expect(total).toMatchObject({
      searches: [2, null],
      searches_with_result: [1, 2],
      requests_per_search_with_result: [1, 1],
      trips_posted: [5, null],
      bookings_confirmed: [1, null],
      seats_booked: [2, null],
      // Four trips leave in the week; Anna's way home is on Monday.
      active_drivers: [3, null],
      active_passengers: [1, null],
      driver_cancellations: [0, 1],
      repeat_passengers: [0, 1],
    });

    const airport = await stored(week46, corridor("airport"));
    expect(airport).toMatchObject({
      searches: [1, null],
      searches_with_result: [1, 1],
      trips_posted: [1, null],
      bookings_confirmed: [1, null],
      active_drivers: [1, null],
    });
    const south = await stored(week46, corridor("south"));
    expect(south).toMatchObject({
      searches: [0, null],
      trips_posted: [1, null],
      bookings_confirmed: [0, null],
      active_passengers: [0, null],
    });
  });

  it("gives the same rows when run twice", async () => {
    const rows = () =>
      api.connection.db
        .select({
          corridorId: weeklyMetrics.corridorId,
          metric: weeklyMetrics.metric,
          numerator: weeklyMetrics.numerator,
          denominator: weeklyMetrics.denominator,
        })
        .from(weeklyMetrics)
        .orderBy(asc(weeklyMetrics.corridorId), asc(weeklyMetrics.metric));
    const before = await rows();
    await metrics.compute([week46]);
    const after = await rows();
    expect(after).toEqual(before);
    // Everything and the three corridors.
    expect(after).toHaveLength(4 * metricKeys.length);
  });

  it("leaves a corridor that is not counted out, and keeps the rows it had", async () => {
    const { db } = api.connection;
    await db
      .update(schema.corridors)
      .set({ active: false })
      .where(eq(schema.corridors.id, corridor("west")));
    await metrics.compute([{ year: 2026, week: 45 }, week46]);
    expect(Object.keys(await stored({ year: 2026, week: 45 }, corridor("west")))).toEqual([]);
    expect(Object.keys(await stored(week46, corridor("west")))).toHaveLength(metricKeys.length);
    expect(Object.keys(await stored({ year: 2026, week: 45 }, corridor("south")))).toHaveLength(
      metricKeys.length,
    );
  });
});

describe("the nightly run", () => {
  it("runs once a day after 03:00, for this week and the two before it", async () => {
    await api.connection.db.delete(weeklyMetrics);
    // Friday noon: due, as nothing was counted today.
    expect(await metrics.computeIfDue()).toBe(true);
    expect(await metrics.computeIfDue()).toBe(false);
    for (const week of [44, 45, 46]) {
      expect(Object.keys(await stored({ year: 2026, week }, null))).toHaveLength(metricKeys.length);
    }
    expect(Object.keys(await stored({ year: 2026, week: 43 }, null))).toEqual([]);

    // Saturday 02:00: not yet. Saturday 03:00: again.
    api.advance(14 * 3600);
    expect(await metrics.computeIfDue()).toBe(false);
    api.advance(3600);
    expect(await metrics.computeIfDue()).toBe(true);
    expect(await metrics.computeIfDue()).toBe(false);
  });

  it("changes last week's figure when a booking confirmed then is cancelled late", async () => {
    expect((await stored(week46, null))["passenger_late_cancellations"]).toEqual([0, 1]);
    // Monday 16 November, 04:00: week 47.
    api.advance(2 * 24 * 3600 + 3600);
    const now = api.now();
    await api.connection.db
      .update(bookings)
      .set({
        status: "cancelled",
        cancelledBy: "passenger",
        cancelledAt: now,
        cancelReason: "plans_changed",
        countsOnReliability: true,
        refundAmount: 1500,
        updatedAt: now,
      })
      .where(eq(bookings.id, bookingId));
    expect(await metrics.computeIfDue()).toBe(true);
    expect((await stored(week46, null))["passenger_late_cancellations"]).toEqual([1, 1]);
    expect((await stored({ year: 2026, week: 47 }, null))["money_refunded"]).toEqual([1500, null]);
  });
});

describe("the console's metrics routes", () => {
  const get = (path: string) => api.request(path, { headers: { cookie } });

  beforeAll(async () => {
    // Now, as the clock has moved days on and a console session does not last that long.
    cookie = (await api.signInOperator()).cookie;
  });

  it("needs an operator", async () => {
    expect((await api.request(adminMetricsRoute.path)).status).toBe(401);
    expect((await api.request(adminMetricsCsvPath)).status).toBe(401);
  });

  it("shows the last 8 weeks up to this one, with a week not counted yet as empty", async () => {
    const response = await get(adminMetricsRoute.path);
    expect(response.status).toBe(200);
    const body = (await response.json()) as AdminMetrics;
    expect(body.weeks.map((week) => week.week)).toEqual([
      "2026-W40",
      "2026-W41",
      "2026-W42",
      "2026-W43",
      "2026-W44",
      "2026-W45",
      "2026-W46",
      "2026-W47",
    ]);
    expect(body.weeks[0]).toEqual({
      week: "2026-W40",
      startsOn: "2026-09-28",
      metrics: null,
      computedAt: null,
    });
    const last46 = body.weeks.find((week) => week.week === "2026-W46");
    expect(last46?.metrics?.trips_posted).toEqual({ numerator: 5, denominator: null });
    expect(last46?.computedAt?.slice(0, 13)).toBe("2026-11-16T04");
    expect(body.corridorId).toBeNull();
    // By name: the west corridor, which is not counted, comes first.
    expect(body.corridors.map((row) => row.active)).toEqual([false, true, true]);
  });

  it("holds the exit criteria on the active corridors over the last 4 complete weeks", async () => {
    const body = (await (await get(adminMetricsRoute.path)).json()) as AdminMetrics;
    expect(body.exitCriteria.from).toBe("2026-W43");
    expect(body.exitCriteria.to).toBe("2026-W46");
    const byKey = Object.fromEntries(
      body.exitCriteria.criteria.map((criterion) => [criterion.key, criterion]),
    );
    // The one search on a corridor showed a trip, and one booking followed.
    expect(byKey["searches_with_result"]).toMatchObject({
      status: "met",
      numerator: 1,
      denominator: 1,
    });
    expect(byKey["requests_per_search_with_result"]?.status).toBe("met");
    expect(byKey["driver_cancellations"]).toMatchObject({ status: "met", denominator: 1 });
    expect(byKey["seat_fill"]?.status).toBe("no_data");
    expect(byKey["repeat_passengers"]?.status).toBe("not_met");
    expect(byKey["reports_answered_late"]?.status).toBe("no_data");
  });

  it("shows one corridor's weeks, and the weeks asked for", async () => {
    const response = await get(
      `${adminMetricsRoute.path}?from=2026-W46&to=2026-W46&corridor=${corridor("south")}`,
    );
    const body = (await response.json()) as AdminMetrics;
    expect(body.corridorId).toBe(corridor("south"));
    expect(body.weeks).toHaveLength(1);
    expect(body.weeks[0]?.metrics?.trips_posted.numerator).toBe(1);
  });

  it("refuses a week that does not exist, weeks the wrong way round, too many, and an unknown corridor", async () => {
    for (const [query, path, issue] of [
      ["from=2025-W53", "from", "no_such_week"],
      ["to=2026-W60", "to", "no_such_week"],
      ["from=2026-W40&to=2026-W39", "to", "before_from"],
      ["from=2025-W01&to=2026-W46", "from", "too_many_weeks"],
    ]) {
      for (const route of [adminMetricsRoute.path, adminMetricsCsvPath]) {
        const response = await get(`${route}?${query ?? ""}`);
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          error: { code: "validation_failed", details: [{ path, issue }] },
        });
      }
    }
    const unknown = `corridor=${sampleId("corridor:nowhere")}`;
    expect((await get(`${adminMetricsRoute.path}?${unknown}`)).status).toBe(404);
    expect((await get(`${adminMetricsCsvPath}?${unknown}`)).status).toBe(404);
  });

  it("gives the figures as a CSV file, with fewer than 5 people as <5", async () => {
    const response = await get(`${adminMetricsCsvPath}?from=2026-W46&to=2026-W47`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="shareride-metrics-2026-W46-2026-W47.csv"',
    );
    const lines = (await response.text()).trimEnd().split("\r\n");
    expect(lines[0]).toBe("week,starts_on,corridor,metric,numerator,denominator");
    expect(lines).toHaveLength(1 + 2 * metricKeys.length);
    expect(lines).toContain('2026-W46,2026-11-09,"all",trips_posted,5,');
    expect(lines).toContain('2026-W46,2026-11-09,"all",active_drivers,<5,');

    const south = await get(
      `${adminMetricsCsvPath}?from=2026-W46&to=2026-W46&corridor=${corridor("south")}`,
    );
    expect(await south.text()).toContain('"Reykjavík – Hveragerði – Selfoss",trips_posted,1,');
  });
});

describe("the metrics command", () => {
  it("counts the weeks asked for again", async () => {
    await api.connection.db.delete(weeklyMetrics);
    const lines: string[] = [];
    const code = await runMetricsCommand(["recompute", "2"], {
      metrics,
      clock: () => api.now(),
      write: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(lines).toEqual(["Counted 2026-W46 to 2026-W47."]);
    expect(Object.keys(await stored(week46, null))).toHaveLength(metricKeys.length);
    expect(Object.keys(await stored({ year: 2026, week: 45 }, null))).toEqual([]);
  });

  it("explains itself when asked for something else", async () => {
    for (const args of [
      [],
      ["recompute"],
      ["recompute", "0"],
      ["recompute", "54"],
      ["count", "2"],
    ]) {
      const lines: string[] = [];
      const code = await runMetricsCommand(args, {
        metrics: { compute: () => Promise.reject(new Error("Not reached.")) },
        clock: () => api.now(),
        write: (line) => lines.push(line),
      });
      expect(code).toBe(1);
      expect(lines.join("\n")).toContain("Usage:");
    }
  });
});
