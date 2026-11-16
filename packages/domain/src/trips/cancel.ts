// Cancelling a published trip (spec 6, 3.3; rules M2, R6.6 and R6.7): what
// happens to each booking on it, and whether it counts on the driver's
// reliability. The API applies it in one transaction.
import type { TripCancelReason } from "../bookings/cancellation.ts";
import type { Money } from "../money.ts";
import { err, ok, type Result } from "../result.ts";
import type { TripStatus } from "./trip.ts";

/** A published trip as cancelling it needs it. */
export interface CancellableTrip {
  readonly status: Exclude<TripStatus, "draft">;
  /** The planned time at the first stop. */
  readonly departsAt: Date;
}

/** A booking that holds seats on the trip (rule S1). */
export interface BookingToCancelWithTrip {
  readonly id: string;
  readonly status: "requested" | "accepted" | "confirmed";
  /** What the passenger paid, or pays once accepted (rule P1). */
  readonly total: Money;
}

export type TripCancelProblem =
  { readonly code: "trip_cancelled" } | { readonly code: "trip_departed" };

export interface TripCancellation {
  /**
   * Once, on the trip (spec 8, 3.8): only with a passenger, a confirmed
   * booking, and never for weather or a road closure (R6.7). Its bookings
   * do not count one by one.
   */
  readonly countsOnReliability: boolean;
  /** In the order given: a request is declined, the rest cancelled by the driver. */
  readonly bookings: readonly {
    readonly id: string;
    readonly outcome: "cancelled" | "declined";
    /** All that was paid (rule M2); nothing for an unpaid booking or a request. */
    readonly refund: Money;
  }[];
}

const excused: ReadonlySet<TripCancelReason> = new Set(["weather", "road_closed"]);

/**
 * The outcome of cancelling a trip now, for the reason given. Nothing is
 * cancelled from the planned departure on (R6.1): what happens then is the
 * trip day's (spec 8).
 */
export function tripCancellation(
  trip: CancellableTrip,
  bookings: readonly BookingToCancelWithTrip[],
  reason: TripCancelReason,
  now: Date,
): Result<TripCancellation, TripCancelProblem> {
  if (trip.status === "cancelled") return err({ code: "trip_cancelled" });
  if (trip.status !== "published" || trip.departsAt <= now) return err({ code: "trip_departed" });
  const withPassenger = bookings.some((booking) => booking.status === "confirmed");
  return ok({
    countsOnReliability: withPassenger && !excused.has(reason),
    bookings: bookings.map(({ id, status, total }) => ({
      id,
      outcome: status === "requested" ? "declined" : "cancelled",
      refund: status === "confirmed" ? total : { amount: 0, currency: total.currency },
    })),
  });
}

/**
 * Whether a trip's cancellation does not count only because of its weather
 * or road-closure reason: the one the operator can overrule (R8.11). A trip
 * without a passenger never counts, whatever the reason.
 */
export function tripExcusedByReason(
  bookings: readonly Pick<BookingToCancelWithTrip, "status">[],
  reason: TripCancelReason,
): boolean {
  return bookings.some((booking) => booking.status === "confirmed") && excused.has(reason);
}
