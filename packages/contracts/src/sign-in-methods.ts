import { z } from "zod";
import { pendingSignInSchema, signInProviderSchema } from "./auth.ts";
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

export const signInMethodsSchema = z.object({ methods: z.array(signInMethodSchema) });

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
