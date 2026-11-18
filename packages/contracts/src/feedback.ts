import {
  feedbackKinds,
  feedbackPlatforms,
  feedbackRules,
  feedbackStatuses,
} from "@shareride/domain";
import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// Feedback from testers (spec 12, 3.3 and section 6; R12.5): sending it,
// reading what I sent with the replies, and the console's list, status
// and reply.

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "unauthenticated", ...errors } as const;
const operatorUnauthenticated = { description: "operator_unauthenticated", ...errors } as const;

export const feedbackKindSchema = z.enum(feedbackKinds);
export const feedbackStatusSchema = z.enum(feedbackStatuses);
export const feedbackPlatformSchema = z.enum(feedbackPlatforms);

/** A screenshot's bytes in base64: up to `feedbackRules.screenshotMaxBytes` once decoded. */
const screenshotSchema = z.base64().max(Math.ceil(feedbackRules.screenshotMaxBytes / 3) * 4);

export const sendFeedbackBodySchema = z.object({
  kind: feedbackKindSchema,
  /** 1 to 2 000 characters once trimmed. */
  message: z.string().max(feedbackRules.messageMaxLength * 4),
  appVersion: z.string().max(feedbackRules.appVersionMaxLength * 4),
  platform: feedbackPlatformSchema,
  /** Empty from a browser. */
  osVersion: z.string().max(feedbackRules.osVersionMaxLength * 4),
  /** The screen's route, such as `/trips/[id]`: never an address with an ID in it. */
  screen: z.string().max(feedbackRules.screenMaxLength * 4),
  /** From phones: a JPEG without metadata, which the person has seen (milestone 11, choice 2). */
  screenshot: screenshotSchema.optional(),
});

export type SendFeedbackBody = z.infer<typeof sendFeedbackBodySchema>;

/** Feedback as the person who sent it sees it. */
export const myFeedbackSchema = z.object({
  id: z.uuid(),
  kind: feedbackKindSchema,
  message: z.string(),
  hasScreenshot: z.boolean(),
  /** ShareRide's reply, if there is one. */
  reply: z.string().nullable(),
  repliedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});

export type MyFeedback = z.infer<typeof myFeedbackSchema>;

export const sendFeedbackRoute = defineRoute({
  method: "post",
  path: "/v1/feedback",
  summary: "Send feedback, with a screenshot from phones; 10 a day (spec 12, 3.3)",
  tags: ["beta"],
  auth: true,
  request: { body: sendFeedbackBodySchema },
  responses: {
    201: { description: "Received", schema: myFeedbackSchema },
    400: {
      description:
        "validation_failed: `message` (missing, too_long), `appVersion`, `osVersion` or `screen` (invalid), or `screenshot` (not_jpeg, metadata, too_large)",
      ...errors,
    },
    401: unauthenticated,
    413: { description: "payload_too_large", ...errors },
    429: { description: "rate_limited, with retryAfterSeconds", ...errors },
  },
});

export const myFeedbackRoute = defineRoute({
  method: "get",
  path: "/v1/me/feedback",
  summary: "The feedback I sent and the replies, newest first",
  tags: ["beta"],
  auth: true,
  responses: {
    200: { description: "My feedback", schema: z.object({ feedback: z.array(myFeedbackSchema) }) },
    401: unauthenticated,
  },
});

/** Feedback as the console lists it: never the picture. */
export const adminFeedbackSchema = z.object({
  id: z.uuid(),
  /** Who sent it: the console's Users page has the rest. */
  userId: z.uuid(),
  firstName: z.string().nullable(),
  kind: feedbackKindSchema,
  message: z.string(),
  appVersion: z.string(),
  platform: feedbackPlatformSchema,
  osVersion: z.string(),
  screen: z.string(),
  language: z.enum(["is", "en"]),
  hasScreenshot: z.boolean(),
  status: feedbackStatusSchema,
  reply: z.string().nullable(),
  repliedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});

export type AdminFeedback = z.infer<typeof adminFeedbackSchema>;

export const adminFeedbackListSchema = z.object({
  /** Newest first, at most 100. */
  feedback: z.array(adminFeedbackSchema),
  /** How many are `new`, whatever the filter. */
  newCount: z.int(),
});

export type AdminFeedbackList = z.infer<typeof adminFeedbackListSchema>;

export const adminFeedbackListRoute = defineRoute({
  method: "get",
  path: "/admin/v1/feedback",
  summary: "Feedback, newest first, by status and kind",
  tags: ["admin", "beta"],
  auth: "operator",
  request: {
    query: z.object({
      status: feedbackStatusSchema.optional(),
      kind: feedbackKindSchema.optional(),
    }),
  },
  responses: {
    200: { description: "The feedback", schema: adminFeedbackListSchema },
    401: operatorUnauthenticated,
  },
});

const feedbackParams = z.object({ id: z.uuid() });
const notFound = { description: "not_found", ...errors } as const;

export const adminFeedbackRoute = defineRoute({
  method: "get",
  path: "/admin/v1/feedback/{id}",
  summary: "One feedback with its details",
  tags: ["admin", "beta"],
  auth: "operator",
  request: { params: feedbackParams },
  responses: {
    200: { description: "The feedback", schema: adminFeedbackSchema },
    401: operatorUnauthenticated,
    404: notFound,
  },
});

/** The path of a feedback's screenshot, a JPEG, for the console's `<img>`; audited. */
export const adminFeedbackScreenshotPath = (id: string) => `/admin/v1/feedback/${id}/screenshot`;

export const adminFeedbackStatusRoute = defineRoute({
  method: "post",
  path: "/admin/v1/feedback/{id}/status",
  summary: "Set where a feedback has got to",
  tags: ["admin", "beta"],
  auth: "operator",
  request: { params: feedbackParams, body: z.object({ status: feedbackStatusSchema }) },
  responses: {
    200: { description: "The feedback", schema: adminFeedbackSchema },
    401: operatorUnauthenticated,
    404: notFound,
  },
});

export const adminFeedbackReplyRoute = defineRoute({
  method: "post",
  path: "/admin/v1/feedback/{id}/reply",
  summary: "Reply to a feedback, once: the tester gets it by push and email",
  tags: ["admin", "beta"],
  auth: "operator",
  request: {
    params: feedbackParams,
    /** 1 to 1 000 characters once trimmed. */
    body: z.object({ reply: z.string().max(feedbackRules.replyMaxLength * 4) }),
  },
  responses: {
    200: { description: "The feedback, with its reply", schema: adminFeedbackSchema },
    400: { description: "validation_failed: `reply` missing or too_long", ...errors },
    401: operatorUnauthenticated,
    404: notFound,
    409: { description: "already_replied", ...errors },
  },
});
