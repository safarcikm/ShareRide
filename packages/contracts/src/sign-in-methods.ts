import { z } from "zod";
import { passkeyRegistrationSchema, webAuthnOptionsResponseSchema } from "./admin.ts";
import { passwordInputSchema, pendingSignInSchema, signInProviderSchema } from "./auth.ts";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { confirmCodeErrors } from "./me.ts";
import { defineRoute } from "./route.ts";

// Sign-in methods in Settings (spec 19, 3.4): the Google and Apple accounts
// linked to mine, adding one with a confirm code, and removing one.

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "unauthenticated", ...errors } as const;

export const signInMethodSchema = z.object({
  provider: signInProviderSchema,
  /** The email the provider vouched for; null when there was none. */
  email: z.string().nullable(),
  linkedAt: timestampSchema,
});

export type SignInMethod = z.infer<typeof signInMethodSchema>;

/** The account's password, when it has one: never the password itself (spec 27, R27.3). */
export const passwordStateSchema = z.object({ setAt: timestampSchema });
export type PasswordState = z.infer<typeof passwordStateSchema>;

/**
 * A device set up for Face ID or fingerprint (spec 27, 3.6): the browser
 * and system that set it up, such as Safari and iPhone, null when unknown.
 * `credentialId` (base64url) lets the browser forget it once removed
 * (spec 29, 3.4); it is no secret.
 */
export const memberPasskeySchema = z.object({
  id: z.uuid(),
  credentialId: z.string().min(1),
  browser: z.string().nullable(),
  system: z.string().nullable(),
  createdAt: timestampSchema,
  lastUsedAt: timestampSchema.nullable(),
});
export type MemberPasskey = z.infer<typeof memberPasskeySchema>;

export const signInMethodsSchema = z.object({
  methods: z.array(signInMethodSchema),
  /** Null when the account has no password (spec 27, 3.6). */
  password: passwordStateSchema.nullable().default(null),
  /** The devices set up for Face ID or fingerprint, oldest first; none from an API that does not say. */
  passkeys: z.array(memberPasskeySchema).default([]),
});

export const listSignInMethodsRoute = defineRoute({
  method: "get",
  path: "/v1/me/sign-in-methods",
  summary: "The Google and Apple accounts linked to mine",
  tags: ["me"],
  auth: true,
  responses: {
    200: { description: "Linked accounts, Google first", schema: signInMethodsSchema },
    401: unauthenticated,
  },
});

export const prepareSignInMethodBodySchema = z.object({
  ticket: z.string().regex(/^sr_pt_[A-Za-z0-9_-]{43}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
});

export const preparedSignInMethodSchema = z.object({
  /** Send it with a confirm code to `POST /v1/me/sign-in-methods`, within 30 minutes. */
  pendingSignIn: z.string(),
  provider: signInProviderSchema,
  email: z.string().nullable(),
  expiresAt: timestampSchema,
});

export const prepareSignInMethodRoute = defineRoute({
  method: "post",
  path: "/v1/me/sign-in-methods/prepare",
  summary: "Take the ticket of a Google or Apple sign-in to add it to my account",
  tags: ["me"],
  auth: true,
  request: { body: prepareSignInMethodBodySchema },
  responses: {
    200: {
      description: "It can be added: ask for a confirm code, then add it",
      schema: preparedSignInMethodSchema,
    },
    400: { description: "ticket_invalid, validation_failed", ...errors },
    401: unauthenticated,
    409: {
      description: "provider_in_use: another account has it; provider_already_linked: mine has one",
      ...errors,
    },
  },
});

export const addSignInMethodBodySchema = z.object({
  pendingSignIn: pendingSignInSchema,
  /** A fresh code from `POST /v1/me/confirm-code` (R19.3). */
  code: z.string().regex(/^\d{6}$/),
});

export const addSignInMethodRoute = defineRoute({
  method: "post",
  path: "/v1/me/sign-in-methods",
  summary: "Add a Google or Apple account to mine, with a confirm code (spec 19, 3.4)",
  tags: ["me"],
  auth: true,
  request: { body: addSignInMethodBodySchema },
  responses: {
    201: { description: "Added", schema: signInMethodSchema },
    400: {
      description: `${confirmCodeErrors[400].description}; provider_expired: prepare it again`,
      ...errors,
    },
    401: unauthenticated,
    409: {
      description: "provider_in_use, provider_already_linked; the code still works",
      ...errors,
    },
    429: confirmCodeErrors[429],
  },
});

export const removeSignInMethodRoute = defineRoute({
  method: "delete",
  path: "/v1/me/sign-in-methods/{provider}",
  summary: "Remove my Google or Apple account; the phone number stays (R19.7)",
  tags: ["me"],
  auth: true,
  request: { params: z.object({ provider: signInProviderSchema }) },
  responses: {
    204: { description: "Removed; sessions stay signed in" },
    401: unauthenticated,
    404: { description: "not_found: none of this provider is linked", ...errors },
  },
});

export const setPasswordBodySchema = z.object({
  password: passwordInputSchema,
  /**
   * A confirm code, needed unless this device signed in less than 10
   * minutes ago (spec 27, R27.5).
   */
  code: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export const setPasswordRoute = defineRoute({
  method: "put",
  path: "/v1/me/password",
  summary: "Add or change my password (spec 27, 3.5)",
  tags: ["me"],
  auth: true,
  request: { body: setPasswordBodySchema },
  responses: {
    200: { description: "Saved; the verified email is told", schema: passwordStateSchema },
    400: {
      description: `password_too_short, password_too_long, password_too_common, password_is_email (R27.2); ${confirmCodeErrors[400].description}`,
      ...errors,
    },
    401: unauthenticated,
    403: {
      description: "confirm_required: send a confirm code with it (R27.5)",
      ...errors,
    },
    409: { description: "email_required: a password needs a verified email", ...errors },
    429: {
      description: `${confirmCodeErrors[429].description}; rate_limited, with retryAfterSeconds: 10 new passwords an hour (R27.4)`,
      ...errors,
    },
  },
});

export const removePasswordRoute = defineRoute({
  method: "delete",
  path: "/v1/me/password",
  summary: "Remove my password; the email code still signs in",
  tags: ["me"],
  auth: true,
  responses: {
    204: { description: "Removed; the verified email is told" },
    401: unauthenticated,
    404: { description: "not_found: the account has no password", ...errors },
  },
});

/** A confirm code, needed unless this device signed in less than 10 minutes ago (R27.5). */
const freshCodeSchema = z
  .string()
  .regex(/^\d{6}$/)
  .optional();

export const passkeySetupOptionsRoute = defineRoute({
  method: "post",
  path: "/v1/me/passkeys/options",
  summary: "Start setting up Face ID or fingerprint on this device (spec 27, 3.6)",
  tags: ["me"],
  auth: true,
  request: { body: z.object({ code: freshCodeSchema }) },
  responses: {
    200: {
      description:
        "Options for navigator.credentials.create: a passkey kept on the device, not the account's others",
      schema: webAuthnOptionsResponseSchema,
    },
    400: confirmCodeErrors[400],
    401: unauthenticated,
    403: {
      description: "confirm_required: send a confirm code (R27.5)",
      ...errors,
    },
    409: { description: "too_many: 10 devices are set up already (R27.8)", ...errors },
    429: confirmCodeErrors[429],
  },
});

export const addPasskeyRoute = defineRoute({
  method: "post",
  path: "/v1/me/passkeys",
  summary: "Save the passkey this device made; the verified email is told",
  tags: ["me"],
  auth: true,
  request: { body: z.object({ credential: passkeyRegistrationSchema }) },
  responses: {
    201: { description: "Saved", schema: memberPasskeySchema },
    400: {
      description: "passkey_invalid: a challenge used, late or someone else's, or a bad answer",
      ...errors,
    },
    401: unauthenticated,
    409: { description: "too_many: 10 devices are set up already (R27.8)", ...errors },
  },
});

export const removePasskeyRoute = defineRoute({
  method: "delete",
  path: "/v1/me/passkeys/{id}",
  summary: "Remove Face ID or fingerprint on one device; the email code still signs in",
  tags: ["me"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    204: { description: "Removed" },
    401: unauthenticated,
    404: { description: "not_found", ...errors },
  },
});
