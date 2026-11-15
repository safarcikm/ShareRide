import { schema, type Database } from "@shareride/db";
import { notificationRetention } from "@shareride/domain";
import { and, isNotNull, lte } from "drizzle-orm";

const { notifications, outboxEvents, scheduledNotifications } = schema;

const dayMs = 24 * 3600 * 1000;

/**
 * The hourly clean-up's part for notifications (privacy register:
 * notification log): the log, with its deliveries, after 90 days; events
 * and scheduled notifications 7 days after they were processed or ran. An
 * event not yet processed stays.
 */
export async function cleanUpNotifications(
  db: Database,
  now: Date,
): Promise<{ notifications: number; events: number; schedules: number }> {
  const before = (days: number) => new Date(now.getTime() - days * dayMs);
  const log = await db
    .delete(notifications)
    .where(lte(notifications.createdAt, before(notificationRetention.logDays)))
    .returning({ id: notifications.id });
  const events = await db
    .delete(outboxEvents)
    .where(
      and(
        isNotNull(outboxEvents.processedAt),
        lte(outboxEvents.processedAt, before(notificationRetention.processedDays)),
      ),
    )
    .returning({ id: outboxEvents.id });
  const schedules = await db
    .delete(scheduledNotifications)
    .where(
      and(
        isNotNull(scheduledNotifications.doneAt),
        lte(scheduledNotifications.doneAt, before(notificationRetention.processedDays)),
      ),
    )
    .returning({ id: scheduledNotifications.id });
  return { notifications: log.length, events: events.length, schedules: schedules.length };
}
