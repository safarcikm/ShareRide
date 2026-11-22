import type {
  AdminActivationChecklist,
  AdminMeetingPoint,
  ErrorResponse,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, samplePoints, seedSampleMeetingPoints } from "@shareride/db/seed";
import { and, eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStraightLineRouter, type Router } from "../../platform/router.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { createMeetingPointAdminService, type ConsoleActor } from "./admin-service.ts";
import { createLegService } from "./legs.ts";

// Activating a draft (spec 2, 3.6.3): only when its checklist passes
// (R2.3), and its legs come with it. The photo is recommended, not
// required (ADR 0036). The tests' router finds no road south of 63.3° N.

const { auditLog, legs, meetingPointPhotos, meetingPoints } = schema;

let api: TestApi;
let cookie: string;
const ready = sampleId("test:ready");
const bare = sampleId("test:bare");
const atSea = sampleId("test:at-sea");
const apart = sampleId("test:apart");
const noPhoto = sampleId("test:no-photo");
const nowhere = sampleId("test:nowhere");

/** A made-up draft with only what saving one needs. */
const draft = {
  region: "south",
  municipality: "Árborg",
  type: "other",
  status: "draft",
} as const;

/** What R2.3 asks for besides the draft's own fields. */
const complete = {
  whereToStandIs: "Við skiltið.",
  whereToStandEn: "By the sign.",
  amenitiesReviewedOn: "2026-11-12",
  seasonReviewedOn: "2026-11-12",
  lastCheckedOn: "2026-11-12",
};

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  const { db } = api.connection;
  await db.insert(meetingPoints).values([
    {
      ...draft,
      ...complete,
      id: ready,
      nameIs: "Við Ölfusá",
      searchText: "vid olfusa",
      location: { latitude: 63.94, longitude: -21.0 },
    },
    {
      ...draft,
      id: bare,
      nameIs: "Óklárað",
      searchText: "oklarad",
      location: { latitude: 64.0, longitude: -21.2 },
    },
    {
      ...draft,
      ...complete,
      id: atSea,
      nameIs: "Út í hafi",
      searchText: "ut i hafi",
      location: { latitude: 63.0, longitude: -20.0 },
    },
    {
      ...draft,
      ...complete,
      id: apart,
      nameIs: "Afskekkt",
      searchText: "afskekkt",
      location: { latitude: 64.1, longitude: -21.5 },
    },
    {
      ...draft,
      ...complete,
      id: noPhoto,
      nameIs: "Án myndar",
      searchText: "an myndar",
      location: { latitude: 63.95, longitude: -21.05 },
    },
  ]);
  const photo = {
    descriptionIs: "Skiltið.",
    descriptionEn: "The sign.",
    position: 0,
    width: 1600,
    height: 1200,
    bytes: 200_000,
  };
  await db.insert(meetingPointPhotos).values([
    { ...photo, meetingPointId: ready, storageKey: "test-ready" },
    { ...photo, meetingPointId: atSea, storageKey: "test-at-sea" },
    { ...photo, meetingPointId: apart, storageKey: "test-apart" },
  ]);
  cookie = (await api.signInOperator()).cookie;
});

afterAll(async () => {
  await api.close();
});

async function call(path: string, method = "GET", body?: unknown, as: string | null = cookie) {
  const response = await api.request(path, {
    method,
    headers: { "content-type": "application/json", ...(as === null ? {} : { cookie: as }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: (text === "" ? null : JSON.parse(text)) as unknown };
}

const checklist = async (id: string) =>
  (await call(`/admin/v1/meeting-points/${id}/activation`)).body as AdminActivationChecklist;
const notDone = async (id: string) =>
  (await checklist(id)).items.filter((check) => !check.done).map((check) => check.item);
const loaded = async (id: string) =>
  ((await call(`/admin/v1/meeting-points/${id}`)).body as AdminMeetingPoint).updatedAt;
const activate = async (id: string, updatedAt?: string) =>
  call(`/admin/v1/meeting-points/${id}/activate`, "POST", {
    updatedAt: updatedAt ?? (await loaded(id)),
  });
const legsOf = (id: string) =>
  api.connection.db
    .select()
    .from(legs)
    .where(or(eq(legs.fromMeetingPointId, id), eq(legs.toMeetingPointId, id)));

describe("the activation checklist", () => {
  it("is for the operator only", async () => {
    expect(
      (await call(`/admin/v1/meeting-points/${ready}/activation`, "GET", undefined, null)).status,
    ).toBe(401);
    expect(
      (await call(`/admin/v1/meeting-points/${ready}/activate`, "POST", {}, null)).status,
    ).toBe(401);
  });

  it("says what a draft still needs", async () => {
    expect(await notDone(bare)).toEqual([
      "whereToStand",
      "photos",
      "amenities",
      "season",
      "confirmed",
    ]);
    expect((await checklist(bare)).ready).toBe(false);
    expect(await checklist(ready)).toEqual({
      items: [
        { item: "details", done: true, required: true },
        { item: "whereToStand", done: true, required: true },
        { item: "photos", done: true, required: false },
        { item: "amenities", done: true, required: true },
        { item: "season", done: true, required: true },
        { item: "confirmed", done: true, required: true },
        { item: "legs", done: true, required: true },
      ],
      ready: true,
    });
  });

  it("is ready without a photo, which it recommends (ADR 0036)", async () => {
    const list = await checklist(noPhoto);
    expect(list.items.find((check) => check.item === "photos")).toEqual({
      item: "photos",
      done: false,
      required: false,
    });
    expect(list.ready).toBe(true);
  });

  it("needs a road within 1 km", async () => {
    expect(await notDone(atSea)).toEqual(["legs"]);
  });

  it("knows no such point", async () => {
    expect((await call(`/admin/v1/meeting-points/${nowhere}/activation`)).status).toBe(404);
  });
});

describe("POST /admin/v1/meeting-points/{id}/activate", () => {
  it("refuses a draft whose checklist is not done, naming each required item", async () => {
    const { status, body } = await activate(bare);
    expect(status).toBe(409);
    expect((body as ErrorResponse).error).toMatchObject({
      code: "activation_not_ready",
      details: ["whereToStand", "amenities", "season", "confirmed"].map((item) => ({
        path: item,
        issue: "not_done",
      })),
    });
    const { body: atSeaBody } = await activate(atSea);
    expect((atSeaBody as ErrorResponse).error.details).toEqual([
      { path: "legs", issue: "not_done" },
    ]);
  });

  it("refuses a copy older than the point's", async () => {
    const { status, body } = await activate(ready, "2026-11-01T00:00:00.000Z");
    expect(status).toBe(409);
    expect((body as ErrorResponse).error.code).toBe("meeting_point_changed");
  });

  it("activates a draft whose checklist passes, with its legs both ways and an audit entry", async () => {
    const { status, body } = await activate(ready);
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: ready, status: "active", reviewDueOn: "2027-11-12" });
    // Both ways with every sample point, all on roads.
    const found = await legsOf(ready);
    expect(found).toHaveLength(2 * samplePoints.length);
    expect(found.every((leg) => leg.source === "straight lines")).toBe(true);

    const [entry] = await api.connection.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "meeting_point.activated"), eq(auditLog.subjectId, ready)));
    expect(entry).toMatchObject({
      before: { status: "draft", reviewDueOn: null },
      after: {
        status: "active",
        reviewDueOn: "2027-11-12",
        legs: 2 * samplePoints.length,
        missing: 0,
      },
    });
  });

  it("activates a draft with no photo yet (ADR 0036)", async () => {
    const { status, body } = await activate(noPhoto);
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: noPhoto, status: "active" });
  });

  it("refuses a point that is not a draft", async () => {
    const { status, body } = await activate(ready);
    expect(status).toBe(409);
    expect((body as ErrorResponse).error.code).toBe("status_change_not_allowed");
  });

  it("knows no such point", async () => {
    expect((await activate(nowhere, "2026-11-01T00:00:00.000Z")).status).toBe(404);
  });
});

describe("activating with another router", () => {
  let operator: ConsoleActor["operator"];
  beforeAll(async () => {
    const { userId, sessionId } = await api.signInOperator();
    operator = { userId, sessionId };
  });

  const serviceWith = (router: Router) =>
    createMeetingPointAdminService({
      db: api.connection.db,
      clock: () => api.now(),
      legs: createLegService({ db: api.connection.db, router, clock: () => api.now() }),
    });
  const actor = () => ({ operator, request: { ipAddress: "192.0.2.1", userAgent: null } });
  const straight = createStraightLineRouter();

  it("needs a road that reaches a point in service, not only a road nearby", async () => {
    // Near a road that reaches nowhere, as on an island the road file has no ferry to.
    const island: Router = {
      ...straight,
      legsFrom: (_, ends) => Promise.resolve(ends.map(() => null)),
    };
    const service = serviceWith(island);
    expect((await service.activationChecklist(apart))?.items.at(-1)).toEqual({
      item: "legs",
      done: false,
      required: true,
    });
    const result = await service.activate(apart, { updatedAt: await loaded(apart) }, actor());
    expect(result).toEqual({
      ok: false,
      error: { code: "activation_not_ready", missing: ["legs"] },
    });
    expect((await serviceWith(straight).activationChecklist(apart))?.ready).toBe(true);
  });

  it("leaves the draft as it was when its legs cannot be computed", async () => {
    const broken: Router = {
      ...straight,
      legsTo: () => Promise.reject(new Error("The road file could not be read.")),
    };
    await expect(
      serviceWith(broken).activate(apart, { updatedAt: await loaded(apart) }, actor()),
    ).rejects.toThrow("The road file could not be read.");
    const [point] = await api.connection.db
      .select({ status: meetingPoints.status, reviewDueOn: meetingPoints.reviewDueOn })
      .from(meetingPoints)
      .where(eq(meetingPoints.id, apart));
    expect(point).toEqual({ status: "draft", reviewDueOn: null });
    expect(await legsOf(apart)).toHaveLength(0);
    expect(
      await api.connection.db.$count(
        auditLog,
        and(eq(auditLog.action, "meeting_point.activated"), eq(auditLog.subjectId, apart)),
      ),
    ).toBe(0);
  });
});
