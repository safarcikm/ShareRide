import { holdsSeats, type BookingStatus } from "../bookings/lifecycle.ts";
import { completesAt, defaultTripDaySettings, type TripDaySettings } from "../trips/day.ts";
import type { TripStatus } from "../trips/trip.ts";
import { addDays } from "./calendar.ts";
import { privacySettings } from "./settings.ts";

/**
 * Something still open when a person asks to delete their account (spec 11,
 * 3.4.1). Trips, bookings and requests can be cancelled from the deletion
 * screen under the normal rules (spec 6); the rest must be settled first.
 */
export type OpenItem =
  | { readonly kind: "trip"; readonly id: string }
  | { readonly kind: "booking"; readonly id: string }
  | { readonly kind: "request"; readonly id: string }
  /** A trip on its way, which nobody can cancel: wait until it completes. The ID is the trip's. */
  | { readonly kind: "trip_under_way"; readonly id: string }
  | { readonly kind: "dispute"; readonly id: string }
  | { readonly kind: "held_payout"; readonly id: string };

export interface DeletionInputs {
  /** Trips the person drives, with their bookings that hold seats (rule S1). */
  readonly trips: readonly {
    readonly id: string;
    readonly status: TripStatus;
    readonly departsAt: Date;
    readonly arrivesAt: Date;
    readonly seatHoldingBookings: number;
  }[];
  /** The person's own bookings and requests as a passenger. */
  readonly bookings: readonly {
    readonly id: string;
    readonly tripId: string;
    readonly status: BookingStatus;
    /** The planned time at the passenger's boarding stop. */
    readonly boardsAt: Date;
    readonly tripArrivesAt: Date;
  }[];
  /** Open disputes they raised or must answer (spec 8); empty until milestone 7 has them. */
  readonly openDisputes: readonly string[];
  /** Payouts held for them (spec 13); empty until payouts exist. */
  readonly heldPayouts: readonly string[];
}

export interface DeletionCheck {
  readonly mustSettle: readonly OpenItem[];
  readonly canCancel: readonly OpenItem[];
  /** Deletion is allowed only when nothing is open (R11.3). */
  readonly allowed: boolean;
}

/**
 * What stands between the person and deleting their account (R11.3), by the
 * clock rather than by status alone, since a trip is marked departed or
 * completed by a job that runs every minute:
 *
 * - Before its departure, a trip with bookings can be cancelled (R6.1), and
 *   before boarding, a booking or request (spec 6).
 * - From then until the trip completes, 2 hours after its last stop (R8.1),
 *   a trip with a booking that holds seats is under way: wait.
 * - Afterwards it is over and nothing is open. A request or unpaid booking
 *   whose boarding passed is not open either: its deadline ends it.
 *
 * A published trip without bookings is not listed: it is hidden at once and
 * cancelled quietly when the data is erased.
 */
export function deletionCheck(
  inputs: DeletionInputs,
  now: Date,
  tripDay: TripDaySettings = defaultTripDaySettings,
): DeletionCheck {
  const mustSettle: OpenItem[] = [];
  const canCancel: OpenItem[] = [];
  const underWay = new Set<string>();
  const waitFor = (tripId: string) => {
    if (underWay.has(tripId)) return;
    underWay.add(tripId);
    mustSettle.push({ kind: "trip_under_way", id: tripId });
  };
  const settled = (arrivesAt: Date) => now >= completesAt(arrivesAt, tripDay);

  for (const trip of inputs.trips) {
    if (trip.seatHoldingBookings === 0) continue;
    if (trip.status !== "published" && trip.status !== "departed") continue;
    if (trip.status === "published" && now < trip.departsAt) {
      canCancel.push({ kind: "trip", id: trip.id });
    } else if (!settled(trip.arrivesAt)) waitFor(trip.id);
  }
  for (const booking of inputs.bookings) {
    if (!holdsSeats(booking.status)) continue;
    if (now < booking.boardsAt) {
      canCancel.push({
        kind: booking.status === "requested" ? "request" : "booking",
        id: booking.id,
      });
    } else if (booking.status === "confirmed" && !settled(booking.tripArrivesAt)) {
      waitFor(booking.tripId);
    }
  }
  for (const id of inputs.openDisputes) mustSettle.push({ kind: "dispute", id });
  for (const id of inputs.heldPayouts) mustSettle.push({ kind: "held_payout", id });

  return { mustSettle, canCancel, allowed: mustSettle.length === 0 && canCancel.length === 0 };
}

/** When the data of an account whose deletion was asked for now is erased (R11.8). */
export function deleteAfter(askedAt: Date): Date {
  return addDays(askedAt, privacySettings.deletionWaitDays);
}
