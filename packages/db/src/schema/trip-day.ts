import { sql } from "drizzle-orm";
import { pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bookings } from "./bookings.ts";
import { at, id } from "./columns.ts";
import { tripStops } from "./trips.ts";
import { users } from "./users.ts";

/**
 * "I'm here" (spec 8, 3.2; R8.3): who said it at which stop, and when. A
 * passenger's goes with their booking, one per booking, so a new booking
 * at the same stop starts afresh; the driver's has no booking, one per
 * stop. A repeat tells nobody again. A time only, never a location. Kept
 * with the booking or the trip (privacy register: trip day records), and on
 * account deletion linked to the former member.
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
    /** The passenger's booking; null for the driver's. */
    bookingId: uuid().references(() => bookings.id, { onDelete: "cascade" }),
    checkedInAt: at().notNull(),
  },
  (table) => [
    uniqueIndex("check_ins_booking_unique").on(table.bookingId),
    uniqueIndex("check_ins_driver_stop_unique")
      .on(table.tripStopId)
      .where(sql`${table.bookingId} is null`),
  ],
);
