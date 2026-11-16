import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
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
