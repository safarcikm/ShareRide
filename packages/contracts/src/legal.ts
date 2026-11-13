import { legalDocumentTypes } from "@shareride/domain";
import { z } from "zod";
import { localeSchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

export const legalDocumentSchema = z.object({
  type: z.enum(legalDocumentTypes),
  version: z.int().positive(),
  /** A material change: people accept it again before booking, posting or chatting. */
  material: z.boolean(),
  publishedAt: timestampSchema,
  locale: localeSchema,
  title: z.string(),
  /** What changed in this version. */
  summary: z.string(),
  /** Markdown. */
  body: z.string(),
});

export type LegalDocument = z.infer<typeof legalDocumentSchema>;

export const currentLegalDocumentRoute = defineRoute({
  method: "get",
  path: "/v1/legal/{type}/current",
  summary: "The current version of a legal document, in my language",
  tags: ["legal"],
  request: {
    params: z.object({ type: z.enum(legalDocumentTypes) }),
    query: z.object({ locale: localeSchema.optional() }),
  },
  responses: {
    200: { description: "The document", schema: legalDocumentSchema },
    404: { description: "not_found: no version is published yet", schema: errorResponseSchema },
  },
});
