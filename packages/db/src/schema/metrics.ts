import { searchEndKinds, searchLogPlatforms } from "@shareride/domain";
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { at, id, oneOf, timestamps } from "./columns.ts";

/**
 * What was searched for, never by whom (spec 10, 3.4.5; R10.6): the two
 * ends, the day searched for, how many trips were shown, the platform and
 * the hour. No person, session, device or address. So that a row cannot be
 * matched to a request, its key is random (the other tables' keys hold the
 * time they were made), its time is cut to the hour, and it has no
 * `created_at` or `updated_at`. Kept 14 months.
 */
export const searchLog = pgTable(
  "search_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    fromKind: text().notNull(),
    /** A place or a meeting point, by `fromKind`; no foreign key, so the row outlives it. */
    fromId: uuid().notNull(),
    toKind: text().notNull(),
    toId: uuid().notNull(),
    /** The day searched for, in Iceland; null for "any day". */
    searchedDate: date({ mode: "string" }),
    /** How many trips the search showed. */
    results: integer().notNull(),
    platform: text().notNull(),
    /** The start of the hour the search was made in. */
    searchedHour: at().notNull(),
  },
  (table) => [
    index("search_log_hour_index").on(table.searchedHour),
    check("search_log_from_kind_check", oneOf(table.fromKind, searchEndKinds)),
    check("search_log_to_kind_check", oneOf(table.toKind, searchEndKinds)),
    check("search_log_platform_check", oneOf(table.platform, searchLogPlatforms)),
    check("search_log_results_check", sql`${table.results} >= 0`),
    check(
      "search_log_hour_check",
      sql`${table.searchedHour} = date_trunc('hour', ${table.searchedHour}, 'UTC')`,
    ),
  ],
);

/**
 * The operator's corridors (spec 10, 3.4.1): a name and the places along a
 * road, in order. The weekly figures are counted for each active one. The
 * places have no foreign keys: a place that is gone simply matches nothing.
 */
export const corridors = pgTable(
  "corridors",
  {
    id: id(),
    name: text().notNull(),
    placeIds: uuid().array().notNull(),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    check("corridors_name_check", sql`char_length(${table.name}) between 1 and 80`),
    check("corridors_places_check", sql`cardinality(${table.placeIds}) between 2 and 12`),
  ],
);
