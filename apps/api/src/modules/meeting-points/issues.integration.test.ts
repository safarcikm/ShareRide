import {
  reportMeetingPointIssueRoute,
  type AdminMeetingPointIssue,
  type ErrorResponse,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints } from "@shareride/db/seed";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { collectExport } from "../privacy/export-data.ts";
import { retentionSteps, runRetention } from "../privacy/retention.ts";

let api: TestApi;
const borgarnes = sampleId("point:borgarnes");

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  const base = {
    location: { latitude: 64.14, longitude: -21.93 },
    region: "capital",
    municipality: "Reykjavík",
    type: "other",
  } as const;
  await api.connection.db.insert(schema.meetingPoints).values([
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

async function report(
  accessToken: string | null,
  id: string,
  body: { reason: string; note: string } = { reason: "unsafe", note: "" },
) {
  return api.client.call(reportMeetingPointIssueRoute, {
    params: { id },
    body: body as { reason: "unsafe"; note: string },
    ...(accessToken === null ? {} : { accessToken }),
  });
}

async function issuesOf(userId: string) {
  return api.connection.db
    .select()
    .from(schema.meetingPointIssues)
    .where(eq(schema.meetingPointIssues.reporterId, userId));
}

describe("POST /v1/meeting-points/{id}/issues", () => {
  it("needs an account, which has a verified phone number (R2.8)", async () => {
    const result = await report(null, borgarnes);
    expect(result.ok ? 0 : result.status).toBe(401);
  });

  it("puts the report in the operator's queue, linked to the person", async () => {
    const { accessToken, userId } = await api.signIn(api.newPhoneNumber());
    const result = await report(accessToken, borgarnes, {
      reason: "wrong_location",
      note: "  Skiltið er hinum megin við götuna. \n",
    });
    expect(result.ok ? result.status : result.status).toBe(204);
    expect(await issuesOf(userId)).toMatchObject([
      {
        meetingPointId: borgarnes,
        reason: "wrong_location",
        note: "Skiltið er hinum megin við götuna.",
        status: "open",
        resolutionNote: null,
        resolvedAt: null,
      },
    ]);
  });

  it("is only for points people can see", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    for (const id of [sampleId("test:draft"), sampleId("test:retired"), sampleId("test:none")]) {
      const result = await report(accessToken, id);
      expect(result.ok ? null : [result.status, result.error.code]).toEqual([404, "not_found"]);
    }
  });

  it("refuses a note over 300 characters or a reason it does not know", async () => {
    const { accessToken, userId } = await api.signIn(api.newPhoneNumber());
    const long = await report(accessToken, borgarnes, { reason: "other", note: "x".repeat(301) });
    expect(long.ok ? null : [long.status, long.error.details]).toEqual([
      400,
      [{ path: "note", issue: "too_long" }],
    ]);
    const unknown = await report(accessToken, borgarnes, { reason: "dirty", note: "" });
    expect(unknown.ok ? null : unknown.status).toBe(400);
    expect(await issuesOf(userId)).toEqual([]);
  });

  it("takes 5 a day from one person, then says when the next can be sent", async () => {
    const phone = api.newPhoneNumber();
    const { accessToken, userId } = await api.signIn(phone);
    for (let sent = 0; sent < 5; sent += 1) {
      const result = await report(accessToken, borgarnes);
      expect(result.ok).toBe(true);
      api.advance(60);
    }
    const sixth = await report(accessToken, borgarnes);
    expect(sixth.ok ? null : [sixth.status, sixth.error.code]).toEqual([429, "too_many_reports"]);
    expect(sixth.ok ? null : sixth.error.retryAfterSeconds).toBe(24 * 3_600 - 5 * 60);
    expect(await issuesOf(userId)).toHaveLength(5);

    // The first falls out of the last 24 hours; a new sign-in, as the token has expired.
    api.advance(24 * 3_600 - 5 * 60);
    expect((await report((await api.signIn(phone)).accessToken, borgarnes)).ok).toBe(true);
  });

  it("still counts a report that is no longer linked to the person, as once resolved", async () => {
    const { accessToken, userId } = await api.signIn(api.newPhoneNumber());
    for (let sent = 0; sent < 5; sent += 1) {
      expect((await report(accessToken, borgarnes)).ok).toBe(true);
    }
    await api.connection.db
      .update(schema.meetingPointIssues)
      .set({
        status: "resolved",
        resolutionNote: "Lagað.",
        resolvedAt: api.now(),
        reporterId: null,
      })
      .where(eq(schema.meetingPointIssues.reporterId, userId));
    const sixth = await report(accessToken, borgarnes);
    expect(sixth.ok ? null : [sixth.status, sixth.error.code]).toEqual([429, "too_many_reports"]);
  });

  it("holds the limit for reports sent at the same moment", async () => {
    const { accessToken, userId } = await api.signIn(api.newPhoneNumber());
    const results = await Promise.all(
      Array.from({ length: 7 }, () => report(accessToken, borgarnes)),
    );
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([204, 204, 204, 204, 204, 429, 429]);
    expect(await issuesOf(userId)).toHaveLength(5);
  });

  it("is in the person's Download my data while it is open, named in their language", async () => {
    const { accessToken, userId } = await api.signIn(api.newPhoneNumber());
    await report(accessToken, borgarnes, { reason: "closed_or_moved", note: "Lokað í vetur." });
    const data = await collectExport(api.connection.db, userId, api.now());
    expect(data.sections.meeting_point_reports).toEqual([
      {
        place: "N1 Borgarnes",
        problem: "closed_or_moved",
        note: "Lokað í vetur.",
        sentAt: api.now().toISOString(),
      },
    ]);
  });
});

describe("the console's queue (spec 2, 3.5 and 3.6)", () => {
  let cookie: string;
  let operatorId: string;

  beforeAll(async () => {
    const signedIn = await api.signInOperator();
    cookie = signedIn.cookie;
    operatorId = signedIn.userId;
  });

  async function admin(path: string, init: { method?: string; body?: unknown } = {}, as = cookie) {
    const response = await api.request(path, {
      method: init.method ?? "GET",
      headers: { cookie: as, "content-type": "application/json" },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const text = await response.text();
    return { status: response.status, body: (text === "" ? null : JSON.parse(text)) as unknown };
  }

  const queue = async () =>
    ((await admin("/admin/v1/meeting-point-issues")).body as { issues: AdminMeetingPointIssue[] })
      .issues;

  const resolve = (id: string, body: unknown) =>
    admin(`/admin/v1/meeting-point-issues/${id}/resolve`, { method: "POST", body });

  async function pointDates(id: string) {
    const [point] = await api.connection.db
      .select({
        lastCheckedOn: schema.meetingPoints.lastCheckedOn,
        reviewDueOn: schema.meetingPoints.reviewDueOn,
      })
      .from(schema.meetingPoints)
      .where(eq(schema.meetingPoints.id, id));
    return point;
  }

  async function auditOf(action: string, subjectId: string) {
    return api.connection.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, action), eq(schema.auditLog.subjectId, subjectId)));
  }

  async function sentBySomeone(point: string, reason: string, note: string) {
    const person = await api.signIn(api.newPhoneNumber());
    expect((await report(person.accessToken, point, { reason, note })).ok).toBe(true);
    const [row] = await issuesOf(person.userId);
    if (row === undefined) throw new Error("The report was not stored.");
    return { id: row.id, person };
  }

  it("needs a console session", async () => {
    expect((await admin("/admin/v1/meeting-point-issues", {}, "")).status).toBe(401);
  });

  it("lists the open reports, the oldest first, never who sent them", async () => {
    const kef = sampleId("point:kef");
    const first = await sentBySomeone(kef, "unsafe", "Dimmt á kvöldin.");
    api.advance(60);
    const second = await sentBySomeone(borgarnes, "other", "");
    const found = (await queue()).filter((issue) => [first.id, second.id].includes(issue.id));
    expect(found).toEqual([
      {
        id: first.id,
        meetingPoint: expect.objectContaining({ id: kef, status: "active" }) as unknown,
        reason: "unsafe",
        note: "Dimmt á kvöldin.",
        sentAt: expect.any(String) as unknown,
      },
      expect.objectContaining({ id: second.id, reason: "other" }),
    ]);
    expect(JSON.stringify(found)).not.toContain(first.person.userId);
  });

  it("resolves with a note, removes the link to the person, and leaves the queue", async () => {
    const { id, person } = await sentBySomeone(borgarnes, "wrong_information", "Rangt heiti.");
    const resolved = await resolve(id, { note: "  Heitið lagað. ", checkedToday: false });
    expect(resolved.status).toBe(204);

    const [row] = await api.connection.db
      .select()
      .from(schema.meetingPointIssues)
      .where(eq(schema.meetingPointIssues.id, id));
    expect(row).toMatchObject({
      status: "resolved",
      resolutionNote: "Heitið lagað.",
      resolvedById: operatorId,
      resolvedAt: api.now(),
      reporterId: null,
      note: "Rangt heiti.",
    });
    expect((await queue()).map((issue) => issue.id)).not.toContain(id);
    const data = await collectExport(api.connection.db, person.userId, api.now());
    expect(data.sections.meeting_point_reports).toEqual([]);

    const [entry] = await api.connection.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "meeting_point_issue.resolved"),
          eq(schema.auditLog.subjectId, id),
        ),
      );
    expect(entry).toMatchObject({
      operatorUserId: operatorId,
      subjectType: "meeting_point_issue",
      before: { status: "open" },
      after: {
        status: "resolved",
        meetingPointId: borgarnes,
        reason: "wrong_information",
        resolutionNote: "Heitið lagað.",
      },
    });
    // Not checked today: the point is as it was, with nothing in its history.
    expect(entry?.after).not.toHaveProperty("lastCheckedOn");

    const again = await resolve(id, { note: "Aftur.", checkedToday: false });
    expect([again.status, (again.body as ErrorResponse).error.code]).toEqual([
      409,
      "issue_resolved",
    ]);
  });

  it("marks the point checked today when asked, which moves its yearly review", async () => {
    const bsi = sampleId("point:bsi");
    const before = await pointDates(bsi);
    const { id } = await sentBySomeone(bsi, "closed_or_moved", "");
    expect((await resolve(id, { note: "Skoðað á staðnum.", checkedToday: true })).status).toBe(204);
    const today = api.now().toISOString().slice(0, 10);
    const checked = {
      lastCheckedOn: today,
      reviewDueOn: `${String(Number(today.slice(0, 4)) + 1)}${today.slice(4)}`,
    };
    expect(await pointDates(bsi)).toEqual(checked);

    // The point's history has the change, before and after, as an edit's would.
    const [pointEntry] = await auditOf("meeting_point.updated", bsi);
    expect(pointEntry).toMatchObject({
      subjectType: "meeting_point",
      operatorUserId: operatorId,
      before,
      after: checked,
    });
    const [issueEntry] = await auditOf("meeting_point_issue.resolved", id);
    expect(issueEntry?.after).toMatchObject({ lastCheckedOn: today });
  });

  it("leaves a retired point as it was, checked today or not", async () => {
    const retired = sampleId("test:retired");
    const [issue] = await api.connection.db
      .insert(schema.meetingPointIssues)
      .values({ meetingPointId: retired, reason: "closed_or_moved" })
      .returning({ id: schema.meetingPointIssues.id });
    if (issue === undefined) throw new Error("No report.");
    expect((await resolve(issue.id, { note: "Hætt.", checkedToday: true })).status).toBe(204);
    expect(await pointDates(retired)).toEqual({ lastCheckedOn: null, reviewDueOn: null });
    expect(await auditOf("meeting_point.updated", retired)).toEqual([]);
    const [entry] = await auditOf("meeting_point_issue.resolved", issue.id);
    expect(entry?.after).not.toHaveProperty("lastCheckedOn");
  });

  it("marks the point in the console's list while a report is open", async () => {
    const akranes = sampleId("point:akranes");
    const listed = async (query: string) =>
      (
        (await admin(`/admin/v1/meeting-points${query}`)).body as {
          meetingPoints: { id: string; openIssues: number }[];
        }
      ).meetingPoints.find((point) => point.id === akranes);
    expect(await listed("")).toMatchObject({ openIssues: 0 });
    expect(await listed("?openIssues=true")).toBeUndefined();

    const first = await sentBySomeone(akranes, "unsafe", "");
    await sentBySomeone(akranes, "other", "");
    expect(await listed("?openIssues=true")).toMatchObject({ openIssues: 2 });
    await resolve(first.id, { note: "Lagað.", checkedToday: false });
    expect(await listed("?openIssues=true")).toMatchObject({ openIssues: 1 });
  });

  it("still counts a resolved report towards the 5 a day (R2.8)", async () => {
    const { accessToken, userId } = await api.signIn(api.newPhoneNumber());
    for (let sent = 0; sent < 5; sent += 1) {
      expect((await report(accessToken, borgarnes)).ok).toBe(true);
    }
    const [first] = await issuesOf(userId);
    if (first === undefined) throw new Error("No report.");
    expect((await resolve(first.id, { note: "Lagað.", checkedToday: false })).status).toBe(204);
    expect((await report(accessToken, borgarnes)).status).toBe(429);
  });

  it("resolves a report once when two operators resolve it at the same moment", async () => {
    const { id } = await sentBySomeone(borgarnes, "other", "");
    const answers = await Promise.all([
      resolve(id, { note: "Fyrri.", checkedToday: false }),
      resolve(id, { note: "Seinni.", checkedToday: false }),
    ]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([204, 409]);
    const entries = await api.connection.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "meeting_point_issue.resolved"),
          eq(schema.auditLog.subjectId, id),
        ),
      );
    expect(entries).toHaveLength(1);
  });

  it("saves nothing when the audit log cannot take the entry", async () => {
    const hlemmur = sampleId("point:hlemmur");
    const { id, person } = await sentBySomeone(hlemmur, "unsafe", "");
    const pointBefore = await pointDates(hlemmur);
    const { pool } = api.connection;
    await pool.query(`
      CREATE FUNCTION test_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.after ->> 'resolutionNote' = 'Refused by the audit log' THEN
          RAISE EXCEPTION 'test: audit entry refused';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER test_refuse_audit BEFORE INSERT ON audit_log
        FOR EACH ROW EXECUTE FUNCTION test_refuse_audit();
    `);
    try {
      const refused = await resolve(id, { note: "Refused by the audit log", checkedToday: true });
      expect(refused.status).toBe(500);
    } finally {
      await pool.query(`
        DROP TRIGGER test_refuse_audit ON audit_log;
        DROP FUNCTION test_refuse_audit();
      `);
    }
    const [row] = await api.connection.db
      .select()
      .from(schema.meetingPointIssues)
      .where(eq(schema.meetingPointIssues.id, id));
    expect(row).toMatchObject({ status: "open", reporterId: person.userId, resolutionNote: null });
    expect(await pointDates(hlemmur)).toEqual(pointBefore);
    expect((await queue()).map((issue) => issue.id)).toContain(id);
  });

  it("needs a note, and knows only reports there are", async () => {
    const { id } = await sentBySomeone(borgarnes, "other", "");
    const empty = await resolve(id, { note: "  ", checkedToday: false });
    expect([empty.status, (empty.body as ErrorResponse).error.details]).toEqual([
      400,
      [{ path: "note", issue: "required" }],
    ]);
    const long = await resolve(id, { note: "x".repeat(1001), checkedToday: false });
    expect((long.body as ErrorResponse).error.details).toEqual([
      { path: "note", issue: "too_long" },
    ]);
    const none = await resolve(sampleId("test:none"), { note: "Lagað.", checkedToday: false });
    expect(none.status).toBe(404);
    expect((await queue()).map((issue) => issue.id)).toContain(id);
  });

  it("deletes a resolved report 12 months after it was resolved", async () => {
    const { id: old } = await sentBySomeone(borgarnes, "other", "Gamalt.");
    await resolve(old, { note: "Lagað.", checkedToday: false });
    // Sent as long ago, but still open, or resolved only later: both stay.
    const { id: longOpen } = await sentBySomeone(borgarnes, "other", "Enn opið.");
    const { id: lateResolved } = await sentBySomeone(borgarnes, "other", "Seint.");
    api.advance(200 * 24 * 3_600);
    await resolve(lateResolved, { note: "Lagað seint.", checkedToday: false });
    const { id: newer } = await sentBySomeone(borgarnes, "other", "Nýrra.");
    await resolve(newer, { note: "Lagað.", checkedToday: false });
    const { id: open } = await sentBySomeone(borgarnes, "other", "Opið.");

    // A year and a day after the first was resolved.
    const now = new Date(api.now().getTime() + 166 * 24 * 3_600_000);
    const logger = { error: () => undefined } as unknown as Parameters<
      typeof runRetention
    >[0]["logger"];
    const result = await runRetention({
      db: api.connection.db,
      now,
      steps: retentionSteps({
        db: api.connection.db,
        erasure: { eraseDue: () => Promise.resolve({ erased: 0, failed: 0 }) },
        logger,
      }).filter((step) => step.rules.includes("meeting_point_issues")),
      logger,
    });
    expect(result.failedRules).toEqual([]);
    const left = await api.connection.db
      .select({ id: schema.meetingPointIssues.id })
      .from(schema.meetingPointIssues);
    const ids = left.map((row) => row.id);
    expect(ids).not.toContain(old);
    expect(ids).toEqual(expect.arrayContaining([newer, open, longOpen, lateResolved]));
  });
});
