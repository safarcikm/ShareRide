import { pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { at, id } from "./columns.ts";
import { tripStops } from "./trips.ts";
import { users } from "./users.ts";

/**
 * "I'm here" (spec 8, 3.2; R8.3): who said it at which stop, and when; one
 * per person per stop, so a repeat tells nobody again. A time only, never a
 * location. Kept with the booking (privacy register: trip day records), and
 * on account deletion linked to the former member.
 */
export const checkIns = pgTable(
  "check_ins",
  {
    id: id(),
    tripStopId: uuid()
      .notNull()
      .references(() => tripStops.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    checkedInAt: at().notNull(),
  },
  (table) => [unique("check_ins_stop_user_unique").on(table.tripStopId, table.userId)],
);
