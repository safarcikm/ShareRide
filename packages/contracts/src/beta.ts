import { groupCodeRules, inviteCodeInputMaxLength } from "@shareride/domain";
import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// The closed beta's invite codes (spec 12, 3.2 and section 6): checking a
// code before sign-up, and the console's group codes.

const errors = { schema: errorResponseSchema } as const;

/** A code as typed: any case, with spaces or hyphens; the API tidies it. */
export const inviteCodeInputSchema = z.string().trim().min(1).max(inviteCodeInputMaxLength);

export const checkInviteCodeRoute = defineRoute({
  method: "post",
  path: "/v1/invites/check",
  summary: "Whether an invite code would work now; 10 a minute per address",
  tags: ["beta"],
  request: { body: z.object({ code: inviteCodeInputSchema }) },
  responses: {
    200: {
      description: "The code works, or no code is needed just now",
      schema: z.object({ valid: z.literal(true) }),
    },
    400: { description: "invite_invalid: unknown, ended, expired or used up", ...errors },
    409: { description: "beta_full: the beta has no places left", ...errors },
    429: { description: "rate_limited, with retryAfterSeconds", ...errors },
  },
});

export const adminInviteCodeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  kind: z.enum(["group", "personal"]),
  name: z.string(),
  usesAllowed: z.int(),
  uses: z.int(),
  expiresAt: timestampSchema,
  endedAt: timestampSchema.nullable(),
  /** Whether a new account could be made with it now, were there a place. */
  works: z.boolean(),
  createdAt: timestampSchema,
});

export type AdminInviteCode = z.infer<typeof adminInviteCodeSchema>;

export const adminInviteCodesSchema = z.object({
  /** Whether a new account needs a code at all (`invite_code_required`). */
  required: z.boolean(),
  /** Accounts that joined with a code. */
  testers: z.int(),
  /** `beta_max_testers`. */
  maxTesters: z.int(),
  placesLeft: z.int(),
  /** Newest first. */
  codes: z.array(adminInviteCodeSchema),
});

export type AdminInviteCodes = z.infer<typeof adminInviteCodesSchema>;

export const adminInviteCodesRoute = defineRoute({
  method: "get",
  path: "/admin/v1/invite-codes",
  summary: "Every invite code with its uses, and the places left in the beta",
  tags: ["admin", "beta"],
  auth: "operator",
  responses: {
    200: { description: "The codes, newest first", schema: adminInviteCodesSchema },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminCreateInviteCodeBodySchema = z.object({
  /** Who it is for, such as the workplace; 1 to 80 characters. */
  name: z.string().max(groupCodeRules.nameMaxLength * 4),
  /** How many accounts can be made with it; 1 to 500. */
  uses: z.number(),
  /** It works until this moment: in the future, at most 12 months ahead. */
  expiresAt: timestampSchema,
});

export const adminCreateInviteCodeRoute = defineRoute({
  method: "post",
  path: "/admin/v1/invite-codes",
  summary: "Make a group code; the API picks the code",
  tags: ["admin", "beta"],
  auth: "operator",
  request: { body: adminCreateInviteCodeBodySchema },
  responses: {
    201: { description: "The new code", schema: adminInviteCodeSchema },
    400: {
      description: "validation_failed: the name, the uses or the end is not allowed",
      ...errors,
    },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminEndInviteCodeRoute = defineRoute({
  method: "post",
  path: "/admin/v1/invite-codes/{id}/end",
  summary: "End a code now; the accounts made with it stay",
  tags: ["admin", "beta"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: { description: "The code, ended", schema: adminInviteCodeSchema },
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found", ...errors },
    409: { description: "already_ended", ...errors },
  },
});
