import { randomUUID } from "node:crypto";
import type {
  AdminMeetingPoint,
  AdminMeetingPointInput,
  AdminMeetingPointListItem,
  ErrorResponse,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints } from "@shareride/db/seed";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";

let api: TestApi;
let cookie: string;
let operatorId: string;

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  const signedIn = await api.signInOperator();
  cookie = signedIn.cookie;
  operatorId = signedIn.userId;
});

afterAll(async () => {
  await api.close();
});

// The test clock's day in Iceland (2026-11-13T12:00:00Z).
const today = "2026-11-13";

/** A made-up point at Borgarnes, with every field. */
const borgarnes: AdminMeetingPointInput = {
  nameIs: "N1 Borgarnesi",
  nameEn: "N1 Borgarnes",
  aliases: ["Hyrnan"],
  position: { latitude: 64.5383, longitude: -21.9206 },
  region: "west",
  municipality: "Borgarbyggð",
  type: "fuel-station",
  amenities: ["shelter", "toilets", "shop"],
  whereToStandIs: "Við inngang verslunarinnar.",
  whereToStandEn: "By the shop's entrance.",
  shelterHours: [
    { opens: "07:00", closes: "23:30" },
    { opens: "07:00", closes: "23:30" },
    { opens: "07:00", closes: "23:30" },
    { opens: "07:00", closes: "23:30" },
    { opens: "07:00", closes: "01:00" },
    { opens: "08:00", closes: "24:00" },
    null,
  ],
  shelterNoteIs: "Lokað á jóladag.",
  shelterNoteEn: "Closed on Christmas Day.",
  season: null,
  lastCheckedOn: "2026-11-12",
  amenitiesReviewed: true,
  seasonReviewed: false,
};

async function send(method: string, path: string, body?: unknown, withCookie = cookie) {
  const response = await api.request(path, {
    method,
    headers: { cookie: withCookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function create(input: Partial<AdminMeetingPointInput> = {}) {
  const { status, body } = await send("POST", "/admin/v1/meeting-points", {
    ...borgarnes,
    ...input,
  });
  if (status !== 201) throw new Error(`Not created: ${JSON.stringify(body)}`);
  return body as AdminMeetingPoint;
}

const inputOf = (point: AdminMeetingPoint): AdminMeetingPointInput & { updatedAt: string } => ({
  nameIs: point.nameIs,
  nameEn: point.nameEn,
  aliases: point.aliases,
  position: point.position,
  region: point.region,
  municipality: point.municipality,
  type: point.type,
  amenities: point.amenities,
  whereToStandIs: point.whereToStandIs,
  whereToStandEn: point.whereToStandEn,
  shelterHours: point.shelterHours,
  shelterNoteIs: point.shelterNoteIs,
  shelterNoteEn: point.shelterNoteEn,
  season: point.season,
  lastCheckedOn: point.lastCheckedOn,
  amenitiesReviewed: point.amenitiesReviewedOn !== null,
  seasonReviewed: point.seasonReviewedOn !== null,
  updatedAt: point.updatedAt,
});

const update = (point: AdminMeetingPoint, change: Record<string, unknown>) =>
  send("PUT", `/admin/v1/meeting-points/${point.id}`, { ...inputOf(point), ...change });

async function list(query: Record<string, string> = {}) {
  const { status, body } = await send(
    "GET",
    `/admin/v1/meeting-points?${new URLSearchParams(query).toString()}`,
  );
  if (status !== 200) throw new Error(`Not listed: ${JSON.stringify(body)}`);
  return (body as { meetingPoints: AdminMeetingPointListItem[] }).meetingPoints;
}

async function auditEntriesFor(subjectId: string) {
  const { rows } = await api.connection.pool.query<{
    action: string;
    operator_user_id: string;
    subject_type: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }>("SELECT * FROM audit_log WHERE subject_id = $1 ORDER BY created_at, id", [subjectId]);
  return rows;
}

const errorOf = (body: unknown) => (body as ErrorResponse).error;

const refusedName = "Refused by the audit log";

/** Does `act` while the audit log refuses any entry for a point named `refusedName`. */
async function whileAuditRefuses(act: () => Promise<void>) {
  const { pool } = api.connection;
  await pool.query(`
    CREATE FUNCTION test_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.after ->> 'nameIs' = '${refusedName}' THEN
        RAISE EXCEPTION 'test: audit entry refused';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER test_refuse_audit BEFORE INSERT ON audit_log
      FOR EACH ROW EXECUTE FUNCTION test_refuse_audit();
  `);
  try {
    await act();
  } finally {
    await pool.query(`
      DROP TRIGGER test_refuse_audit ON audit_log;
      DROP FUNCTION test_refuse_audit();
    `);
  }
}

describe("the console's meeting points (spec 2, 3.6)", () => {
  it("needs a console session for every route", async () => {
    const noSession = "sr_operator=sr_os_not-a-session";
    const id = randomUUID();
    for (const [method, path, body] of [
      ["GET", "/admin/v1/meeting-points", undefined],
      ["GET", `/admin/v1/meeting-points/${id}`, undefined],
      ["POST", "/admin/v1/meeting-points", borgarnes],
      ["PUT", `/admin/v1/meeting-points/${id}`, { ...borgarnes, updatedAt: api.now() }],
    ] as const) {
      const { status, body: reply } = await send(method, path, body, noSession);
      expect(status).toBe(401);
      expect(errorOf(reply).code).toBe("operator_unauthenticated");
    }
  });

  it("adds a draft with every field, and an audit entry with its fields", async () => {
    const { status, body } = await send("POST", "/admin/v1/meeting-points", borgarnes);
    expect(status).toBe(201);
    const point = body as AdminMeetingPoint;
    expect(point).toMatchObject({
      nameIs: "N1 Borgarnesi",
      nameEn: "N1 Borgarnes",
      aliases: ["Hyrnan"],
      position: { latitude: 64.5383, longitude: -21.9206 },
      region: "west",
      municipality: "Borgarbyggð",
      type: "fuel-station",
      amenities: ["shelter", "toilets", "shop"],
      shelterHours: borgarnes.shelterHours,
      shelterNoteEn: "Closed on Christmas Day.",
      season: null,
      status: "draft",
      lastCheckedOn: "2026-11-12",
      reviewDueOn: null,
      amenitiesReviewedOn: today,
      seasonReviewedOn: null,
      sample: false,
      pauseReason: null,
    });

    const [entry, ...others] = await auditEntriesFor(point.id);
    expect(others).toEqual([]);
    expect(entry).toMatchObject({
      action: "meeting_point.created",
      operator_user_id: operatorId,
      subject_type: "meeting_point",
      before: null,
    });
    expect(entry?.after).toMatchObject({
      nameIs: "N1 Borgarnesi",
      status: "draft",
      position: { latitude: 64.5383, longitude: -21.9206 },
      amenitiesReviewedOn: today,
    });
  });

  it("adds a draft and its audit entry together or not at all", async () => {
    await whileAuditRefuses(async () => {
      const { status } = await send("POST", "/admin/v1/meeting-points", {
        ...borgarnes,
        nameIs: refusedName,
        nameEn: null,
      });
      expect(status).toBe(500);
    });
    expect(await list({ q: refusedName })).toEqual([]);
  });

  it("refuses a draft with problems, naming each field, and saves nothing", async () => {
    const before = await list();
    const { status, body } = await send("POST", "/admin/v1/meeting-points", {
      ...borgarnes,
      nameIs: " ",
      position: { latitude: 62.0107, longitude: -6.7741 },
      amenities: ["toilets"],
      lastCheckedOn: "2026-11-14",
    });
    expect(status).toBe(400);
    expect(errorOf(body)).toMatchObject({
      code: "validation_failed",
      details: [
        { path: "nameIs", issue: "required" },
        { path: "position", issue: "outside_iceland" },
        { path: "shelterHours", issue: "needs_shelter" },
        { path: "shelterNoteIs", issue: "needs_shelter" },
        { path: "shelterNoteEn", issue: "needs_shelter" },
        { path: "lastCheckedOn", issue: "in_future" },
      ],
    });
    expect(await list()).toEqual(before);
  });

  it("refuses a body of the wrong shape", async () => {
    const { status, body } = await send("POST", "/admin/v1/meeting-points", {
      ...borgarnes,
      region: "midlands",
    });
    expect(status).toBe(400);
    expect(errorOf(body).code).toBe("validation_failed");
  });

  it("shows one point with every field, and says when there is none", async () => {
    const point = await create({ nameIs: "Shell Selfossi", nameEn: null });
    const { status, body } = await send("GET", `/admin/v1/meeting-points/${point.id}`);
    expect(status).toBe(200);
    expect(body).toEqual(point);

    const missing = await send("GET", `/admin/v1/meeting-points/${randomUUID()}`);
    expect(missing.status).toBe(404);
    expect(errorOf(missing.body).code).toBe("not_found");
  });

  describe("the list", () => {
    let draft: AdminMeetingPoint;

    beforeAll(async () => {
      draft = await create({
        nameIs: "Ásbyrgi",
        nameEn: null,
        aliases: [],
        region: "northeast",
        municipality: "Norðurþing",
        type: "parking",
        amenities: [],
        shelterHours: null,
        shelterNoteIs: null,
        shelterNoteEn: null,
        position: { latitude: 66.0237, longitude: -16.5034 },
        season: { startMonth: 5, endMonth: 9 },
      });
      // A retired point and one overdue for its review, beside the samples.
      await api.connection.db
        .update(schema.meetingPoints)
        .set({ status: "retired" })
        .where(eq(schema.meetingPoints.id, sampleId("point:bsi")));
      await api.connection.db
        .update(schema.meetingPoints)
        .set({ reviewDueOn: "2026-11-12" })
        .where(eq(schema.meetingPoints.id, sampleId("point:kef")));
    });

    it("has every point, drafts, samples and retired ones too, by Icelandic name", async () => {
      const points = await list();
      const statuses = new Set(points.map((point) => point.status));
      expect(statuses).toEqual(new Set(["draft", "active", "retired"]));
      expect(points.some((point) => point.sample)).toBe(true);
      const names = points.map((point) => point.nameIs);
      expect(names).toEqual([...names].sort(new Intl.Collator("is").compare));
      expect(points.find((point) => point.id === draft.id)).toEqual({
        id: draft.id,
        nameIs: "Ásbyrgi",
        nameEn: null,
        position: { latitude: 66.0237, longitude: -16.5034 },
        region: "northeast",
        municipality: "Norðurþing",
        type: "parking",
        season: { startMonth: 5, endMonth: 9 },
        status: "draft",
        reviewDueOn: null,
        sample: false,
        updatedAt: draft.updatedAt,
        openIssues: 0,
      });
    });

    it("filters by status, region, type, season, review and name", async () => {
      const ids = async (query: Record<string, string>) =>
        (await list(query)).map((point) => point.id);
      expect(await ids({ status: "draft", region: "northeast" })).toEqual([draft.id]);
      expect(await ids({ status: "retired" })).toEqual([sampleId("point:bsi")]);
      expect(await ids({ type: "parking", q: "asbyrgi" })).toEqual([draft.id]);
      // November: a summer point is out of season.
      expect(await ids({ season: "out-of-season" })).toEqual([draft.id]);
      expect(await ids({ reviewOverdue: "true" })).toEqual([sampleId("point:kef")]);
      expect(await ids({ q: "zzz" })).toEqual([]);
    });

    it("refuses a filter it does not know", async () => {
      const { status } = await send("GET", "/admin/v1/meeting-points?status=lost");
      expect(status).toBe(400);
    });
  });

  describe("editing", () => {
    it("saves the fields, with an audit entry of only what changed", async () => {
      const point = await create({ nameIs: "Olís Borgarnesi", nameEn: null, aliases: [] });
      const { status, body } = await update(point, {
        whereToStandEn: "By the pumps.",
        aliases: ["OLÍS BORGARNESI"],
        seasonReviewed: true,
      });
      expect(status).toBe(200);
      const saved = body as AdminMeetingPoint;
      expect(saved).toMatchObject({
        whereToStandEn: "By the pumps.",
        aliases: [],
        seasonReviewedOn: today,
        amenitiesReviewedOn: today,
      });
      expect(saved.updatedAt).not.toBe(point.updatedAt);

      const [, entry] = await auditEntriesFor(point.id);
      expect(entry).toMatchObject({
        action: "meeting_point.updated",
        before: { whereToStandEn: "By the shop's entrance.", seasonReviewedOn: null },
        after: { whereToStandEn: "By the pumps.", seasonReviewedOn: today },
      });
      // The name again in capitals adds nothing, so it was dropped and is no change.
      expect(Object.keys(entry?.after ?? {}).sort()).toEqual([
        "seasonReviewedOn",
        "whereToStandEn",
      ]);
    });

    it("finds a point by its new name once saved", async () => {
      const point = await create({ nameIs: "Bónus Hveragerði", nameEn: null, aliases: [] });
      await update(point, { nameIs: "Krónan Hveragerði" });
      expect((await list({ q: "kronan hverager" })).map((found) => found.id)).toEqual([point.id]);
      expect(await list({ q: "bonus hverager" })).toEqual([]);
    });

    it("writes no entry when nothing changed", async () => {
      const point = await create({ nameIs: "Orkan Vík", nameEn: null });
      const { status, body } = await update(point, { nameIs: " Orkan Vík " });
      expect(status).toBe(200);
      expect((body as AdminMeetingPoint).updatedAt).toBe(point.updatedAt);
      expect((await auditEntriesFor(point.id)).map((entry) => entry.action)).toEqual([
        "meeting_point.created",
      ]);
    });

    it("refuses an edit made on an older copy, and keeps the newer one", async () => {
      const point = await create({ nameIs: "N1 Hvolsvelli", nameEn: null });
      const first = await update(point, { whereToStandIs: "Við dælurnar." });
      expect(first.status).toBe(200);
      const second = await update(point, { whereToStandIs: "Við búðina." });
      expect(second.status).toBe(409);
      expect(errorOf(second.body).code).toBe("meeting_point_changed");
      const { body } = await send("GET", `/admin/v1/meeting-points/${point.id}`);
      expect((body as AdminMeetingPoint).whereToStandIs).toBe("Við dælurnar.");
    });

    it("moves a draft, but not a point in use: that is its own step (R2.10)", async () => {
      const point = await create({ nameIs: "Skjól á Hellu", nameEn: null });
      const moved = await update(point, { position: { latitude: 63.8357, longitude: -20.3998 } });
      expect(moved.status).toBe(200);
      expect((moved.body as AdminMeetingPoint).position).toEqual({
        latitude: 63.8357,
        longitude: -20.3998,
      });

      const [active] = await list({ status: "active" });
      if (active === undefined) throw new Error("No active sample point.");
      const { body } = await send("GET", `/admin/v1/meeting-points/${active.id}`);
      const activePoint = body as AdminMeetingPoint;
      const refused = await update(activePoint, {
        position: { latitude: 63.8357, longitude: -20.3998 },
      });
      expect(refused.status).toBe(409);
      expect(errorOf(refused.body).code).toBe("move_needed");
      // The same spot is no move.
      const kept = await update(activePoint, { whereToStandEn: "By the bus shelter." });
      expect(kept.status).toBe(200);
    });

    it("leaves a retired point as it was (R2.2)", async () => {
      const { body } = await send("GET", `/admin/v1/meeting-points/${sampleId("point:bsi")}`);
      const { status, body: reply } = await update(body as AdminMeetingPoint, {
        whereToStandEn: "Gone.",
      });
      expect(status).toBe(409);
      expect(errorOf(reply).code).toBe("meeting_point_retired");
    });

    it("says when there is no such point", async () => {
      const point = await create({ nameIs: "Staður", nameEn: null });
      const { status } = await send(
        "PUT",
        `/admin/v1/meeting-points/${randomUUID()}`,
        inputOf(point),
      );
      expect(status).toBe(404);
    });

    it("refuses problems in an edit, naming each field", async () => {
      const point = await create({ nameIs: "Staður tvö", nameEn: null });
      const { status, body } = await update(point, { municipality: "" });
      expect(status).toBe(400);
      expect(errorOf(body).details).toEqual([{ path: "municipality", issue: "required" }]);
    });

    it("saves the change and its audit entry together or not at all", async () => {
      const point = await create({ nameIs: "Staður þrjú", nameEn: null });
      await whileAuditRefuses(async () => {
        const { status } = await update(point, { nameIs: refusedName });
        expect(status).toBe(500);
      });
      const { body } = await send("GET", `/admin/v1/meeting-points/${point.id}`);
      expect(body).toEqual(point);
    });
  });
});
