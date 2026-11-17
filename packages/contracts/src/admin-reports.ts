import {
  appealOutcomes,
  bookingStatuses,
  hideableContent,
  moderatedContent,
  moderationActionKinds,
  moderationRules,
  reportCategories,
  reportOutcomes,
  reportStatuses,
  reportSubjects,
  tripStatuses,
} from "@shareride/domain";
import { z } from "zod";
import { adminConversationMessageSchema } from "./admin-disputes.ts";
import { localeSchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { localisedTextSchema } from "./meeting-points.ts";
import { defineRoute } from "./route.ts";

// The operator console's reports, actions and appeals (spec 9, 3.4 to 3.6;
// milestone 9, PR 7). The rules for each action are in the domain
// (`checkStatement`, `checkSuspension`, `checkAppealAnswer`); the reasons
// are written for the person affected, who reads them in their notice.
// Only the operator sees any of this (spec 9, section 7).

export const adminReportStates = ["open", "closed"] as const;
export const adminAppealStates = ["open", "answered"] as const;

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "operator_unauthenticated", ...errors } as const;

/** A member as the console shows them; a deleted account's first name is null. */
export const adminPersonSchema = z.object({
  userId: z.uuid(),
  firstName: z.string().nullable(),
  status: z.enum(["active", "suspended", "deleted"]),
  /** A suspension's end; null for one with no end, and when not suspended. */
  suspendedUntil: timestampSchema.nullable(),
  /** The language their notices are in. */
  locale: localeSchema,
});

export type AdminPerson = z.infer<typeof adminPersonSchema>;

export const adminReportListItemSchema = z.object({
  id: z.uuid(),
  subject: z.enum(reportSubjects),
  category: z.enum(reportCategories),
  /** A safety report: first in the queue (3.4.1). */
  urgent: z.boolean(),
  status: z.enum(reportStatuses),
  outcome: z.enum(reportOutcomes).nullable(),
  filedAt: timestampSchema,
  /** Every report is answered within 24 hours (R9.9). */
  dueAt: timestampSchema,
  closedAt: timestampSchema.nullable(),
  /** Null once their account is deleted. */
  reporter: adminPersonSchema.nullable(),
  /** The person reported: a trip's driver, a message's sender, the other side of a booking. */
  reported: adminPersonSchema.nullable(),
});

export type AdminReportListItem = z.infer<typeof adminReportListItemSchema>;

const stopSchema = z.object({ name: localisedTextSchema, plannedAt: timestampSchema.nullable() });

/** A trip one of the people drove or booked, latest first. */
export const adminRecentTripSchema = z.object({
  tripId: z.uuid(),
  role: z.enum(["driver", "passenger"]),
  status: z.enum(tripStatuses),
  /** The driver's whole route, or the passenger's own part of it. */
  from: stopSchema,
  to: stopSchema,
});

export type AdminRecentTrip = z.infer<typeof adminRecentTripSchema>;

/** An action on a person, with its appeal (3.4.3, 3.4.4). */
export const adminModerationActionSchema = z.object({
  id: z.uuid(),
  kind: z.enum(moderationActionKinds),
  /** The person affected; null once their account is deleted. */
  person: adminPersonSchema.nullable(),
  reportId: z.uuid().nullable(),
  /** Null for a reinstatement. */
  rule: z.enum(moderationRules).nullable(),
  /** As the person reads it in their notice. */
  reason: z.string(),
  content: z.object({ kind: z.enum(moderatedContent), id: z.uuid() }).nullable(),
  /** A suspension's end; null for one with no end, and for every other kind. */
  until: timestampSchema.nullable(),
  at: timestampSchema,
  appeal: z
    .object({
      text: z.string(),
      sentAt: timestampSchema,
      answer: z.string().nullable(),
      outcome: z.enum(appealOutcomes).nullable(),
      answeredAt: timestampSchema.nullable(),
    })
    .nullable(),
});

export type AdminModerationAction = z.infer<typeof adminModerationActionSchema>;

/** What the console knows of one side of a report (3.4.2). */
export const adminReportSideSchema = z.object({
  person: adminPersonSchema,
  /** Other reports they filed, latest first, at most 20. */
  reportsBy: z.array(adminReportListItemSchema),
  /** Other reports about them, latest first, at most 20. */
  reportsAbout: z.array(adminReportListItemSchema),
  /** Trips they drove or held a seat on, latest departure first, at most 10. */
  recentTrips: z.array(adminRecentTripSchema),
  /** Actions on them, latest first, at most 20. */
  actions: z.array(adminModerationActionSchema),
});

/** A report with what the system knows (3.4.2). */
export const adminReportSchema = adminReportListItemSchema.extend({
  /** As the reporter wrote it; empty for none. */
  description: z.string(),
  /** The trip reported, or the one the message or booking was on; null once deleted. */
  trip: z
    .object({
      id: z.uuid(),
      /** Who drives it: the console offers hiding its note or cancelling it only for them. */
      driverId: z.uuid(),
      status: z.enum(tripStatuses),
      from: stopSchema,
      to: stopSchema,
      /** Shown to passengers; empty for none. */
      note: z.string(),
      noteHidden: z.boolean(),
    })
    .nullable(),
  booking: z
    .object({ id: z.uuid(), status: z.enum(bookingStatuses), seats: z.int().positive() })
    .nullable(),
  /**
   * The message reported, without its words: those are read in the
   * conversation, whose opening is logged (R9.6).
   */
  message: z.object({ id: z.uuid(), sentAt: timestampSchema, removed: z.boolean() }).nullable(),
  /** The reported person's About you, for a report about a person; null for none. */
  about: z.object({ text: z.string(), hidden: z.boolean() }).nullable(),
  /** Whether the report covers a conversation the operator can open: a message report's. */
  conversation: z.boolean(),
  /** Actions taken on this report. */
  actions: z.array(adminModerationActionSchema),
  reporterSide: adminReportSideSchema.nullable(),
  reportedSide: adminReportSideSchema.nullable(),
});

export type AdminReport = z.infer<typeof adminReportSchema>;

/** The rule an action concerns and its reason, written for the person (3.4.4). */
const statementShape = {
  rule: z.enum(moderationRules),
  /** Up to 1 000 characters as chat counts them; not empty. */
  reason: z.string().max(4000),
  /** The report it answers, if any. */
  reportId: z.uuid().optional(),
};

export const adminWarnBodySchema = z.object(statementShape);
export type AdminWarnBody = z.infer<typeof adminWarnBodySchema>;

export const adminSuspendBodySchema = z.object({
  ...statementShape,
  /** Null for a suspension with no end. */
  until: timestampSchema.nullable(),
});
export type AdminSuspendBody = z.infer<typeof adminSuspendBodySchema>;

export const adminReinstateBodySchema = z.object({
  /** The person reads it; up to 1 000 characters, not empty. */
  note: z.string().max(4000),
});
export type AdminReinstateBody = z.infer<typeof adminReinstateBodySchema>;

export const adminHideContentBodySchema = z.object({
  ...statementShape,
  /** A message, a review, a trip's note (by the trip's ID) or About you (by the person's). */
  content: z.object({ kind: z.enum(hideableContent), id: z.uuid() }),
});
export type AdminHideContentBody = z.infer<typeof adminHideContentBodySchema>;

export const adminCancelTripBodySchema = z.object({
  ...statementShape,
  /** Off the driver's reliability unless the operator says so (3.4.3). */
  countsOnReliability: z.boolean(),
});
export type AdminCancelTripBody = z.infer<typeof adminCancelTripBodySchema>;

export const adminCloseReportBodySchema = z.object({ outcome: z.enum(reportOutcomes) });
export type AdminCloseReportBody = z.infer<typeof adminCloseReportBodySchema>;

export const adminAnswerAppealBodySchema = z.object({
  outcome: z.enum(appealOutcomes),
  /** Final in the app; up to 1 000 characters, not empty. */
  answer: z.string().max(4000),
});
export type AdminAnswerAppealBody = z.infer<typeof adminAnswerAppealBodySchema>;

const actionTaken = {
  description: "The action, as the person's notice says it",
  schema: z.object({ action: adminModerationActionSchema }),
} as const;

const statementInvalid = {
  description:
    "validation_failed: the reason is empty or over 1 000 characters (`reason`, `reason_missing` or `too_long`)",
  ...errors,
} as const;

export const adminReportsRoute = defineRoute({
  method: "get",
  path: "/admin/v1/reports",
  summary: "Open reports, safety first, then oldest (3.4.1); or the last ones closed",
  tags: ["admin", "reports"],
  auth: "operator",
  request: { query: z.object({ state: z.enum(adminReportStates).default("open") }) },
  responses: {
    200: {
      description: "The reports",
      schema: z.object({ reports: z.array(adminReportListItemSchema) }),
    },
    400: { description: "validation_failed: an unknown state", ...errors },
    401: unauthenticated,
  },
});

export const adminReportRoute = defineRoute({
  method: "get",
  path: "/admin/v1/reports/{id}",
  summary: "One report with what the system knows about it and both people (3.4.2)",
  tags: ["admin", "reports"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: { description: "The report", schema: adminReportSchema },
    401: unauthenticated,
    404: { description: "not_found", ...errors },
  },
});

export const adminReportConversationRoute = defineRoute({
  method: "get",
  path: "/admin/v1/reports/{id}/conversation",
  summary: "The conversation a message report covers; each opening is logged (R9.6)",
  tags: ["admin", "reports"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: "The messages, oldest first; one ShareRide removed is marked",
      schema: z.object({ messages: z.array(adminConversationMessageSchema) }),
    },
    401: unauthenticated,
    404: { description: "not_found", ...errors },
    409: {
      description: "not_covered: only a report about a message opens its conversation",
      ...errors,
    },
  },
});

export const adminCloseReportRoute = defineRoute({
  method: "post",
  path: "/admin/v1/reports/{id}/close",
  summary: "Close a report; the reporter is told the outcome in general terms (3.1.6)",
  tags: ["admin", "reports"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }), body: adminCloseReportBodySchema },
  responses: {
    200: { description: "The report, closed", schema: adminReportSchema },
    401: unauthenticated,
    404: { description: "not_found", ...errors },
    409: { description: "already_closed", ...errors },
  },
});

export const adminWarnRoute = defineRoute({
  method: "post",
  path: "/admin/v1/users/{id}/warning",
  summary: "Warn a person; nothing else changes (3.4.3)",
  tags: ["admin", "moderation"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }), body: adminWarnBodySchema },
  responses: {
    201: actionTaken,
    400: statementInvalid,
    401: unauthenticated,
    404: { description: "not_found: no such person, or no such report", ...errors },
  },
});

export const adminSuspendRoute = defineRoute({
  method: "post",
  path: "/admin/v1/users/{id}/suspension",
  summary:
    "Suspend a person, and cancel their upcoming trips and bookings with full refunds (3.6.1, R9.10)",
  tags: ["admin", "moderation"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }), body: adminSuspendBodySchema },
  responses: {
    201: {
      description: "The suspension, with how many trips and bookings it cancelled",
      schema: z.object({
        action: adminModerationActionSchema,
        tripsCancelled: z.int().nonnegative(),
        bookingsCancelled: z.int().nonnegative(),
      }),
    },
    400: {
      description: `${statementInvalid.description}; until_past: the end has passed (\`until\`)`,
      ...errors,
    },
    401: unauthenticated,
    404: { description: "not_found: no such person, or no such report", ...errors },
    409: { description: "already_suspended: reinstate first to change it", ...errors },
  },
});

export const adminReinstateRoute = defineRoute({
  method: "post",
  path: "/admin/v1/users/{id}/reinstatement",
  summary: "End a suspension early, with a note the person reads (3.6.3)",
  tags: ["admin", "moderation"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }), body: adminReinstateBodySchema },
  responses: {
    201: actionTaken,
    400: {
      description: "validation_failed: the note is empty or over 1 000 characters (`note`)",
      ...errors,
    },
    401: unauthenticated,
    404: { description: "not_found", ...errors },
    409: { description: "not_suspended", ...errors },
  },
});

export const adminHideContentRoute = defineRoute({
  method: "post",
  path: "/admin/v1/hidden-content",
  summary: "Hide a message, a review, a trip's note or About you; its author is told why (3.4.3)",
  tags: ["admin", "moderation"],
  auth: "operator",
  request: { body: adminHideContentBodySchema },
  responses: {
    201: actionTaken,
    400: statementInvalid,
    401: unauthenticated,
    404: {
      description: "not_found: no such content that others can read, or no such report",
      ...errors,
    },
    409: { description: "already_hidden", ...errors },
  },
});

export const adminCancelTripRoute = defineRoute({
  method: "post",
  path: "/admin/v1/trips/{id}/cancellation",
  summary:
    "Cancel an upcoming trip as ShareRide, with full refunds; the driver is told why (3.4.3)",
  tags: ["admin", "moderation"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }), body: adminCancelTripBodySchema },
  responses: {
    201: actionTaken,
    400: statementInvalid,
    401: unauthenticated,
    404: { description: "not_found: no such trip, or no such report", ...errors },
    409: {
      description: "already_cancelled; trip_not_cancellable: it has left or completed",
      ...errors,
    },
  },
});

export const adminAppealsRoute = defineRoute({
  method: "get",
  path: "/admin/v1/appeals",
  summary: "Appeals waiting for an answer, oldest first; or the last ones answered (3.4.4)",
  tags: ["admin", "moderation"],
  auth: "operator",
  request: { query: z.object({ state: z.enum(adminAppealStates).default("open") }) },
  responses: {
    200: {
      description: "The appealed actions",
      schema: z.object({ appeals: z.array(adminModerationActionSchema) }),
    },
    400: { description: "validation_failed: an unknown state", ...errors },
    401: unauthenticated,
  },
});

export const adminAnswerAppealRoute = defineRoute({
  method: "post",
  path: "/admin/v1/moderation-actions/{id}/appeal-answer",
  summary:
    "Answer an appeal, once and finally; reversing a suspension or a hiding undoes it (3.4.4)",
  tags: ["admin", "moderation"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }), body: adminAnswerAppealBodySchema },
  responses: {
    200: { description: "The action, with the answer", schema: adminModerationActionSchema },
    400: {
      description: "validation_failed: the answer is empty or over 1 000 characters (`answer`)",
      ...errors,
    },
    401: unauthenticated,
    404: { description: "not_found", ...errors },
    409: { description: "not_appealed; already_answered", ...errors },
  },
});
