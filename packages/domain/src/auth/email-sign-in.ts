import type { RateLimitRule } from "./rate-limit.ts";

// Signing in with a code by email, and the text message that only checks a
// phone number (spec 26, ADR 0046).

/** How often a sign-in code may be emailed (R26.4). */
export const emailCodeSendLimits = {
  perEmail: [
    { limit: 1, windowSeconds: 30 },
    { limit: 5, windowSeconds: 3600 },
  ],
  /** Per network address: an IPv6 address counts by its /64. */
  perIpAddress: [{ limit: 20, windowSeconds: 3600 }],
} as const satisfies Record<string, readonly RateLimitRule[]>;

/**
 * Limits on texts beside R1.3's: a waiting sign-in sends at most 3 (R26.2),
 * so trying many numbers needs many proven inboxes; all sign-in and confirm
 * texts together have a ceiling (R26.3) that bounds what abuse can cost.
 */
export const textSendLimits = {
  perPendingSignIn: [{ limit: 3, windowSeconds: 24 * 3600 }],
  all: [
    { limit: 300, windowSeconds: 3600 },
    { limit: 1000, windowSeconds: 24 * 3600 },
  ],
} as const satisfies Record<string, readonly RateLimitRule[]>;

export const emailSignInRules = {
  /** A proven email waits this long for the phone step (3.3, item 5), as Google's does. */
  waitingSeconds: 30 * 60,
} as const;

/** What becomes of a proven email at the phone step (3.3, item 3). */
export type EmailAtPhoneStep = "created" | "added" | "replaced" | "already" | "in_use";

/**
 * `accountEmail` is the number's account's email: `undefined` when the
 * number has no account, `null` when the account has no email.
 * `takenByOther` is whether another account has the new email.
 */
export function emailAtPhoneStep(input: {
  readonly accountEmail: string | null | undefined;
  readonly newEmail: string;
  readonly takenByOther: boolean;
}): EmailAtPhoneStep {
  const { accountEmail, newEmail, takenByOther } = input;
  if (accountEmail === newEmail) return "already";
  if (takenByOther) return "in_use";
  if (accountEmail === undefined) return "created";
  return accountEmail === null ? "added" : "replaced";
}

/** How a confirm code reaches the person (R26.7). */
export function confirmChannel(hasVerifiedEmail: boolean): "email" | "sms" {
  return hasVerifiedEmail ? "email" : "sms";
}

/** Within this long of the account being made, an email is added without a code (R26.5). */
export const emailChangeWithoutCodeSeconds = 30 * 60;

/** Whether changing the email needs a confirm code first (3.7, R26.5). */
export function emailChangeNeedsCode(accountCreatedAt: Date, now: Date): boolean {
  return now.getTime() - accountCreatedAt.getTime() >= emailChangeWithoutCodeSeconds * 1000;
}

/**
 * An address shown partly hidden, such as "an•••@gmail.com": enough for its
 * owner to know it, too little for anyone else (3.6, R26.6).
 */
export function hideEmail(email: string): string {
  const at = email.lastIndexOf("@");
  const name = email.slice(0, at);
  const kept = name.length > 2 ? name.slice(0, 2) : name.slice(0, 1);
  return `${kept}•••${email.slice(at)}`;
}
