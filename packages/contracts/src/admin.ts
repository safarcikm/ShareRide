import { z } from "zod";
import { localeSchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// The operator console's own endpoints (ADR 0028). Every route here is under
// /admin/v1 and needs the operator's session cookie.

/** Error codes of the console's sign-in and guard. */
export const adminErrorCodes = [
  "operator_unauthenticated",
  "operator_unavailable",
  "setup_link_invalid",
  "passkey_invalid",
  "last_passkey",
  "rate_limited",
  "not_found",
] as const;

export type AdminErrorCode = (typeof adminErrorCodes)[number];

const errors = { schema: errorResponseSchema } as const;

/** The signed-in operator and when the console session ends unless used. */
export const adminMeSchema = z.object({
  userId: z.uuid(),
  firstName: z.string().nullable(),
  locale: localeSchema,
  sessionEndsAt: timestampSchema,
});

export type AdminMe = z.infer<typeof adminMeSchema>;

export const adminMeRoute = defineRoute({
  method: "get",
  path: "/admin/v1/me",
  summary: "The signed-in operator",
  tags: ["admin"],
  auth: "operator",
  responses: {
    200: { description: "The operator", schema: adminMeSchema },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminSignOutRoute = defineRoute({
  method: "post",
  path: "/admin/v1/sign-out",
  summary: "Sign out of the console",
  tags: ["admin"],
  auth: "operator",
  request: { body: z.object({}) },
  responses: {
    204: { description: "Signed out" },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

/**
 * Options for the browser's `navigator.credentials` call, made by the
 * server (WebAuthn's JSON form). The console passes them on unchanged.
 */
const webAuthnOptionsSchema = z.looseObject({ challenge: z.string().max(200) });

const base64url = z
  .string()
  .max(4096)
  .regex(/^[A-Za-z0-9_-]*$/);
const longBase64url = z
  .string()
  .max(65_536)
  .regex(/^[A-Za-z0-9_-]*$/);

/** A new passkey from `navigator.credentials.create`, as JSON (`toJSON()`). */
export const passkeyRegistrationSchema = z.looseObject({
  id: base64url,
  rawId: base64url,
  type: z.literal("public-key"),
  response: z.looseObject({
    clientDataJSON: longBase64url,
    attestationObject: longBase64url,
    transports: z.array(z.string().max(32)).max(10).optional(),
  }),
  clientExtensionResults: z.looseObject({}),
  authenticatorAttachment: z.string().max(32).optional(),
});

/** A passkey's answer from `navigator.credentials.get`, as JSON (`toJSON()`). */
export const passkeyAssertionSchema = z.looseObject({
  id: base64url,
  rawId: base64url,
  type: z.literal("public-key"),
  response: z.looseObject({
    clientDataJSON: longBase64url,
    authenticatorData: longBase64url,
    signature: base64url,
    userHandle: base64url.optional(),
  }),
  clientExtensionResults: z.looseObject({}),
  authenticatorAttachment: z.string().max(32).optional(),
});

/** What the operator calls a passkey, such as "Laptop". */
export const passkeyNameSchema = z.string().trim().min(1).max(60);

/** The setup link's token, from after the `#` of `/admin/setup#…`. */
const setupTokenSchema = z
  .string()
  .max(200)
  .regex(/^sr_ol_[A-Za-z0-9_-]+$/);

export const webAuthnOptionsResponseSchema = z.object({ options: webAuthnOptionsSchema });

export const adminSetupOptionsRoute = defineRoute({
  method: "post",
  path: "/admin/v1/auth/setup/options",
  summary: "Start saving the first passkey with a setup link",
  tags: ["admin"],
  request: { body: z.object({ token: setupTokenSchema }) },
  responses: {
    200: {
      description: "Options for navigator.credentials.create",
      schema: webAuthnOptionsResponseSchema,
    },
    400: { description: "setup_link_invalid", ...errors },
    429: { description: "rate_limited", ...errors },
  },
});

export const adminSetupRoute = defineRoute({
  method: "post",
  path: "/admin/v1/auth/setup",
  summary: "Save the first passkey and sign in",
  tags: ["admin"],
  request: {
    body: z.object({
      token: setupTokenSchema,
      credential: passkeyRegistrationSchema,
      name: passkeyNameSchema,
    }),
  },
  responses: {
    200: { description: "Signed in; the session cookie is set", schema: adminMeSchema },
    400: { description: "setup_link_invalid or passkey_invalid", ...errors },
    429: { description: "rate_limited", ...errors },
  },
});

export const adminSignInOptionsRoute = defineRoute({
  method: "post",
  path: "/admin/v1/auth/sign-in/options",
  summary: "Start signing in with a passkey",
  tags: ["admin"],
  request: { body: z.object({}) },
  responses: {
    200: {
      description: "Options for navigator.credentials.get",
      schema: webAuthnOptionsResponseSchema,
    },
    429: { description: "rate_limited", ...errors },
  },
});

export const adminSignInRoute = defineRoute({
  method: "post",
  path: "/admin/v1/auth/sign-in",
  summary: "Sign in with a passkey",
  tags: ["admin"],
  request: { body: z.object({ credential: passkeyAssertionSchema }) },
  responses: {
    200: { description: "Signed in; the session cookie is set", schema: adminMeSchema },
    401: { description: "passkey_invalid", ...errors },
    403: { description: "operator_unavailable", ...errors },
    429: { description: "rate_limited", ...errors },
  },
});

export const adminConfirmOptionsRoute = defineRoute({
  method: "post",
  path: "/admin/v1/confirm/options",
  summary: "Start confirming it is the operator, with one of their passkeys",
  tags: ["admin"],
  auth: "operator",
  request: { body: z.object({}) },
  responses: {
    200: {
      description: "Options for navigator.credentials.get",
      schema: webAuthnOptionsResponseSchema,
    },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminConfirmRoute = defineRoute({
  method: "post",
  path: "/admin/v1/confirm",
  summary: "Confirm it is the operator, before changing passkeys",
  tags: ["admin"],
  auth: "operator",
  request: { body: z.object({ credential: passkeyAssertionSchema }) },
  responses: {
    200: {
      description: "Confirmed; passkeys can change until then",
      schema: z.object({ confirmedUntil: timestampSchema }),
    },
    400: { description: "passkey_invalid", ...errors },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const passkeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Synced to the operator's other devices by their passkey manager. */
  backedUp: z.boolean(),
  createdAt: timestampSchema,
  lastUsedAt: timestampSchema.nullable(),
});

export type Passkey = z.infer<typeof passkeySchema>;

export const adminPasskeysRoute = defineRoute({
  method: "get",
  path: "/admin/v1/passkeys",
  summary: "The signed-in operator's passkeys",
  tags: ["admin"],
  auth: "operator",
  responses: {
    200: {
      description: "Passkeys, oldest first",
      schema: z.object({ passkeys: z.array(passkeySchema) }),
    },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminAddPasskeyOptionsRoute = defineRoute({
  method: "post",
  path: "/admin/v1/passkeys/options",
  summary: "Start saving another passkey",
  tags: ["admin"],
  auth: "operator",
  request: { body: z.object({}) },
  responses: {
    200: {
      description: "Options for navigator.credentials.create",
      schema: webAuthnOptionsResponseSchema,
    },
    401: { description: "operator_unauthenticated", ...errors },
    403: { description: "confirmation_required: confirm with a passkey first", ...errors },
  },
});

export const adminAddPasskeyRoute = defineRoute({
  method: "post",
  path: "/admin/v1/passkeys",
  summary: "Save another passkey",
  tags: ["admin"],
  auth: "operator",
  request: { body: z.object({ credential: passkeyRegistrationSchema, name: passkeyNameSchema }) },
  responses: {
    201: { description: "Saved", schema: passkeySchema },
    400: { description: "passkey_invalid", ...errors },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminRemovePasskeyRoute = defineRoute({
  method: "delete",
  path: "/admin/v1/passkeys/{id}",
  summary: "Remove a passkey",
  tags: ["admin"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    204: { description: "Removed" },
    401: { description: "operator_unauthenticated", ...errors },
    403: { description: "confirmation_required: confirm with a passkey first", ...errors },
    404: { description: "not_found", ...errors },
    409: { description: "last_passkey", ...errors },
  },
});
