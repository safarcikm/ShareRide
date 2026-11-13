import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/** UUID version 7 keys, made by PostgreSQL 18: unique and in time order. */
export const id = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`);

/** A point in time, stored in UTC (`timestamptz`). */
export const at = () => timestamp({ withTimezone: true, mode: "date" });

/** `created_at` and `updated_at`, which every table has (conventions). */
export const timestamps = {
  createdAt: at().notNull().defaultNow(),
  updatedAt: at()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
