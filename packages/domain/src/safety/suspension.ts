// Suspension (spec 9, 3.6; rule R9.10): who is suspended, what they can no
// longer do, and what a suspension cancels.
import type { BookingEvent, BookingStatus } from "../bookings/lifecycle.ts";
import type { Money } from "../money.ts";
import { err, ok, type Result } from "../result.ts";
import type { TripStatus } from "../trips/trip.ts";
import { checkStatement, type ModerationRule, type StatementProblem } from "./moderation.ts";

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
): Result<SuspensionInput, SuspensionProblem> {
  const statement = checkStatement(input);
  if (!statement.ok) return statement;
  if (input.until && input.until.getTime() <= now.getTime()) return err({ code: "until_past" });
  return ok({ ...input, ...statement.value });
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
  readonly tripDepartsAt: Date;
  readonly total: Money;
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

const upcoming = (status: TripStatus, departsAt: Date, now: Date) =>
  status === "published" && departsAt.getTime() > now.getTime();

/**
 * What a suspension cancels at once (R9.10): the upcoming trips the person
 * drives and the bookings they hold on upcoming trips. A trip under way and
 * its bookings carry on; what happens then is the trip day's (spec 8).
 */
export function suspensionEffects(
  trips: readonly DrivenTrip[],
  bookings: readonly SuspendedPassengerBooking[],
  now: Date,
): SuspensionEffects {
  return {
    trips: trips.filter((trip) => upcoming(trip.status, trip.departsAt, now)).map(({ id }) => id),
    bookings: bookings
      .filter(
        (booking) =>
          ["requested", "accepted", "confirmed"].includes(booking.status) &&
          upcoming(booking.tripStatus, booking.tripDepartsAt, now),
      )
      .map(({ id, status, total }) => ({
        id,
        event: status === "requested" ? "withdraw" : "cancel",
        refund: status === "confirmed" ? total : { amount: 0, currency: total.currency },
      })),
  };
}
