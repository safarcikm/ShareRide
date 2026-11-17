import { randomUUID } from "node:crypto";
import {
  bookingRoute,
  changeTripRoute,
  conversationMessagesRoute,
  copyTripRoute,
  getMeRoute,
  messageAllPassengersRoute,
  myConversationsRoute,
  myNoticesRoute,
  sendMessageRoute,
  tripDetailsRoute,
  updateMeRoute,
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
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { createNotificationWorker } from "../notifications/worker.ts";
import { collectExport } from "../privacy/export-data.ts";
import { choicesOf } from "../trips/drafts.ts";
import { createModerationService, type Moderator } from "./actions.ts";

// Content ShareRide hides, and a trip it cancels, as the console will call
// them (spec 9, 3.4.3): a message, a review, a trip's note or About you;
// each with its notice and audit entry, and the content shown again when an
// appeal reverses it. The sample trips at the test clock (Friday 13 November
// 2026, noon): Jón drives Hlemmur to Keflavík Airport on Saturday at 05:30
// (instant booking).

let api: TestApi;
const { airport } = sampleTrip;
const request: AuditRequest = { ipAddress: "203.0.113.9", userAgent: "Console test" };
const reason = "Rude words about another member.";

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
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

const moderation = () => createModerationService({ db: api.connection.db, clock: () => api.now() });

async function moderator(): Promise<Moderator> {
  const { userId, sessionId } = await api.signInOperator();
  return { userId, sessionId };
}

/**
 * The audit entries about `subjectId`; with `actionId`, only the one of that
 * moderation action, as the log keeps the entries of earlier tests.
 */
async function auditOf(subjectId: string, actionId?: string) {
  const rows = await api.connection.db
    .select({
      action: schema.auditLog.action,
      subjectType: schema.auditLog.subjectType,
      after: schema.auditLog.after,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.subjectId, subjectId))
    .orderBy(asc(schema.auditLog.createdAt), asc(schema.auditLog.id));
  return actionId === undefined
    ? rows
    : rows.filter((row) => row.after?.["moderationActionId"] === actionId);
}

async function events(...types: string[]) {
  return api.connection.db
    .select({ kind: schema.outboxEvents.kind, payload: schema.outboxEvents.payload })
    .from(schema.outboxEvents)
    .where(inArray(schema.outboxEvents.kind, types))
    .orderBy(asc(schema.outboxEvents.id));
}

async function noticesOf(member: Member) {
  const result = await api.client.call(myNoticesRoute, { accessToken: member.accessToken });
  if (!result.ok) throw new Error(result.error.code);
  return result.data.notices;
}

/** Jón drives the airport trip and Gunna has a confirmed seat, so they can talk. */
async function ride() {
  const jon = await driverOf(airport, "Jón");
  const gunna = await newMember("Gunna");
  const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
  await paid(gunna.accessToken, booking.id);
  return { jon, gunna, bookingId: booking.id };
}

async function said(member: Member, bookingId: string, text: string) {
  const sent = await api.client.call(sendMessageRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    body: { clientId: randomUUID(), text },
  });
  if (!sent.ok) throw new Error(sent.error.code);
  return sent.data.id;
}

async function messagesOf(member: Member, bookingId: string) {
  const result = await api.client.call(conversationMessagesRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    query: {},
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.data.messages;
}

async function noteShown(tripId: string) {
  const result = await api.client.call(tripDetailsRoute, {
    params: { id: tripId },
    query: { fromStop: 0, toStop: 1, seats: 1 },
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.data.note;
}

/** The person's appeal of the action, straight in the database, then the operator's answer. */
async function appealed(by: Moderator, actionId: string, outcome: "upheld" | "reversed") {
  await api.connection.db
    .update(schema.moderationActions)
    .set({ appealText: "Please look again.", appealedAt: api.now() })
    .where(eq(schema.moderationActions.id, actionId));
  const answered = await moderation().answerAppeal(
    by,
    { actionId, outcome, answer: "We read it again." },
    request,
  );
  if (!answered.ok) throw new Error(answered.error.code);
}

async function withNote(tripId: string, note: string) {
  await api.connection.db.update(schema.trips).set({ note }).where(eq(schema.trips.id, tripId));
}

describe("hiding a message (spec 9, 3.4.3)", () => {
  it("shows both people that ShareRide removed it, and tells the sender why", async () => {
    const { jon, gunna, bookingId } = await ride();
    const messageId = await said(jon, bookingId, "Something rude");
    const by = await moderator();

    const hidden = await moderation().hideContent(
      by,
      { content: { kind: "message", id: messageId }, rule: "offensive", reason },
      request,
    );

    if (!hidden.ok) throw new Error(hidden.error.code);
    for (const member of [jon, gunna]) {
      const shown = (await messagesOf(member, bookingId)).find((line) => line.id === messageId);
      expect(shown).toMatchObject({ kind: "text", text: null, removed: true });
      const list = await api.client.call(myConversationsRoute, {
        accessToken: member.accessToken,
      });
      if (!list.ok) throw new Error(list.error.code);
      expect(list.data.conversations[0]?.lastMessage).toMatchObject({ text: null, removed: true });
    }
    // Others' messages stay as they were.
    const fine = await said(gunna, bookingId, "See you at five");
    expect((await messagesOf(jon, bookingId)).find((line) => line.id === fine)).toMatchObject({
      text: "See you at five",
      removed: false,
    });
    expect(await noticesOf(jon)).toMatchObject([
      {
        id: hidden.value.actionId,
        kind: "content_hidden",
        rule: "offensive",
        reason,
        content: { kind: "message" },
        canAppeal: true,
      },
    ]);
    expect(await events("ModerationActionTaken")).toEqual([
      { kind: "ModerationActionTaken", payload: { actionId: hidden.value.actionId } },
    ]);
    // Who acted and what changed, never the words (spec 9, section 7).
    expect(await auditOf(messageId)).toEqual([
      {
        action: "message.hidden",
        subjectType: "message",
        after: { fields: ["hiddenAt"], moderationActionId: hidden.value.actionId },
      },
    ]);
  });

  it("sends no push of a message removed before it went out", async () => {
    const { jon, gunna, bookingId } = await ride();
    const { db } = api.connection;
    const [session] = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, gunna.userId));
    if (session === undefined) throw new Error("No session.");
    await db.insert(schema.pushTokens).values({
      sessionId: session.id,
      userId: gunna.userId,
      platform: "ios",
      token: `ExponentPushToken[${gunna.userId}]`,
    });
    const push = createFakePushSender();
    const worker = createNotificationWorker({ db, clock: () => api.now(), push });
    // What the booking itself sent first.
    await worker.runOnce();
    const before = push.sent.length;
    const messageId = await said(jon, bookingId, "Something rude");
    await moderation().hideContent(
      await moderator(),
      { content: { kind: "message", id: messageId }, rule: "offensive", reason },
      request,
    );

    await worker.runOnce();

    expect(push.sent.slice(before)).toEqual([]);
    const deliveries = await db
      .select({
        status: schema.notificationDeliveries.status,
        reason: schema.notificationDeliveries.reason,
      })
      .from(schema.notificationDeliveries)
      .innerJoin(
        schema.notifications,
        eq(schema.notifications.id, schema.notificationDeliveries.notificationId),
      )
      .where(eq(schema.notifications.messageId, messageId));
    expect(deliveries).toEqual([{ status: "skipped", reason: "no_longer_applies" }]);
  });

  it("keeps the sender's own words in their data, and the other person's export says removed", async () => {
    const { jon, gunna, bookingId } = await ride();
    const messageId = await said(jon, bookingId, "Something rude");
    await moderation().hideContent(
      await moderator(),
      { content: { kind: "message", id: messageId }, rule: "offensive", reason },
      request,
    );

    const conversations = async (member: Member) =>
      (await collectExport(api.connection.db, member.userId, api.now())).sections.conversations;
    expect(await conversations(jon)).toEqual([
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ text: "Something rude", removedByShareRide: true }),
        ]) as unknown,
      }),
    ]);
    expect(await conversations(gunna)).toEqual([
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            from: "Jón",
            text: "Removed by ShareRide",
            key: null,
            params: null,
            removedByShareRide: true,
          }),
        ]) as unknown,
      }),
    ]);
    expect(JSON.stringify(await conversations(gunna))).not.toContain("Something rude");
    // The notice names what it concerned (R9.5).
    const data = await collectExport(api.connection.db, jon.userId, api.now());
    expect(data.sections.notices).toEqual([
      expect.objectContaining({ kind: "content_hidden", content: "message" }),
    ]);
  });

  it("hides a message to all passengers in every conversation it went to, as one", async () => {
    const { jon, gunna, bookingId } = await ride();
    const siggi = await newMember("Siggi");
    const other = await booked(siggi.accessToken, airport, { fromStop: 0, toStop: 1 });
    await paid(siggi.accessToken, other.id);
    const sent = await api.client.call(messageAllPassengersRoute, {
      accessToken: jon.accessToken,
      params: { id: airport },
      body: { clientId: randomUUID(), text: "Something rude to you all" },
    });
    expect(sent).toMatchObject({ data: { sent: 2 } });
    const [reported] = (await messagesOf(gunna, bookingId)).filter((line) => line.from === "them");
    if (reported === undefined) throw new Error("No message.");
    const by = await moderator();

    const hidden = await moderation().hideContent(
      by,
      { content: { kind: "message", id: reported.id }, rule: "offensive", reason },
      request,
    );

    if (!hidden.ok) throw new Error(hidden.error.code);
    const [copy] = (await messagesOf(siggi, other.id)).filter((line) => line.from === "them");
    expect(copy).toMatchObject({ text: null, removed: true });
    expect(await auditOf(reported.id)).toEqual([
      {
        action: "message.hidden",
        subjectType: "message",
        after: {
          fields: ["hiddenAt"],
          moderationActionId: hidden.value.actionId,
          copies: [copy?.id],
        },
      },
    ]);
    // One notice for one message, and the copy cannot be hidden again.
    expect(await noticesOf(jon)).toHaveLength(1);
    expect(
      await moderation().hideContent(
        by,
        { content: { kind: "message", id: copy?.id ?? "" }, rule: "offensive", reason },
        request,
      ),
    ).toEqual({ ok: false, error: { code: "already_hidden" } });
    await appealed(by, hidden.value.actionId, "reversed");
    expect((await messagesOf(siggi, other.id)).filter((line) => line.from === "them")).toEqual([
      expect.objectContaining({ text: "Something rude to you all", removed: false }),
    ]);
  });

  it("refuses hiding it twice, a line of ShareRide's, and what does not exist", async () => {
    const { jon, bookingId } = await ride();
    const messageId = await said(jon, bookingId, "Something rude");
    const by = await moderator();
    const hide = (id: string) =>
      moderation().hideContent(
        by,
        { content: { kind: "message", id }, rule: "offensive", reason },
        request,
      );
    expect((await hide(messageId)).ok).toBe(true);
    expect(await hide(messageId)).toEqual({ ok: false, error: { code: "already_hidden" } });
    const [system] = await api.connection.db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(eq(schema.messages.kind, "system"));
    if (system === undefined) throw new Error("No system line.");
    expect(await hide(system.id)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await hide(randomUUID())).toEqual({ ok: false, error: { code: "not_found" } });
    expect(
      await moderation().hideContent(
        by,
        {
          content: { kind: "message", id: messageId },
          rule: "offensive",
          reason: reason,
          reportId: randomUUID(),
        },
        request,
      ),
    ).toEqual({ ok: false, error: { code: "not_found" } });
    expect(
      await moderation().hideContent(
        by,
        { content: { kind: "message", id: messageId }, rule: "offensive", reason: " " },
        request,
      ),
    ).toEqual({ ok: false, error: { code: "reason_missing" } });
    expect(await events("ModerationActionTaken")).toHaveLength(1);
  });

  it("shows it again when an appeal reverses it, and not when the decision stands", async () => {
    const { jon, bookingId } = await ride();
    const kept = await said(jon, bookingId, "Something rude");
    const back = await said(jon, bookingId, "A joke, taken wrong");
    const by = await moderator();
    const hide = async (id: string) => {
      const hidden = await moderation().hideContent(
        by,
        { content: { kind: "message", id }, rule: "offensive", reason },
        request,
      );
      if (!hidden.ok) throw new Error(hidden.error.code);
      return hidden.value.actionId;
    };
    const keptAction = await hide(kept);
    const backAction = await hide(back);
    for (const actionId of [keptAction, backAction]) {
      await api.connection.db
        .update(schema.moderationActions)
        .set({ appealText: "Please look again.", appealedAt: api.now() })
        .where(eq(schema.moderationActions.id, actionId));
    }

    await moderation().answerAppeal(
      by,
      { actionId: keptAction, outcome: "upheld", answer: "It breaks the rules." },
      request,
    );
    await moderation().answerAppeal(
      by,
      { actionId: backAction, outcome: "reversed", answer: "We read it again." },
      request,
    );

    const lines = await messagesOf(jon, bookingId);
    expect(lines.find((line) => line.id === kept)).toMatchObject({ removed: true, text: null });
    expect(lines.find((line) => line.id === back)).toMatchObject({
      removed: false,
      text: "A joke, taken wrong",
    });
    expect((await auditOf(backAction)).at(-1)).toEqual({
      action: "moderation_action.appeal_answered",
      subjectType: "moderation_action",
      after: {
        fields: ["appealAnswer", "appealOutcome", "appealAnsweredAt"],
        contentShown: { kind: "message", id: back, fields: ["hiddenAt"] },
      },
    });
    expect((await auditOf(keptAction)).at(-1)?.after).toEqual({
      fields: ["appealAnswer", "appealOutcome", "appealAnsweredAt"],
    });
  });
});

describe("hiding a trip's note (spec 9, 3.4.3)", () => {
  it("hides it from passengers until the driver writes a new one", async () => {
    const jon = await driverOf(airport, "Jón");
    await withNote(airport, "Rude words");
    const hidden = await moderation().hideContent(
      await moderator(),
      { content: { kind: "trip_note", id: airport }, rule: "offensive", reason },
      request,
    );
    if (!hidden.ok) throw new Error(hidden.error.code);

    expect(await noteShown(airport)).toBe("");
    expect(await noticesOf(jon)).toMatchObject([
      { kind: "content_hidden", content: { kind: "trip_note" } },
    ]);
    expect(await auditOf(airport, hidden.value.actionId)).toEqual([
      {
        action: "trip.note_hidden",
        subjectType: "trip",
        after: { fields: ["noteHiddenAt"], moderationActionId: hidden.value.actionId },
      },
    ]);

    const [trip] = await api.connection.db
      .select()
      .from(schema.trips)
      .where(eq(schema.trips.id, airport));
    if (trip === undefined) throw new Error("No trip.");
    const { preferences } = choicesOf(trip);
    const change = (note: string, childSeat = preferences.childSeat) =>
      api.client.call(changeTripRoute, {
        accessToken: jon.accessToken,
        params: { id: airport },
        query: { preview: false },
        body: { kind: "details", preferences: { ...preferences, childSeat }, note },
      });
    // Other details change; the same note stays hidden.
    expect((await change("Rude words", !preferences.childSeat)).ok).toBe(true);
    expect(await noteShown(airport)).toBe("");
    expect((await change("Two bags each, please")).ok).toBe(true);
    expect(await noteShown(airport)).toBe("Two bags each, please");
  });

  it("leaves a hidden note out when the driver posts the trip again", async () => {
    const jon = await driverOf(airport, "Jón");
    await withNote(airport, "Rude words");
    const copy = async () => {
      const result = await api.client.call(copyTripRoute, {
        accessToken: jon.accessToken,
        params: { id: airport },
        query: {},
        body: {},
      });
      if (!result.ok) throw new Error(result.error.code);
      return result.data.trip.note;
    };
    expect(await copy()).toBe("Rude words");
    await moderation().hideContent(
      await moderator(),
      { content: { kind: "trip_note", id: airport }, rule: "offensive", reason },
      request,
    );
    expect(await copy()).toBe("");
  });

  it("shows a note again on appeal only while it is still the one hidden", async () => {
    await driverOf(airport, "Jón");
    const by = await moderator();
    const hide = async () => {
      const hidden = await moderation().hideContent(
        by,
        { content: { kind: "trip_note", id: airport }, rule: "offensive", reason },
        request,
      );
      if (!hidden.ok) throw new Error(hidden.error.code);
      return hidden.value.actionId;
    };
    await withNote(airport, "First rude note");
    const first = await hide();
    // The driver writes a new note, which the operator hides too.
    await api.connection.db
      .update(schema.trips)
      .set({ note: "Second rude note", noteHiddenAt: null })
      .where(eq(schema.trips.id, airport));
    const second = await hide();

    await appealed(by, first, "reversed");
    expect(await noteShown(airport)).toBe("");
    expect((await auditOf(first)).at(-1)?.after).toEqual({
      fields: ["appealAnswer", "appealOutcome", "appealAnsweredAt"],
    });

    await appealed(by, second, "reversed");
    expect(await noteShown(airport)).toBe("Second rude note");
  });

  it("refuses a trip with no note, hiding it twice and a draft", async () => {
    const by = await moderator();
    const hide = () =>
      moderation().hideContent(
        by,
        { content: { kind: "trip_note", id: airport }, rule: "offensive", reason },
        request,
      );
    await withNote(airport, "");
    expect(await hide()).toEqual({ ok: false, error: { code: "not_found" } });
    await withNote(airport, "Rude words");
    expect((await hide()).ok).toBe(true);
    expect(await hide()).toEqual({ ok: false, error: { code: "already_hidden" } });
    await api.connection.db
      .update(schema.trips)
      .set({ status: "draft", noteHiddenAt: null })
      .where(eq(schema.trips.id, airport));
    expect(await hide()).toEqual({ ok: false, error: { code: "not_found" } });
  });
});

describe("hiding About you (spec 9, 3.4.3)", () => {
  it("marks it hidden until the person writes a new one, which they still read as theirs", async () => {
    const jon = await newMember("Jón");
    const update = (about: string) =>
      api.client.call(updateMeRoute, { accessToken: jon.accessToken, body: { about } });
    expect((await update("Rude words")).ok).toBe(true);
    const by = await moderator();
    const hide = () =>
      moderation().hideContent(
        by,
        { content: { kind: "about", id: jon.userId }, rule: "offensive", reason },
        request,
      );
    const hiddenAt = async () => {
      const [row] = await api.connection.db
        .select({ at: schema.users.aboutHiddenAt })
        .from(schema.users)
        .where(eq(schema.users.id, jon.userId));
      return row?.at ?? null;
    };

    const hidden = await hide();

    if (!hidden.ok) throw new Error(hidden.error.code);
    expect(await hiddenAt()).toEqual(api.now());
    expect(await hide()).toEqual({ ok: false, error: { code: "already_hidden" } });
    expect(await auditOf(jon.userId)).toEqual([
      {
        action: "user.about_hidden",
        subjectType: "user",
        after: { fields: ["aboutHiddenAt"], moderationActionId: hidden.value.actionId },
      },
    ]);
    expect(await api.client.call(getMeRoute, { accessToken: jon.accessToken })).toMatchObject({
      data: { about: "Rude words" },
    });
    // Saving the profile with the same text, as the form does, keeps it hidden.
    expect(
      (
        await api.client.call(updateMeRoute, {
          accessToken: jon.accessToken,
          body: { about: "Rude words", firstName: "Jónsi" },
        })
      ).ok,
    ).toBe(true);
    expect(await hiddenAt()).toEqual(api.now());
    expect((await update("I like quiet drives")).ok).toBe(true);
    expect(await hiddenAt()).toBeNull();
  });

  it("shows About you again when an appeal reverses it", async () => {
    const jon = await newMember("Jón");
    await api.client.call(updateMeRoute, {
      accessToken: jon.accessToken,
      body: { about: "A joke, taken wrong" },
    });
    const by = await moderator();
    const hidden = await moderation().hideContent(
      by,
      { content: { kind: "about", id: jon.userId }, rule: "offensive", reason },
      request,
    );
    if (!hidden.ok) throw new Error(hidden.error.code);
    await appealed(by, hidden.value.actionId, "reversed");
    const [row] = await api.connection.db
      .select({ at: schema.users.aboutHiddenAt })
      .from(schema.users)
      .where(eq(schema.users.id, jon.userId));
    expect(row?.at).toBeNull();
  });

  it("refuses an empty About you", async () => {
    const jon = await newMember("Jón");
    expect(
      await moderation().hideContent(
        await moderator(),
        { content: { kind: "about", id: jon.userId }, rule: "offensive", reason },
        request,
      ),
    ).toEqual({ ok: false, error: { code: "not_found" } });
  });
});

describe("hiding a review (spec 9, 3.4.3)", () => {
  /** Gunna's review of Jón after the airport ride, shown already. */
  async function review(comment: string) {
    const { jon, gunna, bookingId } = await ride();
    const [row] = await api.connection.db
      .insert(schema.reviews)
      .values({
        bookingId,
        authorId: gunna.userId,
        subjectId: jon.userId,
        authorRole: "passenger",
        rating: 1,
        comment,
        revealedAt: api.now(),
      })
      .returning({ id: schema.reviews.id });
    if (row === undefined) throw new Error("No review.");
    return { jon, gunna, reviewId: row.id };
  }

  async function reviewHiddenAt(reviewId: string) {
    const [row] = await api.connection.db
      .select({ at: schema.reviews.hiddenAt })
      .from(schema.reviews)
      .where(eq(schema.reviews.id, reviewId));
    return row?.at ?? null;
  }

  it("hides it, and tells its author why", async () => {
    const { gunna, reviewId } = await review("Rude words about the driver");
    const by = await moderator();
    const hide = () =>
      moderation().hideContent(
        by,
        { content: { kind: "review", id: reviewId }, rule: "offensive", reason },
        request,
      );

    const hidden = await hide();

    if (!hidden.ok) throw new Error(hidden.error.code);
    expect(await reviewHiddenAt(reviewId)).toEqual(api.now());
    expect(await hide()).toEqual({ ok: false, error: { code: "already_hidden" } });
    expect(await noticesOf(gunna)).toMatchObject([
      {
        id: hidden.value.actionId,
        kind: "content_hidden",
        rule: "offensive",
        reason,
        content: { kind: "review" },
        canAppeal: true,
      },
    ]);
    // Who acted and what changed, never the words (spec 9, section 7).
    expect(await auditOf(reviewId)).toEqual([
      {
        action: "review.hidden",
        subjectType: "review",
        after: { fields: ["hiddenAt"], moderationActionId: hidden.value.actionId },
      },
    ]);
  });

  it("shows it again when an appeal reverses it, and not when the decision stands", async () => {
    const by = await moderator();
    for (const outcome of ["upheld", "reversed"] as const) {
      const { reviewId } = await review(`A joke, taken wrong (${outcome})`);
      const hidden = await moderation().hideContent(
        by,
        { content: { kind: "review", id: reviewId }, rule: "offensive", reason },
        request,
      );
      if (!hidden.ok) throw new Error(hidden.error.code);
      await appealed(by, hidden.value.actionId, outcome);
      expect(await reviewHiddenAt(reviewId)).toEqual(outcome === "reversed" ? null : api.now());
    }
  });

  it("hides one whose author's account is erased, telling nobody", async () => {
    const { reviewId } = await review("Rude words, then the account was deleted");
    // Erasure keeps the review under the former member (spec 11).
    await api.connection.db
      .update(schema.reviews)
      .set({ authorId: schema.formerMemberId })
      .where(eq(schema.reviews.id, reviewId));

    const hidden = await moderation().hideContent(
      await moderator(),
      { content: { kind: "review", id: reviewId }, rule: "offensive", reason },
      request,
    );

    if (!hidden.ok) throw new Error(hidden.error.code);
    expect(await reviewHiddenAt(reviewId)).toEqual(api.now());
    const [action] = await api.connection.db
      .select({ userId: schema.moderationActions.userId })
      .from(schema.moderationActions)
      .where(eq(schema.moderationActions.id, hidden.value.actionId));
    expect(action).toEqual({ userId: null });
  });

  it("refuses a review that does not exist", async () => {
    expect(
      await moderation().hideContent(
        await moderator(),
        { content: { kind: "review", id: randomUUID() }, rule: "offensive", reason },
        request,
      ),
    ).toEqual({ ok: false, error: { code: "not_found" } });
  });
});

describe("ShareRide cancelling a trip (spec 9, 3.4.3)", () => {
  it("cancels it with full refunds, off the driver's reliability, and tells the driver why", async () => {
    const { jon, gunna, bookingId } = await ride();
    const by = await moderator();

    const cancelled = await moderation().cancelTrip(
      by,
      { tripId: airport, rule: "safety", reason, countsOnReliability: false },
      request,
    );

    if (!cancelled.ok) throw new Error(cancelled.error.code);
    const [trip] = await api.connection.db
      .select()
      .from(schema.trips)
      .where(eq(schema.trips.id, airport));
    expect(trip).toMatchObject({
      status: "cancelled",
      cancelledBy: "operator",
      countsOnReliability: false,
    });
    const booking = await api.client.call(bookingRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
    });
    expect(booking).toMatchObject({
      data: { status: "cancelled", cancellation: { by: "operator", reason: null } },
    });
    expect(await noticesOf(jon)).toMatchObject([
      {
        id: cancelled.value.actionId,
        kind: "trip_cancelled",
        rule: "safety",
        reason,
        content: { kind: "trip" },
      },
    ]);
    // The passenger is told it was cancelled, never why (R9.10).
    expect(await noticesOf(gunna)).toEqual([]);
    expect(await auditOf(airport, cancelled.value.actionId)).toEqual([
      {
        action: "trip.cancelled",
        subjectType: "trip",
        after: {
          fields: ["status", "cancelledAt", "cancelledBy", "countsOnReliability"],
          moderationActionId: cancelled.value.actionId,
          cancelledBookings: [bookingId],
        },
      },
    ]);
  });

  it("counts it on the driver's reliability when the operator says so, with a passenger on it", async () => {
    await ride();
    const cancelled = await moderation().cancelTrip(
      await moderator(),
      { tripId: airport, rule: "reliability", reason, countsOnReliability: true },
      request,
    );
    expect(cancelled.ok).toBe(true);
    const [trip] = await api.connection.db
      .select({ counts: schema.trips.countsOnReliability })
      .from(schema.trips)
      .where(eq(schema.trips.id, airport));
    expect(trip?.counts).toBe(true);
  });

  it("refuses a trip cancelled already, one that has left, and one that does not exist", async () => {
    await driverOf(airport, "Jón");
    const by = await moderator();
    const cancel = (tripId: string) =>
      moderation().cancelTrip(
        by,
        { tripId, rule: "safety", reason, countsOnReliability: false },
        request,
      );
    expect((await cancel(airport)).ok).toBe(true);
    expect(await cancel(airport)).toEqual({ ok: false, error: { code: "already_cancelled" } });
    expect(await cancel(randomUUID())).toEqual({ ok: false, error: { code: "not_found" } });
    await freshSampleTrips(api);
    await api.connection.db
      .update(schema.trips)
      .set({ status: "departed" })
      .where(eq(schema.trips.id, airport));
    expect(await cancel(airport)).toEqual({ ok: false, error: { code: "trip_not_cancellable" } });
    expect(await events("ModerationActionTaken")).toHaveLength(1);
  });
});
