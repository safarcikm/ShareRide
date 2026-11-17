import { schema, type Database } from "@shareride/db";
import { defaultSafetySettings, deleteArrivedBy, reportsClosedBy } from "@shareride/domain";
import { and, eq, gt, inArray, lte, notExists, or, sql } from "drizzle-orm";
import { notHeld } from "../privacy/holds.ts";

const { bookings, conversations, reports, trips } = schema;

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
  const reported = db
    .select({ one: sql`1` })
    .from(reports)
    .where(
      and(
        eq(reports.conversationId, conversations.id),
        or(
          eq(reports.status, "open"),
          gt(reports.closedAt, reportsClosedBy(now, defaultSafetySettings)),
        ),
      ),
    );
  const deleted = await db
    .delete(conversations)
    .where(and(inArray(conversations.bookingId, old), notExists(reported)))
    .returning({ id: conversations.id });
  return deleted.length;
}
