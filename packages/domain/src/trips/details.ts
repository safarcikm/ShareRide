// A trip opened for one part of it (spec 4, 3.6): the price and free seats
// on that part (rules P1 and S3), and whether it can be booked (rule S4).
// Any stop can become the boarding or alighting stop, in travel order.
import type { Money } from "../money.ts";
import { err, ok, type Result } from "../result.ts";
import { freeSeats, partPrice, type SearchableTrip, type SearchSettings } from "./search.ts";

/** Stop positions on the trip; left out, the part runs from the first stop or to the last. */
export interface PartChoice {
  readonly board?: number | undefined;
  readonly alight?: number | undefined;
  readonly seats: number;
}

/**
 * What the passenger can do with the part (spec 4, 3.6.9), in this order:
 * a cancelled trip; a trip past the boarding stop; the driver's own trip;
 * booking closed at the cut-off; too few seats free; or open for booking.
 */
export const partStates = ["cancelled", "departed", "own", "closed", "full", "open"] as const;
export type PartState = (typeof partStates)[number];

export interface TripPart {
  readonly board: number;
  readonly alight: number;
  readonly seats: number;
  /** Seats free on every stretch of the part (rule S3). */
  readonly freeSeats: number;
  /** For one seat, and for the seats asked for (rule P1). */
  readonly pricePerSeat: Money;
  readonly total: Money;
  readonly state: PartState;
}

/** The end of the part that does not fit the trip. */
export interface InvalidPart {
  readonly code: "invalid_part";
  readonly end: "board" | "alight";
}

const isk = (amount: number): Money => ({ amount, currency: "ISK" });

export function tripPart(
  trip: SearchableTrip,
  choice: PartChoice,
  viewerId: string | null,
  now: Date,
  settings: Pick<SearchSettings, "bookingCutoffMinutes">,
): Result<TripPart, InvalidPart> {
  const last = trip.stops.length - 1;
  const board = choice.board ?? 0;
  const alight = choice.alight ?? last;
  if (!Number.isInteger(board) || board < 0 || board >= last) {
    return err({ code: "invalid_part", end: "board" });
  }
  if (!Number.isInteger(alight) || alight <= board || alight > last) {
    return err({ code: "invalid_part", end: "alight" });
  }

  const occupancy = trip.segments.map((segment) => segment.occupancy);
  const prices = trip.segments.map((segment) => segment.price);
  const free = freeSeats(trip.capacity, occupancy, board, alight);
  const price = partPrice(prices, board, alight);
  const boardsAt = trip.stops[board]?.plannedAt.getTime() ?? 0;
  const cutoff = now.getTime() + settings.bookingCutoffMinutes * 60_000;

  const state = ((): PartState => {
    if (trip.status === "cancelled") return "cancelled";
    if (trip.status === "departed" || trip.status === "completed") return "departed";
    if (boardsAt <= now.getTime()) return "departed";
    if (viewerId !== null && viewerId === trip.driverId) return "own";
    // As in search: the boarding stop must be at least the cut-off away.
    if (boardsAt < cutoff) return "closed";
    return free < choice.seats ? "full" : "open";
  })();

  return ok({
    board,
    alight,
    seats: choice.seats,
    freeSeats: free,
    pricePerSeat: isk(price),
    total: isk(price * choice.seats),
    state,
  });
}
