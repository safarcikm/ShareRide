import { schema, type Database } from "@shareride/db";
import { defaultSafetySettings, deleteArrivedBy, reportsClosedBy } from "@shareride/domain";
import {
  and,
  eq,
  exists,
  gt,
  inArray,
  lte,
  not,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import type { Transaction } from "../bookings/seats.ts";
import { notHeld } from "../privacy/holds.ts";

const { bookings, conversations, reports, trips } = schema;

/**
 * Whether a report covers the conversation `conversationId` names: a report
 * about one of its messages (R9.6), open or closed under 3 years ago (spec 9,
 * section 7). It keeps the conversation from the clean-up, and what its
 * messages said from an erasure.
 */
export function reportCovers(
  db: Database | Transaction,
  now: Date,
  conversationId: AnyColumn,
): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(reports)
      .where(
        and(
          eq(reports.conversationId, conversationId),
          or(
            eq(reports.status, "open"),
            gt(reports.closedAt, reportsClosedBy(now, defaultSafetySettings)),
          ),
        ),
      ),
  );
}

/**
 * Deletes conversations, with their messages, 12 months after their trip's
 * planned arrival (privacy register: messages), unless a hold covers the
 * booking, its trip or either person (spec 11, 3.7.3). Returns how many
 * went. A report keeps the conversation it covers while open, and until
 * 3 years after it is closed (spec 9, section 7).
 */
export async function cleanUpConversations(db: Database, now: Date): Promise<number> {
  const old = db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .where(
      and(
        lte(trips.arrivesAt, deleteArrivedBy(now)),
        notHeld(db, now, [
          ["booking", bookings.id],
          ["trip", trips.id],
          ["user", bookings.passengerId],
          ["user", trips.driverId],
        ]),
      ),
    );
  const deleted = await db
    .delete(conversations)
    .where(and(inArray(conversations.bookingId, old), not(reportCovers(db, now, conversations.id))))
    .returning({ id: conversations.id });
  return deleted.length;
}
