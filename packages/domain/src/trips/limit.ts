// The trip limit (rule P3) and the highest price level within it (rule P4;
// spec 17): a trip never brings its driver more than a full car pays at the
// caps, counting what its bookings have paid or will pay, whatever changed
// after they booked. All amounts are whole krónur.
import type { BookingStatus } from "../bookings/lifecycle.ts";
import type { Money } from "../money.ts";
import { highestPriceLevel, priceCap, segmentPrices, type PriceSettings } from "./prices.ts";

/** A trip as the limit sees it: its stretches, the seats taken on each, and what it brings. */
export interface TripLoad {
  /** Each segment's distance in metres. */
  readonly distancesM: readonly number[];
  /** Seats held on each segment (rule S1). */
  readonly occupancy: readonly number[];
  /** Seats the trip offers now. */
  readonly seats: number;
  /** What the trip's bookings pay, or will pay, the driver, in krónur (`takingsOf`). */
  readonly takings: number;
}

/** What set the highest level: the seats alone (as before spec 17), or the trip limit. */
export type LevelLimit = "seats" | "trip_limit";

const isk = (amount: number): Money => ({ amount, currency: "ISK" });

/**
 * Bookings whose money goes, or went, to the driver (rule P3): those holding
 * seats, and those the driver is paid for after the trip. A cancelled one
 * counts only if it was confirmed first, less its refund.
 */
export const payingStatuses: readonly BookingStatus[] = [
  "requested",
  "accepted",
  "confirmed",
  "completed",
  "no_show",
];

/** Rule P3: what a full car pays at the caps, with the seats the trip has now. */
export function tripLimit(
  distancesM: readonly number[],
  seats: number,
  settings: PriceSettings,
): Money {
  return isk(
    distancesM.reduce(
      (total, distanceM) => total + seats * priceCap(distanceM, seats, settings).amount,
      0,
    ),
  );
}

/**
 * Rule P3: everything the bookings pay the driver at the prices they were
 * made at, less refunds. Money kept after a no-show or a late cancellation
 * counts; a request withdrawn or a booking cancelled before it was paid
 * does not; the passenger service fee is never part of it.
 */
export function takingsOf(
  bookings: readonly {
    readonly status: BookingStatus;
    readonly totalPrice: number;
    readonly refundAmount: number | null;
    readonly confirmedAt: Date | null;
  }[],
): Money {
  return isk(
    bookings
      .filter(
        (booking) =>
          payingStatuses.includes(booking.status) ||
          (booking.status === "cancelled" && booking.confirmedAt !== null),
      )
      .reduce((total, booking) => total + booking.totalPrice - (booking.refundAmount ?? 0), 0),
  );
}

/**
 * Rule P4: from the seats' highest level down, the first step at which a
 * full car still fits in the trip limit, counting what is booked; 0% when
 * none does.
 */
export function highestLevelWithin(
  load: TripLoad,
  settings: PriceSettings,
): { readonly level: number; readonly limitedBy: LevelLimit } {
  const top = highestPriceLevel(load.seats, settings);
  const limit = tripLimit(load.distancesM, load.seats, settings).amount;
  for (let level = top; level > 0; level -= settings.priceLevelStep) {
    const rest = segmentPrices(load.distancesM, level, load.seats, settings).reduce(
      (total, price, k) => total + (load.seats - (load.occupancy[k] ?? 0)) * price.amount,
      0,
    );
    if (load.takings + rest <= limit) {
      return { level, limitedBy: level === top ? "seats" : "trip_limit" };
    }
  }
  return { level: 0, limitedBy: top === 0 ? "seats" : "trip_limit" };
}

/** A level above the highest is lowered to it, and the driver is told why (spec 17, 3.6). */
export function fitLevelWithin(
  level: number,
  load: TripLoad,
  settings: PriceSettings,
): { readonly level: number; readonly lowered: boolean; readonly limitedBy: LevelLimit } {
  const highest = highestLevelWithin(load, settings);
  return level > highest.level
    ? { level: highest.level, lowered: true, limitedBy: highest.limitedBy }
    : { level, lowered: false, limitedBy: highest.limitedBy };
}

/** Rule P4: a whole step from free up to the highest level within the trip limit. */
export function isLevelWithin(level: number, load: TripLoad, settings: PriceSettings): boolean {
  return (
    Number.isInteger(level) &&
    level >= 0 &&
    level % settings.priceLevelStep === 0 &&
    level <= highestLevelWithin(load, settings).level
  );
}
