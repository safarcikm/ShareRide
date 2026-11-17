// Whether a passenger can book or request seats on a part of a trip, and
// what the booking starts as (spec 5, 3.1 and 3.2; rules S4, P1, P3, R5.3,
// R5.6, R5.10, R5.11). The API calls it inside the transaction that locks the trip,
// so the trip it gets is the one the booking changes.
import type { Money } from "../money.ts";
import { err, ok, type Result } from "../result.ts";
import { contactDetailsIn, type ContactKind } from "../trips/note.ts";
import { freeSeats, partPrice, type SearchableTrip } from "../trips/search.ts";
import { takesBookings, type BookingMode } from "../trips/trip.ts";
import { paymentDeadline, requestDeadline } from "./deadlines.ts";
import { statusOnAcceptance } from "./lifecycle.ts";
import type { BookingSettings } from "./settings.ts";

/** A trip as booking sees it: search's view plus the driver's booking mode. */
export interface BookableTrip extends SearchableTrip {
  readonly bookingMode: BookingMode;
}

/** Another booking of the passenger's that holds seats, from boarding to alighting. */
export interface HeldBooking {
  readonly boardsAt: Date;
  readonly alightsAt: Date;
}

export interface BookingAttempt {
  readonly trip: BookableTrip;
  readonly passengerId: string;
  /** Stop positions on the trip. */
  readonly board: number;
  readonly alight: number;
  readonly seats: number;
  /** The total the passenger last saw, for every seat (R5.3). */
  readonly shownTotal: Money;
  /** To the driver, with a request; empty for none. */
  readonly message: string;
  /** The passenger's bookings that hold seats, on any trip (R5.10). */
  readonly heldBookings: readonly HeldBooking[];
  /** The trip limit less the trip's takings, never below 0 (rule P3, spec 17). */
  readonly limitRoom: Money;
  readonly now: Date;
}

export type BookingProblem =
  | { readonly code: "trip_not_bookable" }
  | { readonly code: "invalid_part"; readonly end: "board" | "alight" }
  | { readonly code: "own_trip" }
  | { readonly code: "booking_closed" }
  | { readonly code: "invalid_seats" }
  | { readonly code: "message_not_allowed" }
  | { readonly code: "message_too_long" }
  | { readonly code: "message_has_contact_details"; readonly kinds: readonly ContactKind[] }
  | { readonly code: "seats_taken"; readonly freeSeats: number }
  | { readonly code: "price_changed"; readonly total: Money }
  /** The booking would take the trip past its limit (rule P3, spec 17); a second line of defence. */
  | { readonly code: "trip_limit_reached" }
  | { readonly code: "overlapping_booking" };

/** What to store: the starting status, the price snapshot (P1) and the deadlines. */
export interface BookingPlan {
  readonly status: "requested" | "accepted" | "confirmed";
  /** Per seat, one for each segment of the part, by segment position. */
  readonly segmentPrices: readonly { readonly position: number; readonly price: number }[];
  readonly total: Money;
  /** Set for a request (R5.5). */
  readonly requestExpiresAt: Date | null;
  /** Set for an accepted booking that has something to pay (rule M1). */
  readonly paymentDueAt: Date | null;
}

const isk = (amount: number): Money => ({ amount, currency: "ISK" });

/** The problems in the order the passenger can act on them; the first one found is returned. */
export function checkBooking(
  attempt: BookingAttempt,
  settings: BookingSettings,
): Result<BookingPlan, BookingProblem> {
  const { trip, board, alight, seats, now } = attempt;
  if (!takesBookings(trip.status)) return err({ code: "trip_not_bookable" });

  const last = trip.stops.length - 1;
  if (!Number.isInteger(board) || board < 0 || board >= last) {
    return err({ code: "invalid_part", end: "board" });
  }
  if (!Number.isInteger(alight) || alight <= board || alight > last) {
    return err({ code: "invalid_part", end: "alight" });
  }
  const boardsAt = trip.stops[board]?.plannedAt ?? now;
  const alightsAt = trip.stops[alight]?.plannedAt ?? now;
  if (boardsAt.getTime() <= now.getTime()) return err({ code: "trip_not_bookable" });
  if (attempt.passengerId === trip.driverId) return err({ code: "own_trip" });
  // As search and trip details: open while the boarding stop is more than the
  // cut-off away, so the request or payment deadline is still ahead.
  if (boardsAt.getTime() <= now.getTime() + settings.bookingCutoffMinutes * 60_000) {
    return err({ code: "booking_closed" });
  }
  if (!Number.isInteger(seats) || seats < 1) return err({ code: "invalid_seats" });

  const message = attempt.message.trim();
  if (message !== "") {
    if (trip.bookingMode === "instant") return err({ code: "message_not_allowed" });
    // Characters as the database counts them (code points), like the trip note.
    if (Array.from(message.normalize("NFC")).length > settings.messageMaxLength) {
      return err({ code: "message_too_long" });
    }
    const kinds = contactDetailsIn(message);
    if (kinds.length > 0) return err({ code: "message_has_contact_details", kinds });
  }

  const occupancy = trip.segments.map((segment) => segment.occupancy);
  const free = freeSeats(trip.capacity, occupancy, board, alight);
  if (seats > free) return err({ code: "seats_taken", freeSeats: Math.max(0, free) });

  const prices = trip.segments.map((segment) => segment.price);
  const total = isk(partPrice(prices, board, alight) * seats);
  if (attempt.shownTotal.amount !== total.amount) return err({ code: "price_changed", total });
  if (total.amount > attempt.limitRoom.amount) return err({ code: "trip_limit_reached" });

  const overlaps = attempt.heldBookings.some(
    (held) =>
      held.boardsAt.getTime() < alightsAt.getTime() &&
      boardsAt.getTime() < held.alightsAt.getTime(),
  );
  if (overlaps) return err({ code: "overlapping_booking" });

  const segmentPrices = prices.map((price, position) => ({ position, price })).slice(board, alight);
  if (trip.bookingMode === "approval") {
    return ok({
      status: "requested",
      segmentPrices,
      total,
      requestExpiresAt: requestDeadline(now, boardsAt, settings),
      paymentDueAt: null,
    });
  }
  const status = statusOnAcceptance(total);
  return ok({
    status,
    segmentPrices,
    total,
    requestExpiresAt: null,
    paymentDueAt: status === "accepted" ? paymentDeadline(now, boardsAt, settings) : null,
  });
}
