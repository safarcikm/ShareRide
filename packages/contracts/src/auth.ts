import { signInProviders } from "@shareride/domain";
import { z } from "zod";
import { passkeyAssertionSchema, webAuthnOptionsResponseSchema } from "./admin.ts";
import { inviteCodeInputSchema } from "./beta.ts";
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
  "invite_required",
  "invite_invalid",
  "beta_full",
  "signups_paused",
  "sms_paused",
  "unauthenticated",
  "refresh_invalid",
  "session_ended",
  /** A Google or Apple sign-in: the ticket is wrong, used, older than 5 minutes, or not this app's. */
  "ticket_invalid",
  /** The waiting Google or Apple sign-in took longer than 30 minutes, or was used (spec 19, 3.3). */
  "provider_expired",
  /** The Google or Apple account is linked to another ShareRide account (R19.1). */
  "provider_in_use",
  /** The account already has a Google (or Apple) account: remove it first (R19.1). */
  "provider_already_linked",
  /** Not an email address (spec 26, 3.2). */
  "email_invalid",
  /** The code email could not be sent: try again. */
  "email_failed",
  /** This server sends no email, so email sign-in is off (spec 26, 3.1). */
  "email_unavailable",
] as const;

export type AuthErrorCode = (typeof authErrorCodes)[number];

const phoneNumberSchema = z.string().trim().min(1).max(32);

/** `google` or `apple` (spec 19). */
export const signInProviderSchema = z.enum(signInProviders);

/**
 * A waiting sign-in for the phone step: Google's or Apple's from
 * `POST /v1/auth/oauth/finish` (`sr_ps_…`), or an email's from
 * `POST /v1/auth/email/verify` (`sr_pe_…`).
 */
export const pendingSignInSchema = z.string().regex(/^sr_p[se]_[A-Za-z0-9_-]{43}$/);

export const startPhoneSignInBodySchema = z.object({
  /** As typed, with or without the country code; Iceland if none. */
  phoneNumber: phoneNumberSchema,
  /** The language of the SMS. */
  locale: localeSchema,
  /** The waiting sign-in: no text is sent without one (spec 26, R26.2). */
  pendingSignIn: pendingSignInSchema,
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
  /**
   * The invite code, for a number with no account while the beta is closed
   * (spec 12, R12.1). Ignored for a member.
   */
  inviteCode: inviteCodeInputSchema.optional(),
  /**
   * The email, Google or Apple sign-in waiting for this phone step: the
   * account the number has, or the new one, gets it (spec 19, 3.3; spec 26,
   * 3.3). A number alone never signs in (R26.1).
   */
  pendingSignIn: pendingSignInSchema,
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

/** What became of a waiting Google or Apple sign-in at the phone step (spec 19, 3.3). */
export const providerLinkSchema = z.object({
  provider: signInProviderSchema,
  /**
   * `created`: the new account is linked to it; `linked`: added to the
   * number's account; `replaced`: it took the place of the account's
   * earlier one; `already_linked`; `in_use`: another account has it, so it
   * was not linked, and the person is signed in all the same.
   */
  outcome: z.enum(["created", "linked", "replaced", "already_linked", "in_use"]),
  /** The email the provider vouched for, if any. */
  email: z.string().nullable(),
});

export type ProviderLink = z.infer<typeof providerLinkSchema>;

/** What the phone step did with a waiting email sign-in's address (spec 26, 3.3). */
export const emailLinkSchema = z.object({
  /**
   * `created`: the new account has it; `added`: the number's account had
   * none; `replaced`: it took the place of the account's email, whose old
   * address is told; `already`; `in_use`: another account has it, so
   * nothing changed, and the person is signed in all the same.
   */
  outcome: z.enum(["created", "added", "replaced", "already", "in_use"]),
  email: z.string(),
});

export type EmailLink = z.infer<typeof emailLinkSchema>;

export const signedInSchema = tokensSchema.extend({
  user: meSchema,
  /** True when this sign-in created the account. */
  isNewUser: z.boolean(),
  /** Only with a waiting Google or Apple sign-in. */
  providerLink: providerLinkSchema.optional(),
  /** Only with a waiting email sign-in. */
  emailLink: emailLinkSchema.optional(),
  /**
   * For a new account made with Google or Apple: the first name the
   * provider gave, to fill in step 3's field (R19.5). Not stored.
   */
  suggestedFirstName: z.string().optional(),
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
  summary: "Text the phone step's code, for a waiting email, Google or Apple sign-in",
  tags: ["auth"],
  request: { body: startPhoneSignInBodySchema },
  responses: {
    202: {
      description: "A code was sent. The reply is the same for new and existing accounts.",
      schema: startPhoneSignInResponseSchema,
    },
    400: {
      description:
        "phone_invalid, phone_country_unsupported, validation_failed; provider_expired: the waiting sign-in is gone, and no text was sent",
      ...errors,
    },
    429: { description: "rate_limited, with retryAfterSeconds", ...errors },
    502: { description: "sms_failed", ...errors },
    503: { description: "sms_paused: text messages are paused for a short while", ...errors },
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
      description:
        "code_invalid (with attemptsLeft), code_expired, phone_invalid; invite_invalid: the invite code does not work, and counts as a wrong code; provider_expired: the email, Google or Apple sign-in waited more than 30 minutes, and the code is kept",
      ...errors,
    },
    403: {
      description:
        "account_unavailable; invite_required: the number has no account and the beta is closed, send the same code again with inviteCode",
      ...errors,
    },
    409: {
      description:
        "beta_full: the beta has no places left; provider_in_use: no account is made for a Google or Apple account another account has, and the code is kept",
      ...errors,
    },
    429: { description: "code_attempts_exceeded, with retryAfterSeconds", ...errors },
    503: {
      description:
        "signups_paused: new accounts are paused for a short while; the code is kept and members sign in",
      ...errors,
    },
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

/** Where the app opens a Google or Apple sign-in, in a pop-up or the browser sheet (ADR 0034). */
export const providerStartPath = (provider: (typeof signInProviders)[number]) =>
  `/v1/auth/oauth/${provider}/start`;

export const startProviderSignInRoute = defineRoute({
  method: "get",
  path: "/v1/auth/oauth/{provider}/start",
  summary: "Opened in a browser window: sends the person to Google or Apple",
  tags: ["auth"],
  request: {
    params: z.object({ provider: signInProviderSchema }),
    query: z.object({
      /** SHA-256 of the app's secret for this sign-in, base64url (43 characters). */
      challenge: z.string().optional(),
      /** Where the browser goes back to: the web app's or the app's sign-in/return. */
      returnUrl: z.string().optional(),
    }),
  },
  responses: {
    303: { description: "To the provider; or back to returnUrl with #error=failed" },
    400: { description: "A page: the challenge or the return address is not allowed" },
    404: { description: "A page: this provider is off" },
  },
});

const callbackAnswers = {
  303: {
    description:
      "To returnUrl with #ticket=… (5 minutes, once), #error=cancelled, #error=expired (after 10 minutes, the first time) or #error=failed",
  },
  400: { description: "A page: the sign-in is unknown, used or older than 10 minutes" },
} as const;

export const providerCallbackRoute = defineRoute({
  method: "get",
  path: "/v1/auth/oauth/google/callback",
  summary: "Where Google sends the person back; on to the app with a one-time ticket",
  tags: ["auth"],
  request: {
    query: z.object({
      state: z.string().optional(),
      code: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  responses: callbackAnswers,
});

/** What Apple posts back (response_mode=form_post). */
export const appleCallbackBodySchema = z.object({
  state: z.string().optional(),
  code: z.string().optional(),
  error: z.string().optional(),
  /** JSON with the person's name and email: sent only the first time. */
  user: z.string().optional(),
});

export const appleCallbackRoute = defineRoute({
  method: "post",
  path: "/v1/auth/oauth/apple/callback",
  summary: "Where Apple posts the person back; on to the app with a one-time ticket",
  tags: ["auth"],
  request: { body: appleCallbackBodySchema, bodyType: "form" },
  responses: callbackAnswers,
});

export const finishProviderSignInBodySchema = z.object({
  /** From the return address's fragment (`sr_pt_…`). */
  ticket: z.string().regex(/^sr_pt_[A-Za-z0-9_-]{43}$/),
  /** The app's secret whose SHA-256 was the start's challenge. */
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  device: deviceSchema,
});

export const phoneNeededSchema = z.object({
  status: z.literal("phoneNeeded"),
  /** Send it with the phone step's code, within 30 minutes. */
  pendingSignIn: z.string(),
  /** How the person signed in so far: Google, Apple, or a code by email (spec 26). */
  provider: z.enum([...signInProviders, "email"]),
  /** The verified email, for the line on top of the phone step; null when hidden or unverified. */
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  expiresAt: timestampSchema,
});

export type PhoneNeeded = z.infer<typeof phoneNeededSchema>;

export const finishProviderSignInResponseSchema = z.discriminatedUnion("status", [
  signedInSchema.extend({ status: z.literal("signedIn") }),
  phoneNeededSchema,
]);

export const finishProviderSignInRoute = defineRoute({
  method: "post",
  path: "/v1/auth/oauth/finish",
  summary: "Trade a Google or Apple ticket for a session, or for the phone step",
  tags: ["auth"],
  request: { body: finishProviderSignInBodySchema },
  responses: {
    200: {
      description:
        "signedIn: a linked account, signed in; phoneNeeded: a newcomer, who gives a phone number next",
      schema: finishProviderSignInResponseSchema,
    },
    400: { description: "ticket_invalid, validation_failed", ...errors },
    403: { description: "account_unavailable", ...errors },
  },
});

const emailSchema = z.string().trim().min(1).max(320);

export const startEmailSignInBodySchema = z.object({
  email: emailSchema,
  /** The language of the email. */
  locale: localeSchema,
});

export const verifyEmailCodeBodySchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/),
  device: deviceSchema,
});

export const verifyEmailCodeResponseSchema = z.discriminatedUnion("status", [
  signedInSchema.extend({ status: z.literal("signedIn") }),
  phoneNeededSchema,
]);

export const startEmailSignInRoute = defineRoute({
  method: "post",
  path: "/v1/auth/email/start",
  summary: "Email a sign-in code (spec 26)",
  tags: ["auth"],
  request: { body: startEmailSignInBodySchema },
  responses: {
    202: {
      description:
        "A code was sent. The reply is the same whether or not an account has the email.",
      schema: startPhoneSignInResponseSchema,
    },
    400: { description: "email_invalid, validation_failed", ...errors },
    429: { description: "rate_limited, with retryAfterSeconds", ...errors },
    502: { description: "email_failed: it was not sent; try again", ...errors },
    503: { description: "email_unavailable: this server sends no email", ...errors },
  },
});

export const verifyEmailCodeRoute = defineRoute({
  method: "post",
  path: "/v1/auth/email/verify",
  summary: "Check an email code; sign in, or go on to the phone step",
  tags: ["auth"],
  request: { body: verifyEmailCodeBodySchema },
  responses: {
    200: {
      description:
        "signedIn: the email's account, signed in; phoneNeeded: no account has the email, so the phone number comes next",
      schema: verifyEmailCodeResponseSchema,
    },
    400: {
      description: "code_invalid (with attemptsLeft), code_expired, email_invalid",
      ...errors,
    },
    403: { description: "account_unavailable", ...errors },
    429: { description: "code_attempts_exceeded, with retryAfterSeconds", ...errors },
  },
});

/** A password as typed; its rules are checked when one is set (spec 27, R27.2). */
export const passwordInputSchema = z.string().min(1).max(1024);

export const passwordSignInBodySchema = z.object({
  email: emailSchema,
  password: passwordInputSchema,
  device: deviceSchema,
});

export const passwordSignInRoute = defineRoute({
  method: "post",
  path: "/v1/auth/password",
  summary: "Sign in with the account's email and its password (spec 27)",
  tags: ["auth"],
  request: { body: passwordSignInBodySchema },
  responses: {
    200: {
      description: "Signed in",
      schema: signedInSchema.extend({ status: z.literal("signedIn") }),
    },
    400: {
      description:
        "credentials_invalid: the same for a wrong password, an unknown email and an account without a password",
      ...errors,
    },
    403: { description: "account_unavailable", ...errors },
    429: { description: "rate_limited, with retryAfterSeconds (R27.4)", ...errors },
  },
});

export const passkeySignInOptionsRoute = defineRoute({
  method: "post",
  path: "/v1/auth/passkey/options",
  summary: "Start signing in with Face ID or fingerprint, a passkey on the device (spec 27, 3.3)",
  tags: ["auth"],
  request: { body: z.object({}) },
  responses: {
    200: {
      description: "Options for navigator.credentials.get; any of the site's passkeys may answer",
      schema: webAuthnOptionsResponseSchema,
    },
    429: { description: "rate_limited, with retryAfterSeconds", ...errors },
  },
});

export const passkeySignInRoute = defineRoute({
  method: "post",
  path: "/v1/auth/passkey",
  summary: "Sign in with a passkey's answer (spec 27, 3.3)",
  tags: ["auth"],
  request: { body: z.object({ credential: passkeyAssertionSchema, device: deviceSchema }) },
  responses: {
    200: {
      description: "Signed in",
      schema: signedInSchema.extend({ status: z.literal("signedIn") }),
    },
    400: {
      description:
        "passkey_unknown: the site has no such passkey (removed), so the browser may forget it (spec 28, 3.4); passkey_invalid: the console's passkey, or a bad answer; passkey_expired: the challenge was used, or answered after 5 minutes",
      ...errors,
    },
    403: { description: "account_unavailable", ...errors },
  },
});
