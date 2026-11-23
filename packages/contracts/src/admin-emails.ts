import { z } from "zod";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// The emails the signed-in operator gets for themselves (spec 25): each
// operator chooses their own, and a choice changes nothing for others.

const errors = { schema: errorResponseSchema } as const;

/** The operator's own email choices, and where the emails go. */
export const adminOwnEmailsSchema = z.object({
  /** The email when new members join, at most one an hour (R25.1, R25.3). */
  newMembers: z.boolean(),
  /** The operator's confirmed email address; null while there is none, so nothing is sent. */
  address: z.string().nullable(),
});

export type AdminOwnEmails = z.infer<typeof adminOwnEmailsSchema>;

export const adminOwnEmailsRoute = defineRoute({
  method: "get",
  path: "/admin/v1/me/emails",
  summary: "The emails the signed-in operator chose to get",
  tags: ["admin"],
  auth: "operator",
  responses: {
    200: { description: "The choices and the address", schema: adminOwnEmailsSchema },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminSetOwnEmailsRoute = defineRoute({
  method: "put",
  path: "/admin/v1/me/emails",
  summary: "Choose the emails the signed-in operator gets",
  tags: ["admin"],
  auth: "operator",
  request: { body: z.object({ newMembers: z.boolean() }) },
  responses: {
    200: { description: "The choices as stored", schema: adminOwnEmailsSchema },
    400: { description: "validation_failed", ...errors },
    401: { description: "operator_unauthenticated", ...errors },
  },
});
