import {
  disputeAnswers,
  disputeKinds,
  disputeNoteMaxLength,
  disputeOutcomes,
} from "@shareride/domain";
import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// The trip day (spec 8, 3.1 and 3.2): "I'm here" at a stop.

const errors = { schema: errorResponseSchema } as const;

/** "I'm here" as stored: the stop and the time, never a location (R8.3). */
export const checkInSchema = z.object({
  stopId: z.uuid(),
  checkedInAt: timestampSchema,
});

export type CheckIn = z.infer<typeof checkInSchema>;

const checkInResponses = {
  200: {
    description: "The check-in; a repeat answers with the first one and tells nobody again",
    schema: checkInSchema,
  },
  401: { description: "unauthenticated", ...errors },
  409: {
    description:
      "check_in_not_open, with opensAt: more than 30 minutes before the stop; check_in_closed: more than 60 minutes after it; not_confirmed: the booking is not confirmed; trip_not_running: the trip is not published or under way",
    ...errors,
  },
} as const;

export const passengerCheckInRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/check-in",
  summary: "The passenger's \"I'm here\" at their boarding stop; the driver is told (R8.3)",
  tags: ["trip day"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: z.object({}) },
  responses: {
    ...checkInResponses,
    404: { description: "not_found: no such booking of yours", ...errors },
  },
});

export const driverCheckInRoute = defineRoute({
  method: "post",
  path: "/v1/trips/{id}/stops/{stopId}/check-in",
  summary: "The driver's \"I'm here\" at a stop; each passenger getting in there is told (R8.3)",
  tags: ["trip day"],
  auth: true,
  request: { params: z.object({ id: z.uuid(), stopId: z.uuid() }), body: z.object({}) },
  responses: {
    ...checkInResponses,
    404: { description: "not_found: no such stop on a trip of yours", ...errors },
  },
});

// Reports on the trip day (spec 8, 3.3 to 3.5): the driver marks a no-show,
// or the passenger says the driver didn't come; the other side answers.

/**
 * A report on a booking, as both sides see it: what was reported and when,
 * the answer, and how it ended. The notes are the operator's only (spec 8,
 * section 7), so they are never here.
 */
export const disputeSchema = z.object({
  id: z.uuid(),
  kind: z.enum(disputeKinds),
  raisedAt: timestampSchema,
  /** The other side can answer until then (R8.6): the passenger, a no-show; the driver, the driver's absence. */
  answerBy: timestampSchema,
  answer: z.enum(disputeAnswers).nullable(),
  answeredAt: timestampSchema.nullable(),
  /** Null while it is open: unanswered, or contested and waiting for the operator. */
  outcome: z.enum(disputeOutcomes).nullable(),
  /** `system` when agreed or unanswered in time, `operator` when contested (3.5). */
  decidedBy: z.enum(["system", "operator"]).nullable(),
  decidedAt: timestampSchema.nullable(),
});

export type Dispute = z.infer<typeof disputeSchema>;

// Twice the limit, as the API counts characters as the database does (code points).
const disputeNote = z
  .string()
  .max(disputeNoteMaxLength * 2)
  .optional();

/** A report's note for the operator, optional. */
export const reportBodySchema = z.object({ note: disputeNote });

export type ReportBody = z.input<typeof reportBodySchema>;

const reportResponses = {
  200: {
    description:
      "The report; a repeat answers with the first one and tells nobody again (spec 8, 3.3 and 3.4)",
    schema: disputeSchema,
  },
  400: { description: "validation_failed: the note (`too_long`)", ...errors },
  401: { description: "unauthenticated", ...errors },
} as const;

export const markNoShowRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/no-show",
  summary:
    "The driver marks a confirmed passenger as a no-show; the passenger is told and can answer (R8.4)",
  tags: ["trip day"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: reportBodySchema },
  responses: {
    ...reportResponses,
    404: { description: "not_found: no such booking on a trip of yours", ...errors },
    409: {
      description:
        "not_confirmed; already_reported: the passenger has said the driver didn't come, so the driver answers that instead; trip_completed; no_show_too_early, with allowedAt: before the 10-minute wait after the stop's time; driver_not_checked_in: say \"I'm here\" at that stop first",
      ...errors,
    },
  },
});

export const reportDriverAbsentRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/driver-absent",
  summary: "The passenger says the driver didn't come; the driver is told and can answer (R8.5)",
  tags: ["trip day"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: reportBodySchema },
  responses: {
    ...reportResponses,
    404: { description: "not_found: no such booking of yours", ...errors },
    409: {
      description:
        "not_boarding: the booking is not confirmed or completed; already_reported: the driver has marked a no-show, so the passenger answers that instead; report_too_early, with allowedAt: before the 10-minute wait after the stop's time; report_too_late: more than 24 hours after the trip completed",
      ...errors,
    },
  },
});

export const answerDisputeBodySchema = z.object({
  /** "That's right" or "That's not right" (spec 8, section 8). */
  answer: z.enum(disputeAnswers),
  note: disputeNote,
});

export type AnswerDisputeBody = z.input<typeof answerDisputeBodySchema>;

export const answerDisputeRoute = defineRoute({
  method: "post",
  path: "/v1/disputes/{id}/answer",
  summary:
    "The other side agrees, and the report stands, or contests it for the operator to decide (R8.6)",
  tags: ["trip day"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: answerDisputeBodySchema },
  responses: {
    200: {
      description: "The report with its answer; the same answer again changes nothing",
      schema: disputeSchema,
    },
    400: { description: "validation_failed: the note (`too_long`)", ...errors },
    401: { description: "unauthenticated", ...errors },
    404: { description: "not_found: no such report for you to answer", ...errors },
    409: {
      description:
        "already_answered: with the other answer; already_decided: it stood once the time to answer passed; answer_window_closed",
      ...errors,
    },
  },
});
