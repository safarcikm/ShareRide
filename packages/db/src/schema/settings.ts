import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.ts";

/**
 * Every change of an operator setting (spec 10, 3.2.5; R10.2; ADR 0032):
 * the history, and the values themselves, which are the defaults with
 * these laid over them (`valuesAt` in the domain). Each change is the next
 * settings version; version 0, the defaults, has no row. Triggers in the
 * migration refuse updates, deletes and TRUNCATE, so the history cannot be
 * edited.
 */
export const settingChanges = pgTable(
  "setting_changes",
  {
    id: id(),
    version: integer().notNull(),
    key: text().notNull(),
    oldValue: integer().notNull(),
    newValue: integer().notNull(),
    reason: text().notNull(),
    /**
     * The operator, without a foreign key, as in the audit log: the change
     * stays when the account goes. Null for a command on the server.
     */
    changedBy: uuid(),
    ...timestamps,
  },
  (table) => [
    unique("setting_changes_version_unique").on(table.version),
    check("setting_changes_version_check", sql`${table.version} >= 1`),
    check("setting_changes_reason_check", sql`char_length(${table.reason}) between 1 and 500`),
  ],
);
