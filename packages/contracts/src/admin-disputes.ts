import {
  disputeAnswers,
  disputeKinds,
  disputeNoteMaxLength,
  disputeOutcomes,
} from "@shareride/domain";
import { z } from "zod";
import { chatMessageSchema } from "./chat.ts";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { localisedTextSchema } from "./meeting-points.ts";
import { defineRoute } from "./route.ts";

// The operator console's Disputes page (spec 8, 3.5; milestone 7, PR 5c):
// the contested reports on the trip day, what the system knows about each,
// and the operator's decision. The rules for a decision are in the domain
// (`checkDecision`); the notes are the operator's only (spec 8, section 7).

/** Waiting for the operator (contested and open), or decided by an operator. */
export const adminDisputeStates = ["waiting", "decided"] as const;

/** Error codes of the console's dispute routes, as `checkDecision` gives them. */
export const adminDisputeErrorCodes = [
  /** Only a report the other side contested reaches the operator (3.5). */
  "not_contested",
  /** A report is decided once. */
  "already_decided",
  /** Each kind has its own outcomes (decisions 4 and 5). */
  "outcome_invalid",
] as const;

const errors = { schema: errorResponseSchema } as const;

/** One side of the booking; a former member's first name is null (spec 11, 3.5). */
const adminDisputePersonSchema = z.object({
  userId: z.uuid(),
  firstName: z.string().nullable(),
});

const adminDisputeStopSchema = z.object({
  name: localisedTextSchema,
  plannedAt: timestampSchema.nullable(),
});

export const adminDisputeListItemSchema = z.object({
  id: z.uuid(),
  /** `no_show`: the driver marked the passenger; `driver_absent`: the passenger said the driver didn't come. */
  kind: z.enum(disputeKinds),
  raisedAt: timestampSchema,
  answeredAt: timestampSchema.nullable(),
  outcome: z.enum(disputeOutcomes).nullable(),
  decidedAt: timestampSchema.nullable(),
  driver: adminDisputePersonSchema,
  passenger: adminDisputePersonSchema,
  /** Where the passenger gets in and out. */
  from: adminDisputeStopSchema,
  to: adminDisputeStopSchema,
});

export type AdminDisputeListItem = z.infer<typeof adminDisputeListItemSchema>;

/** A stop of the trip, in order, with when the driver said "I'm here" there. */
export const adminDisputeTripStopSchema = adminDisputeStopSchema.extend({
  driverHereAt: timestampSchema.nullable(),
  /** The passenger gets in here. */
  boards: z.boolean(),
  /** The passenger gets out here. */
  alights: z.boolean(),
});

/** A report with what the system knows (3.5): notes, answer, planned and "I'm here" times. */
export const adminDisputeSchema = adminDisputeListItemSchema.extend({
  bookingId: z.uuid(),
  tripId: z.uuid(),
  seats: z.int().positive(),
  /** The reporter's note; empty for none. */
  note: z.string(),
  answer: z.enum(disputeAnswers).nullable(),
  /** The answer's note; empty for none. */
  answerNote: z.string(),
  /** The other side could answer until then (R8.6). */
  answerBy: timestampSchema,
  decidedBy: z.enum(["system", "operator"]).nullable(),
  /** Why the operator decided as they did; empty for the system's. */
  decisionNote: z.string(),
  /** When the passenger said "I'm here", at their stop. */
  passengerHereAt: timestampSchema.nullable(),
  stops: z.array(adminDisputeTripStopSchema),
  /** What the operator can decide for this kind, while it waits (decisions 4 and 5). */
  outcomes: z.array(z.enum(disputeOutcomes)),
});

export type AdminDispute = z.infer<typeof adminDisputeSchema>;

export const adminDecideDisputeBodySchema = z.object({
  outcome: z.enum(disputeOutcomes),
  // Twice the limit, as the API counts characters as the database does (code points).
  note: z.string().max(disputeNoteMaxLength * 2),
});

export type AdminDecideDisputeBody = z.infer<typeof adminDecideDisputeBodySchema>;

/**
 * A message of the booking's conversation as the operator reads it: who
 * sent it, the driver or the passenger, and what it says. System lines are
 * worded as for the driver, so `by: "me"` is the driver.
 */
export const adminConversationMessageSchema = chatMessageSchema
  .pick({ id: true, kind: true, text: true, quick: true, system: true, sentAt: true })
  .extend({ from: z.enum(["driver", "passenger", "system"]) });

export type AdminConversationMessage = z.infer<typeof adminConversationMessageSchema>;

export const adminDisputesRoute = defineRoute({
  method: "get",
  path: "/admin/v1/disputes",
  summary: "Contested reports waiting for a decision, oldest first, or the last ones decided",
  tags: ["admin", "disputes"],
  auth: "operator",
  request: { query: z.object({ state: z.enum(adminDisputeStates).default("waiting") }) },
  responses: {
    200: {
      description: "The reports",
      schema: z.object({ disputes: z.array(adminDisputeListItemSchema) }),
    },
    400: { description: "validation_failed: an unknown state", ...errors },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminDisputeRoute = defineRoute({
  method: "get",
  path: "/admin/v1/disputes/{id}",
  summary: "One report with what the system knows",
  tags: ["admin", "disputes"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: { description: "The report", schema: adminDisputeSchema },
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found", ...errors },
  },
});

export const adminDecideDisputeRoute = defineRoute({
  method: "post",
  path: "/admin/v1/disputes/{id}/decision",
  summary: "Decide a contested report; both sides are told",
  tags: ["admin", "disputes"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }), body: adminDecideDisputeBodySchema },
  responses: {
    200: { description: "The report, decided", schema: adminDisputeSchema },
    400: { description: "validation_failed: the note is too long", ...errors },
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found", ...errors },
    409: { description: adminDisputeErrorCodes.join(", "), ...errors },
  },
});

export const adminDisputeConversationRoute = defineRoute({
  method: "get",
  path: "/admin/v1/disputes/{id}/conversation",
  summary: "The booking's conversation, for a contested report only; each opening is logged (R9.6)",
  tags: ["admin", "disputes"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: "The messages, oldest first; none once the conversation is deleted",
      schema: z.object({ messages: z.array(adminConversationMessageSchema) }),
    },
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found", ...errors },
    409: {
      description: "not_contested: nobody contested the report, so its conversation stays closed",
      ...errors,
    },
  },
});
