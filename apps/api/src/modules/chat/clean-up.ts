import { schema, type Database } from "@shareride/db";
import { deleteArrivedBy } from "@shareride/domain";
import { eq, inArray, lte } from "drizzle-orm";

const { bookings, conversations, trips } = schema;

/**
 * Deletes conversations, with their messages, 12 months after their trip's
 * planned arrival (privacy register: messages). Returns how many went.
 * Reports (spec 9) will keep the ones they cover.
 */
export async function cleanUpConversations(db: Database, now: Date): Promise<number> {
  const old = db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .where(lte(trips.arrivesAt, deleteArrivedBy(now)));
  const deleted = await db
    .delete(conversations)
    .where(inArray(conversations.bookingId, old))
    .returning({ id: conversations.id });
  return deleted.length;
}
