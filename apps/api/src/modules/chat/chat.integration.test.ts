import { randomUUID } from "node:crypto";
import {
  acceptRequestRoute,
  conversationMessagesRoute,
  declineRequestRoute,
  messageAllPassengersRoute,
  myConversationsRoute,
  readMessagesRoute,
  sendMessageRoute,
  type SendMessageBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { cleanUpConversations } from "./clean-up.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon): Jón
// drives Hlemmur to Keflavík Airport on Saturday at 05:30 (2 seats, instant)
// and Anna drives BSÍ to Hof, Akureyri on Saturday at 09:00 (approval).

let api: TestApi;

const { airport, north } = sampleTrip;

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

const { newMember, later, rewind, driverOf, details, booked, paid } = bookingHelpers(() => api);

/** A driver and a passenger with a paid booking on the airport trip. */
async function confirmedBooking(passengerName = "Gunna", driver?: Member) {
  const jon = driver ?? (await driverOf(airport, "Jón"));
  const passenger = await newMember(passengerName);
  const booking = await booked(passenger.accessToken, airport, { fromStop: 0, toStop: 1 });
  await paid(passenger.accessToken, booking.id);
  return { jon, passenger, bookingId: booking.id };
}

function page(member: Member, bookingId: string, before?: string) {
  return api.client.call(conversationMessagesRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    query: before === undefined ? {} : { before },
  });
}

async function messagesOf(member: Member, bookingId: string) {
  const result = await page(member, bookingId);
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

function send(member: Member, bookingId: string, body: Partial<SendMessageBody> = {}) {
  const message = "quick" in body || "text" in body ? body : { text: "Hello", ...body };
  return api.client.call(sendMessageRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    body: { clientId: randomUUID(), ...message } as SendMessageBody,
  });
}

async function sent(member: Member, bookingId: string, body: Partial<SendMessageBody> = {}) {
  const result = await send(member, bookingId, body);
  if (!result.ok) throw new Error(`${String(result.status)} ${result.error.code}`);
  return result.data;
}

function messageAll(member: Member, tripId: string, body: SendMessageBody) {
  return api.client.call(messageAllPassengersRoute, {
    accessToken: member.accessToken,
    params: { id: tripId },
    body,
  });
}

async function arrivalOf(tripId: string) {
  const trip = await details(tripId);
  return new Date(trip.stops.at(-1)?.plannedAt ?? "");
}

const dayMs = 24 * 3600 * 1000;
const secondsUntil = (moment: Date) => Math.round((moment.getTime() - api.now().getTime()) / 1000);

describe("opening a conversation (R7.1)", () => {
  it("opens one when a booking is paid, with its first line, for both people", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    const mine = await messagesOf(passenger, bookingId);
    expect(mine.conversation).toMatchObject({
      booking: { id: bookingId, status: "confirmed", viewer: "passenger" },
      canWrite: true,
      unread: 0,
      lastMessage: { from: "system", kind: "system", system: { key: "opened" } },
    });
    expect(mine.conversation.closesAt).toBe(
      new Date((await arrivalOf(airport)).getTime() + 7 * dayMs).toISOString(),
    );
    expect(mine.messages).toMatchObject([
      { from: "system", kind: "system", system: { key: "opened" }, text: null, readAt: null },
    ]);
    expect(mine.hasMore).toBe(false);
    const theirs = await messagesOf(jon, bookingId);
    expect(theirs.conversation.booking.viewer).toBe("driver");
    expect(theirs.messages).toHaveLength(1);
  });

  it("opens one for a free instant booking at once", async () => {
    await driverOf(airport, "Jón");
    await api.connection.db
      .update(schema.segments)
      .set({ price: 0 })
      .where(eq(schema.segments.tripId, airport));
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    expect(booking.status).toBe("confirmed");
    expect((await messagesOf(gunna, booking.id)).messages).toHaveLength(1);
  });

  it("opens one when a free request is accepted", async () => {
    const anna = await driverOf(north, "Anna");
    await api.connection.db
      .update(schema.segments)
      .set({ price: 0 })
      .where(eq(schema.segments.tripId, north));
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1, message: "Hi" });
    const accepted = await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: {},
    });
    expect(accepted).toMatchObject({ ok: true, data: { status: "confirmed" } });
    const conversation = await messagesOf(jon, request.id);
    // The request's message is shown at the top (spec 7, 3.1, item 1).
    expect(conversation.conversation.booking.message).toBe("Hi");
    expect(conversation.messages).toHaveLength(1);
  });

  it("has none before the booking is confirmed", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    expect(booking.status).toBe("accepted");
    expect(await page(gunna, booking.id)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "not_confirmed" },
    });
    expect(await send(gunna, booking.id)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "not_confirmed" },
    });
  });

  it("has none for a declined request", async () => {
    const anna = await driverOf(north, "Anna");
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    const declined = await api.client.call(declineRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: {},
    });
    expect(declined).toMatchObject({ ok: true, data: { status: "declined" } });
    for (const member of [jon, anna]) {
      expect(await page(member, request.id)).toMatchObject({
        ok: false,
        status: 409,
        error: { code: "not_confirmed" },
      });
    }
  });
});

describe("who may read and write (R7.3)", () => {
  it("is the booking's passenger and driver only", async () => {
    const { bookingId } = await confirmedBooking();
    const stranger = await newMember("Sigga");
    const otherDriver = await driverOf(north, "Anna");
    for (const member of [stranger, otherDriver]) {
      expect(await page(member, bookingId)).toMatchObject({ ok: false, status: 404 });
      expect(await send(member, bookingId)).toMatchObject({ ok: false, status: 404 });
      const read = await api.client.call(readMessagesRoute, {
        accessToken: member.accessToken,
        params: { id: bookingId },
        body: { upTo: randomUUID() },
      });
      expect(read).toMatchObject({ ok: false, status: 404 });
    }
  });
});

describe("POST /v1/bookings/{id}/messages (R7.2)", () => {
  it("sends a text both people see, each from their side", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    const result = await send(passenger, bookingId, { text: "  I have a large bag  " });
    expect(result).toMatchObject({
      ok: true,
      status: 201,
      data: { from: "me", kind: "text", text: "I have a large bag", quick: null, readAt: null },
    });
    const theirs = await messagesOf(jon, bookingId);
    expect(theirs.messages[0]).toMatchObject({
      from: "them",
      text: "I have a large bag",
      clientId: null,
    });
    expect(theirs.conversation.unread).toBe(1);
  });

  it("stores a quick message as its key, for each reader's language", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await sent(jon, bookingId, { quick: { key: "late", minutes: 10 } });
    await sent(jon, bookingId, { quick: { key: "atPoint" } });
    const mine = await messagesOf(passenger, bookingId);
    expect(mine.messages.slice(0, 2)).toMatchObject([
      { from: "them", kind: "quick", quick: { key: "atPoint" }, text: null },
      { from: "them", kind: "quick", quick: { key: "late", minutes: 10 }, text: null },
    ]);
  });

  it("stores a retry with the same client ID once", async () => {
    const { passenger, bookingId } = await confirmedBooking();
    const clientId = randomUUID();
    const first = await send(passenger, bookingId, { clientId, text: "On my way" });
    const again = await send(passenger, bookingId, { clientId, text: "On my way" });
    expect(first).toMatchObject({ ok: true, status: 201 });
    expect(again).toMatchObject({ ok: true, status: 200 });
    if (!first.ok || !again.ok) return;
    expect(again.data.id).toBe(first.data.id);
    expect(again.data.clientId).toBe(clientId);
    expect((await messagesOf(passenger, bookingId)).messages).toHaveLength(2);
  });

  it("stores two sends of the same message at once only once", async () => {
    const { passenger, bookingId } = await confirmedBooking();
    const clientId = randomUUID();
    const both = await Promise.all([
      send(passenger, bookingId, { clientId, text: "Here" }),
      send(passenger, bookingId, { clientId, text: "Here" }),
    ]);
    expect(both.map((result) => result.status).sort()).toEqual([200, 201]);
    expect((await messagesOf(passenger, bookingId)).messages).toHaveLength(2);
  });

  it.each([
    [{ text: " \n " }, "text", "empty"],
    [{ text: "a".repeat(1001) }, "text", "too_long"],
    [{ quick: { key: "callMe" } }, "quick", "unknown_quick_message"],
    [{ quick: { key: "late", minutes: 20 } }, "quick", "invalid_minutes"],
  ] as const)("refuses %o", async (body, path, issue) => {
    const { passenger, bookingId } = await confirmedBooking();
    expect(await send(passenger, bookingId, body)).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "validation_failed", details: [{ path, issue }] },
    });
  });

  it("takes 1 000 characters", async () => {
    const { passenger, bookingId } = await confirmedBooking();
    expect(await send(passenger, bookingId, { text: "a".repeat(1000) })).toMatchObject({
      ok: true,
      status: 201,
    });
  });

  it("is refused from the moment the conversation closes, and it can still be read", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    const { conversation } = await messagesOf(passenger, bookingId);
    const closesAt = new Date(conversation.closesAt);
    await later(secondsUntil(closesAt) - 60, jon, passenger);
    expect(await send(passenger, bookingId)).toMatchObject({ ok: true, status: 201 });
    await later(60, jon, passenger);
    expect(api.now()).toEqual(closesAt);
    expect(await send(passenger, bookingId)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "chat_closed" },
    });
    const read = await messagesOf(jon, bookingId);
    expect(read.conversation.canWrite).toBe(false);
    expect(read.messages).toHaveLength(2);
  });

  it("refuses an eleventh message within a minute (R7.5), and takes one a minute later", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    for (let count = 0; count < 10; count++) await sent(passenger, bookingId);
    expect(await send(passenger, bookingId)).toMatchObject({
      ok: false,
      status: 429,
      error: { code: "too_many_messages" },
    });
    // The other person is not held back.
    expect(await send(jon, bookingId)).toMatchObject({ ok: true, status: 201 });
    await later(60, jon, passenger);
    expect(await send(passenger, bookingId)).toMatchObject({ ok: true, status: 201 });
  });

  it("counts a retry once towards the limit", async () => {
    const { passenger, bookingId } = await confirmedBooking();
    const clientId = randomUUID();
    for (let count = 0; count < 12; count++) {
      expect(await send(passenger, bookingId, { clientId })).toMatchObject({ ok: true });
    }
  });

  it("refuses a client ID already used in another conversation, so it cannot pass the limit", async () => {
    const one = await confirmedBooking("Gunna");
    const two = await confirmedBooking("Sigga", one.jon);
    const clientId = randomUUID();
    await sent(one.jon, one.bookingId, { clientId, text: "Leaving at 5:30" });
    expect(await send(one.jon, two.bookingId, { clientId, text: "Something else" })).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "validation_failed", details: [{ path: "clientId", issue: "reused" }] },
    });
    expect((await messagesOf(two.passenger, two.bookingId)).messages).toHaveLength(1);
  });
});

describe("POST /v1/bookings/{id}/messages/read (spec 7, 3.1, item 4)", () => {
  it("marks the other person's messages read up to one, which the sender sees as Seen", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    const first = await sent(passenger, bookingId, { text: "One" });
    const second = await sent(passenger, bookingId, { text: "Two" });
    const third = await sent(passenger, bookingId, { text: "Three" });
    await later(5, jon, passenger);
    const read = await api.client.call(readMessagesRoute, {
      accessToken: jon.accessToken,
      params: { id: bookingId },
      body: { upTo: second.id },
    });
    expect(read).toMatchObject({ ok: true, status: 204 });
    const mine = await messagesOf(passenger, bookingId);
    const readAt = (id: string) => mine.messages.find((message) => message.id === id)?.readAt;
    expect(readAt(first.id)).toBe(api.now().toISOString());
    expect(readAt(second.id)).toBe(api.now().toISOString());
    expect(readAt(third.id)).toBeNull();
    expect((await messagesOf(jon, bookingId)).conversation.unread).toBe(1);
  });

  it("never marks the reader's own messages", async () => {
    const { passenger, bookingId } = await confirmedBooking();
    const mine = await sent(passenger, bookingId);
    await api.client.call(readMessagesRoute, {
      accessToken: passenger.accessToken,
      params: { id: bookingId },
      body: { upTo: mine.id },
    });
    expect((await messagesOf(passenger, bookingId)).messages[0]?.readAt).toBeNull();
  });

  it("refuses a message of another conversation", async () => {
    const one = await confirmedBooking("Gunna");
    const two = await confirmedBooking("Sigga", one.jon);
    const elsewhere = await sent(two.passenger, two.bookingId);
    const read = await api.client.call(readMessagesRoute, {
      accessToken: one.jon.accessToken,
      params: { id: one.bookingId },
      body: { upTo: elsewhere.id },
    });
    expect(read).toMatchObject({ ok: false, status: 404 });
    expect((await messagesOf(two.jon, two.bookingId)).conversation.unread).toBe(1);
    // Nor does a page start from one.
    expect(await page(one.jon, one.bookingId, elsewhere.id)).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("never marks a line about the booking read", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    const latest = await sent(passenger, bookingId);
    await api.client.call(readMessagesRoute, {
      accessToken: jon.accessToken,
      params: { id: bookingId },
      body: { upTo: latest.id },
    });
    const lines = await api.connection.db
      .select({ readAt: schema.messages.readAt })
      .from(schema.messages)
      .where(eq(schema.messages.kind, "system"));
    expect(lines).toEqual([{ readAt: null }]);
  });
});

describe("GET /v1/bookings/{id}/messages, page by page", () => {
  it("gives 50 at a time, newest first", async () => {
    const { passenger, bookingId } = await confirmedBooking();
    const [conversation] = await api.connection.db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.bookingId, bookingId));
    const start = api.now().getTime();
    await api.connection.db.insert(schema.messages).values(
      Array.from({ length: 60 }, (_, index) => ({
        conversationId: conversation?.id ?? "",
        senderId: passenger.userId,
        kind: "text",
        body: `Message ${String(index + 1)}`,
        clientId: randomUUID(),
        sentAt: new Date(start + (index + 1) * 1000),
      })),
    );
    const first = await messagesOf(passenger, bookingId);
    expect(first.messages).toHaveLength(50);
    expect(first.messages[0]?.text).toBe("Message 60");
    expect(first.messages[49]?.text).toBe("Message 11");
    expect(first.hasMore).toBe(true);
    const second = await page(passenger, bookingId, first.messages[49]?.id);
    if (!second.ok) throw new Error(second.error.code);
    expect(second.data.messages.map((message) => message.text ?? message.kind)).toEqual([
      ...Array.from({ length: 10 }, (_, index) => `Message ${String(10 - index)}`),
      "system",
    ]);
    expect(second.data.hasMore).toBe(false);
  });
});

describe("GET /v1/me/conversations (spec 7, 3.1, item 9)", () => {
  it("lists my conversations, the latest message first, with unread counts", async () => {
    const one = await confirmedBooking("Gunna");
    const two = await confirmedBooking("Sigga", one.jon);
    await sent(one.passenger, one.bookingId, { text: "First" });
    await later(10, one.jon, one.passenger, two.passenger);
    await sent(two.passenger, two.bookingId, { text: "Second" });
    await sent(two.passenger, two.bookingId, { text: "Third" });
    const result = await api.client.call(myConversationsRoute, {
      accessToken: one.jon.accessToken,
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        unread: 3,
        conversations: [
          {
            booking: { id: two.bookingId, viewer: "driver", passenger: { firstName: "Sigga" } },
            unread: 2,
            lastMessage: { text: "Third", from: "them" },
          },
          {
            booking: { id: one.bookingId, passenger: { firstName: "Gunna" } },
            unread: 1,
            lastMessage: { text: "First" },
          },
        ],
      },
    });
    const gunnas = await api.client.call(myConversationsRoute, {
      accessToken: one.passenger.accessToken,
    });
    expect(gunnas).toMatchObject({
      ok: true,
      data: { unread: 0, conversations: [{ booking: { id: one.bookingId, viewer: "passenger" } }] },
    });
  });
});

describe("POST /v1/trips/{id}/messages (R7.4)", () => {
  it("sends one message into each confirmed passenger's own conversation", async () => {
    const one = await confirmedBooking("Gunna");
    const two = await confirmedBooking("Sigga", one.jon);
    const body = { clientId: randomUUID(), quick: { key: "atPoint" } } as const;
    expect(await messageAll(one.jon, airport, body)).toMatchObject({
      ok: true,
      data: { sent: 2 },
    });
    // A retry adds none.
    expect(await messageAll(one.jon, airport, body)).toMatchObject({ ok: true, data: { sent: 2 } });
    for (const { passenger, bookingId } of [one, two]) {
      const { messages } = await messagesOf(passenger, bookingId);
      expect(messages.map((message) => message.kind)).toEqual(["quick", "system"]);
    }
  });

  it("leaves out passengers who have not paid, and their replies stay apart", async () => {
    const one = await confirmedBooking("Gunna");
    const unpaid = await newMember("Sigga");
    const accepted = await booked(unpaid.accessToken, airport, { fromStop: 1, toStop: 2 });
    expect(
      await messageAll(one.jon, airport, { clientId: randomUUID(), text: "Hi all" }),
    ).toMatchObject({
      ok: true,
      data: { sent: 1 },
    });
    expect(await page(unpaid, accepted.id)).toMatchObject({ ok: false, status: 409 });
    await sent(one.passenger, one.bookingId, { text: "Hi Jón" });
    const conversations = await api.client.call(myConversationsRoute, {
      accessToken: unpaid.accessToken,
    });
    expect(conversations).toMatchObject({ ok: true, data: { conversations: [], unread: 0 } });
  });

  it("is only for the trip's driver", async () => {
    const { passenger } = await confirmedBooking();
    const anna = await driverOf(north, "Anna");
    for (const member of [passenger, anna]) {
      expect(
        await messageAll(member, airport, { clientId: randomUUID(), text: "Hello" }),
      ).toMatchObject({ ok: false, status: 404 });
    }
  });

  it("sends nothing more on a retry, not even to a passenger confirmed since", async () => {
    const one = await confirmedBooking("Gunna");
    const body = { clientId: randomUUID(), text: "Leaving now" };
    expect(await messageAll(one.jon, airport, body)).toMatchObject({ ok: true, data: { sent: 1 } });
    const two = await confirmedBooking("Sigga", one.jon);
    expect(await messageAll(one.jon, airport, body)).toMatchObject({ ok: true, data: { sent: 1 } });
    expect((await messagesOf(two.passenger, two.bookingId)).messages).toHaveLength(1);
  });

  it("sends nothing for a client ID already used for one passenger, so old ones cannot pass the limit", async () => {
    const one = await confirmedBooking("Gunna");
    const used = await sent(one.jon, one.bookingId);
    const other = await confirmedBooking("Sigga", one.jon);
    expect(
      await messageAll(one.jon, airport, { clientId: used.clientId ?? "", text: "Spam" }),
    ).toMatchObject({ ok: true, data: { sent: 1 } });
    expect((await messagesOf(other.passenger, other.bookingId)).messages).toHaveLength(1);
  });

  it("refuses a client ID the driver used on another trip", async () => {
    const one = await confirmedBooking("Gunna");
    // Jón rides on Anna's trip later that morning, and writes to her.
    const anna = await driverOf(north, "Anna");
    const request = await booked(one.jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: {},
    });
    await paid(one.jon.accessToken, request.id);
    const toAnna = await sent(one.jon, request.id);
    expect(
      await messageAll(one.jon, airport, { clientId: toAnna.clientId ?? "", text: "Hi all" }),
    ).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "validation_failed", details: [{ path: "clientId", issue: "reused" }] },
    });
    expect((await messagesOf(one.passenger, one.bookingId)).messages).toHaveLength(1);
  });

  it("leaves out conversations that have closed", async () => {
    const one = await confirmedBooking("Gunna");
    await later(secondsUntil(new Date((await arrivalOf(airport)).getTime() + 7 * dayMs)), one.jon);
    expect(
      await messageAll(one.jon, airport, { clientId: randomUUID(), text: "Thanks all" }),
    ).toMatchObject({ ok: true, data: { sent: 0 } });
  });

  it("counts once towards the driver's limit", async () => {
    const one = await confirmedBooking("Gunna");
    await confirmedBooking("Sigga", one.jon);
    for (let count = 0; count < 9; count++) {
      await messageAll(one.jon, airport, { clientId: randomUUID(), text: "Update" });
    }
    expect(await send(one.jon, one.bookingId)).toMatchObject({ ok: true, status: 201 });
    expect(
      await messageAll(one.jon, airport, { clientId: randomUUID(), text: "Update" }),
    ).toMatchObject({ ok: false, status: 429 });
  });
});

describe("deleting old conversations (privacy register: messages)", () => {
  it("deletes conversations and their messages 12 months after the trip, and keeps newer ones", async () => {
    const { passenger, bookingId } = await confirmedBooking();
    await sent(passenger, bookingId);
    const arrival = await arrivalOf(airport);
    const yearAfter = new Date(arrival);
    yearAfter.setUTCFullYear(yearAfter.getUTCFullYear() + 1);
    const count = async () =>
      (
        await api.connection.db.execute<{ count: number }>(
          sql`select count(*)::int as count from messages`,
        )
      ).rows[0]?.count;
    expect(
      await cleanUpConversations(api.connection.db, new Date(yearAfter.getTime() - 60_000)),
    ).toBe(0);
    expect(await count()).toBe(2);
    expect(await cleanUpConversations(api.connection.db, yearAfter)).toBe(1);
    expect(await count()).toBe(0);
  });
});
