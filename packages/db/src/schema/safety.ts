import { sql } from "drizzle-orm";
import { check, index, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.ts";
import { users } from "./users.ts";

/**
 * One person blocked another (spec 9, 3.2; R9.4): silent, and mutual in
 * effect. Seen only by the blocker, and gone when either account is deleted
 * (spec 9, section 7). Personal data: see the record of processing.
 */
export const blocks = pgTable(
  "blocks",
  {
    /** Shown to the blocker only, to unblock: never the other person's own ID. */
    id: id(),
    blockerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    unique("blocks_pair_unique").on(table.blockerId, table.blockedId),
    // The other direction: who blocked me.
    index("blocks_blocked_index").on(table.blockedId),
    check("blocks_self_check", sql`${table.blockerId} <> ${table.blockedId}`),
  ],
);
