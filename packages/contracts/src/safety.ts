import { reportCategories, reportOutcomes, reportStatuses } from "@shareride/domain";
import { z } from "zod";
import { bookingSchema, peopleColourSchema } from "./bookings.ts";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// Safety and moderation (spec 9): blocking and reports. A person is blocked
// or reported through what the two share, such as a booking or a message,
// so no one's own ID is ever shown to someone else (it holds when their
// account was made).

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "unauthenticated", ...errors } as const;

/** Someone I blocked, as only I see them (spec 9, section 7). */
export const blockedPersonSchema = z.object({
  /** The block's own ID, to unblock with. */
  id: z.uuid(),
  firstName: z.string(),
  colour: peopleColourSchema,
  blockedAt: timestampSchema,
});

export type BlockedPerson = z.infer<typeof blockedPersonSchema>;

export const blockFromBookingRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/block",
  summary:
    "Block the other person of a booking, silently: neither of us sees or books the other's trips, and our chats become read-only (R9.4)",
  tags: ["safety"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: z.object({}) },
  responses: {
    200: {
      description:
        "Blocked, or already blocked; with the bookings and requests we still have together, before boarding, so I can cancel, withdraw or decline them (spec 9, decision 1)",
      schema: z.object({ together: z.array(bookingSchema) }),
    },
    401: unauthenticated,
    404: { description: "not_found: no such booking of yours, or on your trip", ...errors },
  },
});

export const unblockRoute = defineRoute({
  method: "delete",
  path: "/v1/me/blocks/{id}",
  summary: "Unblock someone I blocked; safe to repeat",
  tags: ["safety"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    204: { description: "Not blocked by me any more" },
    401: unauthenticated,
  },
});

export const myBlocksRoute = defineRoute({
  method: "get",
  path: "/v1/me/blocks",
  summary: "People I blocked, the latest first (spec 9, 3.2.4)",
  tags: ["safety"],
  auth: true,
  responses: {
    200: {
      description: "People I blocked",
      schema: z.object({ blocked: z.array(blockedPersonSchema) }),
    },
    401: unauthenticated,
  },
});

/**
 * What a report is about (3.1.1), named by what the reporter can see: a
 * trip; a message in my conversation; a problem with my booking, or on my
 * trip; or the other person of such a booking ("Report this person").
 */
export const reportAboutSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("trip"), tripId: z.uuid() }),
  z.object({ kind: z.literal("message"), messageId: z.uuid() }),
  z.object({ kind: z.literal("booking"), bookingId: z.uuid() }),
  z.object({ kind: z.literal("user"), bookingId: z.uuid() }),
]);

export type ReportAbout = z.infer<typeof reportAboutSchema>;

export const reportBodySchema = z.object({
  about: reportAboutSchema,
  category: z.enum(reportCategories),
  /** Up to 1 000 characters as chat counts them (3.1.4); may be empty. */
  description: z.string().max(4000).default(""),
});

export type ReportBody = z.input<typeof reportBodySchema>;

/** A report as its reporter sees it (3.1.7): never anything of the operator's notes. */
export const myReportSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["user", "trip", "message", "review", "booking"]),
  category: z.enum(reportCategories),
  /** The person reported, by first name; empty once their account is deleted. */
  firstName: z.string().nullable(),
  filedAt: timestampSchema,
  status: z.enum(reportStatuses),
  /** In general terms (3.1.6); empty while open. */
  outcome: z.enum(reportOutcomes).nullable(),
  closedAt: timestampSchema.nullable(),
});

export type MyReport = z.infer<typeof myReportSchema>;

export const fileReportRoute = defineRoute({
  method: "post",
  path: "/v1/reports",
  summary:
    "Report a trip, a message, a problem with a booking or a person; the person reported is never told who (R9.1, R9.2)",
  tags: ["safety"],
  auth: true,
  request: { body: reportBodySchema },
  responses: {
    201: { description: "The report, as I see it", schema: myReportSchema },
    400: {
      description:
        "validation_failed: the description is over 1 000 characters (`description`, `too_long`)",
      ...errors,
    },
    401: unauthenticated,
    404: {
      description: "not_found: no such trip, message or booking that I can see or am part of",
      ...errors,
    },
    409: {
      description:
        "cannot_report_own: it is mine; not_reportable: a system line; report_window_closed: more than 24 hours after the trip completed (R9.1)",
      ...errors,
    },
    429: {
      description: "too_many_reports: 10 in 24 hours, with retryAfterSeconds",
      ...errors,
    },
  },
});

export const myReportsRoute = defineRoute({
  method: "get",
  path: "/v1/me/reports",
  summary: "The reports I filed and their outcomes, the latest first (3.1.7)",
  tags: ["safety"],
  auth: true,
  responses: {
    200: {
      description: "My reports",
      schema: z.object({ reports: z.array(myReportSchema) }),
    },
    401: unauthenticated,
  },
});
