import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { at, id, timestamps } from "./columns.ts";
import { users } from "./users.ts";

/**
 * Sign-in codes sent by SMS (rule R1.2). The number is kept only as a keyed
 * hash and the code only as an HMAC, so a copy of this table reveals neither.
 * A code is deleted when used or replaced.
 */
export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: id(),
    phoneHash: text().notNull(),
    codeHash: text().notNull(),
    expiresAt: at().notNull(),
    attempts: integer().notNull().default(0),
    usedAt: at(),
    ...timestamps,
  },
  (table) => [index().on(table.phoneHash, table.createdAt)],
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
