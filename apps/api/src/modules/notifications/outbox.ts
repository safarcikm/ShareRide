import { schema } from "@shareride/db";
import type { OutboxEventType } from "@shareride/domain";
import type { Transaction } from "../bookings/seats.ts";

const { outboxEvents } = schema;

/**
 * What happened, as booking, payment and chat code records it for the
 * worker. IDs only: the worker reads the rest when it sends (R7.9).
 */
export type OutboxEvent =
  | {
      readonly type: Exclude<
        OutboxEventType,
        "BookingExpired" | "BookingCancelled" | "DepartureMoved" | "TripCancelled" | "MessageSent"
      >;
      readonly bookingId: string;
    }
  | {
      readonly type: "BookingExpired";
      readonly bookingId: string;
      /** A request nobody answered, or an accepted booking nobody paid for. */
      readonly reason: "unanswered" | "unpaid";
    }
  | {
      readonly type: "BookingCancelled";
      readonly bookingId: string;
      /** Who cancelled: the other person is told (spec 7, 3.3). */
      readonly by: "passenger" | "driver";
    }
  | {
      /** One for each booked passenger, with the change for the times before and after (spec 6, 3.2). */
      readonly type: "DepartureMoved";
      readonly bookingId: string;
      readonly tripChangeId: string;
    }
  | {
      /** One for each booking and request on the trip, so each passenger is told (spec 7). */
      readonly type: "TripCancelled";
      readonly tripId: string;
      readonly bookingId: string;
    }
  | { readonly type: "MessageSent"; readonly messageId: string };

/**
 * Writes events to the outbox in the transaction that makes the change, so
 * a change rolled back leaves no event and one stored always has its event
 * (spec 7, 3.7).
 */
export async function recordEvents(
  tx: Transaction,
  events: readonly OutboxEvent[],
  now: Date,
): Promise<void> {
  if (events.length === 0) return;
  await tx.insert(outboxEvents).values(
    events.map(({ type, ...payload }) => ({
      kind: type,
      payload,
      createdAt: now,
      updatedAt: now,
    })),
  );
}
