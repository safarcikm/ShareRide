import {
  bookingStatuses,
  cancelReasons,
  declineReasons,
  paymentMethods,
  defaultBookingSettings,
  defaultTripSettings,
  noteMaxLength,
  overruleNoteMaxLength,
} from "@shareride/domain";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { at, id, oneOf, timestamps } from "./columns.ts";
import { trips, tripStops } from "./trips.ts";
import { users } from "./users.ts";

/**
 * Seats a passenger booked or requested on a part of a trip (spec 5). While
 * a booking holds seats (rule S1), its seats are counted in the occupancy of
 * every segment of its part, changed in the same transaction as its status.
 * Bookings are never deleted with an account or a trip; spec 12 decides how
 * they are kept.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    tripId: uuid()
      .notNull()
      .references(() => trips.id),
    passengerId: uuid()
      .notNull()
      .references(() => users.id),
    /** Stops, not positions, so the booking still names them if a trip's stops change (spec 6). */
    fromStopId: uuid()
      .notNull()
      .references(() => tripStops.id),
    toStopId: uuid()
      .notNull()
      .references(() => tripStops.id),
    seats: integer().notNull(),
    status: text().notNull(),
    /** The snapshot for every seat (rule P1); whole krónur. */
    totalPrice: integer().notNull(),
    currency: text().notNull().default("ISK"),
    /** To the driver with a request (R5.6); empty for none. */
    message: text().notNull().default(""),
    /** Seen only by the operator (R5.7). */
    declineReason: text(),
    /** One per attempt from the app, so a retry never books twice (R5.4). */
    attemptKey: uuid().notNull(),
    /** Null for instant booking. */
    requestedAt: at(),
    /** When the driver accepted or declined, or the instant booking was made. */
    decidedAt: at(),
    /** A request's deadline (R5.5). */
    expiresAt: at(),
    /** An accepted booking's payment deadline (rule M1). */
    paymentDueAt: at(),
    confirmedAt: at(),
    expiredAt: at(),
    cancelledAt: at(),
    /** When its trip completed with it (spec 8, R8.2): the moment reviews count from. */
    completedAt: at(),
    /**
     * `passenger` for a withdrawn request or a cancelled booking, or `driver`
     * (spec 6); `driver` also on a request declined because the trip was
     * cancelled, with the trip's reason and note (3.3).
     */
    cancelledBy: text(),
    /** Why it was cancelled (spec 6, 3.3 to 3.5); null for a withdrawn request. */
    cancelReason: text(),
    /** The driver's note to the passenger, as written (spec 6, 3.3); empty for none. */
    cancelNote: text().notNull().default(""),
    /** What went back to the passenger on cancelling, in whole krónur (rule M2). */
    refundAmount: integer(),
    /** Whether the cancellation shows on the canceller's reliability (R6.7, R6.8; spec 8). */
    countsOnReliability: boolean().notNull().default(false),
    /**
     * It does not count only because of its weather or road-closure reason,
     * as worked out when it was made: the one the operator can overrule
     * (spec 8, R8.11).
     */
    excusedByReason: boolean().notNull().default(false),
    /**
     * When the operator overruled that reason, so it counts; null until then,
     * or once they undid it. The audit log says who.
     */
    overruledAt: at(),
    /** The operator's note on the last change of whether it counts; theirs only. */
    overruleNote: text().notNull().default(""),
    /**
     * The trip's departure when the booking was made: moves are counted from
     * it (R6.3, R6.4). Older bookings took their trip's departure. Null only
     * for one made by the previous version during a deploy, read as the
     * trip's departure; required once no older version runs (expand, then
     * contract).
     */
    departsAtWhenBooked: at(),
    /**
     * The settings version the booking was made under (spec 10, R10.3; ADR
     * 0032): its cancellation rules use that version's values. 0, the
     * defaults, for a booking from before.
     */
    settingsVersion: integer().notNull().default(0),
    /**
     * How it is paid, fixed when it is made (rules M1 and M6, ADR 0038): in
     * the app, or to the driver in person while the operator's
     * `pay_in_person` switch is on. Older bookings were all paid in the app.
     */
    paymentMethod: text().notNull().default("in_app"),
    /**
     * The grams of CO2 one car not driven saves on this part, stored when
     * the booking completed, at the setting in force then (spec 34, R34.2);
     * null while it is not completed. No check ties it to the status, so a
     * version from before it can still complete a booking during a deploy.
     */
    co2Grams: integer(),
    ...timestamps,
  },
  (table) => [
    unique("bookings_attempt_key_unique").on(table.passengerId, table.attemptKey),
    check("bookings_status_check", oneOf(table.status, bookingStatuses)),
    check(
      "bookings_seats_check",
      sql`${table.seats} between 1 and ${sql.raw(String(defaultTripSettings.maxSeats))}`,
    ),
    check("bookings_price_check", sql`${table.totalPrice} >= 0`),
    check("bookings_co2_grams_check", sql`${table.co2Grams} is null or ${table.co2Grams} >= 0`),
    check("bookings_currency_check", sql`${table.currency} = 'ISK'`),
    check(
      "bookings_message_check",
      sql`char_length(${table.message}) <= ${sql.raw(String(defaultBookingSettings.messageMaxLength))}`,
    ),
    check("bookings_payment_method_check", oneOf(table.paymentMethod, paymentMethods)),
    check("bookings_decline_reason_check", oneOf(table.declineReason, declineReasons)),
    check("bookings_cancel_reason_check", oneOf(table.cancelReason, cancelReasons)),
    check(
      "bookings_cancel_note_check",
      sql`char_length(${table.cancelNote}) <= ${sql.raw(String(noteMaxLength))}`,
    ),
    check(
      "bookings_overrule_note_check",
      sql`char_length(${table.overruleNote}) <= ${sql.raw(String(overruleNoteMaxLength))}`,
    ),
    check(
      "bookings_refund_check",
      sql`${table.refundAmount} is null or ${table.refundAmount} between 0 and ${table.totalPrice}`,
    ),
    check(
      "bookings_cancelled_by_check",
      oneOf(table.cancelledBy, ["passenger", "driver", "operator"]),
    ),
    check("bookings_stops_check", sql`${table.fromStopId} <> ${table.toStopId}`),
    check(
      "bookings_deadlines_check",
      sql`(${table.status} <> 'requested' or ${table.expiresAt} is not null) and (${table.status} <> 'accepted' or ${table.paymentDueAt} is not null)`,
    ),
    // My bookings, and the overlap check (R5.10).
    index("bookings_passenger_index").on(table.passengerId, table.status),
    // A trip's bookings, for the driver and for expiring them under the trip's lock.
    index("bookings_trip_index").on(table.tripId, table.status),
    // The expiry job finds the next deadlines quickly.
    index("bookings_requests_due_index")
      .on(table.expiresAt)
      .where(sql`${table.status} = 'requested'`),
    index("bookings_payments_due_index")
      .on(table.paymentDueAt)
      .where(sql`${table.status} = 'accepted'`),
  ],
);

/**
 * A booking's price per seat on each segment of its part, at booking time
 * (domain model, `BookingSegmentPrice`), so receipts and disputes stay exact.
 */
export const bookingSegmentPrices = pgTable(
  "booking_segment_prices",
  {
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    /**
     * The segment's position on the trip now: a stop added splits the
     * price for one segment in two and moves the later ones up (spec 6, 3.2).
     */
    segmentPosition: integer().notNull(),
    price: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.bookingId, table.segmentPosition] }),
    check("booking_segment_prices_price_check", sql`${table.price} >= 0`),
  ],
);
