import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { at, bytes, id, timestamps } from "./columns.ts";
import { users } from "./users.ts";

/**
 * "Download my data" (spec 11, 3.2): asked for after a fresh code, built by
 * the export job, and downloadable for 7 days through a one-time link. The
 * clean-up then deletes the file, and the row, which holds only dates, 30
 * days later. The file is encrypted by the API (decision 1).
 */
export const dataExports = pgTable(
  "data_exports",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    askedAt: at().notNull(),
    readyAt: at(),
    /** When building it was given up; the person can ask again. */
    failedAt: at(),
    /** Failed tries at building it. */
    attempts: integer().notNull().default(0),
    /** 7 days after it is ready (R11.2). */
    expiresAt: at(),
    /** The ZIP, sealed with the server secret: `iv | ciphertext | tag`; gone once expired. */
    file: bytes(),
    /** The ZIP's size before sealing, in bytes. */
    byteSize: integer(),
    /** The current one-time download link, as a hash. */
    linkHash: text().unique("data_exports_link_unique"),
    linkExpiresAt: at(),
    ...timestamps,
  },
  (table) => [
    index("data_exports_user_index").on(table.userId, table.askedAt),
    check(
      "data_exports_ready_check",
      sql`(${table.readyAt} is null) = (${table.expiresAt} is null) and (${table.file} is null or ${table.readyAt} is not null)`,
    ),
  ],
);

/**
 * Accounts erased in the last 30 days, by their former ID only (spec 11,
 * 3.7.4): after a restore, `privacy reapply-erasures` erases again each
 * one that came back. Longer than the 7 days of point-in-time recovery.
 */
export const erasedAccounts = pgTable("erased_accounts", {
  userId: uuid().primaryKey(),
  erasedAt: at().notNull(),
});

/**
 * The number of a suspended person whose data was erased, as the keyed
 * hash sign-in uses, so it cannot sign up again until the suspension ends,
 * at most 3 years (R11.9, decision 2). Not linked to any account.
 */
export const blockedNumbers = pgTable("blocked_numbers", {
  phoneHash: text().primaryKey(),
  until: at().notNull(),
  createdAt: at().notNull().defaultNow(),
});

/**
 * One row per retention rule each time the hourly clean-up runs it (spec
 * 11, 3.7.2; R11.5): how many records it erased or made anonymous, never
 * which or what they held. Kept 90 days; the `privacy runs` command shows
 * the last of each rule.
 */
export const retentionRuns = pgTable(
  "retention_runs",
  {
    id: id(),
    /** The rule's name (`retentionRules` in the domain). */
    rule: text().notNull(),
    ranAt: at().notNull(),
    erased: integer().notNull().default(0),
    anonymised: integer().notNull().default(0),
  },
  (table) => [
    index("retention_runs_rule_index").on(table.rule, table.ranAt),
    check("retention_runs_counts_check", sql`${table.erased} >= 0 and ${table.anonymised} >= 0`),
  ],
);

/**
 * Keeps records past their date while a dispute, chargeback or legal
 * claim needs them (spec 11, 3.7.3; R11.6): everything the clean-up would
 * delete or make anonymous about a person, a trip or a booking, until its
 * end or until an operator ends it. Set and ended through the `privacy`
 * command, each in the audit log. No foreign keys: a hold names the record
 * it keeps, and outlives it once it has ended. Deleted 3 years after its end.
 */
export const holds = pgTable(
  "holds",
  {
    id: id(),
    subjectType: text().notNull(),
    subjectId: uuid().notNull(),
    reason: text().notNull(),
    endsAt: at().notNull(),
    /** The operator who set it. */
    setBy: uuid().notNull(),
    /** When an operator ended it before its end. */
    endedAt: at(),
    ...timestamps,
  },
  (table) => [
    index("holds_subject_index").on(table.subjectType, table.subjectId),
    check("holds_subject_type_check", sql`${table.subjectType} in ('user', 'trip', 'booking')`),
    check("holds_reason_check", sql`length(trim(${table.reason})) > 0`),
  ],
);
