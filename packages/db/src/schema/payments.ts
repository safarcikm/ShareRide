import { paymentStatuses } from "@shareride/domain";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bookings } from "./bookings.ts";
import { at, id, oneOf, timestamps } from "./columns.ts";

/**
 * One attempt to pay for an accepted booking (rule M1, spec 13). Card details
 * never reach ShareRide (R13.2): the provider holds them, and this keeps only
 * its reference. Kept with the booking.
 */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    /** `test` until the real provider comes (spec 13). */
    provider: text().notNull(),
    /** The provider's own ID for the checkout, once it has one. */
    providerRef: text(),
    /** Whole krónur: the booking's total when the payment started. */
    amount: integer().notNull(),
    currency: text().notNull().default("ISK"),
    status: text().notNull().default("pending"),
    /** When the provider's outcome arrived. */
    settledAt: at(),
    ...timestamps,
  },
  (table) => [
    check("payments_status_check", oneOf(table.status, paymentStatuses)),
    check("payments_amount_check", sql`${table.amount} > 0`),
    check("payments_currency_check", sql`${table.currency} = 'ISK'`),
    // A booking has at most one payment in progress, which a retry reuses.
    uniqueIndex("payments_pending_unique")
      .on(table.bookingId)
      .where(sql`${table.status} = 'pending'`),
    index("payments_booking_index").on(table.bookingId),
  ],
);
