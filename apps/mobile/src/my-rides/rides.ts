import type { Booking, MyTrip } from "@shareride/contracts";
import { freeSeats } from "@shareride/domain";

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

/** What a ride asks of me now: paying, answering requests, or nothing. */
export type NeedsYou = "pay" | "answer" | null;

const asBooking = (booking: Booking): Ride => ({
  kind: "booking",
  booking,
  startsAt: new Date(booking.board.plannedAt),
  endsAt: new Date(booking.alight.plannedAt),
});

/** A published trip as a ride; a draft is not a ride yet (3.3 item 7). */
function asTrip(trip: MyTrip): Ride[] {
  if (trip.status !== "published" || trip.departsAt === null || trip.arrivesAt === null) return [];
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
  const rides = [...bookings.map(asBooking), ...trips.flatMap(asTrip)];
  const order = when === "upcoming" ? 1 : -1;
  return rides.sort((a, b) => order * (a.startsAt.getTime() - b.startsAt.getTime()));
}

/**
 * A booking to pay while its payment deadline is still to come, or a trip
 * with requests to answer before they close (3.3 item 2).
 */
export function needsYou(ride: Ride, at: Date): NeedsYou {
  const before = (deadline: string | null) =>
    deadline !== null && new Date(deadline).getTime() > at.getTime();
  if (ride.kind === "booking") {
    return ride.booking.status === "accepted" && before(ride.booking.paymentDueAt) ? "pay" : null;
  }
  return ride.trip.openRequests > 0 && before(ride.trip.requestsCloseAt) ? "answer" : null;
}

const taken = (trip: MyTrip) => trip.segments.map((segment) => segment.seatsTaken);

/**
 * The seats taken on the fullest stretch, "1 of 3 seats taken": bookings
 * and requests waiting for an answer hold seats (rule S1).
 */
export const seatsTaken = (trip: MyTrip): number =>
  trip.seats - freeSeats(trip.seats, taken(trip), 0, trip.segments.length);

/** The seats still free on each stretch, in the trip's order (rule S3). */
export const seatsFree = (trip: MyTrip): number[] =>
  trip.segments.map((_, position) => freeSeats(trip.seats, taken(trip), position, position + 1));

/** A key for a ride in a list: a booking and a trip never share one. */
export const rideKey = (ride: Ride): string =>
  ride.kind === "booking" ? `booking-${ride.booking.id}` : `trip-${ride.trip.id}`;
