import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { at, id, timestamps } from "./columns.ts";
import { users } from "./users.ts";

/**
 * A signed-in operator console (ADR 0028), separate from the app's
 * sessions. The token is kept only as a SHA-256 hash; `created_at` is when
 * the operator signed in.
 */
export const operatorSessions = pgTable(
  "operator_sessions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique("operator_sessions_token_hash_unique"),
    /** The browser and system, from the user agent, to tell sessions apart. */
    device: text(),
    lastUsedAt: at().notNull().defaultNow(),
    /**
     * When the operator last proved it was them with a passkey: at sign-in,
     * or again before adding or removing a passkey (ADR 0028).
     */
    confirmedAt: at().notNull().defaultNow(),
    endedAt: at(),
    endReason: text(),
    ...timestamps,
  },
  (table) => [
    index("operator_sessions_user_index").on(table.userId),
    check(
      "operator_sessions_end_reason_check",
      sql`${table.endReason} is null or ${table.endReason} in ('signed_out', 'idle', 'expired', 'role_removed', 'suspended')`,
    ),
  ],
);

/**
 * Every operator action, append-only (spec 9, 3.8; R9.7, R10.8): who, what,
 * on which record, when, from which address and device, and the changed
 * values. Triggers in the migration set the time of each entry and refuse
 * updates, and deletes of entries younger than 3 years. No foreign keys: the log outlives the
 * sessions and records it names. It holds IDs and the changed fields of
 * operator-curated records, never copies of a person's data.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    operatorUserId: uuid().notNull(),
    /** Null for an action taken through a command on the server. */
    operatorSessionId: uuid(),
    action: text().notNull(),
    subjectType: text(),
    subjectId: text(),
    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (table) => [
    index("audit_log_created_index").on(table.createdAt),
    index("audit_log_subject_index").on(table.subjectType, table.subjectId, table.createdAt),
    index("audit_log_action_index").on(table.action, table.createdAt),
    index("audit_log_operator_index").on(table.operatorUserId, table.createdAt),
    check("audit_log_action_check", sql`${table.action} ~ '^[a-z][a-z_]*(\\.[a-z][a-z_]*)+$'`),
  ],
);

/**
 * The operator's passkeys (ADR 0028): the public key and what the
 * authenticator reported, never anything secret.
 */
export const operatorPasskeys = pgTable(
  "operator_passkeys",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The credential's ID, base64url, as the browser sends it back. */
    credentialId: text().notNull().unique("operator_passkeys_credential_unique"),
    /** The COSE public key, base64url. */
    publicKey: text().notNull(),
    /** The signature counter; one that goes back means a cloned key. */
    counter: bigint({ mode: "number" }).notNull().default(0),
    transports: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Whether the passkey is synced to the operator's other devices. */
    backedUp: boolean().notNull(),
    /** What the operator calls it, such as "Laptop". */
    name: text().notNull(),
    lastUsedAt: at(),
    ...timestamps,
  },
  (table) => [index("operator_passkeys_user_index").on(table.userId)],
);

/**
 * A link that saves an operator's first passkey, printed by the `operator`
 * command. Works once, for 30 minutes; the token is kept only as a hash.
 */
export const operatorSetupLinks = pgTable(
  "operator_setup_links",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique("operator_setup_links_token_unique"),
    expiresAt: at().notNull(),
    usedAt: at(),
    ...timestamps,
  },
  (table) => [index("operator_setup_links_user_index").on(table.userId)],
);

/**
 * A challenge waiting for a passkey's answer: to save one (`setup`,
 * `add`) or to sign in. Used once, and good for 5 minutes.
 */
export const operatorChallenges = pgTable(
  "operator_challenges",
  {
    id: id(),
    challenge: text().notNull().unique("operator_challenges_challenge_unique"),
    purpose: text().notNull(),
    /** Whose passkey is being saved; null when signing in. */
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    setupLinkId: uuid().references(() => operatorSetupLinks.id, { onDelete: "cascade" }),
    expiresAt: at().notNull(),
    ...timestamps,
  },
  (table) => [
    index("operator_challenges_expires_index").on(table.expiresAt),
    check(
      "operator_challenges_purpose_check",
      sql`${table.purpose} in ('setup', 'add', 'sign_in', 'confirm')`,
    ),
  ],
);
