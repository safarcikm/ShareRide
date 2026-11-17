import { randomUUID } from "node:crypto";
import {
  appealNoticeRoute,
  fileReportRoute,
  myNoticesRoute,
  myReportsRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakePushSender } from "../../platform/push.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import type { AuditRequest } from "../admin/audit.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  hours,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { createNotificationWorker } from "../notifications/worker.ts";
import { createModerationService, type Moderator } from "./actions.ts";

// A person's notices from ShareRide (spec 9, 3.4.4; R9.5): what was done
// and why, with one appeal within 14 days; and the reporter's outcome. The
// operator's side comes from the console in later PRs; here it is called
// as the console will call it.

let api: TestApi;
const request: AuditRequest = { ipAddress: "203.0.113.9", userAgent: "Console test" };
const reason = "Repeated messages after being asked to stop.";

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  const { db } = api.connection;
  await db.execute(sql`delete from outbox_events`);
  await db.execute(sql`delete from notifications`);
  await db.execute(sql`delete from push_tokens`);
  await db.delete(schema.reports);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, rewind, later, driverOf } = bookingHelpers(() => api);

const moderation = () => createModerationService({ db: api.connection.db, clock: () => api.now() });

async function moderator(): Promise<Moderator> {
  const { userId, sessionId } = await api.signInOperator();
  return { userId, sessionId };
}

async function notices(member: Member) {
  const result = await api.client.call(myNoticesRoute, { accessToken: member.accessToken });
  if (!result.ok) throw new Error(result.error.code);
  return result.data.notices;
}

const appeal = (member: Member, id: string, text: string) =>
  api.client.call(appealNoticeRoute, {
    accessToken: member.accessToken,
    params: { id },
    body: { text },
  });

async function suspended(member: Member, by: Moderator) {
  const result = await moderation().suspend(
    by,
    { userId: member.userId, rule: "harassment", reason, until: null },
    request,
  );
  if (!result.ok) throw new Error(result.error.code);
  return result.value.actionId;
}

async function standing(userId: string) {
  const [row] = await api.connection.db
    .select({ status: schema.users.status, suspendedUntil: schema.users.suspendedUntil })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return row;
}

async function auditOf(subjectId: string) {
  return api.connection.db
    .select({
      action: schema.auditLog.action,
      subjectType: schema.auditLog.subjectType,
      after: schema.auditLog.after,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.subjectId, subjectId))
    .orderBy(asc(schema.auditLog.createdAt), asc(schema.auditLog.id));
}

async function events(...types: string[]) {
  return api.connection.db
    .select({ kind: schema.outboxEvents.kind, payload: schema.outboxEvents.payload })
    .from(schema.outboxEvents)
    .where(inArray(schema.outboxEvents.kind, types))
    .orderBy(asc(schema.outboxEvents.id));
}

/** Gives the member the app on their phone, so push reaches them. */
async function withPush(member: Member) {
  const { db } = api.connection;
  const [session] = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, member.userId));
  if (session === undefined) throw new Error("No session.");
  await db.insert(schema.pushTokens).values({
    sessionId: session.id,
    userId: member.userId,
    platform: "ios",
    token: `ExponentPushToken[${member.userId}]`,
  });
}

async function pushesTo(member: Member) {
  const push = createFakePushSender();
  await createNotificationWorker({ db: api.connection.db, clock: () => api.now(), push }).runOnce();
  return push.sent
    .filter((message) => message.to === `ExponentPushToken[${member.userId}]`)
    .map(({ title, body, data }) => ({ title, body, path: data.path }));
}

describe("my notices (spec 9, 3.4.4; R9.5)", () => {
  it("lists what ShareRide did and why, the latest first, and never which operator", async () => {
    const jon = await newMember("Jón");
    const gunna = await newMember("Gunna");
    const by = await moderator();
    const warned = await moderation().warn(
      by,
      { userId: jon.userId, rule: "offensive", reason: "Rude words in a trip note." },
      request,
    );
    if (!warned.ok) throw new Error(warned.error.code);
    const suspension = await suspended(jon, by);

    const mine = await notices(jon);
    expect(mine).toEqual([
      {
        id: suspension,
        kind: "suspension",
        rule: "harassment",
        reason,
        content: null,
        until: null,
        at: api.now().toISOString(),
        appealUntil: new Date(api.now().getTime() + hours(24 * 14) * 1000).toISOString(),
        canAppeal: true,
        appeal: null,
      },
      expect.objectContaining({ id: warned.value.actionId, kind: "warning", rule: "offensive" }),
    ]);
    expect(JSON.stringify(mine)).not.toContain(by.userId);
    expect(await notices(gunna)).toEqual([]);
  });

  it("takes one appeal within 14 days, also while suspended, and only from the person", async () => {
    const jon = await newMember("Jón");
    const gunna = await newMember("Gunna");
    const by = await moderator();
    const suspension = await suspended(jon, by);

    expect(await appeal(gunna, suspension, "Not mine.")).toMatchObject({
      status: 404,
      error: { code: "not_found" },
    });
    expect(await appeal(jon, suspension, "  ")).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "text", issue: "empty" }] },
    });
    expect(await appeal(jon, suspension, "x".repeat(1001))).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "text", issue: "too_long" }] },
    });
    const sent = await appeal(jon, suspension, "  I was not there that day. ");
    expect(sent).toMatchObject({
      status: 200,
      data: {
        id: suspension,
        canAppeal: false,
        appeal: {
          text: "I was not there that day.",
          sentAt: api.now().toISOString(),
          answer: null,
          outcome: null,
          answeredAt: null,
        },
      },
    });
    expect(await appeal(jon, suspension, "Again.")).toMatchObject({
      status: 409,
      error: { code: "already_appealed" },
    });

    // A warning past its 14 days, and a reinstatement, take none.
    const warned = await moderation().warn(
      by,
      { userId: gunna.userId, rule: "offensive", reason: "Rude words." },
      request,
    );
    if (!warned.ok) throw new Error(warned.error.code);
    await later(hours(24 * 14) + 1, gunna, jon);
    expect(await appeal(gunna, warned.value.actionId, "Too late?")).toMatchObject({
      status: 409,
      error: { code: "appeal_window_closed" },
    });
    const reinstated = await moderation().reinstate(
      by,
      { userId: jon.userId, note: "A mix-up." },
      request,
    );
    if (!reinstated.ok) throw new Error(reinstated.error.code);
    expect(await appeal(jon, reinstated.value.actionId, "Thanks.")).toMatchObject({
      status: 409,
      error: { code: "not_appealable" },
    });
    expect(await appeal(jon, randomUUID(), "Anything.")).toMatchObject({ status: 404 });
  });
});

describe("the operator's answer to an appeal (spec 9, 3.4.4)", () => {
  it("answers once; reversing a suspension lifts it, and the person is told", async () => {
    const jon = await newMember("Jón");
    const by = await moderator();
    const suspension = await suspended(jon, by);
    const service = moderation();
    expect(
      await service.answerAppeal(
        by,
        { actionId: suspension, outcome: "reversed", answer: "Yes." },
        request,
      ),
    ).toEqual({ ok: false, error: { code: "not_appealed" } });
    await appeal(jon, suspension, "I was not there that day.");
    await withPush(jon);
    await api.connection.db.execute(sql`delete from outbox_events`);

    expect(
      await service.answerAppeal(
        by,
        { actionId: suspension, outcome: "reversed", answer: "  You were right; sorry. " },
        request,
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(await standing(jon.userId)).toEqual({ status: "active", suspendedUntil: null });
    expect((await notices(jon))[0]).toMatchObject({
      id: suspension,
      appeal: {
        answer: "You were right; sorry.",
        outcome: "reversed",
        answeredAt: api.now().toISOString(),
      },
    });
    expect(await auditOf(suspension)).toEqual([
      {
        action: "moderation_action.appeal_answered",
        subjectType: "moderation_action",
        after: {
          fields: ["appealAnswer", "appealOutcome", "appealAnsweredAt"],
          suspensionLifted: { userId: jon.userId, fields: ["status", "suspendedUntil"] },
        },
      },
    ]);
    expect(await events("AppealAnswered")).toEqual([
      { kind: "AppealAnswered", payload: { actionId: suspension } },
    ]);
    expect(await pushesTo(jon)).toEqual([
      {
        title: "ShareRide answered your appeal",
        body: "We looked again and changed our decision.",
        path: "/notices",
      },
    ]);
    expect(
      await service.answerAppeal(
        by,
        { actionId: suspension, outcome: "upheld", answer: "No." },
        request,
      ),
    ).toEqual({ ok: false, error: { code: "already_answered" } });
    expect(
      await service.answerAppeal(
        by,
        { actionId: randomUUID(), outcome: "upheld", answer: "No." },
        request,
      ),
    ).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("keeps the suspension when the decision stands", async () => {
    const jon = await newMember("Jón");
    const by = await moderator();
    const suspension = await suspended(jon, by);
    await appeal(jon, suspension, "I was not there that day.");
    expect(
      await moderation().answerAppeal(
        by,
        { actionId: suspension, outcome: "upheld", answer: "The messages show it was you." },
        request,
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(await standing(jon.userId)).toEqual({ status: "suspended", suspendedUntil: null });
    expect(await auditOf(suspension)).toMatchObject([
      { after: { fields: ["appealAnswer", "appealOutcome", "appealAnsweredAt"] } },
    ]);
  });

  it("lifts only the suspension the person is under now", async () => {
    const jon = await newMember("Jón");
    const gunna = await newMember("Gunna");
    const by = await moderator();
    const service = moderation();
    const reinstate = async (member: Member) => {
      const done = await service.reinstate(
        by,
        { userId: member.userId, note: "A mix-up." },
        request,
      );
      if (!done.ok) throw new Error(done.error.code);
    };
    const reverse = (actionId: string) =>
      service.answerAppeal(
        by,
        { actionId, outcome: "reversed", answer: "You were right." },
        request,
      );

    // Reinstated already: reversing it later has nothing to lift.
    const ended = await suspended(jon, by);
    await appeal(jon, ended, "I was not there that day.");
    await reinstate(jon);
    expect(await reverse(ended)).toEqual({ ok: true, value: undefined });
    expect(await standing(jon.userId)).toEqual({ status: "active", suspendedUntil: null });
    expect(await auditOf(ended)).toEqual([
      expect.objectContaining({
        after: { fields: ["appealAnswer", "appealOutcome", "appealAnsweredAt"] },
      }) as unknown,
    ]);

    // Suspended again since: reversing the first leaves the second.
    const first = await suspended(gunna, by);
    await appeal(gunna, first, "I was not there that day.");
    await reinstate(gunna);
    await later(60, gunna, jon);
    await suspended(gunna, by);
    expect(await reverse(first)).toEqual({ ok: true, value: undefined });
    expect(await standing(gunna.userId)).toEqual({ status: "suspended", suspendedUntil: null });
  });
});

describe("closing a report (spec 9, 3.4.3 and 3.1.6)", () => {
  it("tells the reporter the outcome in general terms, once", async () => {
    await driverOf(sampleTrip.airport, "Jón");
    const gunna = await newMember("Gunna");
    const filed = await api.client.call(fileReportRoute, {
      accessToken: gunna.accessToken,
      body: {
        about: { kind: "trip", tripId: sampleTrip.airport },
        category: "not_as_listed",
        description: "",
      },
    });
    if (!filed.ok) throw new Error(filed.error.code);
    await withPush(gunna);
    await api.connection.db.execute(sql`delete from outbox_events`);
    const by = await moderator();
    const service = moderation();

    expect(
      await service.closeReport(by, { reportId: filed.data.id, outcome: "no_breach" }, request),
    ).toEqual({ ok: true, value: undefined });
    const mine = await api.client.call(myReportsRoute, { accessToken: gunna.accessToken });
    expect(mine).toMatchObject({
      data: {
        reports: [
          {
            id: filed.data.id,
            status: "closed",
            outcome: "no_breach",
            closedAt: api.now().toISOString(),
          },
        ],
      },
    });
    expect(await auditOf(filed.data.id)).toEqual([
      {
        action: "report.closed",
        subjectType: "report",
        after: { fields: ["status", "outcome", "closedAt"] },
      },
    ]);
    expect(await pushesTo(gunna)).toEqual([
      {
        title: "Your report",
        body: "We've looked into your report and found no breach of our rules.",
        path: "/settings/reports",
      },
    ]);
    expect(
      await service.closeReport(by, { reportId: filed.data.id, outcome: "action_taken" }, request),
    ).toEqual({ ok: false, error: { code: "already_closed" } });
    expect(
      await service.closeReport(by, { reportId: randomUUID(), outcome: "no_breach" }, request),
    ).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("tells nobody once the reporter's account is gone", async () => {
    await driverOf(sampleTrip.airport, "Jón");
    const gunna = await newMember("Gunna");
    const filed = await api.client.call(fileReportRoute, {
      accessToken: gunna.accessToken,
      body: {
        about: { kind: "trip", tripId: sampleTrip.airport },
        category: "not_as_listed",
        description: "",
      },
    });
    if (!filed.ok) throw new Error(filed.error.code);
    // As deleting the account leaves it (spec 9, section 7).
    await api.connection.db
      .update(schema.reports)
      .set({ reporterId: null })
      .where(eq(schema.reports.id, filed.data.id));
    await api.connection.db.execute(sql`delete from outbox_events`);

    expect(
      await moderation().closeReport(
        await moderator(),
        { reportId: filed.data.id, outcome: "action_taken" },
        request,
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(await events("ReportClosed")).toEqual([]);
  });
});
