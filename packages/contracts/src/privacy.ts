import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { confirmCodeBodySchema, confirmCodeErrors } from "./me.ts";
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
