import { randomUUID } from "node:crypto";
import {
  answerDisputeRoute,
  driverCheckInRoute,
  markNoShowRoute,
  passengerCheckInRoute,
  reportDriverAbsentRoute,
  sendMessageRoute,
  type AdminDispute,
  type AdminDisputeListItem,
  type AdminConversationMessage,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { defaultTripDaySettings } from "@shareride/domain";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { moveTripsOn } from "../trips/completion.ts";
import { settleUnansweredReports } from "./settle.ts";

// The console's Disputes routes (spec 8, 3.5; milestone 7, PR 5c). At the
// test clock (Friday 13 November 2026, noon), Jón's airport trip leaves
// Hlemmur on Saturday at 05:30 and stops at Fjörður, Fitjar and Keflavík
// Airport. Gunna books Hlemmur to Fjörður.

let api: TestApi;

const { airport } = sampleTrip;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

const minuteMs = 60_000;
const at = (time: Date, minutes: number) => new Date(time.getTime() + minutes * minuteMs);

/** Moves the clock to `minutes` from `time`, refreshing the members' tokens. */
async function until(time: Date, minutes: number, ...members: Member[]) {
  const seconds = (time.getTime() - api.now().getTime()) / 1000 + minutes * 60;
  await later(Math.round(seconds), ...members);
}

async function airportStops() {
  const rows = await api.connection.db
    .select({ id: schema.tripStops.id, plannedAt: schema.tripStops.plannedAt })
    .from(schema.tripStops)
    .where(eq(schema.tripStops.tripId, airport))
    .orderBy(asc(schema.tripStops.position));
  return rows.map(({ id, plannedAt }) => {
    if (plannedAt === null) throw new Error("A published trip's stop has its time.");
    return { id, plannedAt };
  });
}

const ok = <T>(answer: { ok: true; data: T } | { ok: false; error: { code: string } }): T => {
  if (!answer.ok) throw new Error(answer.error.code);
  return answer.data;
};

/** Jón drives; Gunna has paid for Hlemmur to Fjörður and wrote to him; the trip's stops. */
async function onTheTrip() {
  const jon = await driverOf(airport, "Jón");
  const gunna = await newMember("Gunna");
  const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
  await paid(gunna.accessToken, booking.id);
  ok(
    await api.client.call(sendMessageRoute, {
      accessToken: gunna.accessToken,
      params: { id: booking.id },
      body: { clientId: randomUUID(), text: "I'll be by the bus shelter." },
    }),
  );
  const stops = await airportStops();
  const [hlemmur, fjordur] = stops;
  if (hlemmur === undefined || fjordur === undefined) throw new Error("No stops.");
  return { jon, gunna, bookingId: booking.id, hlemmur, fjordur };
}

type Trip = Awaited<ReturnType<typeof onTheTrip>>;

/** Gunna says the driver didn't come, 15 minutes after her time; Jón says that's not right. */
async function contestedAbsence(trip: Trip) {
  const { jon, gunna, bookingId, hlemmur } = trip;
  await until(hlemmur.plannedAt, -3, jon, gunna);
  ok(
    await api.client.call(passengerCheckInRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
      body: {},
    }),
  );
  await until(hlemmur.plannedAt, 15, jon, gunna);
  const report = ok(
    await api.client.call(reportDriverAbsentRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
      body: { note: "Waited at the shelter, nobody came." },
    }),
  );
  const disputeId = report.id;
  await until(hlemmur.plannedAt, 30, jon, gunna);
  ok(
    await api.client.call(answerDisputeRoute, {
      accessToken: jon.accessToken,
      params: { id: disputeId },
      body: { answer: "contested", note: "I was there from 05:25." },
    }),
  );
  return disputeId;
}

/** Jón says "I'm here" at Hlemmur and marks Gunna a no-show after the wait; nobody answers. */
async function unansweredNoShow(trip: Trip) {
  const { jon, gunna, bookingId, hlemmur } = trip;
  await until(hlemmur.plannedAt, -5, jon, gunna);
  ok(
    await api.client.call(driverCheckInRoute, {
      accessToken: jon.accessToken,
      params: { id: airport, stopId: hlemmur.id },
      body: {},
    }),
  );
  await until(hlemmur.plannedAt, 10, jon, gunna);
  const marked = ok(
    await api.client.call(markNoShowRoute, {
      accessToken: jon.accessToken,
      params: { id: bookingId },
      body: {},
    }),
  );
  return marked.id;
}

async function conversationOf(bookingId: string) {
  const [row] = await api.connection.db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(eq(schema.conversations.bookingId, bookingId));
  if (row === undefined) throw new Error("No conversation.");
  return row.id;
}

/** Signed in to the console now: its sessions idle out after 30 minutes. */
async function operator() {
  return api.signInOperator();
}

async function send(cookie: string, method: string, path: string, body?: unknown) {
  const response = await api.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

/** The audit log is append-only, so each test reads the entries about its own report. */
async function auditOf(action: string, subjectId: string) {
  return api.connection.db
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, action), eq(schema.auditLog.subjectId, subjectId)))
    .orderBy(asc(schema.auditLog.id));
}

describe("the console's list of disputes", () => {
  it("is for operators only, as is every dispute route", async () => {
    const trip = await onTheTrip();
    const disputeId = await contestedAbsence(trip);
    const asGunna = { authorization: `Bearer ${trip.gunna.accessToken}` };
    for (const [method, path] of [
      ["GET", "/admin/v1/disputes"],
      ["GET", `/admin/v1/disputes/${disputeId}`],
      ["POST", `/admin/v1/disputes/${disputeId}/decision`],
      ["GET", `/admin/v1/disputes/${disputeId}/conversation`],
    ] as const) {
      const answered = await api.request(path, {
        method,
        headers: { ...asGunna, "content-type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({ outcome: "rode", note: "" }) } : {}),
      });
      expect(answered.status, path).toBe(401);
    }
    expect(await auditOf("conversation.opened", disputeId)).toEqual([]);
  });

  it("lists a contested report as waiting, with both people and the passenger's stops", async () => {
    const trip = await onTheTrip();
    const disputeId = await contestedAbsence(trip);
    const { cookie } = await operator();
    const { status, body } = await send(cookie, "GET", "/admin/v1/disputes");
    expect(status).toBe(200);
    const { disputes } = body as { disputes: AdminDisputeListItem[] };
    expect(disputes).toEqual([
      {
        id: disputeId,
        kind: "driver_absent",
        raisedAt: at(trip.hlemmur.plannedAt, 15).toISOString(),
        answeredAt: at(trip.hlemmur.plannedAt, 30).toISOString(),
        outcome: null,
        decidedAt: null,
        driver: { userId: trip.jon.userId, firstName: "Jón" },
        passenger: { userId: trip.gunna.userId, firstName: "Gunna" },
        from: {
          name: expect.any(Object) as unknown,
          plannedAt: trip.hlemmur.plannedAt.toISOString(),
        },
        to: {
          name: expect.any(Object) as unknown,
          plannedAt: trip.fjordur.plannedAt.toISOString(),
        },
      },
    ]);
    expect(disputes[0]?.from.name.is).toBe("Hlemmur");
  });

  it("leaves out a report nobody has answered, before and after it settles by itself", async () => {
    const trip = await onTheTrip();
    const disputeId = await unansweredNoShow(trip);
    const before = await operator();
    expect((await send(before.cookie, "GET", "/admin/v1/disputes")).body).toEqual({
      disputes: [],
    });
    // A no-show can be answered until 24 hours after the trip completes, 2 hours after its last stop.
    const last = (await airportStops()).at(-1);
    if (last === undefined) throw new Error("No stops.");
    await until(last.plannedAt, (2 + 24) * 60 + 1, trip.jon, trip.gunna);
    await moveTripsOn(api.connection.db, api.now(), defaultTripDaySettings);
    await settleUnansweredReports(api.connection.db, api.now(), defaultTripDaySettings);
    const { cookie } = await operator();
    const settled = await send(cookie, "GET", `/admin/v1/disputes/${disputeId}`);
    expect(settled.body).toMatchObject({ outcome: "stands", decidedBy: "system" });
    const decided = await send(cookie, "GET", "/admin/v1/disputes?state=decided");
    const { disputes } = decided.body as { disputes: AdminDisputeListItem[] };
    expect(disputes.map(({ id }) => id)).not.toContain(disputeId);
  });

  it("moves a report to the decided list once the operator decides it", async () => {
    const trip = await onTheTrip();
    const disputeId = await contestedAbsence(trip);
    const { cookie } = await operator();
    await send(cookie, "POST", `/admin/v1/disputes/${disputeId}/decision`, {
      outcome: "rode",
      note: "Both check-ins at Hlemmur.",
    });
    expect((await send(cookie, "GET", "/admin/v1/disputes")).body).toEqual({ disputes: [] });
    const decided = await send(cookie, "GET", "/admin/v1/disputes?state=decided");
    const { disputes } = decided.body as { disputes: AdminDisputeListItem[] };
    expect(disputes.map(({ id, outcome }) => ({ id, outcome }))).toEqual([
      { id: disputeId, outcome: "rode" },
    ]);
  });
});

describe("one dispute in the console", () => {
  it("shows what the system knows: the notes, the answer, the planned and I'm here times", async () => {
    const trip = await onTheTrip();
    const disputeId = await contestedAbsence(trip);
    const { cookie } = await operator();
    const { status, body } = await send(cookie, "GET", `/admin/v1/disputes/${disputeId}`);
    expect(status).toBe(200);
    const dispute = body as AdminDispute;
    expect(dispute).toMatchObject({
      id: disputeId,
      bookingId: trip.bookingId,
      tripId: airport,
      seats: 1,
      kind: "driver_absent",
      note: "Waited at the shelter, nobody came.",
      answer: "contested",
      answerNote: "I was there from 05:25.",
      decidedBy: null,
      decisionNote: "",
      passengerHereAt: at(trip.hlemmur.plannedAt, -3).toISOString(),
      // A driver's absence can be answered for 24 hours from the report (R8.6).
      answerBy: at(trip.hlemmur.plannedAt, 15 + 24 * 60).toISOString(),
      outcomes: ["stands", "rode", "passenger_absent"],
    });
    expect(
      dispute.stops.map(({ name, plannedAt, driverHereAt, boards, alights }) => ({
        name: name.is,
        plannedAt,
        driverHereAt,
        boards,
        alights,
      })),
    ).toEqual([
      {
        name: "Hlemmur",
        plannedAt: trip.hlemmur.plannedAt.toISOString(),
        driverHereAt: null,
        boards: true,
        alights: false,
      },
      {
        name: expect.any(String) as unknown,
        plannedAt: trip.fjordur.plannedAt.toISOString(),
        driverHereAt: null,
        boards: false,
        alights: true,
      },
      expect.objectContaining({ boards: false, alights: false }) as unknown,
      expect.objectContaining({ boards: false, alights: false }) as unknown,
    ]);
  });

  it("shows the driver's I'm here at the stop", async () => {
    const trip = await onTheTrip();
    const disputeId = await unansweredNoShow(trip);
    const { cookie } = await operator();
    const { body } = await send(cookie, "GET", `/admin/v1/disputes/${disputeId}`);
    const dispute = body as AdminDispute;
    expect(dispute.stops[0]?.driverHereAt).toBe(at(trip.hlemmur.plannedAt, -5).toISOString());
    expect(dispute.passengerHereAt).toBeNull();
    // Nobody contested it, so there is nothing for the operator to decide.
    expect(dispute.outcomes).toEqual([]);
  });

  it("answers 404 for a report that isn't there", async () => {
    const { cookie } = await operator();
    const { status } = await send(cookie, "GET", `/admin/v1/disputes/${randomUUID()}`);
    expect(status).toBe(404);
  });
});

describe("the operator's decision", () => {
  it("decides a contested report, records who decided, and tells both sides", async () => {
    const trip = await onTheTrip();
    const disputeId = await contestedAbsence(trip);
    const signedIn = await operator();
    const { status, body } = await send(
      signedIn.cookie,
      "POST",
      `/admin/v1/disputes/${disputeId}/decision`,
      { outcome: "passenger_absent", note: "Jón's I'm here at 05:27; Gunna's phone shows none." },
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      outcome: "passenger_absent",
      decidedBy: "operator",
      decisionNote: "Jón's I'm here at 05:27; Gunna's phone shows none.",
      outcomes: [],
    });
    const [entry] = await auditOf("dispute.decided", disputeId);
    expect(entry).toMatchObject({
      operatorUserId: signedIn.userId,
      operatorSessionId: signedIn.sessionId,
      subjectType: "dispute",
      subjectId: disputeId,
    });
    const events = await api.connection.db
      .select({ payload: schema.outboxEvents.payload })
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.kind, "DisputeDecided"));
    const ours = events.filter(
      ({ payload }) => (payload as { bookingId?: string }).bookingId === trip.bookingId,
    );
    expect(ours).toHaveLength(1);
  });

  it("refuses a second decision, an outcome of the other kind, and a note too long", async () => {
    const trip = await onTheTrip();
    const disputeId = await contestedAbsence(trip);
    const { cookie } = await operator();
    const path = `/admin/v1/disputes/${disputeId}/decision`;
    const wrongKind = await send(cookie, "POST", path, { outcome: "left_behind", note: "" });
    expect(wrongKind).toMatchObject({ status: 409, body: { error: { code: "outcome_invalid" } } });
    const long = await send(cookie, "POST", path, { outcome: "rode", note: "x".repeat(501) });
    expect(long).toMatchObject({
      status: 400,
      body: {
        error: { code: "validation_failed", details: [{ path: "note", issue: "too_long" }] },
      },
    });
    expect((await send(cookie, "POST", path, { outcome: "rode", note: "" })).status).toBe(200);
    const again = await send(cookie, "POST", path, { outcome: "stands", note: "" });
    expect(again).toMatchObject({ status: 409, body: { error: { code: "already_decided" } } });
  });

  it("refuses a report nobody contested, and one that isn't there", async () => {
    const trip = await onTheTrip();
    const disputeId = await unansweredNoShow(trip);
    const { cookie } = await operator();
    const body = { outcome: "rode", note: "" };
    const open = await send(cookie, "POST", `/admin/v1/disputes/${disputeId}/decision`, body);
    expect(open).toMatchObject({ status: 409, body: { error: { code: "not_contested" } } });
    const missing = await send(cookie, "POST", `/admin/v1/disputes/${randomUUID()}/decision`, body);
    expect(missing.status).toBe(404);
  });
});

describe("the booking's conversation, for a dispute (R7.3, R9.6)", () => {
  it("shows the messages by who sent them, and logs the opening without the text", async () => {
    const trip = await onTheTrip();
    const disputeId = await contestedAbsence(trip);
    const signedIn = await operator();
    const { status, body } = await send(
      signedIn.cookie,
      "GET",
      `/admin/v1/disputes/${disputeId}/conversation`,
    );
    expect(status).toBe(200);
    const { messages } = body as { messages: AdminConversationMessage[] };
    expect(messages.find((message) => message.kind === "text")).toMatchObject({
      from: "passenger",
      text: "I'll be by the bus shelter.",
    });
    expect(messages).toContainEqual(
      expect.objectContaining({ from: "system", system: { key: "checked_in", by: "them" } }),
    );
    const entries = await auditOf("conversation.opened", disputeId);
    expect(entries).toHaveLength(1);
    const conversationId = await conversationOf(trip.bookingId);
    expect(entries[0]).toMatchObject({
      operatorUserId: signedIn.userId,
      subjectType: "dispute",
      subjectId: disputeId,
      before: null,
      after: { bookingId: trip.bookingId, conversationId },
    });
    expect(JSON.stringify(entries[0])).not.toContain("bus shelter");
  });

  it("shows a message whose sender was erased as erased, without its text", async () => {
    const trip = await onTheTrip();
    const disputeId = await contestedAbsence(trip);
    const conversationId = await conversationOf(trip.bookingId);
    await api.connection.db
      .update(schema.messages)
      .set({ body: null, erasedAt: api.now() })
      .where(
        and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.kind, "text")),
      );
    const { cookie } = await operator();
    const { body } = await send(cookie, "GET", `/admin/v1/disputes/${disputeId}/conversation`);
    const { messages } = body as { messages: AdminConversationMessage[] };
    expect(messages.find((message) => message.from === "passenger")).toMatchObject({
      kind: "erased",
      text: null,
    });
  });

  it("shows what an erased sender's message said while a report keeps it", async () => {
    const trip = await onTheTrip();
    const disputeId = await contestedAbsence(trip);
    const conversationId = await conversationOf(trip.bookingId);
    // Erasure keeps the text of a conversation a report covers (spec 9, section 7).
    await api.connection.db
      .update(schema.messages)
      .set({ erasedAt: api.now() })
      .where(
        and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.kind, "text")),
      );
    const { cookie } = await operator();
    const { body } = await send(cookie, "GET", `/admin/v1/disputes/${disputeId}/conversation`);
    const { messages } = body as { messages: AdminConversationMessage[] };
    expect(messages.find((message) => message.from === "passenger")).toMatchObject({
      kind: "text",
      text: "I'll be by the bus shelter.",
    });
  });

  it("stays closed, and logs nothing, for a report nobody contested", async () => {
    const trip = await onTheTrip();
    const disputeId = await unansweredNoShow(trip);
    const { cookie } = await operator();
    const read = await send(cookie, "GET", `/admin/v1/disputes/${disputeId}/conversation`);
    expect(read).toMatchObject({ status: 409, body: { error: { code: "not_contested" } } });
    expect(await auditOf("conversation.opened", disputeId)).toEqual([]);
  });

  it("shows no messages once the conversation is deleted, and still logs the opening", async () => {
    const trip = await onTheTrip();
    const disputeId = await contestedAbsence(trip);
    await api.connection.db
      .delete(schema.conversations)
      .where(eq(schema.conversations.bookingId, trip.bookingId));
    const { cookie } = await operator();
    const read = await send(cookie, "GET", `/admin/v1/disputes/${disputeId}/conversation`);
    expect(read).toEqual({ status: 200, body: { messages: [] } });
    const [entry] = await auditOf("conversation.opened", disputeId);
    expect(entry?.after).toEqual({ bookingId: trip.bookingId, conversationId: null });
  });

  it("answers 404, and logs nothing, for a report that isn't there", async () => {
    const { cookie } = await operator();
    const missing = randomUUID();
    const { status } = await send(cookie, "GET", `/admin/v1/disputes/${missing}/conversation`);
    expect(status).toBe(404);
    expect(await auditOf("conversation.opened", missing)).toEqual([]);
  });
});
