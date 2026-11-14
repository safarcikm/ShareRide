import { carColours, vehicleRules } from "@shareride/domain";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { id, oneOf, timestamps } from "./columns.ts";
import { users } from "./users.ts";

/**
 * Drivers' cars (spec 3, 3.2). Any car the driver may use; who owns it does
 * not matter. A removed car is deleted; once trips exist, a car that trips
 * used is kept for them instead (PR 5 adds `removed_at`). Personal data: see
 * the record of processing (the number plate).
 */
const nameLength = (column: AnyPgColumn) =>
  sql`char_length(btrim(${column})) between 1 and ${sql.raw(String(vehicleRules.nameMaxLength))}`;

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    make: text().notNull(),
    model: text().notNull(),
    colour: text().notNull(),
    /** Capitals without spaces or hyphens; null until the driver adds it (decision 4). */
    registration: text(),
    ...timestamps,
  },
  (table) => [
    // The domain trims the names and counts their characters.
    check("vehicles_make_check", nameLength(table.make)),
    check("vehicles_model_check", nameLength(table.model)),
    check("vehicles_colour_check", oneOf(table.colour, carColours)),
    // The domain checks the letters; this holds without depending on the
    // database's locale, which decides what counts as a letter.
    check(
      "vehicles_registration_check",
      sql`${table.registration} is null or (char_length(${table.registration}) between 2 and 8 and ${table.registration} = upper(${table.registration}) and ${table.registration} !~ '[[:space:]-]')`,
    ),
    index("vehicles_owner_index").on(table.ownerId),
  ],
);
