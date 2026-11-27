import type { SignInProvider, SignInWay } from "@shareride/domain";

/** What step 1 offers now. */
export interface OfferedWays {
  readonly providers: readonly SignInProvider[];
  /** The email form: the email code, a password, and a passkey among its suggestions. */
  readonly email: boolean;
}

/**
 * The way to put first on step 1, marked "Last used" (spec 29, 3.5): the way
 * this browser last signed in with, while the screen still offers it; null
 * keeps today's order. A passkey is picked in the email field (3.7), so after
 * one the form comes first.
 */
export function firstWay(last: SignInWay | null, offered: OfferedWays): SignInWay | null {
  switch (last) {
    case null:
      return null;
    case "google":
    case "apple":
      return offered.providers.includes(last) ? last : null;
    case "passkey":
    case "password":
    case "email":
      return offered.email ? last : null;
  }
}
