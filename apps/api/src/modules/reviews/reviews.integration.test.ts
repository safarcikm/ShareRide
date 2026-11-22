import {
  answerDisputeRoute,
  bookingRoute,
  reportDriverAbsentRoute,
  reviewBookingRoute,
  type ReviewBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import {
  defaultReviewSettings,
  defaultTripDaySettings as settings,
  type DisputeOutcome,
} from "@shareride/domain";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeEmailSender, type FakeEmailSender } from "../../platform/email.ts";
import { createFakePushSender, type FakePushSender } from "../../platform/push.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { setPreferences } from "../notifications/preferences.ts";
import { createNotificationWorker } from "../notifications/worker.ts";
import { decideDispute } from "../trip-day/decide.ts";
import { settleUnansweredReports } from "../trip-day/settle.ts";
import { moveTripsOn } from "../trips/completion.ts";
import { revealDueReviews } from "./reveal.ts";

// Ratings and reviews (spec 8, 3.7; R8.8 and R8.9). At the test clock
// (Friday 13 November 2026, noon), Jón's airport trip leaves Hlemmur on
// Saturday at 05:30 and stops at Fjörður, Fitjar and Keflavík Airport; it
// takes instant bookings, paid by card. It completes 2 hours after its last
// stop.

let api: TestApi;
let push: FakePushSender;
let email: FakeEmailSender;
const webAppUrl = "https://shareride.test";

const { airport } = sampleTrip;
const { outboxEvents, reviews, scheduledNotifications } = schema;
const reviewEvents = ["BookingCompleted", "ReviewRevealed"];

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  await api.connection.db.execute(sql`delete from outbox_events`);
  await api.connection.db.execute(sql`delete from notifications`);
  await api.connection.db.execute(sql`delete from scheduled_notifications`);
  await api.connection.db.execute(sql`delete from push_tokens`);
  push = createFakePushSender();
  email = createFakeEmailSender();
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

const minuteMs = 60_000;
const dayMs = 86_400_000;
const at = (time: Date, minutes: number) => new Date(time.getTime() + minutes * minuteMs);

/** Moves the clock to `minutes` from `time`, refreshing the members' tokens. */
async function until(time: Date, minutes: number, ...members: Member[]) {
  const seconds = (time.getTime() - api.now().getTime()) / 1000 + minutes * 60;
  await later(Math.round(seconds), ...members);
}

/** Runs the minute job once, as the server does. */
async function minuteJob() {
  await moveTripsOn(api.connection.db, api.now(), settings);
  await settleUnansweredReports(api.connection.db, api.now(), settings);
  return revealDueReviews(api.connection.db, api.now(), defaultReviewSettings);
}

/** When the airport trip completes: 2 hours after its last stop. */
async function completionOfAirport() {
  const [last] = await api.connection.db
    .select({ plannedAt: schema.tripStops.plannedAt })
    .from(schema.tripStops)
    .where(eq(schema.tripStops.tripId, airport))
    .orderBy(desc(schema.tripStops.position))
    .limit(1);
  if (last === undefined || last.plannedAt === null) {
    throw new Error("A published trip's stop has its time.");
  }
  return at(last.plannedAt, 120);
}

/** Gunna says Jón didn't come, 15 minutes after Hlemmur, and he says he did. */
async function contestedAbsence(jon: Member, gunna: Member, bookingId: string) {
  const [first] = await api.connection.db
    .select({ plannedAt: schema.tripStops.plannedAt })
    .from(schema.tripStops)
    .where(eq(schema.tripStops.tripId, airport))
    .orderBy(asc(schema.tripStops.position))
    .limit(1);
  if (first === undefined || first.plannedAt === null) throw new Error("No first stop.");
  await until(first.plannedAt, 15, jon, gunna);
  const reported = await api.client.call(reportDriverAbsentRoute, {
    accessToken: gunna.accessToken,
    params: { id: bookingId },
    body: {},
  });
  if (!reported.ok) throw new Error(reported.error.code);
  const contested = await api.client.call(answerDisputeRoute, {
    accessToken: jon.accessToken,
    params: { id: reported.data.id },
    body: { answer: "contested" },
  });
  if (!contested.ok) throw new Error(contested.error.code);
  return reported.data.id;
}

/** Puts the member's account on its way out, as "Delete my account" does. */
async function leaving(member: Member) {
  await api.connection.db
    .update(schema.users)
    .set({ deleteAfter: at(api.now(), 7 * 24 * 60) })
    .where(eq(schema.users.id, member.userId));
}

/** Jón drives; Gunna has paid for Hlemmur to Fjörður. */
async function onTheTrip() {
  const jon = await driverOf(airport, "Jón");
  const gunna = await newMember("Gunna");
  const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
  await paid(gunna.accessToken, booking.id);
  return { jon, gunna, bookingId: booking.id, completesAt: await completionOfAirport() };
}

/** The trip has completed, as the minute job stores it, half an hour ago. */
async function afterTheTrip() {
  const trip = await onTheTrip();
  await until(trip.completesAt, 30, trip.jon, trip.gunna);
  await minuteJob();
  return trip;
}

const review = (member: Member, bookingId: string, body: ReviewBody) =>
  api.client.call(reviewBookingRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    body,
  });

async function reviewed(member: Member, bookingId: string, body: ReviewBody) {
  const result = await review(member, bookingId, body);
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

async function bookingAs(member: Member, bookingId: string) {
  const found = await api.client.call(bookingRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
  });
  if (!found.ok) throw new Error(found.error.code);
  return found.data;
}

async function storedReviews(bookingId: string) {
  return api.connection.db
    .select()
    .from(reviews)
    .where(eq(reviews.bookingId, bookingId))
    .orderBy(asc(reviews.createdAt));
}

async function eventsOf(bookingId: string) {
  const rows = await api.connection.db
    .select({ kind: outboxEvents.kind, payload: outboxEvents.payload })
    .from(outboxEvents)
    .where(inArray(outboxEvents.kind, reviewEvents))
    .orderBy(asc(outboxEvents.createdAt), asc(outboxEvents.id));
  return rows.filter((row) => row.payload["bookingId"] === bookingId).map((row) => row.kind);
}

function worker() {
  return createNotificationWorker({
    db: api.connection.db,
    clock: () => api.now(),
    push,
    email: { sender: email, webAppUrl },
  });
}

/** A verified email address, as opening the link in it gives (spec 1). */
async function withEmail(member: Member, address: string) {
  await api.connection.db
    .update(schema.users)
    .set({ email: address, emailVerifiedAt: api.now() })
    .where(eq(schema.users.id, member.userId));
}

/** What was emailed to the address about reviews: subject and the link's line. */
function emailedTo(address: string) {
  return email.sent
    .filter((sent) => sent.to === address && reviewTitles.includes(sent.subject))
    .map((sent) => ({
      subject: sent.subject,
      link: sent.text.split("\n").find((line) => line.includes(webAppUrl)),
    }));
}

/** A push token on the member's newest session, as the app registers it. */
async function withDevice(member: Member) {
  const { db } = api.connection;
  const [session] = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, member.userId))
    .orderBy(desc(schema.sessions.createdAt))
    .limit(1);
  if (session === undefined) throw new Error("No session.");
  await db.insert(schema.pushTokens).values({
    sessionId: session.id,
    userId: member.userId,
    platform: "ios",
    token: `ExponentPushToken[${member.userId}]`,
  });
}

const reviewKinds = ["rate_trip", "rate_trip_driver", "review_visible"];

/** The kinds of the member's notifications about reviews, oldest first. */
async function toldTo(member: Member) {
  const rows = await api.connection.db
    .select({ kind: schema.notifications.kind })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.recipientId, member.userId),
        inArray(schema.notifications.kind, reviewKinds),
      ),
    )
    .orderBy(asc(schema.notifications.createdAt), asc(schema.notifications.id));
  return rows.map((row) => row.kind);
}

const reviewTitles = ["How was your trip?", "A review about you is now visible"];

/** What push sent to the member about reviews: title, body and the page it opens. */
function pushedTo(member: Member) {
  return push.sent
    .filter(
      (message) =>
        message.to === `ExponentPushToken[${member.userId}]` &&
        reviewTitles.includes(message.title),
    )
    .map(({ title, body, data }) => ({ title, body, path: data["path"] }));
}

async function decide(disputeId: string, outcome: DisputeOutcome) {
  const operator = await newMember("Operator");
  const decided = await decideDispute(
    api.connection.db,
    {
      operator: { userId: operator.userId, sessionId: null },
      disputeId,
      outcome,
      note: "",
      request: null,
    },
    api.now(),
  );
  if (!decided.ok) throw new Error(decided.error.code);
}

describe("rating and reviewing (spec 8, 3.7; R8.8)", () => {
  it("each side reviews the other once the trip completes; a review shows once both have", async () => {
    const { jon, gunna, bookingId, completesAt } = await afterTheTrip();
    const closesAt = new Date(completesAt.getTime() + 14 * dayMs).toISOString();

    const first = await reviewed(gunna, bookingId, { rating: 5, comment: "  Lovely trip.  " });
    expect(first).toEqual({
      closesAt,
      mine: {
        rating: 5,
        comment: "Lovely trip.",
        sentAt: api.now().toISOString(),
        revealed: false,
      },
      theirs: null,
    });
    // Hidden from Jón until he has reviewed too, so he cannot answer it.
    expect((await bookingAs(jon, bookingId)).review).toEqual({
      closesAt,
      mine: null,
      theirs: null,
    });
    expect(await storedReviews(bookingId)).toEqual([
      expect.objectContaining({
        authorId: gunna.userId,
        subjectId: jon.userId,
        authorRole: "passenger",
        revealedAt: null,
        hiddenAt: null,
      }),
    ]);

    await later(60, jon, gunna);
    const second = await reviewed(jon, bookingId, { rating: 4 });
    expect(second).toEqual({
      closesAt,
      mine: { rating: 4, comment: "", sentAt: api.now().toISOString(), revealed: true },
      theirs: { rating: 5, comment: "Lovely trip.", sentAt: first.mine?.sentAt },
    });
    expect((await bookingAs(gunna, bookingId)).review).toEqual({
      closesAt,
      mine: { ...first.mine, revealed: true },
      theirs: { rating: 4, comment: "", sentAt: second.mine?.sentAt },
    });
    expect((await storedReviews(bookingId)).map((row) => row.revealedAt)).toEqual([
      api.now(),
      api.now(),
    ]);
    expect(await eventsOf(bookingId)).toEqual([
      "BookingCompleted",
      "ReviewRevealed",
      "ReviewRevealed",
    ]);
  });

  it("is refused before the booking completes, and has nothing to show then", async () => {
    const { gunna, bookingId } = await onTheTrip();
    expect(await review(gunna, bookingId, { rating: 5 })).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "not_completed" },
    });
    expect((await bookingAs(gunna, bookingId)).review).toBeNull();
    expect(await storedReviews(bookingId)).toEqual([]);
  });

  it("takes the same review again as sent, and never another: a review is not changed", async () => {
    const { gunna, bookingId } = await afterTheTrip();
    const first = await reviewed(gunna, bookingId, { rating: 3, comment: "Late." });
    await later(60, gunna);
    expect(await reviewed(gunna, bookingId, { rating: 3, comment: "Late." })).toEqual(first);
    expect(await review(gunna, bookingId, { rating: 5, comment: "Late." })).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "already_reviewed" },
    });
    expect(await storedReviews(bookingId)).toHaveLength(1);
  });

  it("can be written until 14 days after completion, and not at that moment", async () => {
    const { jon, gunna, bookingId, completesAt } = await afterTheTrip();
    await until(completesAt, 14 * 24 * 60 - 1, jon, gunna);
    expect(await review(gunna, bookingId, { rating: 5 })).toMatchObject({ ok: true });
    await later(60, jon, gunna);
    expect(await review(jon, bookingId, { rating: 5 })).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "review_window_closed" },
    });
  });

  it("takes 1 to 5 stars and up to 500 characters, without phone numbers, email addresses or links", async () => {
    const { jon, gunna, bookingId } = await afterTheTrip();
    expect(await review(gunna, bookingId, { rating: 0 })).toMatchObject({
      status: 400,
      error: { code: "validation_failed" },
    });
    expect(await review(gunna, bookingId, { rating: 5, comment: "x".repeat(501) })).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "comment", issue: "too_long" }] },
    });
    expect(
      await review(gunna, bookingId, { rating: 5, comment: "Call me on 555 1234" }),
    ).toMatchObject({
      status: 400,
      error: {
        code: "validation_failed",
        details: [{ path: "comment", issue: "contact_details" }],
      },
    });
    // Counted as people see them: 500 letters with accents fit.
    expect(await review(jon, bookingId, { rating: 5, comment: "á".repeat(500) })).toMatchObject({
      ok: true,
    });
  });

  it("is only the booking's passenger's and driver's", async () => {
    const { bookingId } = await afterTheTrip();
    const stranger = await newMember("Siggi");
    expect(await review(stranger, bookingId, { rating: 1 })).toMatchObject({
      ok: false,
      status: 404,
      error: { code: "not_found" },
    });
  });

  it("waits while the passenger's report that the driver didn't come is open", async () => {
    const { jon, gunna, bookingId } = await afterTheTrip();
    const reported = await api.client.call(reportDriverAbsentRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
      body: {},
    });
    if (!reported.ok) throw new Error(reported.error.code);
    for (const member of [jon, gunna]) {
      expect(await review(member, bookingId, { rating: 5 })).toMatchObject({
        ok: false,
        status: 409,
        error: { code: "report_open" },
      });
    }
  });

  it("is refused about a former member, who has left PuffinRide", async () => {
    const { jon, bookingId } = await afterTheTrip();
    await api.connection.db
      .update(schema.bookings)
      .set({ passengerId: schema.formerMemberId })
      .where(eq(schema.bookings.id, bookingId));
    expect(await review(jon, bookingId, { rating: 5 })).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "person_left" },
    });
  });
});

describe("when a review shows (R8.9)", () => {
  it("shows a review nobody answered 14 days after completion, once", async () => {
    const { jon, gunna, bookingId, completesAt } = await afterTheTrip();
    await reviewed(gunna, bookingId, { rating: 2, comment: "Rude." });
    await until(completesAt, 14 * 24 * 60 - 1, jon, gunna);
    expect(await minuteJob()).toBe(0);
    await later(60 * 60, jon, gunna);
    expect(await minuteJob()).toBe(1);
    expect(await minuteJob()).toBe(0);
    expect((await bookingAs(jon, bookingId)).review?.theirs).toMatchObject({
      rating: 2,
      comment: "Rude.",
    });
    expect((await bookingAs(gunna, bookingId)).review?.mine?.revealed).toBe(true);
    // Shown as of the 14 days, however late the job ran.
    expect((await storedReviews(bookingId))[0]?.revealedAt).toEqual(at(completesAt, 14 * 24 * 60));
    expect(await eventsOf(bookingId)).toEqual(["BookingCompleted", "ReviewRevealed"]);
  });

  it("never shows a review the operator hid", async () => {
    const { jon, gunna, bookingId } = await afterTheTrip();
    await reviewed(gunna, bookingId, { rating: 1, comment: "Awful." });
    await api.connection.db
      .update(reviews)
      .set({ hiddenAt: api.now() })
      .where(eq(reviews.bookingId, bookingId));
    await reviewed(jon, bookingId, { rating: 5 });
    expect((await bookingAs(jon, bookingId)).review?.theirs).toBeNull();
  });

  it("keeps reviews hidden while a report is open, and removes them when the driver's absence stands", async () => {
    const { jon, gunna, bookingId, completesAt } = await afterTheTrip();
    await reviewed(jon, bookingId, { rating: 5 });
    const reported = await api.client.call(reportDriverAbsentRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
      body: {},
    });
    if (!reported.ok) throw new Error(reported.error.code);
    const contested = await api.client.call(answerDisputeRoute, {
      accessToken: jon.accessToken,
      params: { id: reported.data.id },
      body: { answer: "contested" },
    });
    expect(contested).toMatchObject({ ok: true });

    await until(completesAt, 15 * 24 * 60, jon, gunna);
    expect(await minuteJob()).toBe(0);
    await decide(reported.data.id, "stands");
    expect(await storedReviews(bookingId)).toEqual([]);
    expect((await bookingAs(jon, bookingId)).review).toBeNull();
  });

  it("removes the reviews of a booking whose driver agreed they didn't come", async () => {
    const { jon, gunna, bookingId } = await afterTheTrip();
    await reviewed(jon, bookingId, { rating: 4 });
    const reported = await api.client.call(reportDriverAbsentRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
      body: {},
    });
    if (!reported.ok) throw new Error(reported.error.code);
    await api.client.call(answerDisputeRoute, {
      accessToken: jon.accessToken,
      params: { id: reported.data.id },
      body: { answer: "agreed" },
    });
    expect(await storedReviews(bookingId)).toEqual([]);
  });

  it("opens reviews for a ride the operator found happened, as of the trip's completion", async () => {
    const { jon, gunna, bookingId, completesAt } = await afterTheTrip();
    const reported = await api.client.call(reportDriverAbsentRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
      body: {},
    });
    if (!reported.ok) throw new Error(reported.error.code);
    await api.client.call(answerDisputeRoute, {
      accessToken: jon.accessToken,
      params: { id: reported.data.id },
      body: { answer: "contested" },
    });
    await decide(reported.data.id, "rode");
    expect(await eventsOf(bookingId)).toEqual(["BookingCompleted"]);
    expect(await reviewed(gunna, bookingId, { rating: 4 })).toMatchObject({
      closesAt: new Date(completesAt.getTime() + 14 * dayMs).toISOString(),
    });
  });
});

describe("asking for reviews (spec 8, 3.7.6 and 3.9)", () => {
  it("asks each passenger and, once for the trip, the driver when the trip completes", async () => {
    const { jon, gunna, bookingId, completesAt } = await onTheTrip();
    const siggi = await newMember("Siggi");
    const other = await booked(siggi.accessToken, airport, { fromStop: 1, toStop: 3 });
    await paid(siggi.accessToken, other.id);
    for (const member of [jon, gunna, siggi]) await withDevice(member);

    await until(completesAt, 1, jon, gunna, siggi);
    await minuteJob();
    expect(await eventsOf(bookingId)).toEqual(["BookingCompleted"]);
    await worker().runOnce();
    expect(await toldTo(gunna)).toEqual(["rate_trip"]);
    expect(await toldTo(siggi)).toEqual(["rate_trip"]);
    expect(await toldTo(jon)).toEqual(["rate_trip_driver"]);
    expect(pushedTo(gunna)).toEqual([
      {
        title: "How was your trip?",
        body: "Rate the driver: Jón. Hlemmur – Fjörður shopping centre · Saturday 14 November at 05:30.",
        path: `/bookings/${bookingId}/rate`,
      },
    ]);
    expect(pushedTo(jon)).toEqual([
      {
        title: "How was your trip?",
        body: "Rate your passengers. It helps other drivers choose.",
        path: `/drive/trips/${airport}`,
      },
    ]);
    // One reminder each, 3 days after completion.
    const waiting = await api.connection.db
      .select({ kind: scheduledNotifications.kind, runAt: scheduledNotifications.runAt })
      .from(scheduledNotifications)
      .where(inArray(scheduledNotifications.kind, ["rate_trip", "rate_trip_driver"]))
      .orderBy(asc(scheduledNotifications.kind));
    const reminderAt = new Date(completesAt.getTime() + 3 * dayMs);
    expect(waiting).toEqual([
      { kind: "rate_trip", runAt: reminderAt },
      { kind: "rate_trip", runAt: reminderAt },
      { kind: "rate_trip_driver", runAt: reminderAt },
    ]);
  });

  it("reminds after 3 days only those who have not reviewed", async () => {
    const { jon, gunna, bookingId, completesAt } = await onTheTrip();
    const siggi = await newMember("Siggi");
    const other = await booked(siggi.accessToken, airport, { fromStop: 1, toStop: 3 });
    await paid(siggi.accessToken, other.id);
    await until(completesAt, 1, jon, gunna, siggi);
    await minuteJob();
    await worker().runOnce();
    await reviewed(gunna, bookingId, { rating: 5 });
    // Jón has reviewed Gunna but not Siggi, so he is reminded.
    await reviewed(jon, bookingId, { rating: 5 });

    await until(completesAt, 3 * 24 * 60, jon, gunna, siggi);
    await worker().runOnce();
    expect(await toldTo(gunna)).toEqual(["rate_trip", "review_visible"]);
    expect(await toldTo(siggi)).toEqual(["rate_trip", "rate_trip"]);
    expect(await toldTo(jon)).toEqual(["rate_trip_driver", "review_visible", "rate_trip_driver"]);
  });

  it("does not remind a driver who has reviewed every passenger", async () => {
    const { jon, gunna, bookingId, completesAt } = await afterTheTrip();
    await worker().runOnce();
    await reviewed(jon, bookingId, { rating: 5 });
    await until(completesAt, 3 * 24 * 60, jon, gunna);
    await worker().runOnce();
    expect(await toldTo(jon)).toEqual(["rate_trip_driver"]);
    expect(await toldTo(gunna)).toEqual(["rate_trip", "rate_trip"]);
  });

  it("emails each side without push when the trip completes and once more, with the rating link (spec 20, 3.1)", async () => {
    const { jon, gunna, bookingId, completesAt } = await onTheTrip();
    await withEmail(gunna, "gunna-reviews@example.com");
    await withEmail(jon, "jon-reviews@example.com");

    await until(completesAt, 1, jon, gunna);
    await minuteJob();
    await worker().runOnce();
    const asked = {
      subject: "How was your trip?",
      link: `Open in PuffinRide: ${webAppUrl}/bookings/${bookingId}/rate`,
    };
    const askedDriver = {
      subject: "How was your trip?",
      link: `Open in PuffinRide: ${webAppUrl}/drive/trips/${airport}`,
    };
    expect(emailedTo("gunna-reviews@example.com")).toEqual([asked]);
    expect(emailedTo("jon-reviews@example.com")).toEqual([askedDriver]);

    await until(completesAt, 3 * 24 * 60, jon, gunna);
    await worker().runOnce();
    expect(emailedTo("gunna-reviews@example.com")).toEqual([asked, asked]);
    expect(emailedTo("jon-reviews@example.com")).toEqual([askedDriver, askedDriver]);
  });

  it("emails nobody with push, nor anyone with trip reminders off (spec 20, 3.1)", async () => {
    const { jon, gunna, completesAt } = await onTheTrip();
    await withEmail(gunna, "gunna-pushed@example.com");
    await withEmail(jon, "jon-off@example.com");
    await withDevice(gunna);
    await setPreferences(api.connection.db, jon.userId, { reminders: false }, api.now());

    await until(completesAt, 1, jon, gunna);
    await minuteJob();
    await worker().runOnce();
    await until(completesAt, 3 * 24 * 60, jon, gunna);
    await worker().runOnce();
    expect(await toldTo(gunna)).toEqual(["rate_trip", "rate_trip"]);
    expect(pushedTo(gunna)).toHaveLength(2);
    expect(emailedTo("gunna-pushed@example.com")).toEqual([]);
    expect(await toldTo(jon)).toEqual([]);
    expect(emailedTo("jon-off@example.com")).toEqual([]);
  });

  it("follows the trip reminders switch", async () => {
    const { jon, gunna, completesAt } = await onTheTrip();
    await setPreferences(api.connection.db, gunna.userId, { reminders: false }, api.now());
    await until(completesAt, 1, jon, gunna);
    await minuteJob();
    await worker().runOnce();
    await until(completesAt, 3 * 24 * 60, jon, gunna);
    await worker().runOnce();
    expect(await toldTo(gunna)).toEqual([]);
    expect(await toldTo(jon)).toEqual(["rate_trip_driver", "rate_trip_driver"]);
  });

  it("tells the person a review is about once it shows", async () => {
    const { jon, gunna, bookingId } = await afterTheTrip();
    await withDevice(jon);
    await worker().runOnce();
    await reviewed(gunna, bookingId, { rating: 5 });
    await worker().runOnce();
    expect(await toldTo(jon)).toEqual(["rate_trip_driver"]);
    await reviewed(jon, bookingId, { rating: 5 });
    await worker().runOnce();
    expect(await toldTo(jon)).toEqual(["rate_trip_driver", "review_visible"]);
    expect(await toldTo(gunna)).toEqual(["rate_trip", "review_visible"]);
    expect(pushedTo(jon).at(-1)).toEqual({
      title: "A review about you is now visible",
      body: "Hlemmur – Fjörður shopping centre · Saturday 14 November at 05:30.",
      path: `/drive/trips/${airport}`,
    });
  });

  it("asks about a ride the operator found happened while the 14 days are open", async () => {
    const { jon, gunna, bookingId, completesAt } = await onTheTrip();
    const disputeId = await contestedAbsence(jon, gunna, bookingId);
    // The trip completes; Gunna's booking waits for the decision.
    await until(completesAt, 1, jon, gunna);
    await minuteJob();
    await worker().runOnce();
    expect(await toldTo(gunna)).toEqual([]);

    await until(completesAt, 2 * 24 * 60, jon, gunna);
    await decide(disputeId, "rode");
    await worker().runOnce();
    expect(await toldTo(gunna)).toEqual(["rate_trip"]);
    expect(await toldTo(jon)).toEqual(["rate_trip_driver"]);
  });

  it("asks nobody about a ride the operator found happened after the 14 days", async () => {
    const { jon, gunna, bookingId, completesAt } = await onTheTrip();
    const disputeId = await contestedAbsence(jon, gunna, bookingId);
    await until(completesAt, 1, jon, gunna);
    await minuteJob();

    await until(completesAt, 15 * 24 * 60, jon, gunna);
    await decide(disputeId, "rode");
    expect(await eventsOf(bookingId)).toEqual(["BookingCompleted"]);
    await worker().runOnce();
    expect(await toldTo(gunna)).toEqual([]);
    expect(await toldTo(jon)).toEqual([]);
  });

  it("asks nobody to rate a person who is leaving PuffinRide", async () => {
    const { jon, gunna, completesAt } = await onTheTrip();
    await leaving(jon);
    await until(completesAt, 1, jon, gunna);
    await minuteJob();
    await worker().runOnce();
    await until(completesAt, 3 * 24 * 60, jon, gunna);
    await worker().runOnce();
    expect(await toldTo(gunna)).toEqual([]);
  });

  it("does not remind anyone to rate a person who has since asked to leave", async () => {
    const { jon, gunna, completesAt } = await afterTheTrip();
    await worker().runOnce();
    expect(await toldTo(jon)).toEqual(["rate_trip_driver"]);
    await leaving(gunna);
    await until(completesAt, 3 * 24 * 60, jon, gunna);
    await worker().runOnce();
    expect(await toldTo(jon)).toEqual(["rate_trip_driver"]);
  });

  it("asks nobody about a booking whose reviews a driver absence removed", async () => {
    const { jon, gunna, bookingId } = await afterTheTrip();
    const reported = await api.client.call(reportDriverAbsentRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
      body: {},
    });
    if (!reported.ok) throw new Error(reported.error.code);
    await api.client.call(answerDisputeRoute, {
      accessToken: jon.accessToken,
      params: { id: reported.data.id },
      body: { answer: "agreed" },
    });
    await worker().runOnce();
    expect(await toldTo(gunna)).not.toContain("rate_trip");
    const reminders = await api.connection.db
      .select({ id: scheduledNotifications.id })
      .from(scheduledNotifications)
      .where(
        and(
          eq(scheduledNotifications.bookingId, bookingId),
          eq(scheduledNotifications.kind, "rate_trip"),
        ),
      );
    expect(reminders).toEqual([]);
  });
});
