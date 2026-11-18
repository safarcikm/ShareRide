import { announcementAudiences, announcementRules } from "@shareride/domain";
import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// Announcements (spec 10, 3.5 and section 6; R10.7): the operator's news
// about the beta in both languages, and what a person reads of it under
// "Beta news".

const errors = { schema: errorResponseSchema } as const;
const operatorUnauthenticated = { description: "operator_unauthenticated", ...errors } as const;
const notFound = { description: "not_found", ...errors } as const;

/** How many people an announcement reaches, and by which channel. */
export const announcementReachSchema = z.object({
  /** Everyone it is for: they see it under "Beta news". */
  people: z.int(),
  /** Those of them with a phone that takes push notifications. */
  push: z.int(),
  /** Those of them with a verified email address. */
  email: z.int(),
});

export type AnnouncementReach = z.infer<typeof announcementReachSchema>;

export const adminAnnouncementSchema = z.object({
  id: z.uuid(),
  audience: z.enum(announcementAudiences),
  /** For the audience `corridor`. */
  corridor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  titleIs: z.string(),
  titleEn: z.string(),
  messageIs: z.string(),
  messageEn: z.string(),
  createdAt: timestampSchema,
  /** When "Send to me" was last used. */
  testSentAt: timestampSchema.nullable(),
  /** Null for a draft. */
  sentAt: timestampSchema.nullable(),
  /** How many people it went to, counted as it was sent. */
  reach: z.int().nullable(),
  /**
   * How many it has been delivered to by each channel so far, from the
   * delivery log; null for a draft, and once the log is past its 90 days.
   */
  delivered: z.object({ push: z.int(), email: z.int() }).nullable(),
});

export type AdminAnnouncement = z.infer<typeof adminAnnouncementSchema>;

export const adminAnnouncementsSchema = z.object({
  /** Newest first, at most 100. */
  announcements: z.array(adminAnnouncementSchema),
  /** The corridors an announcement can be for, by name. */
  corridors: z.array(z.object({ id: z.uuid(), name: z.string() })),
});

export type AdminAnnouncements = z.infer<typeof adminAnnouncementsSchema>;

// The rules say how long; this only bounds what is read.
const title = z.string().max(announcementRules.titleMaxLength * 4);
const message = z.string().max(announcementRules.messageMaxLength * 4);

export const announcementBodySchema = z.object({
  audience: z.enum(announcementAudiences),
  corridorId: z.uuid().nullable(),
  titleIs: title,
  titleEn: title,
  messageIs: message,
  messageEn: message,
});

export type AnnouncementBody = z.infer<typeof announcementBodySchema>;

const badAnnouncement = {
  description:
    "validation_failed: a title or a message is missing or too long in one of the languages, or the corridor is missing or does not exist",
  ...errors,
} as const;
const idParams = z.object({ id: z.uuid() });

export const adminAnnouncementsRoute = defineRoute({
  method: "get",
  path: "/admin/v1/announcements",
  summary: "The announcements, drafts and sent, newest first",
  tags: ["admin", "announcements"],
  auth: "operator",
  responses: {
    200: { description: "The announcements", schema: adminAnnouncementsSchema },
    401: operatorUnauthenticated,
  },
});

export const adminCreateAnnouncementRoute = defineRoute({
  method: "post",
  path: "/admin/v1/announcements",
  summary: "Write an announcement as a draft; nothing is sent",
  tags: ["admin", "announcements"],
  auth: "operator",
  request: { body: announcementBodySchema },
  responses: {
    201: { description: "The draft", schema: adminAnnouncementSchema },
    400: badAnnouncement,
    401: operatorUnauthenticated,
  },
});

export const adminUpdateAnnouncementRoute = defineRoute({
  method: "put",
  path: "/admin/v1/announcements/{id}",
  summary: "Change a draft",
  tags: ["admin", "announcements"],
  auth: "operator",
  request: { params: idParams, body: announcementBodySchema },
  responses: {
    200: { description: "The draft, changed", schema: adminAnnouncementSchema },
    400: badAnnouncement,
    401: operatorUnauthenticated,
    404: notFound,
    409: { description: "already_sent", ...errors },
  },
});

export const adminAnnouncementReachRoute = defineRoute({
  method: "get",
  path: "/admin/v1/announcements/{id}/reach",
  summary: "How many people the announcement would reach now",
  tags: ["admin", "announcements"],
  auth: "operator",
  request: { params: idParams },
  responses: {
    200: { description: "The reach", schema: announcementReachSchema },
    401: operatorUnauthenticated,
    404: notFound,
  },
});

export const adminTestAnnouncementRoute = defineRoute({
  method: "post",
  path: "/admin/v1/announcements/{id}/test",
  summary: "Send the announcement to myself, in both languages",
  tags: ["admin", "announcements"],
  auth: "operator",
  request: { params: idParams },
  responses: {
    200: {
      description: "The announcement, with when the test was sent",
      schema: adminAnnouncementSchema,
    },
    401: operatorUnauthenticated,
    404: notFound,
  },
});

export const adminSendAnnouncementRoute = defineRoute({
  method: "post",
  path: "/admin/v1/announcements/{id}/send",
  summary: "Send the announcement to its audience, once",
  tags: ["admin", "announcements"],
  auth: "operator",
  request: { params: idParams },
  responses: {
    200: { description: "The announcement, sent", schema: adminAnnouncementSchema },
    401: operatorUnauthenticated,
    404: notFound,
    409: { description: "already_sent", ...errors },
  },
});

/** An announcement as the person it was sent to reads it, in both languages. */
export const myAnnouncementSchema = z.object({
  id: z.uuid(),
  titleIs: z.string(),
  titleEn: z.string(),
  messageIs: z.string(),
  messageEn: z.string(),
  sentAt: timestampSchema,
});

export type MyAnnouncement = z.infer<typeof myAnnouncementSchema>;

export const myAnnouncementsSchema = z.object({
  /** Newest first: those sent to me in the last 90 days. */
  announcements: z.array(myAnnouncementSchema),
});

export const myAnnouncementsRoute = defineRoute({
  method: "get",
  path: "/v1/me/announcements",
  summary: "The beta news sent to me",
  tags: ["me"],
  auth: true,
  responses: {
    200: { description: "The announcements sent to me", schema: myAnnouncementsSchema },
    401: { description: "unauthenticated", ...errors },
  },
});
