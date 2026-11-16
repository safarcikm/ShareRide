// What a cancellation costs and whether it shows on the canceller's profile
// (spec 6, 3.3 to 3.5; rules M2, R6.3, R6.7 and R6.8). The API asks the
// same function for the preview and when confirming; terms that changed in
// between, at a time edge or after a move, are shown again before cancelling.
import type { Money } from "../money.ts";
import { err, ok, type Result } from "../result.ts";
import { nextStatus, type BookingStatus, type ChangeNotAllowed } from "./lifecycle.ts";

/** Why a driver cancels a trip (spec 6, 3.3.1). */
export const tripCancelReasons = [
  "weather",
  "road_closed",
  "car_problem",
  "illness",
  "plans_changed",
  "other",
] as const;
export type TripCancelReason = (typeof tripCancelReasons)[number];

/** Why a driver cancels one booking: a trip's reasons, or the two of spec 6, 3.4. */
export const driverCancelReasons = [
  ...tripCancelReasons,
  "passenger_asked",
  "car_smaller",
] as const;
export type DriverCancelReason = (typeof driverCancelReasons)[number];

/** Why a passenger cancels (spec 6, 3.5.1). */
export const passengerCancelReasons = [
  "plans_changed",
  "found_another",
  "trip_changed",
  "weather",
  "other",
] as const;
export type PassengerCancelReason = (typeof passengerCancelReasons)[number];

export type Canceller =
  | { readonly by: "passenger"; readonly reason: PassengerCancelReason }
  | { readonly by: "driver"; readonly reason: DriverCancelReason };

/**
 * A departure moved by more than this many minutes from when a booking was
 * made lets its passenger cancel with a full refund, without it counting
 * (R6.3), and is told by SMS close to boarding (spec 7, 3.4).
 */
export const freeCancellationMoveMinutes = 30;
/** Rule M2: a passenger cancelling this many minutes or more before boarding gets a full refund. */
export const refundCutoffMinutes = 15;
/** R6.8: a passenger's cancellation counts when made less than this many hours before boarding. */
export const reliabilityWindowHours = 24;

const minuteMs = 60_000;

/**
 * Weather and road closures never count (R6.7, R6.8). In the beta the reason
 * is trusted as given and the operator can overrule a clearly wrong one
 * (spec 8).
 */
const excusedReasons: ReadonlySet<Canceller["reason"]> = new Set(["weather", "road_closed"]);

/** Whether the departure has moved by more than 30 minutes, earlier or later, since booking (R6.3). */
export function movedFar(departsAtWhenBooked: Date, departsAt: Date): boolean {
  return (
    Math.abs(departsAt.getTime() - departsAtWhenBooked.getTime()) >
    freeCancellationMoveMinutes * minuteMs
  );
}

export interface BookingToCancel {
  readonly status: BookingStatus;
  /** What the passenger paid, or pays once accepted (rule P1). */
  readonly total: Money;
  /** The planned time at the boarding stop as it is now, after any move. */
  readonly boardsAt: Date;
  /** The trip's departure as it is now… */
  readonly departsAt: Date;
  /** …and as it was when the booking was made. */
  readonly departsAtWhenBooked: Date;
}

export interface CancellationTerms {
  /** What goes back to the passenger: all they paid, or nothing (rule M2). */
  readonly refund: Money;
  /** Whether it shows on the canceller's reliability (R6.7, R6.8; shown with spec 8). */
  readonly countsOnReliability: boolean;
}

/**
 * The terms of cancelling an accepted or confirmed booking. A request is
 * withdrawn by the passenger or declined by the driver instead (spec 5).
 *
 * - The driver: always a full refund; it counts unless for weather or a
 *   road closure.
 * - The passenger: a full refund 15 minutes or more before boarding, or
 *   before boarding after a move of more than 30 minutes; otherwise none.
 *   R6.3's "before the new departure" is the passenger's own, at their
 *   boarding stop, as spec 6 says "departure" for it in "less than 15
 *   minutes before departure". It counts only less than 24 hours before
 *   boarding, and never for weather or after such a move.
 * - An accepted booking not yet paid has nothing to refund and never counts.
 */
export function cancellationTerms(
  booking: BookingToCancel,
  canceller: Canceller,
  now: Date,
): Result<CancellationTerms, ChangeNotAllowed> {
  const allowed = nextStatus(booking.status, "cancel");
  if (!allowed.ok) return err(allowed.error);
  const nothing: Money = { amount: 0, currency: booking.total.currency };
  if (booking.status !== "confirmed") return ok({ refund: nothing, countsOnReliability: false });

  const excused = excusedReasons.has(canceller.reason);
  if (canceller.by === "driver") {
    return ok({ refund: booking.total, countsOnReliability: !excused });
  }
  const untilBoardingMs = booking.boardsAt.getTime() - now.getTime();
  const far = movedFar(booking.departsAtWhenBooked, booking.departsAt);
  const refunded =
    untilBoardingMs >= refundCutoffMinutes * minuteMs || (far && untilBoardingMs > 0);
  const late = untilBoardingMs < reliabilityWindowHours * 60 * minuteMs;
  return ok({
    refund: refunded ? booking.total : nothing,
    countsOnReliability: late && !excused && !far,
  });
}
