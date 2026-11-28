import { sql } from "drizzle-orm";
import { bigint, check, integer, pgTable, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./columns.ts";
import { users } from "./users.ts";

/**
 * A member's CO2 totals from trips made anonymous 3 years after (spec 34,
 * 3.11; ADR 0054): those trips no longer name their people, so before one
 * moves, what each of its completed bookings saved is added here for its
 * passenger and its driver, and the member's totals on Profile stay as
 * they were. Only the member sees them (R34.6); erased with the account.
 */
export const co2Carried = pgTable(
  "co2_carried",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    passengerGrams: bigint({ mode: "number" }).notNull().default(0),
    passengerRides: integer().notNull().default(0),
    driverGrams: bigint({ mode: "number" }).notNull().default(0),
    /** Trips driven. */
    driverRides: integer().notNull().default(0),
    /** Completed bookings on those trips. */
    driverPassengers: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    check(
      "co2_carried_counts_check",
      sql`${table.passengerGrams} >= 0 and ${table.passengerRides} >= 0 and ${table.driverGrams} >= 0 and ${table.driverRides} >= 0 and ${table.driverPassengers} >= 0`,
    ),
  ],
);
