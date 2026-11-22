// What a cancellation costs and whether it shows on the canceller's profile
// (spec 6, 3.3 to 3.5; rules M2, R6.3, R6.7 and R6.8). The API asks the
// same function for the preview and when confirming; terms that changed in
// between, at a time edge or after a move, are shown again before cancelling.
import type { Money } from "../money.ts";
import { err, ok, type Result } from "../result.ts";
import {
  nextStatus,
  paidInApp,
  type BookingStatus,
  type ChangeNotAllowed,
  type PaymentMethod,
} from "./lifecycle.ts";

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

/**
 * The reason only ShareRide gives, never offered to anyone: a booking
 * cancelled as if by the driver because the driver didn't come (spec 8, 3.4).
 */
export const systemCancelReasons = ["driver_absent"] as const;
export type SystemCancelReason = (typeof systemCancelReasons)[number];

/** Every reason a cancellation can store, each once. */
export const cancelReasons = [
  ...new Set([...driverCancelReasons, ...passengerCancelReasons, ...systemCancelReasons]),
] as readonly (DriverCancelReason | PassengerCancelReason | SystemCancelReason)[];
export type CancelReason = (typeof cancelReasons)[number];

/** The reasons offered to the one who cancels. */
export function cancelReasonsFor(
  by: "passenger" | "driver",
): readonly PassengerCancelReason[] | readonly DriverCancelReason[] {
  return by === "passenger" ? passengerCancelReasons : driverCancelReasons;
}

export type Canceller =
  | { readonly by: "passenger"; readonly reason: PassengerCancelReason }
  | { readonly by: "driver"; readonly reason: DriverCancelReason };

/**
 * The values of cancelling the operator sets (ADR 0032). A booking keeps
 * the ones of the settings version it was made under, so its deal never
 * changes after the fact (R10.3).
 */
export interface CancellationSettings {
  /**
   * A departure moved by more than this many minutes from when a booking was
   * made lets its passenger cancel with a full refund, without it counting
   * (R6.3), and is told by SMS close to boarding (spec 7, 3.4)
   * (`major_time_change`).
   */
  readonly freeCancellationMoveMinutes: number;
  /**
   * Rule M2: a passenger cancelling this many minutes or more before
   * boarding gets a full refund (`free_cancellation_until`).
   */
  readonly refundCutoffMinutes: number;
  /**
   * R6.8: a passenger's cancellation counts when made less than this many
   * hours before boarding (`reliability_cancellation_window`).
   */
  readonly reliabilityWindowHours: number;
}

/** The starting values (decided 2026-11-13, pricing and seats). */
export const defaultCancellationSettings: CancellationSettings = {
  freeCancellationMoveMinutes: 30,
  refundCutoffMinutes: 15,
  reliabilityWindowHours: 24,
};

/** The starting values, one by one, for texts and tests. */
export const { freeCancellationMoveMinutes, refundCutoffMinutes, reliabilityWindowHours } =
  defaultCancellationSettings;

const minuteMs = 60_000;

/**
 * Weather and road closures never count (R6.7, R6.8). In the beta the reason
 * is trusted as given and the operator can overrule a clearly wrong one
 * (spec 8).
 */
const excusedReasons: ReadonlySet<Canceller["reason"]> = new Set(["weather", "road_closed"]);

/**
 * Whether the departure has moved by more than the booking's
 * `major_time_change` (30 minutes to start), earlier or later, since
 * booking (R6.3).
 */
export function movedFar(
  departsAtWhenBooked: Date,
  departsAt: Date,
  settings: Pick<CancellationSettings, "freeCancellationMoveMinutes"> = defaultCancellationSettings,
): boolean {
  return (
    Math.abs(departsAt.getTime() - departsAtWhenBooked.getTime()) >
    settings.freeCancellationMoveMinutes * minuteMs
  );
}

export interface BookingToCancel {
  readonly status: BookingStatus;
  /** What the passenger paid, or pays once accepted (rule P1). */
  readonly total: Money;
  /** Paid in person, nothing goes back through the app (rule M6). */
  readonly paymentMethod: PaymentMethod;
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
 * The planned time at the passenger's boarding stop has passed: what happens
 * then is the trip day's (spec 8), such as a no-show or a driver who never
 * came, not a cancellation.
 */
export interface BoardingPassed {
  readonly code: "boarding_passed";
}

/**
 * The terms of cancelling an accepted or confirmed booking. A request is
 * withdrawn by the passenger or declined by the driver instead (spec 5).
 *
 * - Neither can cancel once the planned time at the boarding stop has
 *   come: what happens then is the trip day's (spec 8), such as a no-show.
 * - The driver: always a full refund; it counts unless for weather or a
 *   road closure.
 * - The passenger: a full refund 15 minutes or more before boarding, or
 *   before boarding after a move of more than 30 minutes; otherwise none.
 *   R6.3's "before the new departure" is the passenger's own, at their
 *   boarding stop, as spec 6 says "departure" for it in "less than 15
 *   minutes before departure". It counts only less than 24 hours before
 *   boarding, and never for weather or after such a move.
 * - An accepted booking not yet paid has nothing to refund and never counts.
 * - A booking paid to the driver in person refunds nothing, and counts as
 *   one paid in the app would (rule M6).
 *
 * The numbers are the starting values; `settings` are the booking's own.
 */
export function cancellationTerms(
  booking: BookingToCancel,
  canceller: Canceller,
  now: Date,
  settings: CancellationSettings = defaultCancellationSettings,
): Result<CancellationTerms, ChangeNotAllowed | BoardingPassed> {
  const allowed = nextStatus(booking.status, "cancel");
  if (!allowed.ok) return err(allowed.error);
  const untilBoardingMs = booking.boardsAt.getTime() - now.getTime();
  if (untilBoardingMs <= 0) return err({ code: "boarding_passed" });
  const nothing: Money = { amount: 0, currency: booking.total.currency };
  if (booking.status !== "confirmed") return ok({ refund: nothing, countsOnReliability: false });

  const excused = excusedReasons.has(canceller.reason);
  const paid = paidInApp(booking.total, booking.paymentMethod);
  if (canceller.by === "driver") {
    return ok({ refund: paid, countsOnReliability: !excused });
  }
  const far = movedFar(booking.departsAtWhenBooked, booking.departsAt, settings);
  const refunded = untilBoardingMs >= settings.refundCutoffMinutes * minuteMs || far;
  const late = untilBoardingMs < settings.reliabilityWindowHours * 60 * minuteMs;
  return ok({
    refund: refunded ? paid : nothing,
    countsOnReliability: late && !excused && !far,
  });
}

/**
 * Whether a cancellation does not count only because of its weather or
 * road-closure reason: the one the operator can overrule, so that it counts
 * (R8.11). One that would not count for any reason, such as a passenger's
 * two days before boarding, is not.
 */
export function excusedByReason(
  booking: BookingToCancel,
  canceller: Canceller,
  now: Date,
  settings: CancellationSettings = defaultCancellationSettings,
): boolean {
  const asGiven = cancellationTerms(booking, canceller, now, settings);
  const without = cancellationTerms(
    booking,
    canceller.by === "driver"
      ? { by: "driver", reason: "other" }
      : { by: "passenger", reason: "other" },
    now,
    settings,
  );
  return (
    asGiven.ok &&
    without.ok &&
    !asGiven.value.countsOnReliability &&
    without.value.countsOnReliability
  );
}
