import type { AdminLegsStatus } from "@shareride/contracts";
import { schema } from "@shareride/db";
import {
  sampleId,
  sampleLegSource,
  samplePoints,
  seedSampleMeetingPoints,
} from "@shareride/db/seed";
import { and, eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStraightLineRouter } from "../../platform/router.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { createLegService } from "./legs.ts";

const { auditLog, legs, meetingPoints } = schema;

let api: TestApi;
let cookie: string;
let seededAt: Date;
const island = sampleId("test:island");
const draft = sampleId("test:draft");
const retired = sampleId("test:retired");
const bsi = sampleId("point:bsi");
const borgarnes = sampleId("point:borgarnes");
const points = samplePoints.length + 1;

beforeAll(async () => {
  api = await startTestApi();
  seededAt = api.now();
  await seedSampleMeetingPoints(api.connection.db, seededAt);
  const base = { region: "capital", municipality: "Reykjavík", type: "other" } as const;
  await api.connection.db.insert(meetingPoints).values([
    {
      ...base,
      id: island,
      nameIs: "Út í hafi",
      status: "active",
      searchText: "ut i hafi",
      // At sea, where the tests' router finds no road (south of 63.3° N).
      location: { latitude: 63.0, longitude: -20.0 },
    },
    {
      ...base,
      id: draft,
      nameIs: "Drög",
      status: "draft",
      searchText: "drog",
      location: { latitude: 64.14, longitude: -21.93 },
    },
    {
      ...base,
      id: retired,
      nameIs: "Hætt",
      status: "retired",
      searchText: "haett",
      location: { latitude: 64.15, longitude: -21.94 },
    },
  ]);
  // A leg to a retired point, from before it retired.
  await api.connection.db.insert(legs).values({
    fromMeetingPointId: bsi,
    toMeetingPointId: retired,
    distanceM: 1500,
    durationS: 180,
    computedAt: api.now(),
    source: sampleLegSource,
  });
  cookie = (await api.signInOperator()).cookie;
});

afterAll(async () => {
  await api.close();
});

async function admin(path: string, method = "GET", as: string | null = cookie) {
  const response = await api.request(path, {
    method,
    headers: { "content-type": "application/json", ...(as === null ? {} : { cookie: as }) },
    ...(method === "GET" ? {} : { body: "{}" }),
  });
  const text = await response.text();
  return { status: response.status, body: (text === "" ? null : JSON.parse(text)) as unknown };
}

const legBetween = async (from: string, to: string) =>
  (
    await api.connection.db
      .select()
      .from(legs)
      .where(and(eq(legs.fromMeetingPointId, from), eq(legs.toMeetingPointId, to)))
  )[0];

describe("GET /admin/v1/legs", () => {
  it("is for the operator only", async () => {
    expect((await admin("/admin/v1/legs", "GET", null)).status).toBe(401);
    expect((await admin("/admin/v1/legs/recompute", "POST", null)).status).toBe(401);
  });

  it("counts the legs between points in service and lists what is missing", async () => {
    const { status, body } = await admin("/admin/v1/legs");
    expect(status).toBe(200);
    const legsStatus = body as AdminLegsStatus;
    expect(legsStatus).toMatchObject({
      mapData: { mapDate: null, attribution: "Straight lines" },
      // The sample points and the one at sea; not the draft or the retired one.
      points,
      pairs: points * (points - 1),
      withLegs: (points - 1) * (points - 2),
      sources: [
        {
          source: sampleLegSource,
          mapDate: null,
          current: false,
          legs: (points - 1) * (points - 2),
        },
      ],
      offRoad: [{ id: island, nameIs: "Út í hafi" }],
    });
    expect(legsStatus.lastComputedAt).toBe(seededAt.toISOString());
    // Every missing leg is to or from the point at sea, both ways.
    expect(legsStatus.missing).toHaveLength(2 * (points - 1));
    expect(legsStatus.missing.every((leg) => leg.from.id === island || leg.to.id === island)).toBe(
      true,
    );
  });
});

describe("POST /admin/v1/legs/recompute", () => {
  it("computes every leg between points in service again, on the map data the API has now", async () => {
    const { status, body } = await admin("/admin/v1/legs/recompute", "POST");
    expect(status).toBe(200);
    expect(body).toMatchObject({
      points,
      withLegs: (points - 1) * (points - 2),
      sources: [
        {
          source: "straight lines",
          mapDate: null,
          current: true,
          legs: (points - 1) * (points - 2),
        },
      ],
      offRoad: [{ id: island }],
    });
    const [expected] = await createStraightLineRouter().legsFrom(
      samplePoints.find((point) => point.key === "bsi")?.position ?? { latitude: 0, longitude: 0 },
      [
        samplePoints.find((point) => point.key === "borgarnes")?.position ?? {
          latitude: 0,
          longitude: 0,
        },
      ],
    );
    expect(await legBetween(bsi, borgarnes)).toMatchObject({
      ...expected,
      source: "straight lines",
    });
  });

  it("leaves legs to points out of service alone", async () => {
    expect(await legBetween(bsi, retired)).toMatchObject({
      distanceM: 1500,
      source: sampleLegSource,
    });
    expect(await legBetween(bsi, draft)).toBeUndefined();
  });

  it("writes an audit entry with what it did", async () => {
    const [entry] = await api.connection.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "legs.recomputed"));
    expect(entry?.after).toEqual({
      source: "straight lines",
      points,
      legs: (points - 1) * (points - 2),
      missing: 2 * (points - 1),
    });
  });
});

describe("two at once", () => {
  it("answers a second recompute while one runs with the first one's result", async () => {
    const entries = () =>
      api.connection.db.$count(auditLog, eq(auditLog.action, "legs.recomputed"));
    const before = await entries();
    const [first, second] = await Promise.all([
      admin("/admin/v1/legs/recompute", "POST"),
      admin("/admin/v1/legs/recompute", "POST"),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.body).toEqual(first.body);
    expect(await entries()).toBe(before + 1);
  });
});

describe("the legs of one point (for activating and moving it)", () => {
  const service = () =>
    createLegService({
      db: api.connection.db,
      router: createStraightLineRouter({ offRoad: (position) => position.latitude < 63.3 }),
      clock: () => api.now(),
    });

  it("computes a draft's legs to and from every point in service", async () => {
    const result = await service().computeFor(draft);
    expect(result).toEqual({ ok: true, value: { legs: 2 * (points - 1), missing: 2 } });
    expect(await legBetween(draft, borgarnes)).toMatchObject({ source: "straight lines" });
    expect(await legBetween(borgarnes, draft)).toMatchObject({ source: "straight lines" });
    expect(await legBetween(draft, island)).toBeUndefined();
  });

  it("replaces a moved point's legs, and only its own", async () => {
    const before = await legBetween(bsi, borgarnes);
    await api.connection.db
      .update(meetingPoints)
      .set({ location: { latitude: 64.2, longitude: -21.9 } })
      .where(eq(meetingPoints.id, borgarnes));
    await service().computeFor(borgarnes);
    const after = await legBetween(bsi, borgarnes);
    expect(after?.distanceM).not.toBe(before?.distanceM);
    const [expected] = await createStraightLineRouter().legsTo(
      { latitude: 64.2, longitude: -21.9 },
      [
        samplePoints.find((point) => point.key === "bsi")?.position ?? {
          latitude: 0,
          longitude: 0,
        },
      ],
    );
    expect(after).toMatchObject({ ...expected });
    // The leg from the BSÍ to the retired point is not the moved point's.
    expect(await legBetween(bsi, retired)).toMatchObject({ distanceM: 1500 });
    const borgarnesLegs = await api.connection.db
      .select()
      .from(legs)
      .where(or(eq(legs.fromMeetingPointId, borgarnes), eq(legs.toMeetingPointId, borgarnes)));
    // Both ways with every other point in service but the one at sea. Its
    // legs with the draft went with its old place: activating the draft
    // computes them again.
    expect(borgarnesLegs).toHaveLength(2 * (points - 2));
  });

  it("knows no such point", async () => {
    expect(await service().computeFor(sampleId("test:nowhere"))).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });
});
