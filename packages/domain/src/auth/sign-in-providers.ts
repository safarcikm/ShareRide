import { err, ok, type Result } from "../result.ts";
import { normaliseEmail } from "./email-address.ts";
import { validateProfileChanges } from "./profile.ts";
import type { RateLimitRule } from "./rate-limit.ts";

// Signing in with Google and Apple (spec 19; ADR 0034): what a provider's
// answer is worth, how it links to an account, and where the browser may
// go back to. The API does the I/O; these are the rules.

export const signInProviders = ["google", "apple"] as const;
export type SignInProvider = (typeof signInProviders)[number];

/** Where the app runs, as the sign-in rules tell them apart. */
export type SignInPlatform = "ios" | "android" | "web";

/**
 * The providers an app offers of those the API has set up (spec 32, 3.3;
 * R32.5): all of them, except Google on the iPhone without Sign in with
 * Apple beside it, as Apple's guideline 4.8 asks. Members who joined with
 * Google sign in there with an email code to their Google address.
 */
export function providersOffered(
  enabled: readonly SignInProvider[],
  platform: SignInPlatform,
): SignInProvider[] {
  if (platform !== "ios" || enabled.includes("apple")) return [...enabled];
  return enabled.filter((provider) => provider !== "google");
}

export const providerSignInRules = {
  /** From the tap to the provider's answer. */
  startValidSeconds: 10 * 60,
  /** From the provider's answer to the end of the phone step (spec 19, 3.3 item 5). */
  pendingValidSeconds: 30 * 60,
  /** The one-time ticket the app trades for a session or the phone step. */
  ticketValidSeconds: 5 * 60,
  /** Starts per address (its /64 for IPv6), so nobody fills the table. */
  startLimits: [{ limit: 20, windowSeconds: 10 * 60 }] satisfies readonly RateLimitRule[],
} as const;

/** The path the browser comes back to, on the web app's origin or the app's scheme. */
export const providerReturnPath = "sign-in/return";

/** What ShareRide keeps of a provider's answer (R19.4, R19.5). */
export interface ProviderClaims {
  /** The provider's own identifier for the person, which does not change. */
  readonly subject: string;
  /** Only when the provider says it is verified. */
  readonly email: string | null;
  /** Only to fill in step 3's field; one that passes the first name rule, or null. */
  readonly firstName: string | null;
}

const maxSubjectLength = 255;

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

function firstNameFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const checked = validateProfileChanges({ firstName: value });
  return checked.ok ? (checked.value.firstName ?? null) : null;
}

/**
 * Reads a checked ID token's claims, and Apple's `user` form field, which
 * carries the name the first time only. Everything else (last name,
 * picture, locale) is left behind.
 */
export function readProviderClaims(input: {
  readonly claims: Readonly<Record<string, unknown>>;
  readonly appleUser?: unknown;
}): Result<ProviderClaims, { readonly code: "claims_invalid" }> {
  const { claims } = input;
  const subject = claims.sub;
  if (typeof subject !== "string" || subject === "" || subject.length > maxSubjectLength) {
    return err({ code: "claims_invalid" });
  }
  const verified = claims.email_verified === true || claims.email_verified === "true";
  const email =
    verified && typeof claims.email === "string" ? normaliseEmail(claims.email) : undefined;
  const appleName = asRecord(asRecord(input.appleUser)?.name);
  return ok({
    subject,
    email: email?.ok === true ? email.value : null,
    firstName: firstNameFrom(claims.given_name) ?? firstNameFrom(appleName?.firstName),
  });
}

export type LinkDecision =
  /** The number has no account: make it, linked. */
  | { readonly action: "create" }
  | { readonly action: "link" }
  /** The phone step proved the account: the new provider account takes the old one's place. */
  | { readonly action: "replace"; readonly replacedIdentityId: string }
  | { readonly action: "already_linked" }
  | {
      readonly action: "refuse";
      readonly code: "provider_in_use" | "provider_already_linked";
    };

/**
 * How a provider account joins a ShareRide account (plan 4.2). `via` is the
 * phone step, whose code proves the number's account, or Settings, where a
 * confirm code does (R19.3).
 */
export function decideLink(input: {
  readonly via: "phone" | "settings";
  /** The account the code proved; null when the number has none yet. */
  readonly accountId: string | null;
  /** The account the provider account is linked to now, if any. */
  readonly subjectOwnerId: string | null;
  /** The account's own link of this provider, if any. */
  readonly accountLink: { readonly id: string; readonly subject: string } | null;
}): LinkDecision {
  const { via, accountId, subjectOwnerId, accountLink } = input;
  if (accountId === null) {
    return subjectOwnerId === null
      ? { action: "create" }
      : { action: "refuse", code: "provider_in_use" };
  }
  if (subjectOwnerId === accountId) return { action: "already_linked" };
  if (subjectOwnerId !== null) return { action: "refuse", code: "provider_in_use" };
  if (accountLink === null) return { action: "link" };
  return via === "phone"
    ? { action: "replace", replacedIdentityId: accountLink.id }
    : { action: "refuse", code: "provider_already_linked" };
}

/** The domain of Apple's private relay addresses (spec 19, 3.5). */
const appleRelayDomain = "privaterelay.appleid.com";

/** An address of Apple's private relay, which stands in for a hidden email. */
export function isAppleRelay(email: string): boolean {
  return email.toLowerCase().endsWith(`@${appleRelayDomain}`);
}

/**
 * The email to put on the account, or null to leave it as it is (R19.4):
 * a verified one fills an empty email, or takes the place of the Apple
 * relay address of the link it replaces (spec 19, 3.5); never one another
 * account has, and never over the person's own, even when it came from the
 * Google account being replaced (3.3).
 */
export function emailToStore(input: {
  readonly providerEmail: string | null;
  readonly accountEmail: string | null;
  readonly takenByOther: boolean;
  /** The email of the link being replaced, if any. */
  readonly replacedLinkEmail?: string | null;
}): string | null {
  const { providerEmail, accountEmail, takenByOther, replacedLinkEmail } = input;
  if (providerEmail === null || takenByOther || providerEmail === accountEmail) return null;
  if (accountEmail === null) return providerEmail;
  const relayOfReplacedLink =
    replacedLinkEmail !== undefined &&
    replacedLinkEmail !== null &&
    accountEmail === replacedLinkEmail &&
    isAppleRelay(replacedLinkEmail);
  return relayOfReplacedLink ? providerEmail : null;
}

export interface ReturnUrlsAllowed {
  /** The web app's origins, such as https://staging.skinnar.is. */
  readonly webOrigins: readonly string[];
  /** The app's own scheme, `shareride`. */
  readonly appScheme: string;
  /** Expo Go's `exp://` addresses: in development only, never on a server. */
  readonly allowExpoGo: boolean;
}

/** Expo Go's address for the return path: a host, a port, then `/--/` and the path. */
const expoGoReturn = /^exp:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/--\/sign-in\/return$/;

/**
 * Whether the browser may be sent back to this address with a ticket: the
 * return path on one of the web app's origins, the app's scheme, or Expo
 * Go's in development. Exactly, with no query, fragment or user name.
 */
export function isAllowedReturnUrl(url: string, allowed: ReturnUrlsAllowed): boolean {
  if (url === `${allowed.appScheme}://${providerReturnPath}`) return true;
  if (allowed.webOrigins.some((origin) => url === `${origin}/${providerReturnPath}`)) return true;
  return allowed.allowExpoGo && expoGoReturn.test(url);
}

/** A PKCE-style challenge: SHA-256 in base64url, without padding (43 characters). */
export function isChallengeShaped(challenge: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(challenge);
}
