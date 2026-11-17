import {
  reportCategories,
  reportOutcomes,
  reportStatuses,
  reportSubjects,
} from "@shareride/domain";
import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { bookings } from "./bookings.ts";
import { conversations, messages } from "./chat.ts";
import { at, id, oneOf, timestamps } from "./columns.ts";
import { trips } from "./trips.ts";
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

/**
 * A report (spec 9, 3.1; R9.1 to R9.3): who filed it, what it is about and
 * whom, and what the operator found. The reporter is never shown to the
 * person reported (R9.2). Kept 3 years after it is closed (spec 9, section
 * 7); a deleted account leaves its side empty and the report stays.
 */
export const reports = pgTable(
  "reports",
  {
    id: id(),
    reporterId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** The person reported: a trip's driver, a message's sender, the other side of a booking. */
    subjectUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** What was reported: `user`, `trip`, `message`, `review` or `booking`. */
    subject: text().notNull(),
    tripId: uuid().references(() => trips.id, { onDelete: "set null" }),
    /** The booking reported, or the one through which a person was reported. */
    bookingId: uuid().references(() => bookings.id, { onDelete: "set null" }),
    messageId: uuid().references(() => messages.id, { onDelete: "set null" }),
    /** The conversation a report about a message lets the operator read (R9.6). */
    conversationId: uuid().references(() => conversations.id, { onDelete: "set null" }),
    category: text().notNull(),
    /** Up to 1 000 characters, as the reporter wrote it; may be empty. */
    description: text().notNull().default(""),
    /** A safety report: the operator is alerted at once (R9.9). */
    urgent: boolean().notNull(),
    status: text().notNull().default("open"),
    /** What the reporter is told, in general terms (3.1.6). */
    outcome: text(),
    closedById: uuid().references(() => users.id, { onDelete: "set null" }),
    closedAt: at(),
    ...timestamps,
  },
  (table) => [
    check("reports_subject_check", oneOf(table.subject, reportSubjects)),
    check("reports_category_check", oneOf(table.category, reportCategories)),
    check("reports_status_check", oneOf(table.status, reportStatuses)),
    check(
      "reports_outcome_check",
      sql`${table.outcome} is null or ${oneOf(table.outcome, reportOutcomes)}`,
    ),
    // Closed exactly when it has a closing time, and exactly when it has an outcome.
    check(
      "reports_closed_check",
      sql`(${table.status} = 'closed') = (${table.closedAt} is not null) and (${table.status} = 'closed') = (${table.outcome} is not null)`,
    ),
    // My reports, the latest first; and the reports a person filed in 24 hours.
    index("reports_reporter_index").on(table.reporterId, table.createdAt),
    index("reports_subject_user_index").on(table.subjectUserId),
    // The queue: open reports, urgent first, then the oldest (3.4.1).
    index("reports_open_index")
      .on(table.urgent, table.createdAt)
      .where(sql`${table.status} = 'open'`),
    index("reports_conversation_index").on(table.conversationId),
    // Deleting a trip, booking or message sets these to null: found by index.
    index("reports_trip_index").on(table.tripId),
    index("reports_booking_index").on(table.bookingId),
    index("reports_message_index").on(table.messageId),
  ],
);
