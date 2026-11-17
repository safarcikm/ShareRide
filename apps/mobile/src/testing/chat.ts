// Conversations as the API returns them, and a fake chat server, for screen
// tests. Not used by the app itself.
import type { Booking, ChatMessage, Conversation, SendMessageBody } from "@shareride/contracts";
import { ok, type FakeClient } from "./fake-client";
import { paidBooking } from "./bookings";

/** A message ID; `n` orders them. */
export const messageId = (n: number) => `0190a1d6-0000-7000-8000-${String(n).padStart(12, "0")}`;

/** A text from the other person, unless `changes` say otherwise. */
export function chatMessage(changes: Partial<ChatMessage> & Pick<ChatMessage, "id">): ChatMessage {
  return {
    from: "them",
    kind: "text",
    text: "Hi!",
    quick: null,
    system: null,
    clientId: null,
    sentAt: "2026-11-14T12:00:00.000Z",
    readAt: null,
    ...changes,
  };
}

/** "Booking confirmed. You can message each other here." */
export const openedLine = chatMessage({
  id: messageId(1),
  from: "system",
  kind: "system",
  text: null,
  system: { key: "opened" },
  sentAt: "2026-11-14T11:50:00.000Z",
});

export function conversationOf(
  booking: Booking,
  changes: Partial<Conversation> = {},
): Conversation {
  return {
    booking,
    closesAt: "2026-11-22T12:05:00.000Z",
    canWrite: true,
    blockedByMe: false,
    unread: 0,
    lastMessage: null,
    ...changes,
  };
}

/** The passenger's confirmed booking with Anna, with the message sent with the request. */
export const chatBooking = { ...paidBooking, message: "One small bag." };

const order = (a: ChatMessage, b: ChatMessage) =>
  Date.parse(a.sentAt) - Date.parse(b.sentAt) || a.id.localeCompare(b.id);

/**
 * One booking's conversation on the fake server: pages of messages, newest
 * first, 50 at a time; sending, with a retry of a client ID answered by the
 * same message; and reading. `nextSends` answer the next sends instead, such
 * as a failure, and `holdNextFetch` keeps the next page back until released.
 * The test adds the other person's messages with `receive`.
 */
export function chatServer(
  client: FakeClient,
  start: {
    booking?: Booking;
    messages?: readonly ChatMessage[];
    canWrite?: boolean;
    blockedByMe?: boolean;
  } = {},
) {
  const booking = start.booking ?? chatBooking;
  let count = 100;
  const server = {
    messages: [...(start.messages ?? [openedLine])],
    canWrite: start.canWrite ?? true,
    /** I blocked the other person (R9.4). */
    blockedByMe: start.blockedByMe ?? false,
    /** Answers the next sends, oldest first, in place of the server. */
    nextSends: [] as ((body: SendMessageBody) => unknown)[],
    /** While set, the next page waits for it. */
    gate: null as Promise<void> | null,
    /** The next page is made now and answers once the returned function is called. */
    holdNextFetch() {
      let release: () => void = () => undefined;
      server.gate = new Promise((resolve) => {
        release = resolve;
      });
      return () => {
        release();
      };
    },
    /** Each time the clock in the messages moves on, a minute. */
    sentAt: Date.parse("2026-11-14T12:00:00.000Z"),
    receive(changes: Partial<ChatMessage>) {
      count += 1;
      server.sentAt += 60_000;
      const message = chatMessage({
        id: messageId(count),
        sentAt: new Date(server.sentAt).toISOString(),
        ...changes,
      });
      server.messages.push(message);
      return message;
    },
    /** The other person opens the conversation: my messages are seen. */
    readMine() {
      server.messages = server.messages.map((message) =>
        message.from === "me" && message.readAt === null
          ? { ...message, readAt: new Date(server.sentAt).toISOString() }
          : message,
      );
    },
  };
  client.answer(
    "/v1/bookings/{id}/messages",
    (input) => {
      const { before } = input["query"] as { before?: string };
      const newest = [...server.messages].sort(order).reverse();
      const from = before === undefined ? 0 : newest.findIndex((m) => m.id === before) + 1;
      const page = newest.slice(from, from + 50);
      const unread = server.messages.filter((m) => m.from === "them" && m.readAt === null).length;
      const answer = ok(200, {
        conversation: conversationOf(booking, {
          canWrite: server.canWrite,
          blockedByMe: server.blockedByMe,
          unread,
        }),
        messages: page,
        hasMore: newest.length > from + 50,
      });
      const { gate } = server;
      if (gate === null) return answer;
      server.gate = null;
      return gate.then(() => answer);
    },
    "get",
  );
  client.answer(
    "/v1/bookings/{id}/messages",
    (input) => {
      const body = input["body"] as SendMessageBody;
      const sent = server.messages.find((m) => m.from === "me" && m.clientId === body.clientId);
      if (sent !== undefined) return ok(200, sent);
      const answer = server.nextSends.shift();
      if (answer !== undefined) return answer(body);
      const message = server.receive({
        from: "me",
        clientId: body.clientId,
        ...("text" in body
          ? { kind: "text", text: body.text.trim() }
          : { kind: "quick", text: null, quick: body.quick as ChatMessage["quick"] }),
      });
      return ok(201, message);
    },
    "post",
  );
  client.answer("/v1/bookings/{id}/messages/read", (input) => {
    const { upTo } = input["body"] as { upTo: string };
    const last = server.messages.find((m) => m.id === upTo);
    server.messages = server.messages.map((message) =>
      message.from === "them" && last !== undefined && order(message, last) <= 0
        ? { ...message, readAt: last.sentAt }
        : message,
    );
    return ok(204);
  });
  return server;
}

/** The calls made to one route, by method and path, with their input. */
export function callsTo(client: FakeClient, path: string, has: (input: object) => boolean) {
  return client.calls.filter((call) => call.path === path && has(call.input));
}
