import type { RateLimitRule } from "../auth/rate-limit.ts";
import { err, ok, type Result } from "../result.ts";

// Invite codes and the tester cap (spec 12, 3.2; R12.1 to R12.3; feature
// J1). During the closed beta a new account needs a code that still works,
// and no code works once the beta is full.

/** The letters and digits of a code: none that are easily confused (no I, L, O, 0 or 1). */
export const inviteCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const inviteCodeLength = 8;

/** Checks of a code before sign-up, per address block (spec 12, 3.1.4 and section 6). */
export const inviteCheckLimitsPerAddress: readonly RateLimitRule[] = [
  { limit: 10, windowSeconds: 60 },
];

/** What a person may type for a code: any case, with spaces or hyphens between. */
export const inviteCodeInputMaxLength = 32;

/** A code as stored: upper case, without the spaces and hyphens people add. */
export function normaliseInviteCode(text: string): string {
  return text.replaceAll(/[\s-]/g, "").toUpperCase();
}

/** Whether a normalised text could be a code at all. */
export function isInviteCodeShaped(code: string): boolean {
  return (
    code.length === inviteCodeLength &&
    Array.from(code).every((letter) => inviteCodeAlphabet.includes(letter))
  );
}

/** A new code; `randomInt(max)` gives a secure whole number from 0 up to, not including, max. */
export function newInviteCode(randomInt: (max: number) => number): string {
  let code = "";
  for (let index = 0; index < inviteCodeLength; index += 1) {
    code += inviteCodeAlphabet.charAt(randomInt(inviteCodeAlphabet.length));
  }
  return code;
}

/** What the rules need to know of a stored code. */
export interface InviteCodeState {
  readonly usesAllowed: number;
  readonly uses: number;
  /** The code works until this moment, not at it. */
  readonly expiresAt: Date;
  /** When the operator ended it early. */
  readonly endedAt: Date | null;
}

export type InviteCodeProblem =
  /** Unknown, ended, expired or out of uses: one answer, so codes cannot be probed. */
  { readonly code: "invite_invalid" } | { readonly code: "beta_full" };

/** Whether a stored code still works on its own: not ended, not expired, uses left (R12.2). */
export function inviteCodeWorks(code: InviteCodeState, now: Date): boolean {
  return (
    code.endedAt === null &&
    now.getTime() < code.expiresAt.getTime() &&
    code.uses < code.usesAllowed
  );
}

/** How many more testers the beta takes (R12.3). */
export function placesLeft(maxTesters: number, testers: number): number {
  return Math.max(0, maxTesters - testers);
}

/**
 * Whether a new account can be made with a code now (R12.1 to R12.3).
 * `code` is undefined when no such code is stored; `testers` is the number
 * of accounts that joined with a code.
 */
export function checkInviteCode(
  code: InviteCodeState | undefined,
  testers: number,
  maxTesters: number,
  now: Date,
): Result<void, InviteCodeProblem> {
  if (code === undefined || !inviteCodeWorks(code, now)) return err({ code: "invite_invalid" });
  if (placesLeft(maxTesters, testers) === 0) return err({ code: "beta_full" });
  return ok(undefined);
}

export const groupCodeRules = {
  nameMaxLength: 80,
  maxUses: 500,
  /** The furthest ahead a code can end. */
  maxMonthsAhead: 12,
} as const;

export interface GroupCodeDraft {
  readonly name: string;
  readonly uses: number;
  readonly expiresAt: Date;
}

export type GroupCodeProblem =
  | { readonly code: "name_missing" }
  | { readonly code: "name_too_long"; readonly max: number }
  | { readonly code: "uses_out_of_range"; readonly min: number; readonly max: number }
  | { readonly code: "end_in_past" }
  | { readonly code: "end_too_far"; readonly latest: Date };

/** A group code the operator makes for a workplace, school or club (spec 12, 3.2.2). */
export function checkGroupCode(
  draft: GroupCodeDraft,
  now: Date,
): Result<GroupCodeDraft, GroupCodeProblem> {
  const name = draft.name.trim();
  if (name === "") return err({ code: "name_missing" });
  if (name.length > groupCodeRules.nameMaxLength) {
    return err({ code: "name_too_long", max: groupCodeRules.nameMaxLength });
  }
  if (!Number.isInteger(draft.uses) || draft.uses < 1 || draft.uses > groupCodeRules.maxUses) {
    return err({ code: "uses_out_of_range", min: 1, max: groupCodeRules.maxUses });
  }
  if (draft.expiresAt.getTime() <= now.getTime()) return err({ code: "end_in_past" });
  const latest = new Date(now);
  latest.setUTCMonth(latest.getUTCMonth() + groupCodeRules.maxMonthsAhead);
  if (draft.expiresAt.getTime() > latest.getTime()) return err({ code: "end_too_far", latest });
  return ok({ name, uses: draft.uses, expiresAt: draft.expiresAt });
}
