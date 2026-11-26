// What needs me now (spec 31, 3.3, item 3): a ride I drive with requests to
// answer, a seat of mine to pay for, or a ride on its trip day. One rule for
// Find, My rides and the ride's own page, so they never disagree. A rating
// still to give is not among them (decision 9).
import type { BookingStatus } from "../bookings/lifecycle.ts";
import type { DayPhase } from "../trips/day.ts";

/** What a ride asks of me, and by when: the soonest need comes first. */
export type Need =
  /** Requests to answer; `by` is when the first of them closes. */
  | { readonly kind: "answer"; readonly by: Date }
  /** A seat the driver said yes to; `by` is the payment deadline. */
  | { readonly kind: "pay"; readonly by: Date }
  /** A ride on its trip day; `by` is when I get in, or leave as its driver. */
  | { readonly kind: "tripDay"; readonly by: Date };

/**
 * What a booking of mine needs at `at`: paying while the payment deadline
 * is still to come (spec 16, 3.3), or the trip day while a confirmed seat's
 * ride is on it, from three hours before I get in until it is done (spec 8,
 * 3.1). A deadline at or behind `at` needs nobody.
 */
export function bookingNeed(
  booking: {
    readonly status: BookingStatus;
    readonly paymentDueAt: Date | null;
    /** The trip day's phase at my boarding stop; null for a booking without one. */
    readonly phase: DayPhase | null;
    readonly boardsAt: Date;
  },
  at: Date,
): Need | null {
  if (booking.status === "accepted") {
    return booking.paymentDueAt !== null && booking.paymentDueAt > at
      ? { kind: "pay", by: booking.paymentDueAt }
      : null;
  }
  return booking.status === "confirmed" && booking.phase === "trip_day"
    ? { kind: "tripDay", by: booking.boardsAt }
    : null;
}

/**
 * What a ride I drive needs at `at`: an answer while requests wait and
 * their deadline is still to come, otherwise the trip day while the ride is
 * on it. A ride with a request and on its trip day needs the answer first.
 */
export function tripNeed(
  trip: {
    readonly openRequests: number;
    /** When the first open request closes; null with none. */
    readonly requestsCloseAt: Date | null;
    /** Null for a ride that does not run, such as a cancelled one. */
    readonly phase: DayPhase | null;
    readonly departsAt: Date;
  },
  at: Date,
): Need | null {
  if (trip.openRequests > 0 && trip.requestsCloseAt !== null && trip.requestsCloseAt > at) {
    return { kind: "answer", by: trip.requestsCloseAt };
  }
  return trip.phase === "trip_day" ? { kind: "tripDay", by: trip.departsAt } : null;
}

/** Soonest first by `need.by`; needs at the same time keep their order. */
export function soonestFirst<T extends { readonly need: Need }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.need.by.getTime() - b.need.by.getTime());
}
