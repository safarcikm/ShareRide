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
