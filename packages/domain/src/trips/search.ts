// Which trips a passenger's search finds, and on which part (spec 4, 3.3;
// rules R4.1 to R4.3, P1, S3 and S4). The API narrows candidates with SQL;
// these functions decide, so the rules are tested once.
import type { RateLimitRule } from "../auth/rate-limit.ts";
import type { Money } from "../money.ts";
import { inIceland } from "../time.ts";
import type { TripStatus } from "./trip.ts";

/** The values the operator will set (spec 4, section 4; feature H4). */
export interface SearchSettings {
  /** A meeting point search also covers active points this close (R4.2). */
  readonly nearbyPointM: number;
  /** "Nothing matches" looks for points this close to the searched places (R4.7)… */
  readonly alternativesRadiusM: number;
  /** …and this many days either side of the chosen date. */
  readonly alternativeDays: number;
  /** Booking closes this many minutes before the boarding stop (rule S4). */
  readonly bookingCutoffMinutes: number;
}

export const defaultSearchSettings: SearchSettings = {
  nearbyPointM: 3000,
  alternativesRadiusM: 20_000,
  alternativeDays: 3,
  bookingCutoffMinutes: 15,
};

/**
 * Searches from one IP address, against scraping (spec 4, section 7). Generous
 * for a person changing filters, and for the many phones that share one
 * address on Icelandic mobile networks.
 */
export const searchLimitsPerAddress: readonly RateLimitRule[] = [
  { limit: 60, windowSeconds: 60 },
  { limit: 600, windowSeconds: 3600 },
];

/** A day on the calendar in Iceland. */
export interface CalendarDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** What matching needs of a trip: its stops in order and each stretch's price and seats taken. */
export interface SearchableTrip {
  readonly id: string;
  readonly driverId: string;
  readonly status: TripStatus;
  readonly capacity: number;
  readonly stops: readonly { readonly meetingPointId: string; readonly plannedAt: Date }[];
  /** One per stretch: the price per seat in whole krónur, and seats held (rule S1). */
  readonly segments: readonly { readonly price: number; readonly occupancy: number }[];
}

/** A meeting point a search covers, and how far it is from what was searched. */
export interface CoveredPoint {
  readonly meetingPointId: string;
  /** 0 for the point searched itself. */
  readonly distanceM: number;
}

export interface TripSearch {
  readonly from: readonly CoveredPoint[];
  readonly to: readonly CoveredPoint[];
  /** The day of the passenger's own departure; null for every upcoming trip (R4.3). */
  readonly date: CalendarDay | null;
  /** The results filter, at the boarding stop (spec 4, 3.4.3); null for any time. */
  readonly timeOfDay: TimeOfDay | null;
  readonly seats: number;
  /** The signed-in passenger, whose own trips are left out; null without an account. */
  readonly searcherId: string | null;
}

/** The part of a trip a search found: where the passenger gets in and out. */
export interface TripMatch {
  /** Stop positions on the trip. */
  readonly board: number;
  readonly alight: number;
  readonly boardDistanceM: number;
  readonly alightDistanceM: number;
  /** Seats free on every stretch of the part (rule S3). */
  readonly freeSeats: number;
  /** The part's price for one seat, and for the seats searched (rule P1). */
  readonly pricePerSeat: Money;
  readonly total: Money;
}

const isk = (amount: number): Money => ({ amount, currency: "ISK" });

/** Rule S3: capacity less the most seats held on any stretch from `board` to `alight`. */
export function freeSeats(
  capacity: number,
  occupancy: readonly number[],
  board: number,
  alight: number,
): number {
  return capacity - Math.max(0, ...occupancy.slice(board, alight));
}

/** Rule P1 for one seat: the sum of the stretch prices from `board` to `alight`. */
export function partPrice(prices: readonly number[], board: number, alight: number): number {
  return prices.slice(board, alight).reduce((sum, price) => sum + price, 0);
}

const sameDay = (moment: Date, day: CalendarDay) => {
  const shown = inIceland(moment);
  return shown.year === day.year && shown.month === day.month && shown.day === day.day;
};

/**
 * Rule R4.1: the part of `trip` that `search` finds, or null. Among the
 * stops that match, the passenger boards at the one closest to what was
 * searched and alights at the closest after it; ties go to the shorter part.
 */
export function matchTrip(
  trip: SearchableTrip,
  search: TripSearch,
  now: Date,
  settings: Pick<SearchSettings, "bookingCutoffMinutes">,
): TripMatch | null {
  if (trip.status !== "published") return null;
  if (search.searcherId !== null && search.searcherId === trip.driverId) return null;
  const distances = (covered: readonly CoveredPoint[]) =>
    new Map(covered.map((point) => [point.meetingPointId, point.distanceM]));
  const fromDistances = distances(search.from);
  const toDistances = distances(search.to);
  const cutoff = now.getTime() + settings.bookingCutoffMinutes * 60_000;
  const occupancy = trip.segments.map((segment) => segment.occupancy);
  const prices = trip.segments.map((segment) => segment.price);

  let best: TripMatch | null = null;
  trip.stops.forEach((boarding, board) => {
    const boardDistanceM = fromDistances.get(boarding.meetingPointId);
    if (boardDistanceM === undefined) return;
    if (boarding.plannedAt.getTime() < cutoff) return;
    if (search.date !== null && !sameDay(boarding.plannedAt, search.date)) return;
    if (search.timeOfDay !== null && timeOfDay(boarding.plannedAt) !== search.timeOfDay) return;
    for (let alight = board + 1; alight < trip.stops.length; alight += 1) {
      const alightDistanceM = toDistances.get(trip.stops[alight]?.meetingPointId ?? "");
      if (alightDistanceM === undefined) continue;
      const free = freeSeats(trip.capacity, occupancy, board, alight);
      if (free < search.seats) continue;
      const found: TripMatch = {
        board,
        alight,
        boardDistanceM,
        alightDistanceM,
        freeSeats: free,
        pricePerSeat: isk(partPrice(prices, board, alight)),
        total: isk(search.seats * partPrice(prices, board, alight)),
      };
      if (best === null || closer(found, best)) best = found;
    }
  });
  return best;
}

/** Closer boarding first, then closer alighting, then the shorter part. */
function closer(a: TripMatch, b: TripMatch): boolean {
  if (a.boardDistanceM !== b.boardDistanceM) return a.boardDistanceM < b.boardDistanceM;
  if (a.alightDistanceM !== b.alightDistanceM) return a.alightDistanceM < b.alightDistanceM;
  return a.alight - a.board < b.alight - b.board;
}

export const timesOfDay = ["morning", "afternoon", "evening"] as const;
export type TimeOfDay = (typeof timesOfDay)[number];

/** The results filter (spec 4, 3.4.3): before noon, until six, or later, in Iceland. */
export function timeOfDay(moment: Date): TimeOfDay {
  const { hour } = inIceland(moment);
  if (hour < 12) return "morning";
  return hour < 18 ? "afternoon" : "evening";
}

/** The days either side of `day` that "nothing matches" counts trips on (R4.7). */
export function searchDaysAround(
  day: CalendarDay,
  settings: Pick<SearchSettings, "alternativeDays">,
): CalendarDay[] {
  const days: CalendarDay[] = [];
  for (let offset = -settings.alternativeDays; offset <= settings.alternativeDays; offset += 1) {
    if (offset === 0) continue;
    const moved = new Date(Date.UTC(day.year, day.month - 1, day.day + offset));
    days.push({
      year: moved.getUTCFullYear(),
      month: moved.getUTCMonth() + 1,
      day: moved.getUTCDate(),
    });
  }
  return days;
}
