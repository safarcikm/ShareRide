import { schema } from "@shareride/db";
import {
  payReminderAt,
  reminderTimes,
  requestHalfwayAt,
  type NotificationSettings,
} from "@shareride/domain";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Transaction } from "../bookings/seats.ts";

const { bookings, scheduledNotifications, trips, tripStops } = schema;

const passengerReminders = { evening: "reminder_evening", hour: "reminder_hour" } as const;
const driverReminders = {
  evening: "reminder_evening_driver",
  hour: "reminder_hour_driver",
} as const;
const reminderKinds = [...Object.values(passengerReminders), ...Object.values(driverReminders)];

/**
 * After the trip's departure moved (spec 6, 3.2), what waits for a moment
 * follows it: trip reminders are worked out again from now, so one already
 * sent never comes again (R7.11), and the halfway and pay reminders follow
 * the deadlines the move worked out again. Call it in the move's
 * transaction, once the trip, its stops and its bookings' deadlines are
 * stored.
 */
export async function followDepartureMove(
  tx: Transaction,
  tripId: string,
  now: Date,
  settings: NotificationSettings,
): Promise<void> {
  const [trip] = await tx
    .select({ departsAt: trips.departsAt })
    .from(trips)
    .where(eq(trips.id, tripId));
  if (trip === undefined || trip.departsAt === null) return;
  const held = await tx
    .select({ booking: bookings, boardsAt: tripStops.plannedAt })
    .from(bookings)
    .innerJoin(tripStops, eq(tripStops.id, bookings.fromStopId))
    .where(
      and(
        eq(bookings.tripId, tripId),
        inArray(bookings.status, ["requested", "accepted", "confirmed"]),
      ),
    );
  const ids = held.map(({ booking }) => booking.id);

  // Trip reminders not sent yet go, and come again at their new moments;
  // one already sent keeps its key, so it is not made again.
  await tx
    .delete(scheduledNotifications)
    .where(
      and(
        isNull(scheduledNotifications.doneAt),
        inArray(scheduledNotifications.kind, reminderKinds),
        or(
          eq(scheduledNotifications.tripId, tripId),
          ids.length === 0 ? undefined : inArray(scheduledNotifications.bookingId, ids),
        ),
      ),
    );
  const rows: (typeof scheduledNotifications.$inferInsert)[] = [];
  const confirmed = held.filter(({ booking }) => booking.status === "confirmed");
  for (const { booking, boardsAt } of confirmed) {
    if (boardsAt === null) continue;
    for (const { which, at } of reminderTimes({ startsAt: boardsAt, since: now }, settings)) {
      const kind = passengerReminders[which];
      rows.push({ key: `${kind}:${booking.id}`, kind, bookingId: booking.id, runAt: at });
    }
  }
  if (confirmed.length > 0) {
    for (const { which, at } of reminderTimes({ startsAt: trip.departsAt, since: now }, settings)) {
      const kind = driverReminders[which];
      rows.push({ key: `${kind}:${tripId}`, kind, tripId, runAt: at });
    }
  }
  if (rows.length > 0) {
    await tx
      .insert(scheduledNotifications)
      .values(rows.map((row) => ({ ...row, createdAt: now, updatedAt: now })))
      .onConflictDoNothing();
  }

  // The driver's halfway reminder and the passenger's pay reminder follow the new deadlines.
  for (const { booking } of held) {
    const waiting = and(
      eq(scheduledNotifications.bookingId, booking.id),
      isNull(scheduledNotifications.doneAt),
    );
    const { requestedAt, expiresAt, decidedAt, paymentDueAt } = booking;
    if (booking.status === "requested" && requestedAt !== null && expiresAt !== null) {
      await tx
        .update(scheduledNotifications)
        .set({ runAt: requestHalfwayAt({ requestedAt, expiresAt }), updatedAt: now })
        .where(and(waiting, eq(scheduledNotifications.kind, "request_halfway")));
    }
    if (booking.status === "accepted" && decidedAt !== null && paymentDueAt !== null) {
      const at = payReminderAt({ acceptedAt: decidedAt, dueAt: paymentDueAt }, settings);
      const pay = and(waiting, eq(scheduledNotifications.kind, "pay_reminder"));
      await (at === null
        ? tx.delete(scheduledNotifications).where(pay)
        : tx.update(scheduledNotifications).set({ runAt: at, updatedAt: now }).where(pay));
    }
  }
}
