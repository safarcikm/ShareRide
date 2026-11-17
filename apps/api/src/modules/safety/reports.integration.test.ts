import { randomUUID } from "node:crypto";
import {
  bookingRoute,
  conversationMessagesRoute,
  fileReportRoute,
  myReportsRoute,
  sendMessageRoute,
  type ReportBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { cleanUpConversations } from "../chat/clean-up.ts";

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

function report(member: Member | null, body: ReportBody) {
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
