import type { Booking, MyTrip } from "@shareride/contracts";
import { bookingNeed, freeSeats, soonestFirst, tripNeed, type Need } from "@shareride/domain";
import { canRate } from "@/reviews/held-back";

// My rides puts my bookings and the trips I drive in one list (spec 16, 3.3).

export type When = "upcoming" | "past";

/** A booking of mine or a published trip I drive, with when it starts and ends. */
export type Ride =
  | {
      readonly kind: "booking";
      readonly booking: Booking;
      readonly startsAt: Date;
      readonly endsAt: Date;
    }
  | {
      readonly kind: "trip";
      readonly trip: MyTrip;
      readonly startsAt: Date;
      readonly endsAt: Date;
    };

/** A booking of mine as a ride, for its ticket where it shows on its own. */
export const rideOfBooking = (booking: Booking): Ride => ({
  kind: "booking",
  booking,
  startsAt: new Date(booking.board.plannedAt),
  endsAt: new Date(booking.alight.plannedAt),
});

/**
 * A published or cancelled trip as a ride (spec 6, 3.1); a draft is not a
 * ride yet (3.3 item 7).
 */
function asTrip(trip: MyTrip): Ride[] {
  if (trip.status === "draft" || trip.departsAt === null || trip.arrivesAt === null) return [];
  return [
    { kind: "trip", trip, startsAt: new Date(trip.departsAt), endsAt: new Date(trip.arrivesAt) },
  ];
}

/**
 * The bookings and trips the server listed for `when`, as one list: soonest
 * first for upcoming, a ride under way included, or latest first for past.
 */
export function mergeRides(
  bookings: readonly Booking[],
  trips: readonly MyTrip[],
  when: When,
): Ride[] {
  const rides = [...bookings.map(rideOfBooking), ...trips.flatMap(asTrip)];
  const order = when === "upcoming" ? 1 : -1;
  return rides.sort((a, b) => order * (a.startsAt.getTime() - b.startsAt.getTime()));
}

const dateOrNull = (time: string | null) => (time === null ? null : new Date(time));

/**
 * What a ride asks of me now, and by when (spec 31, 3.3 item 3): a seat to
 * pay for, requests to answer, or its trip day; the rule is the domain's.
 */
export function needOf(ride: Ride, at: Date): Need | null {
  if (ride.kind === "booking") {
    return bookingNeed(
      {
        status: ride.booking.status,
        paymentDueAt: dateOrNull(ride.booking.paymentDueAt),
        phase: ride.booking.tripDay?.phase ?? null,
        boardsAt: ride.startsAt,
      },
      at,
    );
  }
  return tripNeed(
    {
      openRequests: ride.trip.openRequests,
      requestsCloseAt: dateOrNull(ride.trip.requestsCloseAt),
      phase: ride.trip.phase,
      departsAt: ride.startsAt,
    },
    at,
  );
}

/**
 * The rides that need me at `at`, each with what it needs, the soonest
 * need first: by the deadline to answer or pay, or by the time to get in
 * or leave, whenever the rides themselves start.
 */
export function needing(
  rides: readonly Ride[],
  at: Date,
): { readonly ride: Ride; readonly need: Need }[] {
  return soonestFirst(
    rides.flatMap((ride) => {
      const need = needOf(ride, at);
      return need === null ? [] : [{ ride, need }];
    }),
  );
}

/** A rating a ride that is done still waits for from me. */
export interface Rating {
  /** Whom I rate: the driver of my seat, or the passengers of a ride I drove. */
  readonly whom: "driver" | "passengers";
  readonly count: number;
}

/**
 * The rating a ride still waits for from me at `at` (spec 31, 3.10, item
 * 3): the driver's on a seat of mine, while I can rate them, or my
 * passengers' on a ride I drove, as the server counts them, until the last
 * of their times ends. Not something that needs me (decision 9): it is
 * said under Past, on the ride's own ticket, and given on the ride's page.
 */
export function ratingOf(ride: Ride, at: Date): Rating | null {
  if (ride.kind === "booking") {
    return canRate(ride.booking, at) ? { whom: "driver", count: 1 } : null;
  }
  const { toRate } = ride.trip;
  if (toRate === null || at >= new Date(toRate.closesAt)) return null;
  return { whom: "passengers", count: toRate.bookingIds.length };
}

const taken = (trip: MyTrip) => trip.segments.map((segment) => segment.seatsTaken);

/**
 * The seats taken on the fullest stretch, "1 of 3 seats taken": bookings
 * and requests waiting for an answer hold seats (rule S1).
 */
export const seatsTaken = (trip: MyTrip): number =>
  trip.seats - freeSeats(trip.seats, taken(trip), 0, trip.segments.length);

/** A key for a ride in a list: a booking and a trip never share one. */
export const rideKey = (ride: Ride): string =>
  ride.kind === "booking" ? `booking-${ride.booking.id}` : `trip-${ride.trip.id}`;
