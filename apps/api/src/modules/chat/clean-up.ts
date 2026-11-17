import { schema, type Database } from "@shareride/db";
import { deleteArrivedBy } from "@shareride/domain";
import { and, eq, inArray, lte } from "drizzle-orm";
import { notHeld } from "../privacy/holds.ts";

const { bookings, conversations, trips } = schema;

/**
 * Deletes conversations, with their messages, 12 months after their trip's
 * planned arrival (privacy register: messages), unless a hold covers the
 * booking, its trip or either person (spec 11, 3.7.3). Returns how many
 * went. Reports (spec 9) will keep the ones they cover.
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
    .where(inArray(conversations.bookingId, old))
    .returning({ id: conversations.id });
  return deleted.length;
}
