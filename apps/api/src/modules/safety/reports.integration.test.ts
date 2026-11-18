import { randomUUID } from "node:crypto";
import {
  bookingRoute,
  cancelBookingRoute,
  cancellationPreviewRoute,
  conversationMessagesRoute,
  fileReportRoute,
  myReportsRoute,
  sendMessageRoute,
  type FileReportBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { operatorRole } from "@shareride/domain";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakePushSender, type FakePushSender } from "../../platform/push.ts";
import {
  createDevSmsSender,
  SmsSendError,
  type DevSmsSender,
  type SmsSender,
} from "../../platform/sms.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { cleanUpConversations } from "../chat/clean-up.ts";
import { createNotificationWorker } from "../notifications/worker.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon): Jón
// drives Hlemmur to Keflavík Airport on Saturday at 05:30. A report names
// what the reporter can see (a trip, a message, a booking), never a user ID.

let api: TestApi;
const { airport } = sampleTrip;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  await api.connection.db.delete(schema.reports);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, rewind, later, driverOf, booked, paid } = bookingHelpers(() => api);

function report(member: Member | null, body: FileReportBody) {
  return api.client.call(fileReportRoute, {
    ...(member === null ? {} : { accessToken: member.accessToken }),
    body,
  });
}

async function mine(member: Member) {
  const result = await api.client.call(myReportsRoute, { accessToken: member.accessToken });
  if (!result.ok) throw new Error(result.error.code);
  return result.data.reports;
}

async function stored() {
  return api.connection.db.select().from(schema.reports);
}

/** Gunna's paid booking on Jón's airport trip, with its conversation open. */
async function confirmed() {
  const jon = await driverOf(airport, "Jón");
  const gunna = await newMember("Gunna");
  const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
  await paid(gunna.accessToken, booking.id);
  return { jon, gunna, bookingId: booking.id };
}

async function send(member: Member, bookingId: string) {
  const sent = await api.client.call(sendMessageRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    body: { clientId: randomUUID(), text: "Something unkind" },
  });
  if (!sent.ok) throw new Error(sent.error.code);
  return sent.data.id;
}

describe("POST /v1/reports and GET /v1/me/reports (spec 9, 3.1)", () => {
  it("reports a trip, about its driver, and lists it as mine", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const filed = await report(gunna, {
      about: { kind: "trip", tripId: airport },
      category: "not_as_listed",
      description: "  The car was not the one listed.  ",
    });
    expect(filed).toMatchObject({
      status: 201,
      data: {
        kind: "trip",
        category: "not_as_listed",
        firstName: "Jón",
        filedAt: api.now().toISOString(),
        status: "open",
        outcome: null,
        closedAt: null,
      },
    });
    expect(await mine(gunna)).toEqual([filed.ok && filed.data]);
    const [row] = await stored();
    expect(row).toMatchObject({
      reporterId: gunna.userId,
      subject: "trip",
      tripId: airport,
      urgent: false,
      description: "The car was not the one listed.",
    });
  });

  it("marks a safety report urgent (3.4.1)", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    await report(gunna, { about: { kind: "trip", tripId: airport }, category: "safety" });
    const [row] = await stored();
    expect(row?.urgent).toBe(true);
  });

  it("never tells the person reported, nor lists it for them (R9.2)", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    await report(gunna, { about: { kind: "trip", tripId: airport }, category: "harassment" });
    expect(await mine(jon)).toEqual([]);
    const [row] = await stored();
    expect(row?.subjectUserId).toBe(jon.userId);
  });

  it("refuses reporting my own trip", async () => {
    const jon = await driverOf(airport, "Jón");
    expect(
      await report(jon, { about: { kind: "trip", tripId: airport }, category: "other" }),
    ).toMatchObject({ status: 409, error: { code: "cannot_report_own" } });
  });

  it("refuses a trip that does not exist, or that a block closes to me", async () => {
    const { jon, gunna, bookingId } = await confirmed();
    expect(
      await report(gunna, { about: { kind: "trip", tripId: randomUUID() }, category: "other" }),
    ).toMatchObject({ status: 404, error: { code: "not_found" } });
    await api.connection.db.insert(schema.blocks).values({
      blockerId: jon.userId,
      blockedId: gunna.userId,
    });
    // Gunna is booked on it: it stays hers to report.
    expect(
      await report(gunna, { about: { kind: "trip", tripId: airport }, category: "other" }),
    ).toMatchObject({ status: 201 });
    const sigga = await newMember("Sigga");
    await api.connection.db.insert(schema.blocks).values({
      blockerId: jon.userId,
      blockedId: sigga.userId,
    });
    expect(
      await report(sigga, { about: { kind: "trip", tripId: airport }, category: "other" }),
    ).toMatchObject({ status: 404 });
    expect(bookingId).toBeTruthy();
  });

  it("refuses a draft trip, which nobody else can see", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    await api.connection.db
      .update(schema.trips)
      .set({ status: "draft" })
      .where(eq(schema.trips.id, airport));
    expect(
      await report(gunna, { about: { kind: "trip", tripId: airport }, category: "other" }),
    ).toMatchObject({ status: 404, error: { code: "not_found" } });
  });

  it("reports a message in my conversation, which lets the operator read it (R9.6)", async () => {
    const { jon, gunna, bookingId } = await confirmed();
    const messageId = await send(jon, bookingId);
    const filed = await report(gunna, {
      about: { kind: "message", messageId },
      category: "harassment",
    });
    expect(filed).toMatchObject({ status: 201, data: { kind: "message", firstName: "Jón" } });
    const [conversation] = await api.connection.db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.bookingId, bookingId));
    const [row] = await stored();
    expect(row).toMatchObject({
      subject: "message",
      subjectUserId: jon.userId,
      messageId,
      conversationId: conversation?.id,
      bookingId,
    });
  });

  it("refuses my own message, a system line, and a message of someone else's chat", async () => {
    const { jon, gunna, bookingId } = await confirmed();
    const messageId = await send(jon, bookingId);
    expect(
      await report(jon, { about: { kind: "message", messageId }, category: "other" }),
    ).toMatchObject({ status: 409, error: { code: "cannot_report_own" } });

    const page = await api.client.call(conversationMessagesRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
      query: {},
    });
    const line = page.ok ? page.data.messages.find((message) => message.kind === "system") : null;
    expect(
      await report(gunna, {
        about: { kind: "message", messageId: line?.id ?? "" },
        category: "other",
      }),
    ).toMatchObject({ status: 409, error: { code: "not_reportable" } });

    const sigga = await newMember("Sigga");
    expect(
      await report(sigga, { about: { kind: "message", messageId }, category: "other" }),
    ).toMatchObject({ status: 404, error: { code: "not_found" } });
  });

  it.each([
    ["the passenger reports the driver", "passenger"],
    ["the driver reports the passenger", "driver"],
  ] as const)("reports the other person of a booking when %s", async (_, who) => {
    const { jon, gunna, bookingId } = await confirmed();
    const [reporter, reported] = who === "passenger" ? [gunna, jon] : [jon, gunna];
    const filed = await report(reporter, {
      about: { kind: "user", bookingId },
      category: "harassment",
    });
    expect(filed).toMatchObject({
      status: 201,
      data: { kind: "user", firstName: who === "passenger" ? "Jón" : "Gunna" },
    });
    const [row] = await stored();
    expect(row).toMatchObject({ subject: "user", subjectUserId: reported.userId, bookingId });
  });

  it("refuses a booking I am not part of", async () => {
    const { bookingId } = await confirmed();
    const sigga = await newMember("Sigga");
    for (const kind of ["user", "booking"] as const) {
      expect(await report(sigga, { about: { kind, bookingId }, category: "other" })).toMatchObject({
        status: 404,
        error: { code: "not_found" },
      });
    }
  });

  it("reports a booking problem until 24 hours after the trip completed (R9.1)", async () => {
    const { gunna, bookingId } = await confirmed();
    const completed = (hoursAgo: number) =>
      api.connection.db
        .update(schema.trips)
        .set({ completedAt: new Date(api.now().getTime() - hoursAgo * 3_600_000) })
        .where(eq(schema.trips.id, airport));
    const problem = { about: { kind: "booking", bookingId }, category: "not_as_listed" } as const;

    const reportable = async () => {
      const shown = await api.client.call(bookingRoute, {
        accessToken: gunna.accessToken,
        params: { id: bookingId },
      });
      return shown.ok && shown.data.problemReportable;
    };
    expect(await reportable()).toBe(true);
    await completed(25);
    expect(await reportable()).toBe(false);
    expect(await report(gunna, problem)).toMatchObject({
      status: 409,
      error: { code: "report_window_closed" },
    });
    await completed(23);
    expect(await reportable()).toBe(true);
    expect(await report(gunna, problem)).toMatchObject({
      status: 201,
      data: { kind: "booking", firstName: "Jón" },
    });
  });

  it("has no booking problem for a request, but its person can be reported", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const request = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    const shown = await api.client.call(bookingRoute, {
      accessToken: gunna.accessToken,
      params: { id: request.id },
    });
    expect(shown).toMatchObject({ ok: true, data: { problemReportable: false } });
    expect(
      await report(gunna, { about: { kind: "booking", bookingId: request.id }, category: "other" }),
    ).toMatchObject({ status: 409, error: { code: "not_reportable" } });
    expect(
      await report(gunna, { about: { kind: "user", bookingId: request.id }, category: "other" }),
    ).toMatchObject({ status: 201, data: { kind: "user", firstName: "Jón" } });
  });

  it("takes a description of up to 1 000 characters, counted as chat does", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const about = { kind: "trip", tripId: airport } as const;
    // "á" written as a + accent is one character (NFC).
    expect(
      await report(gunna, { about, category: "other", description: "á".repeat(1000) }),
    ).toMatchObject({ status: 201 });
    expect(
      await report(gunna, { about, category: "other", description: "a".repeat(1001) }),
    ).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "description", issue: "too_long" }] },
    });
  });

  it("takes 10 reports in 24 hours from one person, and refuses the next", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const body = { about: { kind: "trip", tripId: airport }, category: "other" } as const;
    for (let filed = 0; filed < 10; filed += 1) {
      expect(await report(gunna, body)).toMatchObject({ status: 201 });
    }
    expect(await report(gunna, body)).toMatchObject({
      status: 429,
      error: { code: "too_many_reports", retryAfterSeconds: 24 * 3600 },
    });
  });

  it("holds the limit for reports sent at the same moment", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const body = { about: { kind: "trip", tripId: airport }, category: "other" } as const;
    const answers = await Promise.all(Array.from({ length: 12 }, () => report(gunna, body)));
    expect(answers.filter((answer) => answer.status === 201)).toHaveLength(10);
    expect(answers.filter((answer) => answer.status === 429)).toHaveLength(2);
    expect(await stored()).toHaveLength(10);
  });

  it("takes reports again as the oldest pass 24 hours", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const body = { about: { kind: "trip", tripId: airport }, category: "other" } as const;
    expect(await report(gunna, body)).toMatchObject({ status: 201 });
    await later(3600, gunna);
    for (let filed = 1; filed < 10; filed += 1) {
      expect(await report(gunna, body)).toMatchObject({ status: 201 });
    }
    expect(await report(gunna, body)).toMatchObject({
      status: 429,
      error: { retryAfterSeconds: 23 * 3600 },
    });
    // The first report is 24 hours old: one more fits, then none until the next hour.
    await later(23 * 3600, gunna);
    expect(await report(gunna, body)).toMatchObject({ status: 201 });
    expect(await report(gunna, body)).toMatchObject({
      status: 429,
      error: { retryAfterSeconds: 3600 },
    });
  });

  it("lets two people report each other at the same moment", async () => {
    const { jon, gunna, bookingId } = await confirmed();
    const answers = await Promise.all([
      report(gunna, { about: { kind: "user", bookingId }, category: "harassment" }),
      report(jon, { about: { kind: "user", bookingId }, category: "harassment" }),
    ]);
    expect(answers.map((answer) => answer.status)).toEqual([201, 201]);
  });

  it("lists my reports the latest first, with the outcome once closed (3.1.6)", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const about = { kind: "trip", tripId: airport } as const;
    const first = await report(gunna, { about, category: "other" });
    api.advance(60);
    try {
      const second = await report(gunna, { about, category: "scam" });
      const closedAt = api.now();
      await api.connection.db
        .update(schema.reports)
        .set({ status: "closed", outcome: "no_breach", closedAt })
        .where(eq(schema.reports.id, first.ok ? first.data.id : ""));
      expect(await mine(gunna)).toMatchObject([
        { id: second.ok && second.data.id, status: "open", outcome: null },
        {
          id: first.ok && first.data.id,
          status: "closed",
          outcome: "no_breach",
          closedAt: closedAt.toISOString(),
        },
      ]);
    } finally {
      api.advance(-60);
    }
  });

  it("needs an account", async () => {
    expect(
      await report(null, { about: { kind: "trip", tripId: airport }, category: "other" }),
    ).toMatchObject({ status: 401 });
  });
});

/** The reference of a member's public profile, never their ID. */
async function profileIdOf(member: Member) {
  const [row] = await api.connection.db
    .select({ profileId: schema.users.profileId })
    .from(schema.users)
    .where(eq(schema.users.id, member.userId));
  if (row === undefined) throw new Error("No such member.");
  return row.profileId;
}

describe("reporting from a profile (spec 9, 3.1.1)", () => {
  /** Gunna's review of Jón on her airport booking, shown on his profile unless said. */
  async function reviewed(shown: { readonly revealed?: boolean; readonly hidden?: boolean } = {}) {
    const { jon, gunna, bookingId } = await confirmed();
    const [row] = await api.connection.db
      .insert(schema.reviews)
      .values({
        bookingId,
        authorId: gunna.userId,
        subjectId: jon.userId,
        authorRole: "passenger",
        rating: 1,
        comment: "Unkind words",
        revealedAt: shown.revealed === false ? null : api.now(),
        hiddenAt: shown.hidden === true ? api.now() : null,
      })
      .returning({ id: schema.reviews.id });
    if (row === undefined) throw new Error("No review.");
    return { jon, gunna, bookingId, reviewId: row.id };
  }

  it("reports a review about me, about its author, linking the review and its ride", async () => {
    const { jon, gunna, bookingId, reviewId } = await reviewed();
    const filed = await report(jon, {
      about: { kind: "review", reviewId },
      category: "offensive",
      description: "Not true.",
    });
    expect(filed).toMatchObject({
      status: 201,
      data: { kind: "review", category: "offensive", firstName: "Gunna", status: "open" },
    });
    const [row] = await stored();
    expect(row).toMatchObject({
      subject: "review",
      subjectUserId: gunna.userId,
      reviewId,
      bookingId,
      tripId: airport,
      messageId: null,
      conversationId: null,
    });
  });

  it("reports a review anyone can read on a profile, as someone who was not on the ride", async () => {
    const { reviewId } = await reviewed();
    const sigga = await newMember("Sigga");
    expect(
      await report(sigga, { about: { kind: "review", reviewId }, category: "discrimination" }),
    ).toMatchObject({ status: 201, data: { kind: "review", firstName: "Gunna" } });
  });

  it("refuses my own review", async () => {
    const { gunna, reviewId } = await reviewed();
    expect(
      await report(gunna, { about: { kind: "review", reviewId }, category: "other" }),
    ).toMatchObject({ status: 409, error: { code: "cannot_report_own" } });
  });

  it.each([
    ["not yet shown", { revealed: false }],
    ["hidden by ShareRide", { hidden: true }],
  ] as const)("finds no review %s", async (_, shown) => {
    const { jon, reviewId } = await reviewed(shown);
    expect(
      await report(jon, { about: { kind: "review", reviewId }, category: "other" }),
    ).toMatchObject({ status: 404, error: { code: "not_found" } });
    expect(
      await report(jon, { about: { kind: "review", reviewId: randomUUID() }, category: "other" }),
    ).toMatchObject({ status: 404 });
    expect(await stored()).toEqual([]);
  });

  it("finds no review by someone leaving ShareRide, which no profile shows", async () => {
    const { jon, gunna, reviewId } = await reviewed();
    await api.connection.db
      .update(schema.users)
      .set({ deleteAfter: new Date(api.now().getTime() + 30 * 24 * 3_600_000) })
      .where(eq(schema.users.id, gunna.userId));
    expect(
      await report(jon, { about: { kind: "review", reviewId }, category: "offensive" }),
    ).toMatchObject({ status: 404, error: { code: "not_found" } });
  });

  it("reports a review by the former member, naming nobody to act on (A51)", async () => {
    const { jon, reviewId } = await reviewed();
    // As the 3-year clean-up leaves it: by the former member, on no booking.
    await api.connection.db
      .update(schema.reviews)
      .set({ bookingId: null, authorId: schema.formerMemberId })
      .where(eq(schema.reviews.id, reviewId));
    const filed = await report(jon, {
      about: { kind: "review", reviewId },
      category: "offensive",
    });
    expect(filed).toMatchObject({ status: 201, data: { kind: "review", firstName: null } });
    const [row] = await stored();
    expect(row).toMatchObject({
      subject: "review",
      subjectUserId: null,
      reviewId,
      bookingId: null,
      tripId: null,
    });
  });

  it("reports a person from their profile, with no booking between us", async () => {
    const jon = await driverOf(airport, "Jón");
    const sigga = await newMember("Sigga");
    const filed = await report(sigga, {
      about: { kind: "profile", profileId: await profileIdOf(jon) },
      category: "false_info",
    });
    expect(filed).toMatchObject({ status: 201, data: { kind: "user", firstName: "Jón" } });
    const [row] = await stored();
    expect(row).toMatchObject({
      subject: "user",
      subjectUserId: jon.userId,
      tripId: null,
      bookingId: null,
      reviewId: null,
    });
  });

  it("refuses my own profile, and finds none for someone leaving ShareRide", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    expect(
      await report(jon, {
        about: { kind: "profile", profileId: await profileIdOf(jon) },
        category: "other",
      }),
    ).toMatchObject({ status: 409, error: { code: "cannot_report_own" } });

    await api.connection.db
      .update(schema.users)
      .set({ deleteAfter: new Date(api.now().getTime() + 30 * 24 * 3_600_000) })
      .where(eq(schema.users.id, jon.userId));
    expect(
      await report(gunna, {
        about: { kind: "profile", profileId: await profileIdOf(jon) },
        category: "other",
      }),
    ).toMatchObject({ status: 404, error: { code: "not_found" } });
    expect(
      await report(gunna, {
        about: { kind: "profile", profileId: randomUUID() },
        category: "other",
      }),
    ).toMatchObject({ status: 404 });
    expect(await stored()).toEqual([]);
  });
});

describe("a reported conversation is kept (spec 9, section 7)", () => {
  it("outlives the 12 months of chats until 3 years after its report is closed", async () => {
    const { jon, gunna, bookingId } = await confirmed();
    const messageId = await send(jon, bookingId);
    await report(gunna, { about: { kind: "message", messageId }, category: "harassment" });
    const conversationLeft = async () =>
      (
        await api.connection.db
          .select({ id: schema.conversations.id })
          .from(schema.conversations)
          .where(eq(schema.conversations.bookingId, bookingId))
      ).length;

    // Two years on, the chat's 12 months are long past: an open report keeps it.
    const later = new Date("2028-11-13T12:00:00Z");
    expect(await cleanUpConversations(api.connection.db, later)).toBe(0);
    expect(await conversationLeft()).toBe(1);

    // Closed, it stays 3 years after closing, then goes.
    await api.connection.db
      .update(schema.reports)
      .set({ status: "closed", outcome: "action_taken", closedAt: later });
    expect(await cleanUpConversations(api.connection.db, new Date("2031-11-13T11:00:00Z"))).toBe(0);
    expect(await cleanUpConversations(api.connection.db, new Date("2031-11-13T12:00:00Z"))).toBe(1);
    expect(await conversationLeft()).toBe(0);
  });

  it("still deletes old chats when a report covers no conversation", async () => {
    const { gunna, bookingId } = await confirmed();
    await send(gunna, bookingId);
    await report(gunna, { about: { kind: "trip", tripId: airport }, category: "other" });
    expect(await cleanUpConversations(api.connection.db, new Date("2028-11-13T12:00:00Z"))).toBe(1);
  });
});

describe("the operator's alert of a new report (spec 9, R9.9)", () => {
  let push: FakePushSender;
  let sms: DevSmsSender;

  beforeEach(async () => {
    const { db } = api.connection;
    await db.execute(sql`delete from outbox_events`);
    await db.execute(sql`delete from notifications`);
    await db.execute(sql`delete from push_tokens`);
    // Only this test's operators: others from earlier tests lose the role.
    await db.update(schema.users).set({ roles: [] });
    push = createFakePushSender();
    sms = createDevSmsSender({ print: () => undefined });
  });

  function runWorker(sender: SmsSender = sms) {
    return createNotificationWorker({
      db: api.connection.db,
      clock: () => api.now(),
      push,
      sms: sender,
    }).runOnce();
  }

  /** An operator with the app on their phone, so push reaches them. */
  async function operator(firstName = "Ósk") {
    return asOperator(await newMember(firstName));
  }

  async function asOperator(member: Member) {
    const { db } = api.connection;
    await db
      .update(schema.users)
      .set({ roles: [operatorRole] })
      .where(eq(schema.users.id, member.userId));
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
    return member;
  }

  async function logOf(member: Member) {
    return api.connection.db
      .select({
        kind: schema.notifications.kind,
        channel: schema.notificationDeliveries.channel,
        status: schema.notificationDeliveries.status,
        reason: schema.notificationDeliveries.reason,
      })
      .from(schema.notifications)
      .innerJoin(
        schema.notificationDeliveries,
        eq(schema.notificationDeliveries.notificationId, schema.notifications.id),
      )
      .where(eq(schema.notifications.recipientId, member.userId))
      .orderBy(asc(schema.notificationDeliveries.channel));
  }

  async function phoneOf(member: Member) {
    const [user] = await api.connection.db
      .select({ phone: schema.users.phoneE164 })
      .from(schema.users)
      .where(eq(schema.users.id, member.userId));
    return user?.phone;
  }

  it("alerts every operator at once, by push and SMS, for a safety report by day", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const osk = await operator("Ósk");
    const pall = await operator("Páll");
    await report(gunna, {
      about: { kind: "trip", tripId: airport },
      category: "safety",
      description: "He drove after drinking.",
    });
    await runWorker();
    for (const member of [osk, pall]) {
      expect(await logOf(member)).toEqual([
        { kind: "report_filed_urgent", channel: "push", status: "sent", reason: null },
        { kind: "report_filed_urgent", channel: "sms", status: "sent", reason: null },
      ]);
    }
    expect(push.sent).toHaveLength(2);
    expect(push.sent[0]).toMatchObject({
      title: "New safety report",
      body: "Look at it in the console now.",
    });
    expect(sms.outbox.map((message) => message.to).sort()).toEqual(
      [await phoneOf(osk), await phoneOf(pall)].sort(),
    );
    expect(sms.outbox[0]?.text).toBe(
      "ShareRide: a new safety report. Look at it in the console now.",
    );
    // Never who or what (3.1.5): the console has the rest.
    expect(JSON.stringify([push.sent, sms.outbox])).not.toMatch(/Jón|Gunna|drinking|Keflav/);
    // Nobody else hears of it.
    expect(await logOf(jon)).toEqual([]);
    expect(await logOf(gunna)).toEqual([]);
  });

  it("alerts by push only at night, from 23:00 to 07:00", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const osk = await operator();
    await later((Date.parse("2026-11-13T23:30:00Z") - api.now().getTime()) / 1000, gunna);
    await report(gunna, { about: { kind: "trip", tripId: airport }, category: "safety" });
    await runWorker();
    expect(await logOf(osk)).toEqual([
      { kind: "report_filed_urgent", channel: "push", status: "sent", reason: null },
      {
        kind: "report_filed_urgent",
        channel: "sms",
        status: "skipped",
        reason: "outside_sms_window",
      },
    ]);
    expect(sms.outbox).toEqual([]);
  });

  it("alerts by push only for a report that is not about safety", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const osk = await operator();
    await report(gunna, { about: { kind: "trip", tripId: airport }, category: "scam" });
    await runWorker();
    expect(await logOf(osk)).toEqual([
      { kind: "report_filed", channel: "push", status: "sent", reason: null },
    ]);
    expect(push.sent[0]).toMatchObject({
      title: "New report",
      body: "Look at it in the console within 24 hours.",
    });
  });

  it("alerts nobody whose account is suspended, and nobody for a report closed first", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const osk = await operator();
    await api.connection.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, osk.userId));
    await report(gunna, { about: { kind: "trip", tripId: airport }, category: "safety" });
    await runWorker();
    expect(await logOf(osk)).toEqual([]);

    const pall = await operator("Páll");
    await report(gunna, { about: { kind: "trip", tripId: airport }, category: "other" });
    await api.connection.db
      .update(schema.reports)
      .set({ status: "closed", outcome: "no_breach", closedAt: api.now() });
    await runWorker();
    expect(await logOf(pall)).toEqual([]);
  });

  it("drops an alert not yet sent once its report is closed", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const osk = await operator();
    await report(gunna, { about: { kind: "trip", tripId: airport }, category: "other" });
    push.failure = new Error("The push service is down.");
    await runWorker();
    push.failure = null;
    await api.connection.db
      .update(schema.reports)
      .set({ status: "closed", outcome: "no_breach", closedAt: api.now() });
    await later(3600);
    await runWorker();
    expect(await logOf(osk)).toEqual([
      { kind: "report_filed", channel: "push", status: "skipped", reason: "no_longer_applies" },
    ]);
  });

  it("drops an alert not yet sent once the operator no longer holds the role", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const osk = await operator();
    await report(gunna, { about: { kind: "trip", tripId: airport }, category: "other" });
    push.failure = new Error("The push service is down.");
    await runWorker();
    push.failure = null;
    await api.connection.db
      .update(schema.users)
      .set({ roles: [] })
      .where(eq(schema.users.id, osk.userId));
    await later(3600);
    await runWorker();
    expect(await logOf(osk)).toEqual([
      { kind: "report_filed", channel: "push", status: "skipped", reason: "no_longer_applies" },
    ]);
  });

  it("never sends the SMS after 23:00, even when a send at 22:59 is tried again", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const osk = await operator();
    // 22:59 in Iceland, whatever earlier tests left on the clock.
    await later((Date.parse("2026-11-13T22:59:00Z") - api.now().getTime()) / 1000, gunna);
    await report(gunna, { about: { kind: "trip", tripId: airport }, category: "safety" });
    const refusing: SmsSender = {
      send: () => Promise.reject(new SmsSendError("The SMS provider is down.")),
    };
    await runWorker(refusing);
    await later(120);
    await runWorker();
    expect(await logOf(osk)).toEqual([
      { kind: "report_filed_urgent", channel: "push", status: "sent", reason: null },
      {
        kind: "report_filed_urgent",
        channel: "sms",
        status: "skipped",
        reason: "outside_sms_window",
      },
    ]);
    expect(sms.outbox).toEqual([]);
  });

  it("keeps an operator's own SMS news when alerts came in that day (R7.10)", async () => {
    const { jon, gunna, bookingId } = await confirmed();
    await asOperator(gunna);
    const siggi = await newMember("Siggi");
    for (let index = 0; index < 5; index += 1) {
      await report(siggi, { about: { kind: "trip", tripId: airport }, category: "safety" });
    }
    await runWorker();
    expect(sms.outbox).toHaveLength(5);

    const preview = await api.client.call(cancellationPreviewRoute, {
      accessToken: jon.accessToken,
      params: { id: bookingId },
    });
    if (!preview.ok) throw new Error(preview.error.code);
    const shown = preview.data.reasons.find((option) => option.reason === "car_problem");
    if (shown === undefined) throw new Error("car_problem is not offered");
    const cancelled = await api.client.call(cancelBookingRoute, {
      accessToken: jon.accessToken,
      params: { id: bookingId },
      body: {
        reason: shown.reason,
        terms: { refund: shown.refund, countsOnReliability: shown.countsOnReliability },
      },
    });
    expect(cancelled.ok).toBe(true);
    await runWorker();
    expect(sms.outbox).toHaveLength(6);
    expect(sms.outbox.at(-1)?.text).toMatch(/^ShareRide: the driver cancelled your booking/);
  });
});
