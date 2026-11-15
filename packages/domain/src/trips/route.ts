// The route through a trip's stops (spec 3, 3.4): which meeting points are
// on the way, where an added one goes, and the checks on the whole route.
// Distances and times come from legs (spec 2, 3.7), never from a map here.
import { isInSeason, monthInIceland, type Season } from "../meeting-points/catalogue.ts";
import type { Leg } from "../meeting-points/legs.ts";
import { err, ok, type Result } from "../result.ts";
import type { TripSettings } from "./settings.ts";

/** The leg from one meeting point to another; undefined until it is worked out. */
export type LegLookup = (
  from: string,
  to: string,
) => Pick<Leg, "distanceM" | "durationS"> | undefined;

export interface DistancesMissing {
  readonly code: "distances_missing";
  /** The pairs whose legs are not worked out yet, such as for a new point. */
  readonly pairs: readonly (readonly [from: string, to: string])[];
}

/** Looks legs up by their ends; a point to itself is no distance at all. */
export function lookUpLegs(legs: readonly Leg[]): LegLookup {
  const byEnds = new Map(legs.map((leg) => [`${leg.from} ${leg.to}`, leg]));
  return (from, to) => (from === to ? { distanceM: 0, durationS: 0 } : byEnds.get(`${from} ${to}`));
}

type OnTheWay = Pick<TripSettings, "onTheWayPercent" | "onTheWayMaxM">;

/**
 * Every candidate that is on the way from `from` to `to`, in route order:
 * going through it adds at most 5% or 3 km to the direct distance,
 * whichever is less (spec 3, 3.4.2). A candidate whose legs are not worked
 * out yet is left out.
 *
 * Route order is how far along the way a point is, the distance there less
 * the distance onwards, so a point down a side road comes before the main
 * road beyond the turning, not after it.
 */
export function stopsOnTheWay(
  from: string,
  to: string,
  candidates: readonly string[],
  legs: LegLookup,
  settings: OnTheWay,
): Result<string[], DistancesMissing> {
  const direct = legs(from, to);
  if (direct === undefined) return err({ code: "distances_missing", pairs: [[from, to]] });
  const found: { readonly stop: string; readonly alongM: number }[] = [];
  for (const stop of new Set(candidates)) {
    if (stop === from || stop === to) continue;
    const there = legs(from, stop);
    const onwards = legs(stop, to);
    if (there === undefined || onwards === undefined) continue;
    const detourM = there.distanceM + onwards.distanceM - direct.distanceM;
    const allowed =
      detourM <= settings.onTheWayMaxM &&
      100 * detourM <= settings.onTheWayPercent * direct.distanceM;
    if (allowed) found.push({ stop, alongM: there.distanceM - onwards.distanceM });
  }
  found.sort((a, b) => a.alongM - b.alongM || a.stop.localeCompare(b.stop));
  return ok(found.map(({ stop }) => stop));
}

type Pair = readonly [from: string, to: string];

/** Each pair once, in the order first named. */
function distinct(pairs: readonly Pair[]): [string, string][] {
  const byKey = new Map(
    pairs.map(([from, to]) => [`${from} ${to}`, [from, to] as [string, string]]),
  );
  return [...byKey.values()];
}

/**
 * The legs `checkRoute` looks up for these stops: each stretch, each bypass
 * of one stop (for warnings) and the first stop to the last.
 */
export function routeLegPairs(stops: readonly string[]): [string, string][] {
  const pairs: Pair[] = [];
  stops.forEach((stop, index) => {
    const next = stops[index + 1];
    const afterNext = stops[index + 2];
    if (next !== undefined) pairs.push([stop, next]);
    if (afterNext !== undefined) pairs.push([stop, afterNext]);
  });
  const first = stops[0];
  const last = stops.at(-1);
  if (first !== undefined && last !== undefined && first !== last) pairs.push([first, last]);
  return distinct(pairs);
}

/** The legs `insertStop` looks up to place `stop` among `stops`. */
export function insertionLegPairs(stops: readonly string[], stop: string): [string, string][] {
  if (stops.includes(stop)) return [];
  const pairs: Pair[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    const before = stops[index - 1] ?? "";
    const after = stops[index] ?? "";
    pairs.push([before, stop], [stop, after], [before, after]);
  }
  return distinct(pairs);
}

/**
 * Inserts a stop the driver adds between the two neighbours where it adds
 * the least distance (spec 3, 3.4.3). The first and last stops stay.
 */
export function insertStop(
  stops: readonly string[],
  stop: string,
  legs: LegLookup,
): Result<string[], DistancesMissing> {
  if (stops.includes(stop)) return ok([...stops]);
  const missing = new Pairs();
  let best: { readonly at: number; readonly addedM: number } | undefined;
  for (let index = 1; index < stops.length; index += 1) {
    const before = stops[index - 1] ?? "";
    const after = stops[index] ?? "";
    const there = missing.check(legs, before, stop);
    const onwards = missing.check(legs, stop, after);
    const bypass = missing.check(legs, before, after);
    if (there === undefined || onwards === undefined || bypass === undefined) continue;
    const addedM = there.distanceM + onwards.distanceM - bypass.distanceM;
    if (best === undefined || addedM < best.addedM) best = { at: index, addedM };
  }
  if (missing.any()) return err(missing.error());
  if (best === undefined) return ok([...stops, stop]);
  return ok([...stops.slice(0, best.at), stop, ...stops.slice(best.at)]);
}

export interface RouteSegment {
  readonly from: string;
  readonly to: string;
  readonly distanceM: number;
  readonly durationS: number;
}

export type RouteProblem =
  | { readonly code: "too_few_stops" }
  /** A stop used a second time, by its position. */
  | { readonly code: "stop_repeated"; readonly stop: number }
  | { readonly code: "route_too_long" };

/** A stop, by its position, that adds a lot to the stretch between its neighbours. */
export interface RouteWarning {
  readonly code: "stop_adds_distance";
  readonly stop: number;
  readonly addedM: number;
}

export interface CheckedRoute {
  readonly segments: readonly RouteSegment[];
  readonly distanceM: number;
  readonly durationS: number;
  /** From the first stop to the last, without the stops between. */
  readonly directDistanceM: number;
  readonly problems: readonly RouteProblem[];
  readonly warnings: readonly RouteWarning[];
}

type RouteRules = Pick<
  TripSettings,
  "routeFactorPercent" | "detourWarningPercent" | "detourWarningMinM"
>;

/**
 * The segments of a route and what is wrong with it: fewer than two stops,
 * a stop used twice (R3.2), or a route over 1.5 times the direct distance
 * (R3.4). A stop that adds more than 20% and more than 20 km to the stretch
 * between its neighbours is a warning only (spec 3, 3.4.5).
 */
export function checkRoute(
  stops: readonly string[],
  legs: LegLookup,
  settings: RouteRules,
): Result<CheckedRoute, DistancesMissing> {
  const missing = new Pairs();
  const segments: RouteSegment[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1] ?? "";
    const to = stops[index] ?? "";
    const leg = missing.check(legs, from, to);
    if (leg !== undefined) segments.push({ from, to, ...leg });
  }
  const first = stops[0];
  const last = stops.at(-1);
  const direct =
    first === undefined || last === undefined ? undefined : missing.check(legs, first, last);
  const warnings: RouteWarning[] = [];
  for (let index = 1; index < stops.length - 1; index += 1) {
    const before = stops[index - 1] ?? "";
    const after = stops[index + 1] ?? "";
    const bypass = missing.check(legs, before, after);
    const there = segments[index - 1];
    const onwards = segments[index];
    if (bypass === undefined || there === undefined || onwards === undefined) continue;
    const addedM = there.distanceM + onwards.distanceM - bypass.distanceM;
    if (
      addedM > settings.detourWarningMinM &&
      100 * addedM > settings.detourWarningPercent * bypass.distanceM
    ) {
      warnings.push({ code: "stop_adds_distance", stop: index, addedM });
    }
  }
  if (missing.any()) return err(missing.error());

  const distanceM = segments.reduce((total, segment) => total + segment.distanceM, 0);
  const directDistanceM = direct?.distanceM ?? 0;
  const problems: RouteProblem[] = [];
  if (stops.length < 2) problems.push({ code: "too_few_stops" });
  stops.forEach((stop, index) => {
    if (stops.indexOf(stop) !== index) problems.push({ code: "stop_repeated", stop: index });
  });
  if (stops.length >= 2 && 100 * distanceM > settings.routeFactorPercent * directDistanceM) {
    problems.push({ code: "route_too_long" });
  }
  return ok({
    segments,
    distanceM,
    durationS: segments.reduce((total, segment) => total + segment.durationS, 0),
    directDistanceM,
    problems,
    warnings,
  });
}

/**
 * R3.2: every stop is in season on the day of departure in Iceland (spec 2).
 * The stops come in route order; the problems name them by position.
 */
export function stopsOutOfSeason(
  stops: readonly Season[],
  departure: Date,
): { readonly code: "stop_out_of_season"; readonly stop: number }[] {
  const month = monthInIceland(departure);
  return stops.flatMap((season, stop) =>
    isInSeason(season, month) ? [] : [{ code: "stop_out_of_season" as const, stop }],
  );
}

/** Collects the pairs whose legs are missing, each once, in the order met. */
class Pairs {
  readonly #pairs = new Map<string, readonly [string, string]>();

  check(legs: LegLookup, from: string, to: string) {
    const leg = legs(from, to);
    if (leg === undefined) this.#pairs.set(`${from} ${to}`, [from, to]);
    return leg;
  }

  any(): boolean {
    return this.#pairs.size > 0;
  }

  error(): DistancesMissing {
    return { code: "distances_missing", pairs: [...this.#pairs.values()] };
  }
}
