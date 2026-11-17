import type { Dispute } from "@shareride/contracts";
import { schema } from "@shareride/db";
import {
  answerDeadline,
  completesAt,
  type DisputeAnswer,
  type DisputeKind,
  type DisputeOutcome,
  type TripDaySettings,
  type Dispute as DisputeRule,
} from "@shareride/domain";
import { inArray } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";

const { disputes } = schema;

export type DisputeRow = typeof disputes.$inferSelect;

/** The reports on these bookings, at most one each (spec 8, 3.3 to 3.5). */
export async function disputesOf(
  q: Queryable,
  bookingIds: readonly string[],
): Promise<readonly DisputeRow[]> {
  if (bookingIds.length === 0) return [];
  return q
    .select()
    .from(disputes)
    .where(inArray(disputes.bookingId, [...new Set(bookingIds)]));
}

/** A stored report as the domain's rules take it. */
export function asRule(row: DisputeRow): DisputeRule {
  return {
    kind: row.kind as DisputeKind,
    raisedAt: row.raisedAt,
    answer: row.answer as DisputeAnswer | null,
    outcome: row.outcome as DisputeOutcome | null,
  };
}

/**
 * When the other side's time to answer ends (R8.6), from the trip's last
 * stop: the trip completes 2 hours after it, whether or not the minute job
 * has stored that yet. A trip with a report has departed, so its times no
 * longer move (spec 6, R6.1).
 */
export function answerByOf(row: DisputeRow, lastStopAt: Date, settings: TripDaySettings): Date {
  return answerDeadline(asRule(row), completesAt(lastStopAt, settings), settings);
}

/** A report as both sides see it: never the notes, which are the operator's (spec 8, section 7). */
export function shownDispute(
  row: DisputeRow,
  lastStopAt: Date,
  settings: TripDaySettings,
): Dispute {
  return {
    id: row.id,
    kind: row.kind as DisputeKind,
    raisedAt: row.raisedAt.toISOString(),
    answerBy: answerByOf(row, lastStopAt, settings).toISOString(),
    answer: row.answer as DisputeAnswer | null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    outcome: row.outcome as DisputeOutcome | null,
    decidedBy: row.decidedBy as "system" | "operator" | null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}
