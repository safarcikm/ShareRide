// Payment deadlines across a pause of bookings and payments (spec 10, 3.3):
// nobody can pay while paying is paused, so no booking runs out for lack of
// payment then. A deadline is a stored time that every reader compares with
// now, so the pause moves the times themselves, in the transaction that
// turns the switch.
import { schema } from "@shareride/db";
import {
  latestPaymentDeadline,
  payReminderAt,
  paymentDeadlineAfterPause,
  type BookingSettings,
  type NotificationSettings,
} from "@shareride/domain";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Transaction } from "./seats.ts";

const { bookings, scheduledNotifications, tripStops } = schema;

export interface PauseSettings {
  readonly bookings: BookingSettings;
  readonly notifications: NotificationSettings;
}

/**
 * Moves the deadline of every booking that waits for payment at `now`:
 * as the pause starts, to the latest it can be, the booking cut-off; as it
 * ends, to the payment window from then, or back to its own when that is
 * still ahead. The "10 minutes left to pay" reminder moves with it. A
 * booking whose deadline had already come is left to expire. Returns how
 * many moved.
 */
export async function movePaymentDeadlines(
  tx: Transaction,
  pause: "starts" | "ends",
  now: Date,
  settings: PauseSettings,
): Promise<number> {
  const waiting = await tx
    .select({
      id: bookings.id,
      decidedAt: bookings.decidedAt,
      boardsAt: tripStops.plannedAt,
    })
    .from(bookings)
    .innerJoin(tripStops, eq(tripStops.id, bookings.fromStopId))
    .where(and(eq(bookings.status, "accepted"), gt(bookings.paymentDueAt, now)))
    .for("update", { of: bookings });
  let moved = 0;
  for (const { id, decidedAt, boardsAt } of waiting) {
    if (decidedAt === null || boardsAt === null) continue;
    const dueAt =
      pause === "starts"
        ? latestPaymentDeadline(boardsAt, settings.bookings)
        : paymentDeadlineAfterPause(decidedAt, boardsAt, now, settings.bookings);
    await tx
      .update(bookings)
      .set({ paymentDueAt: dueAt, updatedAt: now })
      .where(eq(bookings.id, id));
    // The reminder still to come: 10 minutes before the new deadline, or
    // none when that is not ahead any more.
    const remindAt = payReminderAt({ acceptedAt: now, dueAt }, settings.notifications);
    await tx
      .update(scheduledNotifications)
      .set(
        remindAt === null ? { doneAt: now, updatedAt: now } : { runAt: remindAt, updatedAt: now },
      )
      .where(
        and(
          eq(scheduledNotifications.key, `pay_reminder:${id}`),
          isNull(scheduledNotifications.doneAt),
        ),
      );
    moved += 1;
  }
  return moved;
}
