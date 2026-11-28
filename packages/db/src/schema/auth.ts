import { codePurposes, signInProviders } from "@shareride/domain";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { at, id, oneOf, timestamps } from "./columns.ts";
import { users } from "./users.ts";

/**
 * Codes sent by SMS or email (rule R1.2). The number, or for an email
 * sign-in code the email, is kept only as a keyed hash, and the code only as
 * an HMAC, so a copy of this table reveals neither. A code is deleted when
 * used or replaced. A code to confirm a sensitive action (spec 11) lives
 * here too, keyed by the account's number however it was sent, and never
 * signs in.
 */
export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: id(),
    /** The number's keyed hash; for `email_sign_in`, the email's (spec 26). */
    phoneHash: text().notNull(),
    /** One of `codePurposes`: what the code is for. */
    purpose: text().notNull().default("sign_in"),
    codeHash: text().notNull(),
    expiresAt: at().notNull(),
    attempts: integer().notNull().default(0),
    usedAt: at(),
    ...timestamps,
  },
  (table) => [
    index().on(table.phoneHash, table.createdAt),
    check("verification_codes_purpose_check", oneOf(table.purpose, codePurposes)),
  ],
);

/** One signed-in device (spec 1, section 3.7). */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceName: text(),
    platform: text().notNull(),
    appVersion: text(),
    lastActiveAt: at().notNull().defaultNow(),
    endedAt: at(),
    endReason: text(),
    ...timestamps,
  },
  (table) => [
    index().on(table.userId),
    check("sessions_platform_check", sql`${table.platform} in ('ios', 'android', 'web')`),
  ],
);

/**
 * Access and refresh tokens, stored only as SHA-256 hashes (ADR 0016). A
 * rotated refresh token keeps `rotated_at` and `replaced_by` so that reuse can
 * be detected.
 */
export const sessionTokens = pgTable(
  "session_tokens",
  {
    id: id(),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    tokenHash: text().notNull().unique("session_tokens_token_hash_unique"),
    expiresAt: at().notNull(),
    rotatedAt: at(),
    replacedBy: uuid().references((): AnyPgColumn => sessionTokens.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    index().on(table.sessionId),
    check("session_tokens_kind_check", sql`${table.kind} in ('access', 'refresh')`),
  ],
);

/**
 * When codes were sent, per number, IP address and country calling code
 * (rule R1.3). Keys are keyed hashes, so the table holds no numbers or IP
 * addresses.
 */
export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    id: id(),
    scope: text().notNull(),
    keyHash: text().notNull(),
    ...timestamps,
  },
  (table) => [index().on(table.scope, table.keyHash, table.createdAt)],
);

/**
 * A link sent to verify an email address (spec 1, 3.5; plan 4.6). The
 * address waits here until the link is opened, and only then becomes the
 * account's. The token is kept only as a hash. Only the newest link of an
 * account works; links are deleted a day after they were sent.
 */
export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text().notNull(),
    tokenHash: text().notNull().unique("email_verifications_token_unique"),
    /** When it was asked for, whether or not the email went out. */
    sentAt: at().notNull(),
    /** When it was opened, or given up by asking for the email in use. */
    usedAt: at(),
    /** When the email was refused: it never works, but counts towards the limits. */
    failedAt: at(),
    ...timestamps,
  },
  (table) => [index("email_verifications_user_index").on(table.userId, table.sentAt)],
);

/**
 * An email proven by its sign-in code that no account has yet, waiting for
 * the phone step (spec 26, 3.3): the address, and the waiting sign-in
 * (`sr_pe_…`) only as a SHA-256 hash. The phone step takes it and deletes
 * the row; the hourly clean-up deletes the rest an hour after they expired.
 */
export const emailSignIns = pgTable(
  "email_sign_ins",
  {
    id: id(),
    email: text().notNull(),
    pendingHash: text().notNull().unique("email_sign_ins_pending_hash_unique"),
    /** 30 minutes after the code was right. */
    expiresAt: at().notNull(),
    ...timestamps,
  },
  (table) => [index().on(table.expiresAt)],
);

/**
 * A Google or Apple account linked to a ShareRide account (spec 19, R19.1):
 * one of each provider per account, and each provider account on one
 * ShareRide account only. Only the provider's identifier and a verified
 * email are kept (R19.5), and for Apple the refresh token that ends the
 * link with Apple when it goes (spec 37, ADR 0056).
 */
export const identities = pgTable(
  "identities",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    /** The provider's own identifier for the person (`sub`), which does not change. */
    subject: text().notNull(),
    /** The email the provider vouched for when it was linked; empty without one. */
    email: text(),
    /**
     * Apple's refresh token from the latest sign-in, to revoke when the link
     * ends (spec 37, R37.1); null for Google and for Apple links made before.
     * Never logged, returned or exported (R37.3).
     */
    appleRefreshToken: text(),
    linkedAt: at().notNull(),
    lastUsedAt: at().notNull(),
    ...timestamps,
  },
  (table) => [
    unique("identities_provider_subject_unique").on(table.provider, table.subject),
    unique("identities_user_provider_unique").on(table.userId, table.provider),
    check("identities_provider_check", oneOf(table.provider, signInProviders)),
  ],
);

/**
 * One sign-in with a provider, from the tap until it is finished (ADR
 * 0034; plan 4.1). The state, the ticket and the waiting sign-in are kept
 * only as SHA-256 hashes; the PKCE verifier and the nonce are made from the
 * state and never stored. After the provider answers, it holds the subject,
 * a verified email and a first name for at most 30 minutes, before or while
 * an account is made, or while a member adds it on Sign-in methods. A sign-in
 * that ends is deleted; the hourly clean-up deletes the rest an hour after
 * they expired.
 */
export const providerSignIns = pgTable(
  "provider_sign_ins",
  {
    id: id(),
    provider: text().notNull(),
    stateHash: text().notNull().unique("provider_sign_ins_state_hash_unique"),
    /** SHA-256 of the app's secret, base64url: finishing needs the secret. */
    challenge: text().notNull(),
    returnUrl: text().notNull(),
    /** 10 minutes after the start; 30 minutes after the provider's answer. */
    expiresAt: at().notNull(),
    /** When the provider's answer came back, checked. */
    answeredAt: at(),
    subject: text(),
    email: text(),
    firstName: text(),
    /** Apple's refresh token, until the link takes it (spec 37, 3.1). */
    appleRefreshToken: text(),
    ticketHash: text().unique("provider_sign_ins_ticket_hash_unique"),
    ticketExpiresAt: at(),
    ticketUsedAt: at(),
    /**
     * The waiting sign-in: the phone step takes it to make or find the
     * account (spec 19, 3.3), or Settings, with a confirm code, for the
     * account in `link_user_id` (3.4). Taking it deletes the row.
     */
    pendingHash: text().unique("provider_sign_ins_pending_hash_unique"),
    linkUserId: uuid().references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index().on(table.expiresAt),
    check("provider_sign_ins_provider_check", oneOf(table.provider, signInProviders)),
  ],
);

/**
 * Apple refresh tokens of links that ended (spec 37, 3.2): an erased
 * account, Apple removed or replaced on Sign-in methods. Kept alone, with
 * no account ID, until Apple takes the revocation. The API sends each from
 * `revoke_after` (job `apple-revocations`, every minute, 10 minutes apart
 * after a refusal); the hourly clean-up drops one queued 7 days ago.
 */
export const appleTokensToRevoke = pgTable(
  "apple_tokens_to_revoke",
  {
    id: id(),
    token: text().notNull(),
    revokeAfter: at().notNull(),
    queuedAt: at().notNull(),
  },
  (table) => [index().on(table.revokeAfter), index().on(table.queuedAt)],
);

/**
 * A member's password (spec 27, ADR 0047): only its scrypt hash, with the
 * settings it was made with (`scrypt$15$8$3$<salt>$<hash>`). One per account.
 */
export const memberPasswords = pgTable("member_passwords", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  hash: text().notNull(),
  /** When the person last chose it; a new hash at sign-in leaves it (spec 27, 3.6). */
  setAt: at().notNull(),
  ...timestamps,
});

/**
 * A member's Face ID or fingerprint: a passkey kept on the device (spec 27,
 * ADR 0048), apart from the console's (`operator_passkeys`). The public key
 * and what the browser reported, never anything secret.
 */
export const memberPasskeys = pgTable(
  "member_passkeys",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The credential's ID, base64url, as the browser sends it back. */
    credentialId: text().notNull().unique("member_passkeys_credential_unique"),
    /** The COSE public key, base64url. */
    publicKey: text().notNull(),
    /** The signature counter; one that goes back means a cloned key. */
    counter: bigint({ mode: "number" }).notNull().default(0),
    transports: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Whether the passkey is synced to the person's other devices. */
    backedUp: boolean().notNull(),
    /**
     * The user handle the device keeps, base64url: random, one per account,
     * never the account's ID, which the console's passkeys use (ADR 0048).
     */
    userHandle: text().notNull(),
    /** The browser and system that set it up, such as Safari and iPhone; null when unknown. */
    browser: text(),
    system: text(),
    lastUsedAt: at(),
    ...timestamps,
  },
  (table) => [index("member_passkeys_user_index").on(table.userId)],
);

/**
 * A challenge waiting for a member's passkey: to sign in, or to set one up
 * (`register`, with whose; `register_quiet` when the browser saves it by
 * itself after a password, ADR 0050). Used once, good for 5 minutes; the
 * hourly clean-up deletes the rest an hour after they expired.
 */
export const memberPasskeyChallenges = pgTable(
  "member_passkey_challenges",
  {
    id: id(),
    challenge: text().notNull().unique("member_passkey_challenges_challenge_unique"),
    purpose: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    /** For a new passkey: the handle its options gave the device (ADR 0048). */
    userHandle: text(),
    expiresAt: at().notNull(),
    ...timestamps,
  },
  (table) => [
    index("member_passkey_challenges_expires_index").on(table.expiresAt),
    check(
      "member_passkey_challenges_purpose_check",
      sql`${table.purpose} in ('sign_in', 'register', 'register_quiet')`,
    ),
  ],
);
