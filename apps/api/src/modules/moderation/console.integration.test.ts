import { randomUUID } from "node:crypto";
import {
  fileReportRoute,
  myReportsRoute,
  sendMessageRoute,
  type AdminModerationAction,
  type AdminReport,
  type AdminReportListItem,
  type FileReportBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";

// The console's reports, actions and appeals (spec 9, 3.4 to 3.6;
// milestone 9, PR 7). At the test clock (Friday 13 November 2026, noon),
// Jón drives Hlemmur to Keflavík Airport on Saturday at 05:30, and to Vík
// later; Anna drives to Akureyri.

let api: TestApi;
const { airport, north } = sampleTrip;
const hourMs = 3_600_000;
const reason = "Rude words about another member.";

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  const { db } = api.connection;
  await db.execute(sql`delete from moderation_actions`);
  await db.execute(sql`delete from reports`);
  await db.execute(sql`delete from outbox_events`);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

async function send(cookie: string, method: string, path: string, body?: unknown) {
  const response = await api.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function filed(member: Member, body: FileReportBody) {
  const result = await api.client.call(fileReportRoute, {
    accessToken: member.accessToken,
    body,
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.data.id;
}

/** Jón drives the airport trip; Gunna paid for a seat; Jón wrote to her, and she reported it. */
async function reportedMessage() {
  const jon = await driverOf(airport, "Jón");
  const gunna = await newMember("Gunna");
  const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
  await paid(gunna.accessToken, booking.id);
  const sent = await api.client.call(sendMessageRoute, {
    accessToken: jon.accessToken,
    params: { id: booking.id },
    body: { clientId: randomUUID(), text: "Something unkind" },
  });
  if (!sent.ok) throw new Error(sent.error.code);
  const reportId = await filed(gunna, {
    about: { kind: "message", messageId: sent.data.id },
    category: "harassment",
    description: "He was rude to me.",
  });
  return { jon, gunna, bookingId: booking.id, messageId: sent.data.id, reportId };
}

/** The audit log is append-only, so each test reads the entries about its own records. */
async function auditOf(action: string, subjectId: string) {
  return api.connection.db
    .select({
      subjectType: schema.auditLog.subjectType,
      after: schema.auditLog.after,
      operatorId: schema.auditLog.operatorUserId,
    })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, action), eq(schema.auditLog.subjectId, subjectId)))
    .orderBy(asc(schema.auditLog.id));
}

async function conversationOf(bookingId: string) {
  const [row] = await api.connection.db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(eq(schema.conversations.bookingId, bookingId));
  if (row === undefined) throw new Error("No conversation.");
  return row.id;
}

const person = (member: Member, firstName: string) => ({
  userId: member.userId,
  firstName,
  status: "active",
  suspendedUntil: null,
  locale: "en",
});

describe("the console's reports, actions and appeals", () => {
  it("are for operators only", async () => {
    const { gunna, reportId } = await reportedMessage();
    const asGunna = { authorization: `Bearer ${gunna.accessToken}` };
    const statement = { rule: "offensive", reason };
    for (const [method, path, body] of [
      ["GET", "/admin/v1/reports", undefined],
      ["GET", `/admin/v1/reports/${reportId}`, undefined],
      ["GET", `/admin/v1/reports/${reportId}/conversation`, undefined],
      ["POST", `/admin/v1/reports/${reportId}/close`, { outcome: "no_breach" }],
      ["POST", `/admin/v1/users/${gunna.userId}/warning`, statement],
      ["POST", `/admin/v1/users/${gunna.userId}/suspension`, { ...statement, until: null }],
      ["POST", `/admin/v1/users/${gunna.userId}/reinstatement`, { note: "Welcome back." }],
      [
        "POST",
        "/admin/v1/hidden-content",
        { ...statement, content: { kind: "about", id: gunna.userId } },
      ],
      [
        "POST",
        `/admin/v1/trips/${airport}/cancellation`,
        { ...statement, countsOnReliability: false },
      ],
      ["GET", "/admin/v1/appeals", undefined],
      [
        "POST",
        `/admin/v1/moderation-actions/${randomUUID()}/appeal-answer`,
        { outcome: "upheld", answer: "It stands." },
      ],
    ] as const) {
      const answered = await api.request(path, {
        method,
        headers: { ...asGunna, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      expect(answered.status, path).toBe(401);
    }
    expect(await auditOf("conversation.opened", reportId)).toEqual([]);
    expect(await api.connection.db.select().from(schema.moderationActions)).toEqual([]);
  });
});

describe("the reports queue (spec 9, 3.4.1)", () => {
  it("lists open reports, safety first, then the oldest, each due 24 hours after it was filed", async () => {
    const anna = await driverOf(north, "Anna");
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const older = await filed(gunna, { about: { kind: "trip", tripId: north }, category: "scam" });
    const olderAt = api.now();
    await later(60, gunna);
    const newer = await filed(gunna, {
      about: { kind: "trip", tripId: airport },
      category: "not_as_listed",
    });
    await later(60, gunna);
    const urgent = await filed(gunna, {
      about: { kind: "trip", tripId: airport },
      category: "safety",
    });
    const { cookie } = await api.signInOperator();

    const { status, body } = await send(cookie, "GET", "/admin/v1/reports");

    expect(status).toBe(200);
    const { reports } = body as { reports: AdminReportListItem[] };
    expect(reports.map((report) => report.id)).toEqual([urgent, older, newer]);
    expect(reports[1]).toEqual({
      id: older,
      subject: "trip",
      category: "scam",
      urgent: false,
      status: "open",
      outcome: null,
      filedAt: olderAt.toISOString(),
      dueAt: new Date(olderAt.getTime() + 24 * hourMs).toISOString(),
      closedAt: null,
      reporter: person(gunna, "Gunna"),
      reported: person(anna, "Anna"),
    });
    expect(reports[0]?.reported).toEqual(person(jon, "Jón"));
  });

  it("moves a closed report to the closed list, latest first, and tells the reporter", async () => {
    const { gunna, reportId } = await reportedMessage();
    const { cookie, userId } = await api.signInOperator();

    const closed = await send(cookie, "POST", `/admin/v1/reports/${reportId}/close`, {
      outcome: "no_breach",
    });

    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({
      id: reportId,
      status: "closed",
      outcome: "no_breach",
      closedAt: api.now().toISOString(),
    });
    expect((await send(cookie, "GET", "/admin/v1/reports")).body).toEqual({ reports: [] });
    expect((await send(cookie, "GET", "/admin/v1/reports?state=closed")).body).toMatchObject({
      reports: [{ id: reportId, outcome: "no_breach" }],
    });
    const mine = await api.client.call(myReportsRoute, { accessToken: gunna.accessToken });
    expect(mine).toMatchObject({ data: { reports: [{ id: reportId, outcome: "no_breach" }] } });
    expect(await auditOf("report.closed", reportId)).toEqual([
      {
        subjectType: "report",
        after: { fields: ["status", "outcome", "closedAt"] },
        operatorId: userId,
      },
    ]);
    const again = await send(cookie, "POST", `/admin/v1/reports/${reportId}/close`, {
      outcome: "action_taken",
    });
    expect(again).toMatchObject({ status: 409, body: { error: { code: "already_closed" } } });
    const missing = await send(cookie, "POST", `/admin/v1/reports/${randomUUID()}/close`, {
      outcome: "no_breach",
    });
    expect(missing.status).toBe(404);
  });
});

describe("a report's page (spec 9, 3.4.2)", () => {
  it("shows the report, its records without the message's words, and both people's history", async () => {
    const { jon, gunna, bookingId, messageId, reportId } = await reportedMessage();
    const earlier = await filed(gunna, {
      about: { kind: "trip", tripId: airport },
      category: "other",
    });
    // A request never paid is no ride, so not among her recent trips.
    await booked(gunna.accessToken, north, { fromStop: 0, toStop: 1 });
    const { cookie } = await api.signInOperator();

    const { status, body } = await send(cookie, "GET", `/admin/v1/reports/${reportId}`);

    expect(status).toBe(200);
    const report = body as AdminReport;
    expect(report).toMatchObject({
      id: reportId,
      subject: "message",
      category: "harassment",
      description: "He was rude to me.",
      reporter: person(gunna, "Gunna"),
      reported: person(jon, "Jón"),
      trip: { id: airport, driverId: jon.userId, status: "published", noteHidden: false },
      booking: { id: bookingId, status: "confirmed", seats: 1 },
      message: { id: messageId, removed: false },
      about: null,
      conversation: true,
      actions: [],
    });
    expect(JSON.stringify(report)).not.toContain("Something unkind");
    expect(report.trip?.from.name.en).toBe("Hlemmur");
    expect(report.reporterSide?.reportsBy.map((one) => one.id)).toEqual([earlier]);
    expect(report.reporterSide?.reportsAbout).toEqual([]);
    expect(report.reportedSide?.reportsAbout.map((one) => one.id)).toEqual([earlier]);
    expect(report.reportedSide?.recentTrips).toContainEqual(
      expect.objectContaining({ tripId: airport, role: "driver", status: "published" }),
    );
    expect(report.reporterSide?.recentTrips).toEqual([
      expect.objectContaining({ tripId: airport, role: "passenger", status: "published" }),
    ]);
  });

  it("shows About you for a report about a person, and nothing for one that does not exist", async () => {
    const { jon, gunna, bookingId } = await reportedMessage();
    await api.connection.db
      .update(schema.users)
      .set({ about: "I drive fast." })
      .where(eq(schema.users.id, jon.userId));
    const reportId = await filed(gunna, {
      about: { kind: "user", bookingId },
      category: "offensive",
    });
    const { cookie } = await api.signInOperator();

    const { body } = await send(cookie, "GET", `/admin/v1/reports/${reportId}`);

    expect(body).toMatchObject({
      subject: "user",
      about: { text: "I drive fast.", hidden: false },
      message: null,
      conversation: false,
    });
    const missing = await send(cookie, "GET", `/admin/v1/reports/${randomUUID()}`);
    expect(missing).toMatchObject({ status: 404, body: { error: { code: "not_found" } } });
  });

  it("shows the review a report is about, with its words, and whether it is hidden", async () => {
    const { jon, gunna, bookingId } = await reportedMessage();
    const [review] = await api.connection.db
      .insert(schema.reviews)
      .values({
        bookingId,
        authorId: gunna.userId,
        subjectId: jon.userId,
        authorRole: "passenger",
        rating: 1,
        comment: "Unkind words",
        revealedAt: api.now(),
      })
      .returning({ id: schema.reviews.id, at: schema.reviews.createdAt });
    if (review === undefined) throw new Error("No review.");
    const reportId = await filed(jon, {
      about: { kind: "review", reviewId: review.id },
      category: "offensive",
    });
    const { cookie } = await api.signInOperator();

    const { body } = await send(cookie, "GET", `/admin/v1/reports/${reportId}`);

    expect(body).toMatchObject({
      subject: "review",
      reported: { userId: gunna.userId, firstName: "Gunna" },
      review: {
        id: review.id,
        rating: 1,
        comment: "Unkind words",
        authorRole: "passenger",
        writtenAt: review.at.toISOString(),
        hidden: false,
      },
      about: null,
      message: null,
      conversation: false,
    });
    await api.connection.db
      .update(schema.reviews)
      .set({ hiddenAt: api.now() })
      .where(eq(schema.reviews.id, review.id));
    expect((await send(cookie, "GET", `/admin/v1/reports/${reportId}`)).body).toMatchObject({
      review: { id: review.id, hidden: true },
    });
  });

  it("gives each side's rating and reliability as their profile counts them, none for a former member", async () => {
    const { jon, gunna, bookingId, reportId } = await reportedMessage();
    const { db } = api.connection;
    await db.insert(schema.reviews).values({
      bookingId,
      authorId: gunna.userId,
      subjectId: jon.userId,
      authorRole: "passenger",
      rating: 4,
      revealedAt: api.now(),
    });
    const { cookie } = await api.signInOperator();

    const report = (await send(cookie, "GET", `/admin/v1/reports/${reportId}`)).body as AdminReport;

    // The trip has not happened yet, so nothing counts on either side.
    const none = { kept: 0, counted: 0 };
    const nothingYet = {
      ...none,
      percent: null,
      byRole: { driver: none, passenger: none },
      belowWatchLevel: false,
    };
    expect(report.reportedSide).toMatchObject({
      rating: { average: 4, count: 1 },
      reliability: nothingYet,
    });
    expect(report.reporterSide).toMatchObject({
      rating: { average: null, count: 0 },
      reliability: nothingYet,
    });

    // Once Gunna's account is erased, her report is by the former member,
    // whose records are everyone's who left.
    await db
      .update(schema.reports)
      .set({ reporterId: schema.formerMemberId })
      .where(eq(schema.reports.id, reportId));
    const erased = (await send(cookie, "GET", `/admin/v1/reports/${reportId}`)).body as AdminReport;
    expect(erased.reporterSide).toMatchObject({
      person: { userId: schema.formerMemberId, status: "deleted" },
      rating: null,
      reliability: null,
    });
  });
});

describe("the conversation a message report covers (R9.6)", () => {
  it("opens it, logged, with a message ShareRide removed marked so", async () => {
    const { bookingId, messageId, reportId } = await reportedMessage();
    const { cookie, userId } = await api.signInOperator();
    const hidden = await send(cookie, "POST", "/admin/v1/hidden-content", {
      content: { kind: "message", id: messageId },
      rule: "harassment",
      reason,
      reportId,
    });
    expect(hidden.status).toBe(201);

    const { status, body } = await send(
      cookie,
      "GET",
      `/admin/v1/reports/${reportId}/conversation`,
    );

    expect(status).toBe(200);
    expect((body as { messages: unknown[] }).messages).toContainEqual(
      expect.objectContaining({
        id: messageId,
        from: "driver",
        kind: "text",
        text: "Something unkind",
        removed: true,
      }),
    );
    expect(await auditOf("conversation.opened", reportId)).toEqual([
      {
        subjectType: "report",
        after: { bookingId, conversationId: await conversationOf(bookingId) },
        operatorId: userId,
      },
    ]);
  });

  it("stays closed for a report about anything else, and is not logged then", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const reportId = await filed(gunna, {
      about: { kind: "trip", tripId: airport },
      category: "scam",
    });
    const { cookie } = await api.signInOperator();

    const read = await send(cookie, "GET", `/admin/v1/reports/${reportId}/conversation`);

    expect(read).toMatchObject({ status: 409, body: { error: { code: "not_covered" } } });
    expect(await auditOf("conversation.opened", reportId)).toEqual([]);
    const missing = randomUUID();
    const none = await send(cookie, "GET", `/admin/v1/reports/${missing}/conversation`);
    expect(none.status).toBe(404);
    expect(await auditOf("conversation.opened", missing)).toEqual([]);
  });
});

describe("the operator's actions from a report (spec 9, 3.4.3)", () => {
  it("warns the person reported, under the report, which lists it", async () => {
    const { jon, reportId } = await reportedMessage();
    const { cookie } = await api.signInOperator();

    const warned = await send(cookie, "POST", `/admin/v1/users/${jon.userId}/warning`, {
      rule: "harassment",
      reason,
      reportId,
    });

    expect(warned.status).toBe(201);
    const { action } = warned.body as { action: AdminModerationAction };
    expect(action).toEqual({
      id: expect.any(String) as unknown,
      kind: "warning",
      person: person(jon, "Jón"),
      reportId,
      rule: "harassment",
      reason,
      content: null,
      until: null,
      at: api.now().toISOString(),
      appeal: null,
    });
    const report = (await send(cookie, "GET", `/admin/v1/reports/${reportId}`)).body as AdminReport;
    expect(report.actions.map((one) => one.id)).toEqual([action.id]);
    expect(report.reportedSide?.actions.map((one) => one.id)).toEqual([action.id]);
  });

  it("refuses an empty reason, an unknown person and an unknown report", async () => {
    const { jon } = await reportedMessage();
    const { cookie } = await api.signInOperator();
    const warn = (userId: string, body: object) =>
      send(cookie, "POST", `/admin/v1/users/${userId}/warning`, {
        rule: "harassment",
        reason,
        ...body,
      });

    expect(await warn(jon.userId, { reason: "  " })).toMatchObject({
      status: 400,
      body: {
        error: {
          code: "validation_failed",
          details: [{ path: "reason", issue: "reason_missing" }],
        },
      },
    });
    expect((await warn(randomUUID(), {})).status).toBe(404);
    expect((await warn(jon.userId, { reportId: randomUUID() })).status).toBe(404);
    expect(await api.connection.db.select().from(schema.moderationActions)).toEqual([]);
  });

  it("suspends the person, cancelling their trips, and reinstates them", async () => {
    const { jon, reportId } = await reportedMessage();
    const { cookie } = await api.signInOperator();
    const until = new Date(api.now().getTime() + 7 * 24 * hourMs).toISOString();

    const suspended = await send(cookie, "POST", `/admin/v1/users/${jon.userId}/suspension`, {
      rule: "harassment",
      reason,
      until,
      reportId,
    });

    expect(suspended).toMatchObject({
      status: 201,
      body: {
        action: {
          kind: "suspension",
          until,
          person: { status: "suspended", suspendedUntil: until },
        },
        tripsCancelled: 1,
        bookingsCancelled: 0,
      },
    });
    const again = await send(cookie, "POST", `/admin/v1/users/${jon.userId}/suspension`, {
      rule: "harassment",
      reason,
      until: null,
    });
    expect(again).toMatchObject({ status: 409, body: { error: { code: "already_suspended" } } });
    const past = await send(cookie, "POST", `/admin/v1/users/${randomUUID()}/suspension`, {
      rule: "harassment",
      reason,
      until: new Date(api.now().getTime() - hourMs).toISOString(),
    });
    expect(past).toMatchObject({
      status: 400,
      body: { error: { details: [{ path: "until", issue: "until_past" }] } },
    });

    const reinstated = await send(cookie, "POST", `/admin/v1/users/${jon.userId}/reinstatement`, {
      note: "We looked again.",
    });
    expect(reinstated).toMatchObject({
      status: 201,
      body: { action: { kind: "reinstatement", rule: null, reason: "We looked again." } },
    });
    const twice = await send(cookie, "POST", `/admin/v1/users/${jon.userId}/reinstatement`, {
      note: "Again.",
    });
    expect(twice).toMatchObject({ status: 409, body: { error: { code: "not_suspended" } } });
  });

  it("hides content once, and cancels a trip as ShareRide once", async () => {
    const { jon, messageId, reportId } = await reportedMessage();
    const { cookie } = await api.signInOperator();
    const hide = () =>
      send(cookie, "POST", "/admin/v1/hidden-content", {
        content: { kind: "message", id: messageId },
        rule: "harassment",
        reason,
        reportId,
      });

    expect(await hide()).toMatchObject({
      status: 201,
      body: { action: { kind: "content_hidden", content: { kind: "message", id: messageId } } },
    });
    expect(await hide()).toMatchObject({
      status: 409,
      body: { error: { code: "already_hidden" } },
    });
    const report = (await send(cookie, "GET", `/admin/v1/reports/${reportId}`)).body as AdminReport;
    expect(report.message?.removed).toBe(true);

    const cancel = () =>
      send(cookie, "POST", `/admin/v1/trips/${airport}/cancellation`, {
        rule: "safety",
        reason,
        countsOnReliability: false,
        reportId,
      });
    expect(await cancel()).toMatchObject({
      status: 201,
      body: { action: { kind: "trip_cancelled", person: { userId: jon.userId } } },
    });
    expect(await cancel()).toMatchObject({
      status: 409,
      body: { error: { code: "already_cancelled" } },
    });
    const missing = await send(cookie, "POST", `/admin/v1/trips/${randomUUID()}/cancellation`, {
      rule: "safety",
      reason,
      countsOnReliability: false,
    });
    expect(missing.status).toBe(404);
  });
});

describe("appeals (spec 9, 3.4.4)", () => {
  /** Jón was warned, and appealed. */
  async function appealed() {
    const { jon, reportId } = await reportedMessage();
    const { cookie } = await api.signInOperator();
    const warned = await send(cookie, "POST", `/admin/v1/users/${jon.userId}/warning`, {
      rule: "harassment",
      reason,
      reportId,
    });
    const { action } = warned.body as { action: AdminModerationAction };
    await api.connection.db
      .update(schema.moderationActions)
      .set({ appealText: "I was joking.", appealedAt: api.now() })
      .where(eq(schema.moderationActions.id, action.id));
    return { jon, cookie, actionId: action.id };
  }

  it("lists open appeals, and answers one finally", async () => {
    const { cookie, actionId } = await appealed();
    const open = await send(cookie, "GET", "/admin/v1/appeals");
    expect(open).toMatchObject({
      status: 200,
      body: {
        appeals: [
          {
            id: actionId,
            appeal: { text: "I was joking.", answer: null, outcome: null, answeredAt: null },
          },
        ],
      },
    });

    const answered = await send(
      cookie,
      "POST",
      `/admin/v1/moderation-actions/${actionId}/appeal-answer`,
      {
        outcome: "upheld",
        answer: "The warning stands.",
      },
    );

    expect(answered).toMatchObject({
      status: 200,
      body: {
        id: actionId,
        appeal: {
          answer: "The warning stands.",
          outcome: "upheld",
          answeredAt: api.now().toISOString(),
        },
      },
    });
    expect((await send(cookie, "GET", "/admin/v1/appeals")).body).toEqual({ appeals: [] });
    expect((await send(cookie, "GET", "/admin/v1/appeals?state=answered")).body).toMatchObject({
      appeals: [{ id: actionId }],
    });
    const again = await send(
      cookie,
      "POST",
      `/admin/v1/moderation-actions/${actionId}/appeal-answer`,
      {
        outcome: "reversed",
        answer: "Changed my mind.",
      },
    );
    expect(again).toMatchObject({ status: 409, body: { error: { code: "already_answered" } } });
  });

  it("refuses an answer to an action not appealed, an empty answer and an unknown action", async () => {
    const { jon, cookie, actionId } = await appealed();
    const empty = await send(
      cookie,
      "POST",
      `/admin/v1/moderation-actions/${actionId}/appeal-answer`,
      {
        outcome: "upheld",
        answer: " ",
      },
    );
    expect(empty).toMatchObject({
      status: 400,
      body: { error: { details: [{ path: "answer", issue: "reason_missing" }] } },
    });
    const warned = await send(cookie, "POST", `/admin/v1/users/${jon.userId}/warning`, {
      rule: "harassment",
      reason,
    });
    const { action } = warned.body as { action: AdminModerationAction };
    const notAppealed = await send(
      cookie,
      "POST",
      `/admin/v1/moderation-actions/${action.id}/appeal-answer`,
      { outcome: "upheld", answer: "It stands." },
    );
    expect(notAppealed).toMatchObject({ status: 409, body: { error: { code: "not_appealed" } } });
    const missing = await send(
      cookie,
      "POST",
      `/admin/v1/moderation-actions/${randomUUID()}/appeal-answer`,
      { outcome: "upheld", answer: "It stands." },
    );
    expect(missing.status).toBe(404);
  });
});
