// Changing a published trip (spec 6, 3.2; rules R6.1 to R6.4, S5, P4): what
// the rules allow, and what a change does for the booked passengers, so
// the app can show it before saving and the API saves the same. Stops are
// added and removed with milestone 6's PR 6.
import { movedFar } from "../bookings/cancellation.ts";
import type { Season } from "../meeting-points/catalogue.ts";
import type { NotificationEvent } from "../notifications/catalogue.ts";
import type { Money } from "../money.ts";
import { err, ok, type Result } from "../result.ts";
import { checkNote, type NoteProblem } from "./note.ts";
import { fitPriceLevel, isPriceLevel, priceCap, segmentPrice } from "./prices.ts";
import { overlaps, type TimeWindow } from "./publish.ts";
import { stopsOutOfSeason } from "./route.ts";
import type { TripSettings } from "./settings.ts";
import { checkTimes, type TimeProblem } from "./times.ts";
import type { BookingMode, TripPreferences, TripStatus } from "./trip.ts";

/**
 * With bookings, the departure moves at most this many minutes, earlier or
 * later, from the time each passenger booked (R6.4, decision 1). A bigger
 * change is a new trip: the driver cancels and posts again.
 */
export const maxMoveMinutes = 120;

const minuteMs = 60_000;

/** A published trip as changing it needs it. */
export interface ChangeableTrip {
  readonly status: Exclude<TripStatus, "draft">;
  /** In order, the departure first. */
  readonly stops: readonly { readonly plannedAt: Date; readonly season: Season }[];
  /** Each segment's typical driving time in seconds, from its leg as it is now (R3.6). */
  readonly typicalS: readonly number[];
  /** Each segment's distance in metres, for its price and cap (rules P3, P4). */
  readonly distancesM: readonly number[];
  /** Seats held on each segment (rule S1). */
  readonly occupancy: readonly number[];
  readonly seats: number;
  readonly priceLevel: number;
  readonly vehicleId: string;
  readonly bookingMode: BookingMode;
  readonly preferences: TripPreferences;
  readonly note: string;
  /** The driver's other published trips (R3.7). */
  readonly otherTrips: readonly TimeWindow[];
}

/** A booking that holds seats on the trip (rule S1). */
export interface BookingOnTrip {
  readonly id: string;
  readonly status: "requested" | "accepted" | "confirmed";
  /** The trip's departure when the booking was made (R6.3, R6.4). */
  readonly departsAtWhenBooked: Date;
}

/** One change at a time, as the driver saves it from Edit trip. */
export type TripChange =
  | { readonly kind: "departure"; readonly departsAt: Date }
  | { readonly kind: "seats"; readonly seats: number }
  | { readonly kind: "priceLevel"; readonly priceLevel: number }
  | { readonly kind: "vehicle"; readonly vehicleId: string }
  | { readonly kind: "bookingMode"; readonly bookingMode: BookingMode }
  | { readonly kind: "details"; readonly preferences: TripPreferences; readonly note: string };

export type ChangeProblem =
  | { readonly code: "trip_cancelled" }
  | { readonly code: "trip_departed" }
  | TimeProblem
  | { readonly code: "stop_out_of_season"; readonly stop: number }
  | { readonly code: "overlaps_trip" }
  /** The departures the bookings allow: within 2 hours of each booking's time (R6.4). */
  | { readonly code: "move_too_far"; readonly earliest: Date; readonly latest: Date }
  | { readonly code: "seats_invalid" }
  /** The most seats taken on any segment, the fewest the trip can offer (rule S5). */
  | { readonly code: "seats_below_taken"; readonly taken: number }
  | { readonly code: "price_level_invalid" }
  | NoteProblem;

/** What one booked passenger is told of a change (spec 7, 3.3). */
export interface PassengerTold {
  readonly bookingId: string;
  /** By how many minutes from the departure when booked, for a move. */
  readonly event: Extract<NotificationEvent, { readonly type: "DepartureMoved" | "TripChanged" }>;
  /** A paid passenger may now cancel with a full refund, without it counting (R6.3). */
  readonly freeCancellation: boolean;
}

/** A segment's price per seat for new bookings, and the most it may cost (rules P3, P4). */
export interface SegmentPricing {
  readonly price: Money;
  readonly cap: Money;
}

export interface ChangeEffect {
  /** The trip as it will be. */
  readonly trip: ChangeableTrip;
  /** More seats lowered the price level to the highest they allow (rule P4; spec 3, 3.6.4). */
  readonly priceLevelLowered: boolean;
  /**
   * Each segment's price and cap for new bookings after a change of seats or
   * price level, as when publishing; null when they stay. Bookings keep
   * the prices they booked at (rule P1).
   */
  readonly pricing: readonly SegmentPricing[] | null;
  /**
   * Who is told: each booked passenger, accepted or confirmed, for a move or
   * a new car; nobody for the seats, price level, booking mode or details,
   * or when nothing changed. A request's passenger is told only if the trip
   * is cancelled (spec 7, 3.3).
   */
  readonly told: readonly PassengerTold[];
}

type ChangeSettings = Parameters<typeof checkTimes>[3] &
  Parameters<typeof isPriceLevel>[2] &
  Pick<TripSettings, "maxSeats">;

/**
 * Whether a published trip can take a change now, and its effect. Every
 * broken rule comes at once, as when publishing. Nothing changes from the
 * planned departure on (R6.1): running late on the day is a chat message
 * (spec 7). Bookings keep their stops and price snapshots (rule P1).
 */
export function checkTripChange(
  trip: ChangeableTrip,
  bookings: readonly BookingOnTrip[],
  change: TripChange,
  now: Date,
  settings: ChangeSettings,
): Result<ChangeEffect, ChangeProblem[]> {
  if (trip.status === "cancelled") return err([{ code: "trip_cancelled" }]);
  const departsAt = trip.stops[0]?.plannedAt ?? now;
  if (trip.status !== "published" || departsAt <= now) return err([{ code: "trip_departed" }]);

  const changed = applied(trip, change, settings);
  const problems = changeProblems(trip, bookings, change, changed.trip, now, settings);
  if (problems.length > 0) return err(problems);

  const after = changed.trip;
  const pricing =
    change.kind === "seats" || change.kind === "priceLevel"
      ? after.distancesM.map((distanceM) => ({
          price: segmentPrice(distanceM, after.priceLevel, after.seats, settings),
          cap: priceCap(distanceM, after.seats, settings),
        }))
      : null;
  const told = whoIsTold(trip, change, after, bookings);
  return ok({ ...changed, pricing, told });
}

/** The trip with the change made, before any rule is checked. */
function applied(
  trip: ChangeableTrip,
  change: TripChange,
  settings: ChangeSettings,
): { readonly trip: ChangeableTrip; readonly priceLevelLowered: boolean } {
  switch (change.kind) {
    case "departure": {
      const byMs = change.departsAt.getTime() - (trip.stops[0]?.plannedAt.getTime() ?? 0);
      const stops = trip.stops.map((stop) => ({
        ...stop,
        plannedAt: new Date(stop.plannedAt.getTime() + byMs),
      }));
      return { trip: { ...trip, stops }, priceLevelLowered: false };
    }
    case "seats": {
      const fitted = fitPriceLevel(trip.priceLevel, change.seats, settings);
      return {
        trip: { ...trip, seats: change.seats, priceLevel: fitted.level },
        priceLevelLowered: fitted.lowered,
      };
    }
    case "priceLevel":
      return { trip: { ...trip, priceLevel: change.priceLevel }, priceLevelLowered: false };
    case "vehicle":
      return { trip: { ...trip, vehicleId: change.vehicleId }, priceLevelLowered: false };
    case "bookingMode":
      return { trip: { ...trip, bookingMode: change.bookingMode }, priceLevelLowered: false };
    case "details":
      return {
        trip: { ...trip, preferences: change.preferences, note: change.note },
        priceLevelLowered: false,
      };
  }
}

function changeProblems(
  trip: ChangeableTrip,
  bookings: readonly BookingOnTrip[],
  change: TripChange,
  after: ChangeableTrip,
  now: Date,
  settings: ChangeSettings,
): ChangeProblem[] {
  switch (change.kind) {
    case "departure":
      return departureProblems(trip, bookings, after, now, settings);
    case "seats": {
      if (!Number.isInteger(change.seats) || change.seats < 1 || change.seats > settings.maxSeats) {
        return [{ code: "seats_invalid" }];
      }
      const taken = Math.max(0, ...trip.occupancy);
      return change.seats < taken ? [{ code: "seats_below_taken", taken }] : [];
    }
    case "priceLevel":
      return isPriceLevel(change.priceLevel, trip.seats, settings)
        ? []
        : [{ code: "price_level_invalid" }];
    case "details":
      return checkNote(change.note);
    case "vehicle":
    case "bookingMode":
      return [];
  }
}

/** R6.2 to R6.4, and the time rules of publishing (R2.5, R3.5 to R3.7). */
function departureProblems(
  trip: ChangeableTrip,
  bookings: readonly BookingOnTrip[],
  after: ChangeableTrip,
  now: Date,
  settings: ChangeSettings,
): ChangeProblem[] {
  const times = after.stops.map((stop) => stop.plannedAt);
  const departsAt = times[0];
  const arrivesAt = times.at(-1);
  if (departsAt === undefined || arrivesAt === undefined) return [{ code: "times_missing" }];
  if (departsAt.getTime() === trip.stops[0]?.plannedAt.getTime()) return [];

  const problems: ChangeProblem[] = [
    ...checkTimes(times, trip.typicalS, now, settings).problems,
    ...stopsOutOfSeason(
      after.stops.map((stop) => stop.season),
      departsAt,
    ),
  ];
  if (trip.otherTrips.some((other) => overlaps({ departsAt, arrivesAt }, other))) {
    problems.push({ code: "overlaps_trip" });
  }
  if (bookings.length > 0) {
    const booked = bookings.map((booking) => booking.departsAtWhenBooked.getTime());
    const earliest = new Date(Math.max(...booked) - maxMoveMinutes * minuteMs);
    const latest = new Date(Math.min(...booked) + maxMoveMinutes * minuteMs);
    if (departsAt < earliest || departsAt > latest) {
      problems.push({ code: "move_too_far", earliest, latest });
    }
  }
  return problems;
}

function whoIsTold(
  trip: ChangeableTrip,
  change: TripChange,
  after: ChangeableTrip,
  bookings: readonly BookingOnTrip[],
): PassengerTold[] {
  const departsAt = after.stops[0]?.plannedAt ?? new Date(0);
  const tell = (
    event: PassengerTold["event"] | ((booking: BookingOnTrip) => PassengerTold["event"]),
  ) =>
    bookings
      .filter((booking) => booking.status !== "requested")
      .map((booking) => ({
        bookingId: booking.id,
        event: typeof event === "function" ? event(booking) : event,
        freeCancellation:
          booking.status === "confirmed" && movedFar(booking.departsAtWhenBooked, departsAt),
      }));
  switch (change.kind) {
    case "departure":
      if (departsAt.getTime() === trip.stops[0]?.plannedAt.getTime()) return [];
      return tell((booking) => ({
        type: "DepartureMoved",
        byMinutes: (departsAt.getTime() - booking.departsAtWhenBooked.getTime()) / minuteMs,
      }));
    case "vehicle":
      return change.vehicleId === trip.vehicleId ? [] : tell({ type: "TripChanged" });
    case "seats":
    case "priceLevel":
    case "bookingMode":
    case "details":
      return [];
  }
}
