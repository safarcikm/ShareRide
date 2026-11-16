import { z } from "zod";
import { localeSchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// The operator console's own endpoints (ADR 0028). Every route here is under
// /admin/v1 and needs the operator's session cookie.

/** Error codes of the console's sign-in and guard. */
export const adminErrorCodes = ["operator_unauthenticated"] as const;

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
