// Suspension (spec 9, 3.6; rule R9.10): who is suspended, what they can no
// longer do, and what a suspension cancels.
import {
  holdsSeats,
  paidInApp,
  type BookingEvent,
  type BookingStatus,
  type PaymentMethod,
} from "../bookings/lifecycle.ts";
import type { Money } from "../money.ts";
import { err, ok, type Result } from "../result.ts";
import type { TripStatus } from "../trips/trip.ts";
import { checkStatement, type ModerationRule, type StatementProblem } from "./moderation.ts";
import { characterCount, defaultSafetySettings, type SafetySettings } from "./settings.ts";

export interface AccountStanding {
  readonly status: "active" | "suspended";
  /** Empty for a suspension without an end. */
  readonly suspendedUntil: Date | null;
}

/** Suspended until the end date passes, or for good without one. */
export function isSuspended(user: AccountStanding, now: Date): boolean {
  return (
    user.status === "suspended" &&
    (user.suspendedUntil === null || user.suspendedUntil.getTime() > now.getTime())
  );
}

/**
 * What a suspended person cannot do (3.6.2). Signing in, reading their own
 * data, downloading it, deleting the account, reporting, blocking and
 * appealing stay open.
 */
export const restrictedActions = [
  "search",
  "book",
  "request",
  "post_trip",
  "change_trip",
  // A trip under way carries on, but takes nobody new: accepting is
  // refused, and others cannot find or book it (milestone 9, PR 6a).
  "accept_request",
  "send_message",
  "review",
] as const;
export type RestrictedAction = (typeof restrictedActions)[number];

export type AccountSuspended = {
  readonly code: "account_suspended";
  readonly until: Date | null;
};

/** Refuses every one of the restricted actions while the person is suspended. */
export function checkActive(user: AccountStanding, now: Date): Result<void, AccountSuspended> {
  return isSuspended(user, now)
    ? err({ code: "account_suspended", until: user.suspendedUntil })
    : ok(undefined);
}

export interface SuspensionInput {
  readonly rule: ModerationRule;
  /** Written for the person: it goes in their statement of reasons (R9.5). */
  readonly reason: string;
  readonly until: Date | null;
}

export type SuspensionProblem = StatementProblem | { readonly code: "until_past" };

/** A suspension has a rule, a reason and an end in the future, or none (3.6.1). */
export function checkSuspension(
  input: SuspensionInput,
  now: Date,
  settings: SafetySettings = defaultSafetySettings,
): Result<SuspensionInput, SuspensionProblem> {
  const statement = checkStatement(input, settings);
  if (!statement.ok) return statement;
  if (input.until && input.until.getTime() <= now.getTime()) return err({ code: "until_past" });
  return ok({ ...input, ...statement.value });
}

/** Reinstating ends a suspension early, with a note the person reads (3.6.3). */
export function checkReinstatement(
  note: string,
  settings: SafetySettings = defaultSafetySettings,
): Result<string, StatementProblem> {
  const trimmed = note.trim();
  if (trimmed === "") return err({ code: "reason_missing" });
  if (characterCount(trimmed) > settings.textMaxLength) return err({ code: "too_long" });
  return ok(trimmed);
}

/** A trip the suspended person drives. */
export interface DrivenTrip {
  readonly id: string;
  readonly status: TripStatus;
  readonly departsAt: Date;
}

/** A booking the suspended person holds as a passenger. */
export interface SuspendedPassengerBooking {
  readonly id: string;
  readonly status: BookingStatus;
  readonly tripStatus: TripStatus;
  /** When the person boards: a later stop of a trip under way is still ahead. */
  readonly boardsAt: Date;
  readonly total: Money;
  readonly paymentMethod: PaymentMethod;
}

export interface SuspensionEffects {
  /** Cancelled by the operator, each with full refunds to its passengers. */
  readonly trips: readonly string[];
  /** Withdrawn or cancelled, with a full refund of what was paid (milestone 9 decision 3). */
  readonly bookings: readonly {
    readonly id: string;
    readonly event: Extract<BookingEvent, "withdraw" | "cancel">;
    readonly refund: Money;
  }[];
}

/**
 * What goes back when ShareRide cancels a booking: all that was paid in the
 * app (decision 3), so nothing for one paid in person (rule M6).
 */
export function operatorBookingRefund(
  status: BookingStatus,
  total: Money,
  method: PaymentMethod,
): Money {
  return status === "confirmed"
    ? paidInApp(total, method)
    : { amount: 0, currency: total.currency };
}

const upcoming = (status: TripStatus, departsAt: Date, now: Date) =>
  status === "published" && departsAt.getTime() > now.getTime();

/** A booking the person has not boarded yet, on a trip that still runs. */
const notBoarded = (booking: SuspendedPassengerBooking, now: Date) =>
  holdsSeats(booking.status) &&
  (booking.tripStatus === "published" || booking.tripStatus === "departed") &&
  booking.boardsAt.getTime() > now.getTime();

/**
 * What a suspension cancels at once (R9.10): the upcoming trips the person
 * drives, and every booking they have not boarded yet, even at a later stop
 * of a trip under way, as a cancellation is open until boarding (spec 6).
 * A trip under way that they drive carries on; what happens then is the
 * trip day's (spec 8).
 */
export function suspensionEffects(
  trips: readonly DrivenTrip[],
  bookings: readonly SuspendedPassengerBooking[],
  now: Date,
): SuspensionEffects {
  return {
    trips: trips.filter((trip) => upcoming(trip.status, trip.departsAt, now)).map(({ id }) => id),
    bookings: bookings
      .filter((booking) => notBoarded(booking, now))
      .map(({ id, status, total, paymentMethod }) => ({
        id,
        event: status === "requested" ? "withdraw" : "cancel",
        refund: operatorBookingRefund(status, total, paymentMethod),
      })),
  };
}
