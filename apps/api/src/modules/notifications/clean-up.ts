import { schema, type Database } from "@shareride/db";
import { notificationRetention } from "@shareride/domain";
import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { notHeld } from "../privacy/holds.ts";

const { bookings, notifications, outboxEvents, scheduledNotifications, trips } = schema;

const dayMs = 24 * 3600 * 1000;

/**
 * The hourly clean-up's part for notifications (privacy register:
 * notification log): the log, with its deliveries, after 90 days, unless a
 * hold covers its person, or its booking, the booking's trip or either
 * person on it (spec 11, 3.7.3); events and scheduled notifications, which
 * hold only IDs, 7 days after they were processed or ran. An event not yet
 * processed stays. All or nothing, so a run's counts are whole.
 */
export async function cleanUpNotifications(
  db: Database,
  now: Date,
): Promise<{ notifications: number; events: number; schedules: number }> {
  const before = (days: number) => new Date(now.getTime() - days * dayMs);
  return db.transaction(async (tx) => {
    // A booking's notifications name the booking only; a driver's
    // reminder names the trip.
    const old = tx
      .select({ id: notifications.id })
      .from(notifications)
      .leftJoin(bookings, eq(bookings.id, notifications.bookingId))
      .leftJoin(trips, eq(trips.id, sql`coalesce(${notifications.tripId}, ${bookings.tripId})`))
      .where(
        and(
          lte(notifications.createdAt, before(notificationRetention.logDays)),
          notHeld(tx, now, [
            ["user", notifications.recipientId],
            ["booking", notifications.bookingId],
            ["trip", trips.id],
            ["user", bookings.passengerId],
            ["user", trips.driverId],
          ]),
        ),
      );
    const log = await tx
      .delete(notifications)
      .where(inArray(notifications.id, old))
      .returning({ id: notifications.id });
    const events = await tx
      .delete(outboxEvents)
      .where(
        and(
          isNotNull(outboxEvents.processedAt),
          lte(outboxEvents.processedAt, before(notificationRetention.processedDays)),
        ),
      )
      .returning({ id: outboxEvents.id });
    const schedules = await tx
      .delete(scheduledNotifications)
      .where(
        and(
          isNotNull(scheduledNotifications.doneAt),
          lte(scheduledNotifications.doneAt, before(notificationRetention.processedDays)),
        ),
      )
      .returning({ id: scheduledNotifications.id });
    return { notifications: log.length, events: events.length, schedules: schedules.length };
  });
}
