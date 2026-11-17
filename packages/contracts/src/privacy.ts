import { privacyRequestKinds } from "@shareride/domain";
import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { localisedTextSchema } from "./meeting-points.ts";
import { confirmCodeBodySchema, confirmCodeErrors, meSchema } from "./me.ts";
import { defineRoute } from "./route.ts";

// "Download my data" (spec 11, 3.2): ask with a fresh code, wait while it
// is built, then download it through a one-time link for 7 days.

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "unauthenticated", ...errors } as const;

/**
 * The latest export. `nextAllowedAt` is when another can be asked for (one
 * per 24 hours), null when it can be now.
 */
export const dataExportSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("none") }),
  z.object({
    state: z.enum(["preparing", "failed"]),
    askedAt: timestampSchema,
    nextAllowedAt: timestampSchema.nullable(),
  }),
  z.object({
    state: z.enum(["ready", "expired"]),
    askedAt: timestampSchema,
    readyAt: timestampSchema,
    /** Ready exports can be downloaded until then (7 days). */
    expiresAt: timestampSchema,
    /** The ZIP's size in bytes; null once expired. */
    byteSize: z.int().nonnegative().nullable(),
    nextAllowedAt: timestampSchema.nullable(),
  }),
]);

export type DataExport = z.infer<typeof dataExportSchema>;

export const exportLinkSchema = z.object({
  /** The API path to open, relative to the API's address. It works once. */
  path: z.string(),
  expiresAt: timestampSchema,
});

export const askDataExportRoute = defineRoute({
  method: "post",
  path: "/v1/me/export",
  summary: "Ask for a file of my data, with a fresh code (spec 11, 3.2)",
  tags: ["privacy"],
  auth: true,
  request: { body: confirmCodeBodySchema },
  responses: {
    202: { description: "Asked for; it is being prepared", schema: dataExportSchema },
    400: confirmCodeErrors[400],
    401: unauthenticated,
    429: {
      description:
        "export_too_soon (one per 24 hours) or code_attempts_exceeded, with retryAfterSeconds",
      ...errors,
    },
  },
});

export const getDataExportRoute = defineRoute({
  method: "get",
  path: "/v1/me/export",
  summary: "Where my latest file of my data stands",
  tags: ["privacy"],
  auth: true,
  responses: {
    200: { description: "The latest export", schema: dataExportSchema },
    401: unauthenticated,
  },
});

export const dataExportLinkRoute = defineRoute({
  method: "post",
  path: "/v1/me/export/link",
  summary: "A one-time link to download my ready export, valid for 2 minutes",
  tags: ["privacy"],
  auth: true,
  request: { body: z.object({}) },
  responses: {
    200: { description: "The link", schema: exportLinkSchema },
    401: unauthenticated,
    409: { description: "export_not_ready: nothing ready to download", ...errors },
  },
});

export const downloadDataExportRoute = defineRoute({
  method: "get",
  path: "/v1/exports/{token}",
  summary: "Download an export through its one-time link; the link is the key",
  tags: ["privacy"],
  request: { params: z.object({ token: z.string().max(100) }) },
  responses: {
    200: { description: "The ZIP file (application/zip)" },
    404: { description: "not_found: the link is unknown, used or expired", ...errors },
  },
});

// "Delete my account" (spec 11, 3.4): see what is still open, confirm with
// a fresh code, then 7 days to change one's mind.

const placesSchema = z.object({ from: localisedTextSchema, to: localisedTextSchema });

/**
 * Something still open (spec 11, 3.4.1), with what the app needs to show it
 * and open its own screen: the trip or booking, and its cancel screen
 * (spec 6) for those that can be cancelled.
 */
export const openItemSchema = z.discriminatedUnion("kind", [
  z.object({
    /** A trip the person drives, with bookings or requests on it. */
    kind: z.literal("trip"),
    id: z.uuid(),
    departsAt: timestampSchema,
    places: placesSchema,
  }),
  z.object({
    /** The person's own booking or request as a passenger, with their part of the trip. */
    kind: z.enum(["booking", "request"]),
    id: z.uuid(),
    tripId: z.uuid(),
    boardsAt: timestampSchema,
    places: placesSchema,
  }),
  z.object({
    /** A trip on its way, which nobody can cancel: deleting waits until it completes. */
    kind: z.literal("trip_under_way"),
    tripId: z.uuid(),
    completesAt: timestampSchema,
    places: placesSchema,
  }),
  z.object({
    /** Settled elsewhere first: an open dispute (spec 8) or a held payout (spec 13). */
    kind: z.enum(["dispute", "held_payout"]),
    id: z.uuid(),
  }),
]);

export type OpenItem = z.infer<typeof openItemSchema>;

export const deletionCheckSchema = z.object({
  /** True when nothing is open, so the account can be deleted now (R11.3). */
  allowed: z.boolean(),
  /** What must be settled first, and cannot be cancelled from the deletion screen. */
  mustSettle: z.array(openItemSchema),
  /** Trips, bookings and requests the person can cancel under the normal rules (spec 6). */
  canCancel: z.array(openItemSchema),
});

export type DeletionCheck = z.infer<typeof deletionCheckSchema>;

export const deletionCheckRoute = defineRoute({
  method: "get",
  path: "/v1/me/deletion-check",
  summary: "What is still open before I can delete my account (spec 11, 3.4.1)",
  tags: ["privacy"],
  auth: true,
  responses: {
    200: { description: "What is open", schema: deletionCheckSchema },
    401: unauthenticated,
  },
});

export const deleteAccountRoute = defineRoute({
  method: "post",
  path: "/v1/me/delete",
  summary:
    "Delete my account, with a fresh code: signed out everywhere and hidden at once, erased after 7 days (spec 11, 3.4)",
  tags: ["privacy"],
  auth: true,
  request: { body: confirmCodeBodySchema },
  responses: {
    202: {
      description: "Deletion scheduled; every session has ended, this one too",
      schema: z.object({ deleteAfter: timestampSchema }),
    },
    400: confirmCodeErrors[400],
    401: unauthenticated,
    409: {
      description: "deletion_blocked: something is still open; GET /v1/me/deletion-check says what",
      ...errors,
    },
    429: confirmCodeErrors[429],
  },
});

export const cancelDeletionRoute = defineRoute({
  method: "post",
  path: "/v1/me/delete/cancel",
  summary: "Keep my account: undo a deletion while it waits (spec 11, 3.4.4)",
  tags: ["privacy"],
  auth: true,
  request: { body: z.object({}) },
  responses: {
    200: { description: "Kept, as it was", schema: meSchema },
    401: unauthenticated,
  },
});

// "Ask about my data" (spec 11, 3.6): anything the app cannot do itself,
// answered by email within a month (R11.7).

export const privacyRequestKindSchema = z.enum(privacyRequestKinds);

export type PrivacyRequestKind = z.infer<typeof privacyRequestKindSchema>;

export const privacyRequestBodySchema = z.object({
  kind: privacyRequestKindSchema,
  /** 1 to 2 000 characters once trimmed; longer is refused with `request_text_invalid`. */
  text: z.string().max(4000),
});

export const privacyRequestSchema = z.object({
  id: z.uuid(),
  kind: privacyRequestKindSchema,
  receivedAt: timestampSchema,
  /** One month later: the answer comes by email before then. */
  dueAt: timestampSchema,
});

export type PrivacyRequest = z.infer<typeof privacyRequestSchema>;

export const askAboutMyDataRoute = defineRoute({
  method: "post",
  path: "/v1/me/privacy-requests",
  summary: "Ask about my data: answered by email within a month (spec 11, 3.6)",
  tags: ["privacy"],
  auth: true,
  request: { body: privacyRequestBodySchema },
  responses: {
    201: { description: "Received", schema: privacyRequestSchema },
    400: { description: "request_text_invalid: empty or over 2 000 characters", ...errors },
    401: unauthenticated,
    409: {
      description: "email_required: the answer goes by email, so a verified one is needed first",
      ...errors,
    },
    429: { description: "rate_limited, with retryAfterSeconds: 5 requests a day", ...errors },
  },
});
