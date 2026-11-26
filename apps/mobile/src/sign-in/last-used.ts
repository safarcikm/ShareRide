import type { SignInProvider, SignInWay } from "@shareride/domain";

/** What step 1 offers now. */
export interface OfferedWays {
  readonly providers: readonly SignInProvider[];
  /** Face ID or fingerprint: the server has it and the device has its own lock. */
  readonly passkey: boolean;
  /** The email form, for the email code and a password. */
  readonly email: boolean;
}

/**
 * The way to put first on step 1, marked "Last used" (spec 29, 3.5): the way
 * this browser last signed in with, while the screen still offers it; null
 * keeps today's order.
 */
export function firstWay(last: SignInWay | null, offered: OfferedWays): SignInWay | null {
  switch (last) {
    case null:
      return null;
    case "google":
    case "apple":
      return offered.providers.includes(last) ? last : null;
    case "passkey":
      return offered.passkey ? last : null;
    case "password":
    case "email":
      return offered.email ? last : null;
  }
}
