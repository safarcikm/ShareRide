import {
  disputeAnswers,
  disputeKinds,
  disputeNoteMaxLength,
  disputeOutcomes,
  operatorOutcomes,
} from "@shareride/domain";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bookings } from "./bookings.ts";
import { at, id, oneOf, timestamps } from "./columns.ts";
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

const noteFits = (column: Parameters<typeof oneOf>[0]) =>
  sql`char_length(${column}) <= ${sql.raw(String(disputeNoteMaxLength))}`;

/**
 * A report on the trip day (spec 8, 3.3 to 3.5): a no-show the driver
 * marked, or the passenger's "The driver didn't come". One per booking: the
 * other side answers it rather than reporting back, so the operator decides
 * one question. Who raised it follows from the kind (`reporterOf`). The
 * notes are for the operator only (spec 8, section 7). A report is decided
 * once: by the system when the other side agrees or does not answer in
 * time, or by the operator when it was contested. Kept with the booking
 * (privacy register: trip day records).
 */
export const disputes = pgTable(
  "disputes",
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    raisedAt: at().notNull(),
    /** The reporter's note to the operator; empty for none. */
    note: text().notNull().default(""),
    /** "That's right" or "That's not right"; null until the other side answers. */
    answer: text(),
    answeredAt: at(),
    /** The answer's note to the operator; empty for none. */
    answerNote: text().notNull().default(""),
    /** How it ended; null while it is open. */
    outcome: text(),
    /** `system` for an agreed or unanswered report, `operator` for a contested one. */
    decidedBy: text(),
    decidedAt: at(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("disputes_booking_unique").on(table.bookingId),
    check("disputes_kind_check", oneOf(table.kind, disputeKinds)),
    check("disputes_answer_check", oneOf(table.answer, disputeAnswers)),
    check("disputes_outcome_check", oneOf(table.outcome, disputeOutcomes)),
    check("disputes_decided_by_check", oneOf(table.decidedBy, ["system", "operator"])),
    check("disputes_note_check", noteFits(table.note)),
    check("disputes_answer_note_check", noteFits(table.answerNote)),
    check(
      "disputes_answered_check",
      sql`(${table.answer} is null) = (${table.answeredAt} is null)`,
    ),
    check(
      "disputes_decided_check",
      sql`(${table.outcome} is null) = (${table.decidedAt} is null) and (${table.outcome} is null) = (${table.decidedBy} is null)`,
    ),
    // Only a contested report reaches the operator (3.5).
    check(
      "disputes_operator_check",
      sql`${table.decidedBy} is distinct from 'operator' or ${table.answer} = 'contested'`,
    ),
    // Each kind ends only in its own outcomes (decisions 4 and 5).
    check(
      "disputes_kind_outcome_check",
      sql`${table.outcome} is null or (${table.kind} = 'no_show' and ${oneOf(table.outcome, operatorOutcomes.no_show)}) or (${table.kind} = 'driver_absent' and ${oneOf(table.outcome, operatorOutcomes.driver_absent)})`,
    ),
    // The minute job settles the open ones whose time to answer has passed.
    index("disputes_open_index")
      .on(table.raisedAt)
      .where(sql`${table.outcome} is null`),
  ],
);
