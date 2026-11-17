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
