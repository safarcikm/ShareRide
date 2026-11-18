import { acceptableDocumentTypes } from "@shareride/domain";
import { z } from "zod";
import { localeSchema, platformSchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

export const onboardingStepSchema = z.enum(["phone", "legal", "profile"]);

/** The signed-in person's own account. Only they see the phone number and email. */
export const meSchema = z.object({
  id: z.uuid(),
  /** My public profile's own reference (`/people/{profileId}`), never my ID. */
  profileId: z.uuid(),
  phoneNumber: z.string().nullable(),
  firstName: z.string().nullable(),
  about: z.string().nullable(),
  languages: z.array(z.string()),
  locale: localeSchema,
  /** The verified email address, if any. */
  email: z.string().nullable(),
  /** An address waiting for its link to be opened (plan 4.6). */
  pendingEmail: z.string().nullable(),
  /** Whether any of my signed-in phones gets push (spec 7, 3.6.2). */
  pushOn: z.boolean(),
  ageConfirmed: z.boolean(),
  memberSince: timestampSchema,
  /** What is still needed, in order; empty when the account is complete. */
  missingSteps: z.array(onboardingStepSchema),
  /**
   * My suspension now, with its end (null for none), or null when I am not
   * suspended (spec 9, 3.6.2): what I can still do, and Notices to appeal.
   */
  // Null when missing, as from an API before it: the app then shows nothing suspended.
  suspension: z.object({ until: timestampSchema.nullable() }).nullable().default(null),
  /**
   * When the account's data is erased, while its deletion waits (spec 11,
   * 3.4.4): the app then shows only that date, "Keep my account" and
   * "Sign out". Null otherwise.
   */
  deletionScheduledFor: timestampSchema.nullable(),
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

/** The address to verify; the API checks its shape (spec 1, 3.5). */
export const emailBodySchema = z.object({ email: z.string().max(320) });

export const emailVerificationBodySchema = z.object({
  /** From the link, after `#`. */
  token: z.string().min(1).max(200),
});

export const emailVerifiedSchema = z.object({ email: z.string() });

/** An Expo push token, as the app's notifications module gives it. */
export const pushTokenSchema = z
  .string()
  .max(200)
  .regex(/^Expo(nent)?PushToken\[[^\]\s]+\]$/);

export const pushTokenBodySchema = z.object({
  /** Null stops push on this device. */
  token: pushTokenSchema.nullable(),
});

export type PushTokenBody = z.infer<typeof pushTokenBodySchema>;

/** What a person can turn off (spec 7, 3.6, item 1; R7.8): trip reminders and beta news. */
export const notificationSettingsSchema = z.object({
  reminders: z.boolean(),
  /** The operator's announcements about the beta (spec 10, 3.5.4). */
  betaNews: z.boolean(),
});

/** What changes; what is left out stays as it is. */
export const notificationSettingsBodySchema = notificationSettingsSchema.partial();

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

/**
 * Stores the push token of the device making the request, or removes it
 * with null (plan 4.5). A token another session had moves to this one, and
 * signing out removes it.
 */
export const setPushTokenRoute = defineRoute({
  method: "put",
  path: "/v1/me/sessions/current/push-token",
  summary: "Turn push on or off for this device",
  tags: ["me"],
  auth: true,
  request: { body: pushTokenBodySchema },
  responses: {
    204: { description: "Stored or removed" },
    400: { description: "validation_failed: not an Expo push token", ...errors },
    401: unauthenticated,
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

export const putEmailRoute = defineRoute({
  method: "put",
  path: "/v1/me/email",
  summary: "Send a link to verify my email address",
  tags: ["me"],
  auth: true,
  request: { body: emailBodySchema },
  responses: {
    200: {
      description:
        "The link was sent (or may have been) and the address waits as pendingEmail; an address already mine changes nothing",
      schema: meSchema,
    },
    400: { description: "email_invalid", ...errors },
    401: unauthenticated,
    429: { description: "rate_limited, with retryAfterSeconds", ...errors },
    502: { description: "email_failed: it was not sent; try again", ...errors },
    503: { description: "email_unavailable: this server sends no email", ...errors },
  },
});

export const verifyEmailRoute = defineRoute({
  method: "post",
  path: "/v1/email-verifications",
  summary: "Verify an email address with the link's token, signed in or not",
  tags: ["me"],
  request: { body: emailVerificationBodySchema },
  responses: {
    200: { description: "The address is the account's, verified", schema: emailVerifiedSchema },
    400: { description: "link_invalid: unknown, used, older than 24 hours or replaced", ...errors },
    409: { description: "email_taken: another account has verified this address", ...errors },
  },
});

export const getNotificationSettingsRoute = defineRoute({
  method: "get",
  path: "/v1/me/notification-settings",
  summary: "Read what I turned off: trip reminders",
  tags: ["me"],
  auth: true,
  responses: {
    200: { description: "My notification settings", schema: notificationSettingsSchema },
    401: unauthenticated,
  },
});

/** News about bookings, trips, payments and messages stays on (R7.8). */
export const updateNotificationSettingsRoute = defineRoute({
  method: "patch",
  path: "/v1/me/notification-settings",
  summary: "Turn trip reminders or beta news on or off",
  tags: ["me"],
  auth: true,
  request: { body: notificationSettingsBodySchema },
  responses: {
    200: {
      description: "My notification settings after the change",
      schema: notificationSettingsSchema,
    },
    400: { description: "validation_failed", ...errors },
    401: unauthenticated,
  },
});

export const confirmCodeSentSchema = z.object({
  /** Seconds until another code can be asked for. */
  resendAfterSeconds: z.int().positive(),
});

/**
 * A fresh code from `POST /v1/me/confirm-code`, sent with a sensitive action
 * such as downloading my data or deleting my account (spec 11, R11.1).
 */
export const confirmCodeBodySchema = z.object({ code: z.string().regex(/^\d{6}$/) });

/** The answers a route that takes a confirm code adds to its own. */
export const confirmCodeErrors = {
  400: {
    description: "code_invalid (with attemptsLeft), code_expired, validation_failed",
    schema: errorResponseSchema,
  },
  429: {
    description: "code_attempts_exceeded, with retryAfterSeconds",
    schema: errorResponseSchema,
  },
} as const;

export const sendConfirmCodeRoute = defineRoute({
  method: "post",
  path: "/v1/me/confirm-code",
  summary: "Send a code to my own number to confirm a sensitive action",
  tags: ["me"],
  auth: true,
  request: { body: z.object({}) },
  responses: {
    202: { description: "A code was sent by SMS", schema: confirmCodeSentSchema },
    401: unauthenticated,
    429: { description: "rate_limited, with retryAfterSeconds", schema: errorResponseSchema },
    502: { description: "sms_failed", schema: errorResponseSchema },
    503: { description: "sms_paused", schema: errorResponseSchema },
  },
});
