import { z } from "zod";
import { localeSchema, platformSchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { meSchema } from "./me.ts";
import { defineRoute } from "./route.ts";

/** Error codes of the sign-in endpoints; the app shows a text for each. */
export const authErrorCodes = [
  "phone_invalid",
  "phone_country_unsupported",
  "rate_limited",
  "sms_failed",
  "code_invalid",
  "code_expired",
  "code_attempts_exceeded",
  "account_unavailable",
  "unauthenticated",
  "refresh_invalid",
  "session_ended",
] as const;

export type AuthErrorCode = (typeof authErrorCodes)[number];

const phoneNumberSchema = z.string().trim().min(1).max(32);

export const startPhoneSignInBodySchema = z.object({
  /** As typed, with or without the country code; Iceland if none. */
  phoneNumber: phoneNumberSchema,
  /** The language of the SMS. */
  locale: localeSchema,
});

export const startPhoneSignInResponseSchema = z.object({
  resendAfterSeconds: z.int().positive(),
});

export const deviceSchema = z.object({
  platform: platformSchema,
  /** Shown in the list of signed-in devices, for example "Anna's iPhone". */
  name: z.string().trim().min(1).max(100).optional(),
  appVersion: z.string().trim().min(1).max(32).optional(),
});

export const verifyPhoneCodeBodySchema = z.object({
  phoneNumber: phoneNumberSchema,
  code: z.string().regex(/^\d{6}$/),
  /** The app language, kept for a new account. */
  locale: localeSchema,
  device: deviceSchema,
});

/**
 * New tokens. On the web the refresh token is not in the body: it is set as
 * an HTTP-only cookie instead (ADR 0016).
 */
export const tokensSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: timestampSchema,
  refreshToken: z.string().optional(),
  refreshTokenExpiresAt: timestampSchema,
});

export const signedInSchema = tokensSchema.extend({
  user: meSchema,
  /** True when this sign-in created the account. */
  isNewUser: z.boolean(),
});

/** On the web, send `{}` and the browser sends the cookie. */
export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1).max(200).optional(),
});

export const signOutBodySchema = z.object({
  /** Sign out on every device, not only this one. */
  all: z.boolean().optional(),
});

const errors = { schema: errorResponseSchema } as const;

export const startPhoneSignInRoute = defineRoute({
  method: "post",
  path: "/v1/auth/phone/start",
  summary: "Send a sign-in code by SMS",
  tags: ["auth"],
  request: { body: startPhoneSignInBodySchema },
  responses: {
    202: {
      description: "A code was sent. The reply is the same for new and existing accounts.",
      schema: startPhoneSignInResponseSchema,
    },
    400: { description: "phone_invalid, phone_country_unsupported, validation_failed", ...errors },
    429: { description: "rate_limited, with retryAfterSeconds", ...errors },
    502: { description: "sms_failed", ...errors },
  },
});

export const verifyPhoneCodeRoute = defineRoute({
  method: "post",
  path: "/v1/auth/phone/verify",
  summary: "Check a sign-in code; sign in, or create the account",
  tags: ["auth"],
  request: { body: verifyPhoneCodeBodySchema },
  responses: {
    200: { description: "Signed in", schema: signedInSchema },
    400: {
      description: "code_invalid (with attemptsLeft), code_expired, phone_invalid",
      ...errors,
    },
    403: { description: "account_unavailable", ...errors },
    429: { description: "code_attempts_exceeded, with retryAfterSeconds", ...errors },
  },
});

export const refreshRoute = defineRoute({
  method: "post",
  path: "/v1/auth/refresh",
  summary: "Swap a refresh token for new tokens",
  tags: ["auth"],
  request: { body: refreshBodySchema },
  responses: {
    200: { description: "New tokens; the old refresh token stops working", schema: tokensSchema },
    401: { description: "refresh_invalid, session_ended: sign in again", ...errors },
  },
});

export const signOutRoute = defineRoute({
  method: "post",
  path: "/v1/auth/sign-out",
  summary: "Sign out on this device, or on all devices",
  tags: ["auth"],
  auth: true,
  request: { body: signOutBodySchema },
  responses: {
    204: { description: "Signed out" },
    401: { description: "unauthenticated", ...errors },
  },
});
