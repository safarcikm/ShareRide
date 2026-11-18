import { schema } from "@shareride/db";
import type { OutboxEventType } from "@shareride/domain";
import type { Transaction } from "../bookings/seats.ts";

const { outboxEvents } = schema;

/**
 * What happened, as booking, payment, chat, privacy, console and safety code records
 * it for the worker. IDs only: the worker reads the rest when it sends (R7.9).
 */
export type OutboxEvent =
  | {
      readonly type: Exclude<
        OutboxEventType,
        | "BookingExpired"
        | "BookingCancelled"
        | "CheckedIn"
        | "DepartureMoved"
        | "TripChanged"
        | "TripCancelled"
        | "MessageSent"
        | "ReviewRevealed"
        | "MeetingPointChanged"
        | "MeetingPointMoved"
        | "DataExportReady"
        | "ReportFiled"
        | "ModerationActionTaken"
        | "SuspensionEnded"
        | "AccountDeletionScheduled"
        | "AppealAnswered"
        | "ReportClosed"
        | "FeedbackReplied"
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
      /**
       * Who cancelled: the other person is told (spec 7, 3.3). ShareRide
       * cancels a suspended passenger's booking: the driver is told (spec 9, 3.6).
       */
      readonly by: "passenger" | "driver" | "operator";
    }
  | {
      /** "I'm here" (spec 8, 3.2): one for each booking at the stop; the other side is told. */
      readonly type: "CheckedIn";
      readonly bookingId: string;
      readonly by: "passenger" | "driver";
    }
  | {
      /**
       * One for each booked passenger, with the change: the times before and
       * after, or the new car (spec 6, 3.2).
       */
      readonly type: "DepartureMoved" | "TripChanged";
      readonly bookingId: string;
      readonly tripChangeId: string;
    }
  | {
      /** One for each booking and request on the trip, so each passenger is told (spec 7). */
      readonly type: "TripCancelled";
      readonly tripId: string;
      readonly bookingId: string;
    }
  | { readonly type: "MessageSent"; readonly messageId: string }
  | {
      /** A review shows (spec 8, R8.9): the person it is about is told. */
      readonly type: "ReviewRevealed";
      readonly bookingId: string;
      readonly reviewId: string;
    }
  | {
      /**
       * A meeting point paused (spec 2, 3.6.4) or moved more than 50 m
       * (3.6.6), one for each trip still to stop there: its driver, and each
       * passenger who gets in or out there, are told.
       */
      readonly type: "MeetingPointChanged" | "MeetingPointMoved";
      readonly tripId: string;
      readonly meetingPointId: string;
    }
  | {
      /** The person's file of their data is ready to download (spec 11, 3.2). */
      readonly type: "DataExportReady";
      readonly userId: string;
      readonly exportId: string;
    }
  | {
      /** A new report: every operator is told, never who or what (spec 9, R9.9). */
      readonly type: "ReportFiled";
      readonly reportId: string;
    }
  | {
      /** An operator's action that affects the person: they get its notice (spec 9, R9.5). */
      readonly type: "ModerationActionTaken";
      readonly actionId: string;
    }
  | {
      /** The person's suspension reached its end: they are told (spec 9, 3.6). */
      readonly type: "SuspensionEnded";
      readonly userId: string;
    }
  | {
      /** The person asked to delete their account; the email says when (spec 11, 3.4.5). */
      readonly type: "AccountDeletionScheduled";
      readonly userId: string;
    }
  | {
      /** The operator answered the person's question about their data; the email has the answer (spec 11, 3.6). */
      readonly type: "PrivacyRequestAnswered";
      readonly userId: string;
      readonly requestId: string;
    }
  | {
      /** The operator answered the person's appeal: they are told (spec 9, 3.4.4). */
      readonly type: "AppealAnswered";
      readonly actionId: string;
    }
  | {
      /** A report was closed: the reporter is told the outcome (spec 9, 3.1.6). */
      readonly type: "ReportClosed";
      readonly reportId: string;
    }
  | {
      /** The operator replied to a tester's feedback: they are told (spec 12, 3.3.4). */
      readonly type: "FeedbackReplied";
      readonly feedbackId: string;
    };

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
