import {
  appealOutcomes,
  moderatedContent,
  moderationActionKinds,
  moderationRules,
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

/**
 * An operator's action that affects a person (spec 9, 3.4.3 and 3.6; R9.5):
 * what was done, which rule it concerns, the reason as the person reads it
 * in their notice, the content affected, the end of a suspension, and the
 * appeal with its answer. Seen by the operator and, as their notice, by the
 * person; kept 3 years after it closes (spec 9, section 7).
 */
export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: id(),
    /** The person affected; empty once their account is deleted. */
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    kind: text().notNull(),
    /** The report that led to it, if any. */
    reportId: uuid().references(() => reports.id, { onDelete: "set null" }),
    /** The community rule it concerns; none for a reinstatement. */
    rule: text(),
    /** Written for the person: their statement of reasons, or the reinstatement's note. */
    reason: text().notNull(),
    /** The content affected: a message, review, trip note, bio, trip or booking. */
    contentKind: text(),
    contentId: uuid(),
    /** The end of a suspension; empty for one for good, and for every other kind. */
    until: at(),
    operatorId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** The appeal, once, within 14 days (R9.5), and the operator's final answer. */
    appealText: text(),
    appealedAt: at(),
    appealAnswer: text(),
    appealOutcome: text(),
    appealAnsweredAt: at(),
    appealAnsweredById: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    check("moderation_actions_kind_check", oneOf(table.kind, moderationActionKinds)),
    check(
      "moderation_actions_rule_check",
      sql`(${table.kind} = 'reinstatement') = (${table.rule} is null) and (${table.rule} is null or ${oneOf(table.rule, moderationRules)})`,
    ),
    check(
      "moderation_actions_content_check",
      sql`(${table.contentKind} is null) = (${table.contentId} is null) and (${table.contentKind} is null or ${oneOf(table.contentKind, moderatedContent)})`,
    ),
    check(
      "moderation_actions_until_check",
      sql`${table.until} is null or ${table.kind} = 'suspension'`,
    ),
    check(
      "moderation_actions_appeal_check",
      sql`(${table.appealText} is null) = (${table.appealedAt} is null) and (${table.appealAnsweredAt} is null or ${table.appealedAt} is not null) and (${table.appealAnsweredAt} is null) = (${table.appealOutcome} is null) and (${table.appealAnsweredAt} is null) = (${table.appealAnswer} is null)`,
    ),
    check(
      "moderation_actions_outcome_check",
      sql`${table.appealOutcome} is null or ${oneOf(table.appealOutcome, appealOutcomes)}`,
    ),
    // A person's notices, the latest first.
    index("moderation_actions_user_index").on(table.userId, table.createdAt),
    index("moderation_actions_report_index").on(table.reportId),
  ],
);

/**
 * What an operator wrote down about a person (spec 9, 3.5.3), read in the
 * console. The person gets their own in Download my data, never who wrote
 * them (A49). Erased with the person; kept, by the former member, when the
 * operator who wrote them is erased.
 */
export const operatorNotes = pgTable(
  "operator_notes",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Trimmed, at most 1 000 characters as chat counts them (`checkOperatorNote`). */
    text: text().notNull(),
    byId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    // The domain counts characters; this is a ceiling that holds without it.
    check("operator_notes_text_check", sql`char_length(${table.text}) between 1 and 4000`),
    // A person's notes, the latest first.
    index("operator_notes_user_index").on(table.userId, table.createdAt),
  ],
);
