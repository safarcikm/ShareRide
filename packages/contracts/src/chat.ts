import { cancelReasons, lateMinutes, quickMessageKeys } from "@shareride/domain";
import { z } from "zod";
import { bookingSchema } from "./bookings.ts";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// The chat (spec 7, 3.1 and 3.2): one conversation per confirmed booking,
// between its driver and passenger only (R7.1, R7.3).

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "unauthenticated", ...errors } as const;
const notFound = {
  description: "not_found: no such booking of yours, or on your trip",
  ...errors,
} as const;
const notConfirmed = {
  description:
    "not_confirmed: the booking is not confirmed, so it has no conversation yet; chat_closed: read-only since `closesAt` (R7.1)",
  ...errors,
} as const;
const tooMany = {
  description: "too_many_messages: more than 10 messages in a minute (R7.5)",
  ...errors,
} as const;

/** Checked by the domain (1 to 1 000 characters, R7.2); this only bounds the body. */
const maxTextInRequest = 4000;

export const quickMessageSchema = z.union([
  z.object({ key: z.literal("late"), minutes: z.literal(lateMinutes) }),
  z.object({ key: z.enum(quickMessageKeys).exclude(["late"]) }),
]);

/** A text or a quick message, with an ID the app makes for each message (a retry sends it once). */
export const sendMessageBodySchema = z.union([
  z.strictObject({ clientId: z.uuid(), text: z.string().max(maxTextInRequest) }),
  z.strictObject({
    clientId: z.uuid(),
    quick: z.strictObject({ key: z.string().max(40), minutes: z.int().optional() }),
  }),
]);

export type SendMessageBody = z.input<typeof sendMessageBodySchema>;

/**
 * A message as one of the two people sees it. Quick messages and system
 * lines come as keys, for the app to put into its language (R7.2).
 */
export const chatMessageSchema = z.object({
  id: z.uuid(),
  /** Mine, the other person's, or a line about the booking. */
  from: z.enum(["me", "them", "system"]),
  kind: z.enum(["text", "quick", "system"]),
  /** A text message's text, as written. */
  text: z.string().nullable(),
  quick: quickMessageSchema.nullable(),
  /** A line about the booking: opened, or cancelled by me or them, with the reason (spec 6). */
  system: z
    .discriminatedUnion("key", [
      z.object({ key: z.literal("opened") }),
      z.object({
        key: z.literal("cancelled"),
        by: z.enum(["me", "them"]),
        reason: z.enum(cancelReasons),
      }),
    ])
    .nullable(),
  /** On my messages: the ID the app sent it with. */
  clientId: z.uuid().nullable(),
  sentAt: timestampSchema,
  /** On my messages: when the other person read it ("Seen"). */
  readAt: timestampSchema.nullable(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const conversationSchema = z.object({
  /**
   * The booking, as its passenger or driver sees it: who the other person
   * is, the part and its times, and the request message (`message`), shown
   * at the top of the conversation (spec 7, 3.1, item 1).
   */
  booking: bookingSchema,
  /** Read-only from then on (R7.1). */
  closesAt: timestampSchema,
  canWrite: z.boolean(),
  /** The other person's messages I have not read. */
  unread: z.int().nonnegative(),
  lastMessage: chatMessageSchema.nullable(),
});

export type Conversation = z.infer<typeof conversationSchema>;

export const myConversationsRoute = defineRoute({
  method: "get",
  path: "/v1/me/conversations",
  summary: "My conversations, the latest message first, with unread counts (spec 7, 3.1, item 9)",
  tags: ["chat"],
  auth: true,
  responses: {
    200: {
      description: "My conversations, and the unread total for the badge",
      schema: z.object({
        conversations: z.array(conversationSchema),
        unread: z.int().nonnegative(),
      }),
    },
    401: unauthenticated,
  },
});

const bookingParams = z.object({ id: z.uuid() });

/** Messages per page. */
export const messagesPageSize = 50;

export const conversationMessagesRoute = defineRoute({
  method: "get",
  path: "/v1/bookings/{id}/messages",
  summary: "A booking's conversation and its messages, newest first, a page at a time",
  tags: ["chat"],
  auth: true,
  request: {
    params: bookingParams,
    query: z.object({
      /** The oldest message of the last page: the page before it. */
      before: z.uuid().optional(),
    }),
  },
  responses: {
    200: {
      description: "The conversation, and up to 50 messages before `before`, newest first",
      schema: z.object({
        conversation: conversationSchema,
        messages: z.array(chatMessageSchema),
        hasMore: z.boolean(),
      }),
    },
    401: unauthenticated,
    404: {
      description: "not_found: no such booking of yours, or `before` is not in it",
      ...errors,
    },
    409: notConfirmed,
  },
});

export const sendMessageRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/messages",
  summary: "Send a text or quick message to the other person (R7.2)",
  tags: ["chat"],
  auth: true,
  request: { params: bookingParams, body: sendMessageBodySchema },
  responses: {
    200: { description: "The message this client ID already sent", schema: chatMessageSchema },
    201: { description: "Sent", schema: chatMessageSchema },
    400: {
      description:
        "validation_failed: the text (`empty`, `too_long`), the quick message (`unknown_quick_message`, `invalid_minutes`), or a `clientId` already used for another message (`reused`)",
      ...errors,
    },
    401: unauthenticated,
    404: notFound,
    409: notConfirmed,
    429: tooMany,
  },
});

export const readMessagesRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/messages/read",
  summary: "Mark the other person's messages read, up to and with this one",
  tags: ["chat"],
  auth: true,
  request: { params: bookingParams, body: z.object({ upTo: z.uuid() }) },
  responses: {
    204: { description: "Read" },
    401: unauthenticated,
    404: { description: "not_found: no such booking of yours, or `upTo` is not in it", ...errors },
    409: notConfirmed,
  },
});

export const messageAllPassengersRoute = defineRoute({
  method: "post",
  path: "/v1/trips/{id}/messages",
  summary:
    "The driver sends the same message to every confirmed passenger, each in their own conversation (R7.4)",
  tags: ["chat"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: sendMessageBodySchema },
  responses: {
    200: {
      description:
        "The conversations it reached; a retry with the same client ID sends nothing more and gives the number the first one reached",
      schema: z.object({ sent: z.int().nonnegative() }),
    },
    400: {
      description:
        "validation_failed: as for one message; a `clientId` used for a message outside this trip is `reused`",
      ...errors,
    },
    401: unauthenticated,
    404: { description: "not_found: no such published trip of yours", ...errors },
    429: tooMany,
  },
});
