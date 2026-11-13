import { acceptableDocumentTypes } from "@shareride/domain";
import { z } from "zod";
import { localeSchema, platformSchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

export const onboardingStepSchema = z.enum(["phone", "legal", "profile"]);

/** The signed-in person's own account. Only they see the phone number and email. */
export const meSchema = z.object({
  id: z.uuid(),
  phoneNumber: z.string().nullable(),
  firstName: z.string().nullable(),
  about: z.string().nullable(),
  languages: z.array(z.string()),
  locale: localeSchema,
  email: z.string().nullable(),
  ageConfirmed: z.boolean(),
  memberSince: timestampSchema,
  /** What is still needed, in order; empty when the account is complete. */
  missingSteps: z.array(onboardingStepSchema),
});

export type Me = z.infer<typeof meSchema>;

/** Only the fields sent change. The rules are in spec 1, section 3.5. */
export const updateMeBodySchema = z.object({
  firstName: z.string().max(100).optional(),
  about: z.string().max(1000).optional(),
  languages: z.array(z.string().max(8)).max(40).optional(),
  locale: localeSchema.optional(),
});

export const sessionSchema = z.object({
  id: z.uuid(),
  deviceName: z.string().nullable(),
  platform: platformSchema,
  appVersion: z.string().nullable(),
  createdAt: timestampSchema,
  lastActiveAt: timestampSchema,
  /** The session making this request. */
  current: z.boolean(),
});

export const sessionsResponseSchema = z.object({ sessions: z.array(sessionSchema) });

export const legalAcceptancesBodySchema = z.object({
  /** "I am 18 or older" (rule R1.7). */
  ageConfirmed: z.literal(true).optional(),
  documents: z
    .array(
      z.object({
        type: z.enum(acceptableDocumentTypes),
        version: z.int().positive(),
      }),
    )
    .min(1)
    .max(acceptableDocumentTypes.length),
  /** The language the documents were shown in. */
  locale: localeSchema,
});

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "unauthenticated", ...errors } as const;

export const getMeRoute = defineRoute({
  method: "get",
  path: "/v1/me",
  summary: "My account",
  tags: ["me"],
  auth: true,
  responses: {
    200: { description: "My account", schema: meSchema },
    401: unauthenticated,
  },
});

export const updateMeRoute = defineRoute({
  method: "patch",
  path: "/v1/me",
  summary: "Change my profile or app language",
  tags: ["me"],
  auth: true,
  request: { body: updateMeBodySchema },
  responses: {
    200: { description: "My account after the change", schema: meSchema },
    400: { description: "profile_invalid, with the field in details", ...errors },
    401: unauthenticated,
  },
});

export const listSessionsRoute = defineRoute({
  method: "get",
  path: "/v1/me/sessions",
  summary: "My signed-in devices",
  tags: ["me"],
  auth: true,
  responses: {
    200: {
      description: "Signed-in devices, most recently active first",
      schema: sessionsResponseSchema,
    },
    401: unauthenticated,
  },
});

export const endSessionRoute = defineRoute({
  method: "delete",
  path: "/v1/me/sessions/{id}",
  summary: "Sign out one of my devices",
  tags: ["me"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    204: { description: "Signed out" },
    401: unauthenticated,
    404: { description: "not_found: no such signed-in device of mine", ...errors },
  },
});

export const acceptLegalRoute = defineRoute({
  method: "post",
  path: "/v1/me/legal-acceptances",
  summary: "Accept the current Terms and Community Rules, and confirm my age",
  tags: ["me", "legal"],
  auth: true,
  request: { body: legalAcceptancesBodySchema },
  responses: {
    200: { description: "My account after accepting", schema: meSchema },
    400: { description: "legal_document_not_acceptable: a document is listed twice", ...errors },
    401: unauthenticated,
    409: {
      description: "legal_version_outdated: a newer version exists; show it and ask again",
      ...errors,
    },
  },
});
