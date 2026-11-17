import {
  bookingModes,
  chatOptions,
  defaultTripSettings,
  luggageOptions,
  noteMaxLength,
  petOptions,
  smokingOptions,
  tripCancelReasons,
  tripChangeKinds,
  tripStatuses,
} from "@shareride/domain";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { at, id, oneOf, timestamps } from "./columns.ts";
import { meetingPoints } from "./meeting-points.ts";
import { users } from "./users.ts";
import { vehicles } from "./vehicles.ts";

/**
 * Trips a driver offers (spec 3). A draft is saved as the driver goes and
 * may miss the car and times; a published trip has them, and its segments.
 */
export const trips = pgTable(
  "trips",
  {
    id: id(),
    // Restrict: erasure moves trips to the former member first, so a missed
    // step fails instead of deleting other people's bookings (privacy plan 4.6).
    driverId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** A car a published trip used stays (`removed_at`) instead of being deleted. */
    vehicleId: uuid().references(() => vehicles.id),
    status: text().notNull().default("draft"),
    /** Seats offered (R3.9). */
    capacity: integer().notNull(),
    /** Percent of the suggested prices (rule P4, ADR 0012). */
    priceLevel: integer().notNull(),
    bookingMode: text().notNull(),
    luggage: text().notNull(),
    pets: text().notNull(),
    smoking: text().notNull(),
    childSeat: boolean().notNull(),
    chat: text().notNull(),
    /** To passengers, without contact details (R3.10); empty for none. */
    note: text().notNull().default(""),
    /** When ShareRide hid the note from passengers (spec 9, 3.4.3); a new note is shown again. */
    noteHiddenAt: at(),
    /** Copies of the first and last stops' planned times, for overlap and clean-up. */
    departsAt: at(),
    arrivesAt: at(),
    publishedAt: at(),
    cancelledAt: at(),
    /** Two hours after its last stop's planned time (spec 8, R8.1), as the job stored it. */
    completedAt: at(),
    /** `driver`, or `operator` for ShareRide (spec 9, 3.4.3 and 3.6). */
    cancelledBy: text(),
    /** Why the driver cancelled the trip (spec 6, 3.3); never given for ShareRide. */
    cancelReason: text(),
    /** The driver's note to the passengers, as written (spec 6, 3.3); empty for none. */
    cancelNote: text().notNull().default(""),
    /** Whether the cancellation shows on the driver's reliability, once for the trip (spec 8, 3.8). */
    countsOnReliability: boolean().notNull().default(false),
    /** Made by the seed for local and staging (sample trips). */
    sample: boolean().notNull().default(false),
    ...timestamps,
  },
  (table) => [
    check("trips_status_check", oneOf(table.status, tripStatuses)),
    check(
      "trips_capacity_check",
      sql`${table.capacity} between 1 and ${sql.raw(String(defaultTripSettings.maxSeats))}`,
    ),
    check("trips_price_level_check", sql`${table.priceLevel} >= 0`),
    check("trips_booking_mode_check", oneOf(table.bookingMode, bookingModes)),
    check("trips_luggage_check", oneOf(table.luggage, luggageOptions)),
    check("trips_pets_check", oneOf(table.pets, petOptions)),
    check("trips_smoking_check", oneOf(table.smoking, smokingOptions)),
    check("trips_chat_check", oneOf(table.chat, chatOptions)),
    check("trips_note_check", sql`char_length(${table.note}) <= ${sql.raw(String(noteMaxLength))}`),
    check("trips_cancel_reason_check", oneOf(table.cancelReason, tripCancelReasons)),
    // Empty on a trip that the version before this one cancelled, which knew
    // only drivers' cancellations: the migration fills in the earlier ones,
    // and a later one can require it (conventions: expand, then contract).
    check(
      "trips_cancelled_by_check",
      sql`${table.cancelledBy} is null or (${table.cancelledAt} is not null and ${oneOf(table.cancelledBy, ["driver", "operator"])})`,
    ),
    check(
      "trips_cancel_note_check",
      sql`char_length(${table.cancelNote}) <= ${sql.raw(String(noteMaxLength))}`,
    ),
    check(
      "trips_times_check",
      // A draft keeps the times as the driver left them; publishing checks them (R3.6).
      sql`(${table.departsAt} is null) = (${table.arrivesAt} is null) and (${table.status} = 'draft' or ${table.departsAt} is null or ${table.departsAt} < ${table.arrivesAt})`,
    ),
    check(
      "trips_published_check",
      sql`${table.status} = 'draft' or (${table.vehicleId} is not null and ${table.departsAt} is not null and ${table.publishedAt} is not null)`,
    ),
    index("trips_driver_index").on(table.driverId, table.status),
    index("trips_departs_index").on(table.status, table.departsAt),
  ],
);

/** A trip's stops in order (invariants 1 to 3); times stay null in a draft until chosen. */
export const tripStops = pgTable(
  "trip_stops",
  {
    id: id(),
    tripId: uuid()
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    meetingPointId: uuid()
      .notNull()
      .references(() => meetingPoints.id),
    /** 0-based and contiguous among the stops not removed. */
    position: integer().notNull(),
    plannedAt: at(),
    /**
     * When the driver removed the stop (spec 6, 3.2). It stays for the
     * bookings that once got in or out there, which still name it; every
     * list of a trip's stops leaves it out.
     */
    removedAt: at(),
  },
  (table) => [
    uniqueIndex("trip_stops_live_position_unique")
      .on(table.tripId, table.position)
      .where(sql`${table.removedAt} is null`),
    uniqueIndex("trip_stops_live_point_unique")
      .on(table.tripId, table.meetingPointId)
      .where(sql`${table.removedAt} is null`),
    check("trip_stops_position_check", sql`${table.position} >= 0`),
    // Search finds trips through their stops and times (spec 4).
    index("trip_stops_point_index").on(table.meetingPointId, table.plannedAt),
  ],
);

/**
 * The stretches of a published trip, with the prices it was published at
 * (spec 3, section 6), so the operator can check caps were respected.
 * Occupancy is kept by the booking transaction and never exceeds capacity.
 */
export const segments = pgTable(
  "segments",
  {
    tripId: uuid()
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** 0 for the stretch from the first stop to the second. */
    position: integer().notNull(),
    fromStopId: uuid()
      .notNull()
      .references(() => tripStops.id, { onDelete: "cascade" }),
    toStopId: uuid()
      .notNull()
      .references(() => tripStops.id, { onDelete: "cascade" }),
    distanceM: integer().notNull(),
    durationS: integer().notNull(),
    /** Whole krónur per seat (ISK has no minor unit). */
    suggestedPrice: integer().notNull(),
    cap: integer().notNull(),
    price: integer().notNull(),
    currency: text().notNull().default("ISK"),
    /** The trip's seats, copied so the database can hold occupancy to it. */
    capacity: integer().notNull(),
    occupancy: integer().notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.tripId, table.position] }),
    check("segments_position_check", sql`${table.position} >= 0`),
    check("segments_price_check", sql`${table.price} between 0 and ${table.cap}`),
    check("segments_currency_check", sql`${table.currency} = 'ISK'`),
    check("segments_occupancy_check", sql`${table.occupancy} between 0 and ${table.capacity}`),
  ],
);

/**
 * Each change to a published trip (spec 6, 3.2 and section 6), so its
 * passengers see what changed since they booked: "Departure changed from
 * 08:00 to 08:45". Kept as long as the trip (privacy register).
 */
export const tripChanges = pgTable(
  "trip_changes",
  {
    id: id(),
    tripId: uuid()
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    /** What it was and what it became, such as `{ "departsAt": "…" }` in ISO 8601. */
    before: jsonb().$type<Readonly<Record<string, string | number | boolean | null>>>().notNull(),
    after: jsonb().$type<Readonly<Record<string, string | number | boolean | null>>>().notNull(),
    changedAt: at().notNull(),
    ...timestamps,
  },
  (table) => [
    check("trip_changes_kind_check", oneOf(table.kind, tripChangeKinds)),
    // A trip's changes in order, for its bookings.
    index("trip_changes_trip_index").on(table.tripId, table.changedAt),
  ],
);
