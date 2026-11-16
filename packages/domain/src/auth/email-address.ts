import { err, ok, type Result } from "../result.ts";
import type { RateLimitRule } from "./rate-limit.ts";

// An email address of one's own (spec 1, 3.5; plan 4.6): it is the
// account's once its link is opened.

/** How a link to verify an address works. */
export const emailLinkRules = {
  validForSeconds: 24 * 3600,
  /** Per account: once a minute, and 5 a day. */
  sendLimits: [
    { limit: 1, windowSeconds: 60 },
    { limit: 5, windowSeconds: 24 * 3600 },
  ] satisfies readonly RateLimitRule[],
} as const;

/** The longest address email allows (RFC 5321, with RFC 3696's errata). */
const maxLength = 254;

/** Something before the @, and a domain with a dot, without spaces. */
const shape = /^[^\s@]+@[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u;

/** The address as stored: without the spaces around it, in small letters. */
export function normaliseEmail(input: string): Result<string, { readonly code: "email_invalid" }> {
  const address = input.trim().toLowerCase();
  if (address.length > maxLength || !shape.test(address)) return err({ code: "email_invalid" });
  return ok(address);
}

export interface EmailLinkState {
  /** When it was asked for; a refused one counts towards the limits too. */
  readonly sentAt: Date;
  readonly usedAt: Date | null;
  /** When the email with the link was refused, so it never arrived. */
  readonly failedAt: Date | null;
  /** Whether no newer link went out to the account since (refused ones aside). */
  readonly newest: boolean;
}

/** Whether a link still works: sent, within 24 hours, not used, and the newest. */
export function checkEmailLink(
  link: EmailLinkState,
  now: Date,
): Result<undefined, { readonly code: "link_invalid" }> {
  const ageSeconds = (now.getTime() - link.sentAt.getTime()) / 1000;
  if (
    link.usedAt !== null ||
    link.failedAt !== null ||
    !link.newest ||
    ageSeconds >= emailLinkRules.validForSeconds
  ) {
    return err({ code: "link_invalid" });
  }
  return ok(undefined);
}
