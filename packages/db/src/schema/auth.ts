import { codePurposes } from "@shareride/domain";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { at, id, oneOf, timestamps } from "./columns.ts";
import { users } from "./users.ts";

/**
 * Sign-in codes sent by SMS (rule R1.2). The number is kept only as a keyed
 * hash and the code only as an HMAC, so a copy of this table reveals neither.
 * A code is deleted when used or replaced. A code to confirm a sensitive
 * action (spec 11) lives here too, and never signs in.
 */
export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: id(),
    phoneHash: text().notNull(),
    /** `sign_in`, or `confirm` for a signed-in person's sensitive action. */
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
