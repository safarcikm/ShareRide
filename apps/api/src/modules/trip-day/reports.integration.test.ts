import {
  answerDisputeRoute,
  bookingRoute,
  driverCheckInRoute,
  markNoShowRoute,
  reportDriverAbsentRoute,
  type AnswerDisputeBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { defaultTripDaySettings as settings, type DisputeOutcome } from "@shareride/domain";
import { asc, eq, inArray } from "drizzle-orm";
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
import { decideDispute } from "./decide.ts";
import { settleUnansweredReports } from "./settle.ts";

// Reports on the trip day (spec 8, 3.3 to 3.5; R8.4 to R8.7; decisions 4
// and 5). At the test clock (Friday 13 November 2026, noon), Jón's airport
// trip leaves Hlemmur on Saturday at 05:30 and stops at Fjörður, Fitjar and
// Keflavík Airport; it takes instant bookings, paid by card.

let api: TestApi;

const { airport } = sampleTrip;
const reportEvents = ["NoShowMarked", "DriverAbsentReported", "DisputeDecided"];

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  await api.connection.db
    .delete(schema.outboxEvents)
    .where(inArray(schema.outboxEvents.kind, reportEvents));
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid, occupancy } = bookingHelpers(() => api);

const minute = 60;
const minuteMs = 60_000;
const at = (time: Date, minutes: number) => new Date(time.getTime() + minutes * minuteMs);

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

/** Moves the clock to `minutes` from `time`, refreshing the members' tokens. */
async function until(time: Date, minutes: number, ...members: Member[]) {
  const seconds = (time.getTime() - api.now().getTime()) / 1000 + minutes * minute;
  await later(Math.round(seconds), ...members);
}

/** Jón drives; Gunna has paid for Hlemmur to Fjörður; the trip's stops. */
async function onTheTrip() {
  const jon = await driverOf(airport, "Jón");
  const gunna = await newMember("Gunna");
  const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
  await paid(gunna.accessToken, booking.id);
  const stops = await airportStops();
  const hlemmur = stops[0];
  const last = stops.at(-1);
  if (hlemmur === undefined || last === undefined) throw new Error("No stops.");
  return { jon, gunna, bookingId: booking.id, hlemmur, completesAt: at(last.plannedAt, 120) };
}

const driverCheckIn = (member: Member, stopId: string) =>
  api.client.call(driverCheckInRoute, {
    accessToken: member.accessToken,
    params: { id: airport, stopId },
    body: {},
  });

const markNoShow = (member: Member, bookingId: string, note?: string) =>
  api.client.call(markNoShowRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    body: note === undefined ? {} : { note },
  });

const reportAbsent = (member: Member, bookingId: string, note?: string) =>
  api.client.call(reportDriverAbsentRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    body: note === undefined ? {} : { note },
  });

const answer = (member: Member, disputeId: string, body: AnswerDisputeBody) =>
  api.client.call(answerDisputeRoute, {
    accessToken: member.accessToken,
    params: { id: disputeId },
    body,
  });

async function bookingAs(member: Member, bookingId: string) {
  const found = await api.client.call(bookingRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
  });
  if (!found.ok) throw new Error(found.error.code);
  return found.data;
}

async function storedBooking(bookingId: string) {
  const [row] = await api.connection.db
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.id, bookingId));
  if (row === undefined) throw new Error("No such booking.");
  return row;
}

async function storedDispute(bookingId: string) {
  const [row] = await api.connection.db
    .select()
    .from(schema.disputes)
    .where(eq(schema.disputes.bookingId, bookingId));
  if (row === undefined) throw new Error("No report.");
  return row;
}

async function paymentOf(bookingId: string) {
  const [row] = await api.connection.db
    .select({ status: schema.payments.status })
    .from(schema.payments)
    .where(eq(schema.payments.bookingId, bookingId));
  return row?.status;
}

async function eventsOf(bookingId: string) {
  const rows = await api.connection.db
    .select({ kind: schema.outboxEvents.kind, payload: schema.outboxEvents.payload })
    .from(schema.outboxEvents)
    .where(inArray(schema.outboxEvents.kind, reportEvents))
    .orderBy(asc(schema.outboxEvents.createdAt), asc(schema.outboxEvents.id));
  return rows
    .filter((row) => (row.payload as { bookingId?: string }).bookingId === bookingId)
    .map((row) => row.kind);
}

/** Jón has waited 10 minutes at Hlemmur, where he said "I'm here". */
async function waitedAtHlemmur(trip: Awaited<ReturnType<typeof onTheTrip>>) {
  await until(trip.hlemmur.plannedAt, -5, trip.jon, trip.gunna);
  const said = await driverCheckIn(trip.jon, trip.hlemmur.id);
  if (!said.ok) throw new Error(said.error.code);
  await until(trip.hlemmur.plannedAt, 10, trip.jon, trip.gunna);
}

/** Runs the minute job's trip day steps once, as the server does. */
async function minuteJob() {
  await moveTripsOn(api.connection.db, api.now(), settings);
  return settleUnansweredReports(api.connection.db, api.now(), settings);
}

async function operatorDecides(disputeId: string, outcome: DisputeOutcome, note = "") {
  const operator = await newMember("Operator");
  return decideDispute(
    api.connection.db,
    {
      operator: { userId: operator.userId, sessionId: null },
      disputeId,
      outcome,
      note,
      request: null,
    },
    api.now(),
  );
}

/** What a full car pays at the caps the airport trip's stretches store (rule P3). */
async function limitOfAirport() {
  const stretches = await api.connection.db
    .select({ capacity: schema.segments.capacity, cap: schema.segments.cap })
    .from(schema.segments)
    .where(eq(schema.segments.tripId, airport));
  return stretches.reduce((sum, row) => sum + row.capacity * row.cap, 0);
}

async function levelOfAirport() {
  const [trip] = await api.connection.db
    .select({ priceLevel: schema.trips.priceLevel })
    .from(schema.trips)
    .where(eq(schema.trips.id, airport));
  return trip?.priceLevel;
}

async function priceChangesOfAirport() {
  return api.connection.db
    .select({
      kind: schema.tripChanges.kind,
      before: schema.tripChanges.before,
      after: schema.tripChanges.after,
    })
    .from(schema.tripChanges)
    .where(eq(schema.tripChanges.tripId, airport));
}

describe("marking a no-show (spec 8, 3.3; R8.4)", () => {
  it("after the wait, once the driver said I'm here: the booking is a no-show, its seat freed, and the passenger told once", async () => {
    const trip = await onTheTrip();
    const { jon, gunna, bookingId } = trip;
    expect((await occupancy(airport))[0]).toBe(1);
    await waitedAtHlemmur(trip);
    const raisedAt = api.now().toISOString();

    const marked = await markNoShow(jon, bookingId, "  Waited 15 minutes, called twice.  ");
    expect(marked).toMatchObject({
      ok: true,
      status: 200,
      data: {
        kind: "no_show",
        raisedAt,
        // Until 24 hours after the trip completes (3.3).
        answerBy: at(trip.completesAt, 24 * 60).toISOString(),
        answer: null,
        outcome: null,
        decidedBy: null,
      },
    });
    expect(await storedBooking(bookingId)).toMatchObject({ status: "no_show" });
    expect((await occupancy(airport))[0]).toBe(0);
    // The note is for the operator, trimmed; neither side reads it back.
    expect((await storedDispute(bookingId)).note).toBe("Waited 15 minutes, called twice.");
    const asGunna = await bookingAs(gunna, bookingId);
    expect(asGunna).toMatchObject({ status: "no_show", tripDay: { arrival: "no_show" } });
    expect(asGunna.dispute).toEqual(marked.ok ? marked.data : null);
    expect(JSON.stringify(asGunna)).not.toContain("called twice");
    expect(await eventsOf(bookingId)).toEqual(["NoShowMarked"]);

    // Tapped again, or retried after a lost answer: the same report, told once.
    await later(minute, jon, gunna);
    expect(await markNoShow(jon, bookingId)).toMatchObject({ ok: true, data: { raisedAt } });
    expect(await eventsOf(bookingId)).toEqual(["NoShowMarked"]);
  });

  it("lowers the level for the seats ahead when the driver keeps a no-show's money (spec 17)", async () => {
    const trip = await onTheTrip();
    const { jon, bookingId } = trip;
    // As if Gunna had paid as much as a full car pays at the caps: the
    // freed seat can then only be sold for free (rule P3).
    await api.connection.db
      .update(schema.bookings)
      .set({ totalPrice: await limitOfAirport() })
      .where(eq(schema.bookings.id, bookingId));
    const before = await levelOfAirport();
    await waitedAtHlemmur(trip);

    expect((await markNoShow(jon, bookingId)).ok).toBe(true);
    expect(await levelOfAirport()).toBe(0);
    expect(await priceChangesOfAirport()).toEqual([
      {
        kind: "priceLevel",
        before: { priceLevel: before },
        after: { priceLevel: 0, reason: "trip_limit" },
      },
    ]);
  });

  it("keeps the level after a no-show at the price the trip was booked at (spec 17)", async () => {
    const trip = await onTheTrip();
    const before = await levelOfAirport();
    await waitedAtHlemmur(trip);
    expect((await markNoShow(trip.jon, trip.bookingId)).ok).toBe(true);
    expect(await levelOfAirport()).toBe(before);
    expect(await priceChangesOfAirport()).toEqual([]);
  });

  it("is refused before the wait, saying when, and until the driver said I'm here at that stop", async () => {
    const trip = await onTheTrip();
    const { jon, gunna, bookingId, hlemmur } = trip;
    await until(hlemmur.plannedAt, 9, jon, gunna);
    expect(await markNoShow(jon, bookingId)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "no_show_too_early", allowedAt: at(hlemmur.plannedAt, 10).toISOString() },
    });
    await later(minute, jon, gunna);
    expect(await markNoShow(jon, bookingId)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "driver_not_checked_in" },
    });
    expect(await storedBooking(bookingId)).toMatchObject({ status: "confirmed" });
  });

  it("is only the driver's, and a note may hold 500 characters", async () => {
    const trip = await onTheTrip();
    const { jon, gunna, bookingId } = trip;
    await waitedAtHlemmur(trip);
    const someone = await newMember("Siggi");
    expect(await markNoShow(gunna, bookingId)).toMatchObject({ ok: false, status: 404 });
    expect(await markNoShow(someone, bookingId)).toMatchObject({ ok: false, status: 404 });
    expect(await markNoShow(jon, bookingId, "x".repeat(501))).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "validation_failed", details: [{ path: "note", issue: "too_long" }] },
    });
    expect(await markNoShow(jon, bookingId, "x".repeat(500))).toMatchObject({ ok: true });
  });

  it("is refused once the passenger has said the driver didn't come: the driver answers that instead", async () => {
    const trip = await onTheTrip();
    const { jon, gunna, bookingId } = trip;
    await waitedAtHlemmur(trip);
    expect(await reportAbsent(gunna, bookingId)).toMatchObject({ ok: true });
    expect(await markNoShow(jon, bookingId)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "already_reported" },
    });
  });
});

describe("the driver didn't come (spec 8, 3.4; R8.5)", () => {
  it("after the wait: the driver is told once, and the booking stays as it is, even when the trip completes", async () => {
    const trip = await onTheTrip();
    const { jon, gunna, bookingId, hlemmur } = trip;
    await until(hlemmur.plannedAt, 9, jon, gunna);
    expect(await reportAbsent(gunna, bookingId)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "report_too_early", allowedAt: at(hlemmur.plannedAt, 10).toISOString() },
    });
    await later(minute, jon, gunna);
    const raisedAt = api.now();
    expect(await reportAbsent(gunna, bookingId, "Nobody came to Hlemmur.")).toMatchObject({
      ok: true,
      data: {
        kind: "driver_absent",
        raisedAt: raisedAt.toISOString(),
        // The driver has 24 hours from the report (3.4).
        answerBy: at(raisedAt, 24 * 60).toISOString(),
      },
    });
    expect(await reportAbsent(gunna, bookingId)).toMatchObject({ ok: true });
    expect(await eventsOf(bookingId)).toEqual(["DriverAbsentReported"]);
    // A booking is reported once: Jón answers Gunna's report instead.
    expect(await markNoShow(jon, bookingId)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "already_reported" },
    });

    // The trip completes; this booking waits for its report (R8.2).
    await until(trip.completesAt, 0, jon, gunna);
    await minuteJob();
    expect(await storedBooking(bookingId)).toMatchObject({
      status: "confirmed",
      completedAt: null,
    });
    expect((await bookingAs(jon, bookingId)).dispute).toMatchObject({
      kind: "driver_absent",
      answer: null,
    });
  });

  it("can be said after the trip completed, until 24 hours later, and only by the passenger", async () => {
    const trip = await onTheTrip();
    const { jon, gunna, bookingId } = trip;
    await until(trip.completesAt, 0, jon, gunna);
    await minuteJob();
    expect(await storedBooking(bookingId)).toMatchObject({ status: "completed" });
    expect(await reportAbsent(jon, bookingId)).toMatchObject({ ok: false, status: 404 });
    await until(trip.completesAt, 24 * 60 + 1, jon, gunna);
    expect(await reportAbsent(gunna, bookingId)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "report_too_late" },
    });
    await later(-2 * minute, jon, gunna);
    expect(await reportAbsent(gunna, bookingId)).toMatchObject({ ok: true });
  });
});

describe("answering a report (spec 8, 3.3 and 3.4; R8.6, R8.7)", () => {
  it("a passenger who agrees: the no-show stands, with no refund", async () => {
    const trip = await onTheTrip();
    const { jon, gunna, bookingId } = trip;
    await waitedAtHlemmur(trip);
    const marked = await markNoShow(jon, bookingId);
    if (!marked.ok) throw new Error(marked.error.code);

    expect(await answer(jon, marked.data.id, { answer: "agreed" })).toMatchObject({
      ok: false,
      status: 404,
    });
    const answeredAt = api.now().toISOString();
    expect(await answer(gunna, marked.data.id, { answer: "agreed" })).toMatchObject({
      ok: true,
      data: { answer: "agreed", answeredAt, outcome: "stands", decidedBy: "system" },
    });
    expect(await storedBooking(bookingId)).toMatchObject({ status: "no_show", refundAmount: null });
    expect(await paymentOf(bookingId)).toBe("succeeded");
    // The same answer again changes nothing; the other one is refused.
    expect(await answer(gunna, marked.data.id, { answer: "agreed" })).toMatchObject({ ok: true });
    expect(await answer(gunna, marked.data.id, { answer: "contested" })).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "already_answered" },
    });
  });

  it("a driver who agrees they didn't come: cancelled as if by the driver, a full refund that counts on them", async () => {
    const trip = await onTheTrip();
    const { jon, gunna, bookingId, hlemmur } = trip;
    await until(hlemmur.plannedAt, 15, jon, gunna);
    const reported = await reportAbsent(gunna, bookingId);
    if (!reported.ok) throw new Error(reported.error.code);
    const { totalPrice } = await storedBooking(bookingId);

    await answer(jon, reported.data.id, { answer: "agreed", note: "Car broke down." });
    expect(await storedBooking(bookingId)).toMatchObject({
      status: "cancelled",
      cancelledBy: "driver",
      cancelReason: "driver_absent",
      refundAmount: totalPrice,
      countsOnReliability: true,
    });
    expect(await paymentOf(bookingId)).toBe("refund_due");
    expect((await occupancy(airport))[0]).toBe(0);
    expect((await bookingAs(gunna, bookingId)).cancellation).toMatchObject({
      by: "driver",
      reason: "driver_absent",
      refund: { amount: totalPrice, currency: "ISK" },
    });
  });

  it("takes an answer at the deadline itself, and a contested report waits for the operator", async () => {
    const trip = await onTheTrip();
    const { jon, gunna, bookingId } = trip;
    // Gunna says the driver didn't come after the trip completed with her.
    await until(trip.completesAt, 60, jon, gunna);
    await minuteJob();
    const reported = await reportAbsent(gunna, bookingId);
    if (!reported.ok) throw new Error(reported.error.code);

    await until(new Date(reported.data.answerBy), 0, jon, gunna);
    expect(await minuteJob()).toBe(0);
    expect(await answer(jon, reported.data.id, { answer: "contested" })).toMatchObject({
      ok: true,
      data: { answer: "contested", outcome: null },
    });
    await later(minute, jon, gunna);
    expect(await minuteJob()).toBe(0);
    expect(await storedBooking(bookingId)).toMatchObject({ status: "completed" });
  });

  it("an unanswered driver absence stands after the deadline: the completed booking is cancelled and refunded", async () => {
    const trip = await onTheTrip();
    const { jon, gunna, bookingId } = trip;
    await until(trip.completesAt, 60, jon, gunna);
    await minuteJob();
    const reported = await reportAbsent(gunna, bookingId);
    if (!reported.ok) throw new Error(reported.error.code);

    await until(new Date(reported.data.answerBy), 1, jon, gunna);
    expect(await minuteJob()).toBe(1);
    expect(await minuteJob()).toBe(0);
    expect(await storedDispute(bookingId)).toMatchObject({
      outcome: "stands",
      decidedBy: "system",
    });
    expect(await storedBooking(bookingId)).toMatchObject({
      status: "cancelled",
      cancelReason: "driver_absent",
      countsOnReliability: true,
    });
    expect(await paymentOf(bookingId)).toBe("refund_due");
    expect(await answer(jon, reported.data.id, { answer: "agreed" })).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "already_decided" },
    });
  });

  it("settles the others when one report cannot be, and says so", async () => {
    const trip = await onTheTrip();
    const { jon, gunna, bookingId, hlemmur } = trip;
    const sigga = await newMember("Sigga");
    const other = await booked(sigga.accessToken, airport, { fromStop: 0, toStop: 1 });
    await paid(sigga.accessToken, other.id);
    await until(hlemmur.plannedAt, 15, jon, gunna, sigga);
    const broken = await reportAbsent(gunna, bookingId);
    const fine = await reportAbsent(sigga, other.id);
    if (!broken.ok || !fine.ok) throw new Error("not reported");
    // Gunna's payment is missing, so her refund cannot be owed.
    await api.connection.db.delete(schema.payments).where(eq(schema.payments.bookingId, bookingId));

    await until(new Date(fine.data.answerBy), 1, jon, gunna, sigga);
    await expect(settleUnansweredReports(api.connection.db, api.now(), settings)).rejects.toThrow(
      /1 of 2 reports/,
    );
    expect(await storedDispute(other.id)).toMatchObject({ outcome: "stands" });
    expect(await storedDispute(bookingId)).toMatchObject({ outcome: null });
    expect(await storedBooking(bookingId)).toMatchObject({ status: "confirmed" });
  });

  it("an unanswered no-show stands 24 hours after the trip completes, and takes no late answer", async () => {
    const trip = await onTheTrip();
    const { jon, gunna, bookingId } = trip;
    await waitedAtHlemmur(trip);
    const marked = await markNoShow(jon, bookingId);
    if (!marked.ok) throw new Error(marked.error.code);
    await until(trip.completesAt, 24 * 60, jon, gunna);
    expect(await minuteJob()).toBe(0);
    await later(minute, jon, gunna);
    expect(await answer(gunna, marked.data.id, { answer: "contested" })).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "answer_window_closed" },
    });
    expect(await minuteJob()).toBe(1);
    expect(await storedDispute(bookingId)).toMatchObject({ outcome: "stands" });
    expect(await storedBooking(bookingId)).toMatchObject({ status: "no_show" });
    expect(await paymentOf(bookingId)).toBe("succeeded");
  });
});

describe("the operator decides a contested report (spec 8, 3.5; decisions 4 and 5)", () => {
  /** Gunna is marked a no-show and says that's not right. */
  async function contestedNoShow() {
    const trip = await onTheTrip();
    await waitedAtHlemmur(trip);
    const marked = await markNoShow(trip.jon, trip.bookingId);
    if (!marked.ok) throw new Error(marked.error.code);
    const contested = await answer(trip.gunna, marked.data.id, {
      answer: "contested",
      note: "I stood by the shelter in a red coat.",
    });
    if (!contested.ok) throw new Error(contested.error.code);
    return { ...trip, disputeId: marked.data.id };
  }

  /** Gunna says the driver didn't come, and Jón says that's not right. */
  async function contestedAbsence() {
    const trip = await onTheTrip();
    await until(trip.hlemmur.plannedAt, 15, trip.jon, trip.gunna);
    const reported = await reportAbsent(trip.gunna, trip.bookingId);
    if (!reported.ok) throw new Error(reported.error.code);
    const contested = await answer(trip.jon, reported.data.id, { answer: "contested" });
    if (!contested.ok) throw new Error(contested.error.code);
    return { ...trip, disputeId: reported.data.id };
  }

  it("leaves a contested report open, past its deadline, for the operator", async () => {
    const { jon, gunna, bookingId, completesAt } = await contestedNoShow();
    await until(completesAt, 3 * 24 * 60, jon, gunna);
    expect(await minuteJob()).toBe(0);
    expect((await bookingAs(gunna, bookingId)).dispute).toMatchObject({
      answer: "contested",
      outcome: null,
    });
    expect(JSON.stringify(await bookingAs(jon, bookingId))).not.toContain("red coat");
  });

  it("a passenger left behind: cancelled as a driver absence, a full refund, both told and the decision audited", async () => {
    const { gunna, bookingId, disputeId } = await contestedNoShow();
    const { totalPrice } = await storedBooking(bookingId);
    const decided = await operatorDecides(disputeId, "left_behind", "Her check-in was on time.");
    expect(decided).toMatchObject({
      ok: true,
      value: {
        outcome: "left_behind",
        decidedBy: "operator",
        decisionNote: "Her check-in was on time.",
      },
    });
    expect(await storedBooking(bookingId)).toMatchObject({
      status: "cancelled",
      cancelledBy: "driver",
      cancelReason: "driver_absent",
      refundAmount: totalPrice,
      countsOnReliability: true,
    });
    expect(await paymentOf(bookingId)).toBe("refund_due");
    expect(await eventsOf(bookingId)).toEqual(["NoShowMarked", "DisputeDecided"]);
    const [entry] = await api.connection.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.subjectId, disputeId));
    expect(entry).toMatchObject({
      action: "dispute.decided",
      subjectType: "dispute",
      operatorSessionId: null,
      // Names of the fields only: never the outcome or the note (spec 9, 3.8).
      after: { changed: ["outcome", "decidedBy", "decidedAt", "decisionNote"] },
    });
    expect((await bookingAs(gunna, bookingId)).dispute).toMatchObject({
      outcome: "left_behind",
      decidedBy: "operator",
    });
  });

  it("a no-show who rode: the booking completes, with no refund", async () => {
    const { bookingId, disputeId } = await contestedNoShow();
    expect(await operatorDecides(disputeId, "rode")).toMatchObject({ ok: true });
    expect(await storedBooking(bookingId)).toMatchObject({
      status: "completed",
      refundAmount: null,
    });
    expect(await paymentOf(bookingId)).toBe("succeeded");
  });

  it("a no-show the operator finds keeps its money, so the level falls for the seats ahead (spec 17)", async () => {
    const { bookingId, disputeId } = await contestedAbsence();
    await api.connection.db
      .update(schema.bookings)
      .set({ totalPrice: await limitOfAirport() })
      .where(eq(schema.bookings.id, bookingId));
    const before = await levelOfAirport();
    expect(await operatorDecides(disputeId, "passenger_absent")).toMatchObject({ ok: true });
    expect(await levelOfAirport()).toBe(0);
    expect(await priceChangesOfAirport()).toEqual([
      {
        kind: "priceLevel",
        before: { priceLevel: before },
        after: { priceLevel: 0, reason: "trip_limit" },
      },
    ]);
  });

  it("a driver who was there and the passenger didn't come: the passenger's no-show", async () => {
    const { bookingId, disputeId } = await contestedAbsence();
    expect(await operatorDecides(disputeId, "passenger_absent")).toMatchObject({ ok: true });
    expect(await storedBooking(bookingId)).toMatchObject({ status: "no_show" });
    expect((await occupancy(airport))[0]).toBe(0);
    expect(await paymentOf(bookingId)).toBe("succeeded");
  });

  it("a driver absence found wrong after the trip completed, the passenger rode: the booking completes then", async () => {
    const { jon, gunna, bookingId, disputeId, completesAt } = await contestedAbsence();
    await until(completesAt, 30, jon, gunna);
    await minuteJob();
    expect(await storedBooking(bookingId)).toMatchObject({ status: "confirmed" });
    expect(await operatorDecides(disputeId, "rode")).toMatchObject({ ok: true });
    expect(await storedBooking(bookingId)).toMatchObject({
      status: "completed",
      completedAt: completesAt,
    });
    expect((await occupancy(airport))[0]).toBe(0);
  });

  it("a driver absence found wrong while the trip runs, the passenger rode: the booking completes with the trip", async () => {
    const { jon, gunna, bookingId, disputeId, completesAt } = await contestedAbsence();
    expect(await operatorDecides(disputeId, "rode")).toMatchObject({ ok: true });
    expect(await storedBooking(bookingId)).toMatchObject({ status: "confirmed" });
    await until(completesAt, 0, jon, gunna);
    await minuteJob();
    expect(await storedBooking(bookingId)).toMatchObject({ status: "completed" });
  });

  it("decides once, with an outcome the report's kind can have", async () => {
    const { bookingId, disputeId } = await contestedNoShow();
    expect(await operatorDecides(disputeId, "passenger_absent")).toMatchObject({
      ok: false,
      error: { code: "outcome_invalid" },
    });
    expect(await operatorDecides(disputeId, "stands")).toMatchObject({ ok: true });
    expect(await operatorDecides(disputeId, "rode")).toMatchObject({
      ok: false,
      error: { code: "already_decided" },
    });
    expect(await storedBooking(bookingId)).toMatchObject({ status: "no_show" });
    expect(await eventsOf(bookingId)).toEqual(["NoShowMarked", "DisputeDecided"]);
  });

  it("decides only a contested report: one still waiting for its answer is not the operator's", async () => {
    const trip = await onTheTrip();
    await waitedAtHlemmur(trip);
    const marked = await markNoShow(trip.jon, trip.bookingId);
    if (!marked.ok) throw new Error(marked.error.code);
    expect(await operatorDecides(marked.data.id, "rode")).toMatchObject({
      ok: false,
      error: { code: "not_contested" },
    });
  });
});
