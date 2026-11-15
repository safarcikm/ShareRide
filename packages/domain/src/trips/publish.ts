// The checks before a trip is published (spec 3, section 4): every broken
// rule at once, as codes the apps turn into texts, and the segment prices
// the published trip keeps.
import type { Season } from "../meeting-points/catalogue.ts";
import type { Money } from "../money.ts";
import { err, ok, type Result } from "../result.ts";
import { checkNote, type NoteProblem } from "./note.ts";
import { isPriceLevel, priceCap, segmentPrice, suggestedPrice } from "./prices.ts";
import {
  checkRoute,
  type CheckedRoute,
  stopsOutOfSeason,
  type DistancesMissing,
  type LegLookup,
  type RouteProblem,
  type RouteSegment,
  type RouteWarning,
} from "./route.ts";
import type { TripSettings } from "./settings.ts";
import { checkDeparture, checkTimes, type TimeProblem, type TimeWarning } from "./times.ts";

export interface PublishStop {
  readonly id: string;
  /** Active or otherwise offered for new trips (spec 2). */
  readonly offered: boolean;
  readonly season: Season;
}

/** From the departure at the first stop to the planned time at the last. */
export interface TimeWindow {
  readonly departsAt: Date;
  readonly arrivesAt: Date;
}

export interface TripToPublish {
  readonly stops: readonly PublishStop[];
  /** One per stop; null until the driver has chosen a departure. */
  readonly plannedTimes: readonly Date[] | null;
  readonly seats: number;
  readonly priceLevel: number;
  readonly note: string;
  /** One of the driver's cars, not removed. */
  readonly hasCar: boolean;
  /** Account finished and nothing blocking missing (R3.1). */
  readonly driverReady: boolean;
  /** The driver's other published trips, to check overlap (R3.7). */
  readonly otherTrips: readonly TimeWindow[];
}

export type PublishProblem =
  | { readonly code: "driver_not_ready" }
  | { readonly code: "car_missing" }
  | { readonly code: "seats_invalid" }
  | { readonly code: "price_level_invalid" }
  | { readonly code: "stop_unavailable"; readonly stop: number }
  | { readonly code: "stop_out_of_season"; readonly stop: number }
  | RouteProblem
  | TimeProblem
  | { readonly code: "overlaps_trip" }
  | NoteProblem;

export interface PricedSegment extends RouteSegment {
  readonly suggestedPrice: Money;
  readonly cap: Money;
  readonly price: Money;
}

export interface CheckedTrip {
  /** Empty when the trip can be published. */
  readonly problems: readonly PublishProblem[];
  readonly warnings: readonly (RouteWarning | TimeWarning)[];
  /** Priced at the trip's level; empty while the seats or level are wrong. */
  readonly segments: readonly PricedSegment[];
  readonly departsAt: Date | null;
  readonly arrivesAt: Date | null;
}

/** Two trips overlap when they share some time; one may leave as the other arrives. */
export function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return a.departsAt < b.arrivesAt && b.departsAt < a.arrivesAt;
}

type PublishSettings = Parameters<typeof checkRoute>[2] &
  Parameters<typeof checkTimes>[3] &
  Parameters<typeof priceCap>[2] &
  Pick<TripSettings, "maxSeats">;

/**
 * Every rule of spec 3, section 4, that a trip breaks (R3.1 to R3.10, with
 * payouts left out until payments), with the legs, settings and clock of
 * the server at the time of publishing. A price level above the highest for
 * the seats is refused, never lowered: the driver did not see those prices.
 */
export function checkTripForPublishing(
  trip: TripToPublish,
  legs: LegLookup,
  now: Date,
  settings: PublishSettings,
): Result<CheckedTrip, DistancesMissing> {
  const problems: PublishProblem[] = [];
  const warnings: (RouteWarning | TimeWarning)[] = [];
  if (!trip.driverReady) problems.push({ code: "driver_not_ready" });
  if (!trip.hasCar) problems.push({ code: "car_missing" });
  const seatsValid =
    Number.isInteger(trip.seats) && trip.seats >= 1 && trip.seats <= settings.maxSeats;
  const levelValid = seatsValid && isPriceLevel(trip.priceLevel, trip.seats, settings);
  if (!seatsValid) problems.push({ code: "seats_invalid" });
  else if (!levelValid) problems.push({ code: "price_level_invalid" });

  const times = trip.plannedTimes;
  const departsAt = times?.[0] ?? null;
  const arrivesAt = times?.at(-1) ?? null;
  const unavailable = trip.stops.flatMap((stop, index) =>
    stop.offered ? [] : [{ code: "stop_unavailable" as const, stop: index }],
  );
  problems.push(...unavailable);
  // The legs of a paused or retired point may be gone, so with one on the
  // route only the checks that need no distances run; the driver changes
  // the route first (spec 3, 3.9).
  let route: CheckedRoute | null = null;
  if (unavailable.length === 0) {
    const checked = checkRoute(
      trip.stops.map((stop) => stop.id),
      legs,
      settings,
    );
    if (!checked.ok) return err(checked.error);
    route = checked.value;
    problems.push(...route.problems);
    warnings.push(...route.warnings);
  }

  if (times === null || departsAt === null || arrivesAt === null) {
    problems.push({ code: "times_missing" });
  } else {
    problems.push(
      ...stopsOutOfSeason(
        trip.stops.map((stop) => stop.season),
        departsAt,
      ),
    );
    if (route === null) {
      problems.push(...checkDeparture(departsAt, now, settings));
    } else {
      const checked = checkTimes(
        times,
        route.segments.map((segment) => segment.durationS),
        now,
        settings,
      );
      problems.push(...checked.problems);
      warnings.push(...checked.warnings);
    }
    if (trip.otherTrips.some((other) => overlaps({ departsAt, arrivesAt }, other))) {
      problems.push({ code: "overlaps_trip" });
    }
  }
  problems.push(...checkNote(trip.note));

  const segments =
    levelValid && route !== null
      ? route.segments.map((segment) => ({
          ...segment,
          suggestedPrice: suggestedPrice(segment.distanceM, settings),
          cap: priceCap(segment.distanceM, trip.seats, settings),
          price: segmentPrice(segment.distanceM, trip.priceLevel, trip.seats, settings),
        }))
      : [];
  return ok({ problems, warnings, segments, departsAt, arrivesAt });
}
