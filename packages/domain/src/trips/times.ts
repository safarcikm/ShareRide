// Planned times at a trip's stops (spec 3, 3.5). Times are moments in UTC;
// the apps show them in Iceland time. Rounding to whole minutes works on
// the moment itself, which is the same in Iceland, a whole hours' offset.
import type { TripSettings } from "./settings.ts";

type TimeRules = Pick<
  TripSettings,
  | "timeRoundingMinutes"
  | "timeFloorPercent"
  | "longBreakMinutes"
  | "minNoticeMinutes"
  | "maxDaysAhead"
>;

const minuteMs = 60_000;

const roundToNearest = (moment: number, stepMs: number) =>
  Math.floor((moment + stepMs / 2) / stepMs) * stepMs;
const roundUp = (moment: number, stepMs: number) => Math.ceil(moment / stepMs) * stepMs;

/** The shortest time a stretch may be planned to take (R3.6), in milliseconds. */
const floorMs = (typicalS: number, settings: TimeRules) =>
  Math.ceil((typicalS * 1000 * settings.timeFloorPercent) / 100);

/**
 * The departure, then a planned time at each stop from the legs' typical
 * times, rounded to 5 minutes (spec 3, 3.5.2). Where rounding would make a
 * stretch too fast (R3.6) or not later than the stop before, the time is
 * rounded up instead, so planned times always pass `checkTimes`.
 */
export function plannedTimes(
  departure: Date,
  typicalS: readonly number[],
  settings: TimeRules,
): Date[] {
  const stepMs = settings.timeRoundingMinutes * minuteMs;
  const times = [departure.getTime()];
  let typicalArrival = departure.getTime();
  for (const stretchS of typicalS) {
    typicalArrival += stretchS * 1000;
    const previous = times.at(-1) ?? departure.getTime();
    const earliest = previous + Math.max(floorMs(stretchS, settings), 1);
    const nearest = roundToNearest(typicalArrival, stepMs);
    times.push(nearest >= earliest ? nearest : roundUp(earliest, stepMs));
  }
  return times.map((time) => new Date(time));
}

/**
 * The planned time of a stop added between two others on a published trip
 * (spec 6, 3.2): the gap between them shared by the typical times of the
 * stretches to it and on from it, on 5 minutes where that leaves 90% of
 * each (R3.6), or else on the nearest whole minute that does. Undefined
 * when no whole minute does: the stop does not fit between them, since
 * the stops either side keep their times.
 */
export function stopTimeBetween(
  before: Date,
  after: Date,
  thereS: number,
  onwardsS: number,
  settings: TimeRules,
): Date | undefined {
  const earliest = before.getTime() + Math.max(floorMs(thereS, settings), 1);
  const latest = after.getTime() - Math.max(floorMs(onwardsS, settings), 1);
  const totalS = thereS + onwardsS;
  const share = totalS === 0 ? 0.5 : thereS / totalS;
  const ideal = before.getTime() + (after.getTime() - before.getTime()) * share;
  for (const stepMs of [settings.timeRoundingMinutes * minuteMs, minuteMs]) {
    const low = roundUp(earliest, stepMs);
    const high = Math.floor(latest / stepMs) * stepMs;
    if (low <= high) return new Date(Math.min(Math.max(roundToNearest(ideal, stepMs), low), high));
  }
  return undefined;
}

export type TimeProblem =
  | { readonly code: "times_missing" }
  | { readonly code: "departure_too_soon" }
  | { readonly code: "departure_too_far" }
  /** A stop planned no later than the one before it. */
  | { readonly code: "times_not_increasing"; readonly segment: number }
  /** A stretch planned under 90% of its typical time, which would need speeding. */
  | { readonly code: "stretch_too_fast"; readonly segment: number };

/** "Planning a long break?" A stretch much longer than typical. */
export interface TimeWarning {
  readonly code: "long_break";
  readonly segment: number;
}

/** A departure at least 30 minutes and at most 60 days from now (R3.5). */
export function checkDeparture(
  departure: Date,
  now: Date,
  settings: Pick<TimeRules, "minNoticeMinutes" | "maxDaysAhead">,
): TimeProblem[] {
  if (departure.getTime() < now.getTime() + settings.minNoticeMinutes * minuteMs) {
    return [{ code: "departure_too_soon" }];
  }
  if (departure.getTime() > now.getTime() + settings.maxDaysAhead * 24 * 60 * minuteMs) {
    return [{ code: "departure_too_far" }];
  }
  return [];
}

/**
 * Checks planned times, one per stop, against the typical time of each
 * stretch: departure 30 minutes to 60 days from now (R3.5), times that
 * increase and leave at least 90% of the typical time (R3.6), and a warning
 * for a stretch more than 2 hours over it (spec 3, 3.5.3).
 */
export function checkTimes(
  times: readonly Date[],
  typicalS: readonly number[],
  now: Date,
  settings: TimeRules,
): { readonly problems: TimeProblem[]; readonly warnings: TimeWarning[] } {
  const problems: TimeProblem[] = [];
  const warnings: TimeWarning[] = [];
  const departure = times[0];
  if (departure === undefined || times.length !== typicalS.length + 1) {
    return { problems: [{ code: "times_missing" }], warnings };
  }
  problems.push(...checkDeparture(departure, now, settings));
  typicalS.forEach((stretchS, segment) => {
    const plannedMs = (times[segment + 1]?.getTime() ?? 0) - (times[segment]?.getTime() ?? 0);
    if (plannedMs <= 0) problems.push({ code: "times_not_increasing", segment });
    else if (plannedMs < floorMs(stretchS, settings)) {
      problems.push({ code: "stretch_too_fast", segment });
    }
    if (plannedMs > stretchS * 1000 + settings.longBreakMinutes * minuteMs) {
      warnings.push({ code: "long_break", segment });
    }
  });
  return { problems, warnings };
}
