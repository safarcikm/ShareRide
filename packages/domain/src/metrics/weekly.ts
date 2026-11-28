import type { BookingStatus } from "../bookings/lifecycle.ts";
import { endOfIsoWeek, startOfIsoWeek, type IsoWeek } from "./weeks.ts";

// The weekly figures (spec 10, 3.4.2), each counted from the database's
// own records and the search log (R10.6). A figure is a numerator and,
// for a share or a rate, a denominator; the page divides.

export const metricKeys = [
  /** Searches made. */
  "searches",
  /** Searches that showed at least one trip, of the searches made. */
  "searches_with_result",
  /** Requests and instant bookings made, per search with a result in the same week. */
  "requests_per_search_with_result",
  /** Trips published. */
  "trips_posted",
  /** The seats of the trips published. */
  "seats_offered",
  /** Bookings confirmed: paid, or free. */
  "bookings_confirmed",
  /** The seats of the bookings confirmed. */
  "seats_booked",
  /** Booked seat-kilometres of the offered ones, on trips completed in the week. */
  "seat_fill",
  /**
   * Trips whose driver cancelled the trip or a confirmed booking on it in
   * a way that counts (spec 6, spec 8: weather and closed roads do not),
   * of the trips with passengers that were to leave in the week.
   */
  "driver_cancellations",
  /** Late cancellations and no-shows, of the bookings confirmed in the week. */
  "passenger_late_cancellations",
  /** Passengers who had booked within the 60 days before, of those who booked in the week. */
  "repeat_passengers",
  /** Reports made, per trip that left in the week; the page shows it per 1 000 trips. */
  "reports_per_trip",
  /** Minutes from a report to its answer, over the answered reports made in the week. */
  "report_answer_minutes",
  /** Reports not answered within 24 hours, of the reports made in the week. */
  "reports_answered_late",
  /** Krónur paid by passengers. */
  "money_paid",
  /** Krónur refunded to passengers. */
  "money_refunded",
  /** Drivers with a trip that left in the week. */
  "active_drivers",
  /** Passengers with a booking on a trip that left in the week. */
  "active_passengers",
  /** Whole road kilometres of the bookings completed in the week: one car not driven each (spec 34). */
  "car_km_saved",
  /** Grams of CO2 the bookings completed in the week kept (spec 34, R34.2). */
  "co2_saved_grams",
] as const;
export type MetricKey = (typeof metricKeys)[number];

export interface MetricValue {
  readonly numerator: number;
  /** Null for a plain count or sum. */
  readonly denominator: number | null;
}

export type WeekMetrics = Readonly<Record<MetricKey, MetricValue>>;

/** Figures that count people: shown as "fewer than 5" outside the console (spec 10, section 7). */
export const peopleMetrics: readonly MetricKey[] = [
  "repeat_passengers",
  "active_drivers",
  "active_passengers",
];

/** A report is answered in time within this long (decision 2). */
export const reportAnswerHours = 24;
/** A passenger is a repeat one when they booked within this long before (decision 2). */
export const repeatWithinDays = 60;

/** Whether a figure about people is too small to show outside the console. */
export function fewerThanFive(people: number): boolean {
  return people > 0 && people < 5;
}

export interface MetricTrip {
  readonly id: string;
  readonly driverId: string;
  readonly publishedAt: Date;
  readonly departsAt: Date;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly capacity: number;
  /** The driver cancelled the trip in a way that counts on their reliability. */
  readonly driverCancellationCounts: boolean;
  /** Each segment's length times its seats, summed, in metres. */
  readonly offeredSeatM: number;
  /** Each segment's length times the seats taken on it, summed. */
  readonly bookedSeatM: number;
}

export interface MetricBooking {
  readonly tripId: string;
  readonly passengerId: string;
  readonly seats: number;
  /** When the request or the instant booking was made. */
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
  readonly status: BookingStatus;
  readonly cancelledBy: "passenger" | "driver" | "operator" | null;
  readonly countsOnReliability: boolean;
  readonly completedAt: Date | null;
  /** The road metres of its part. */
  readonly distanceM: number;
  /** The grams of CO2 it kept when it completed (spec 34). */
  readonly co2Grams: number | null;
}

/**
 * The records the figures of some weeks are counted from, for everything
 * or for one corridor. They may reach outside the weeks asked for, and
 * must hold every booking of the trips given, and every booking confirmed
 * in the 60 days before the first week.
 */
export interface MetricRecords {
  readonly searches: readonly { readonly at: Date; readonly results: number }[];
  readonly trips: readonly MetricTrip[];
  readonly bookings: readonly MetricBooking[];
  readonly reports: readonly { readonly createdAt: Date; readonly closedAt: Date | null }[];
  readonly payments: readonly { readonly at: Date; readonly amount: number }[];
  readonly refunds: readonly { readonly at: Date; readonly amount: number }[];
}

const count = (numerator: number): MetricValue => ({ numerator, denominator: null });
const sum = (numbers: readonly number[]) => numbers.reduce((total, value) => total + value, 0);

/** The figures of one week from the records, as they stand at `now`. */
export function weekMetrics(records: MetricRecords, week: IsoWeek, now: Date): WeekMetrics {
  const start = startOfIsoWeek(week).getTime();
  const end = endOfIsoWeek(week).getTime();
  const inWeek = (moment: Date | null): moment is Date =>
    moment !== null && moment.getTime() >= start && moment.getTime() < end;

  const searches = records.searches.filter((search) => inWeek(search.at));
  const withResult = searches.filter((search) => search.results > 0).length;
  const requests = records.bookings.filter((booking) => inWeek(booking.createdAt)).length;
  const posted = records.trips.filter((trip) => inWeek(trip.publishedAt));
  const confirmed = records.bookings.filter((booking) => inWeek(booking.confirmedAt));
  const completed = records.trips.filter((trip) => inWeek(trip.completedAt));

  // Trips that were to leave in the week, with the bookings ever confirmed on each.
  const leaving = records.trips.filter((trip) => inWeek(trip.departsAt));
  const confirmedOn = new Map<string, MetricBooking[]>();
  for (const booking of records.bookings) {
    if (booking.confirmedAt === null) continue;
    confirmedOn.set(booking.tripId, [...(confirmedOn.get(booking.tripId) ?? []), booking]);
  }
  const withPassengers = leaving.filter((trip) => confirmedOn.has(trip.id));
  const driverCancelled = withPassengers.filter(
    (trip) =>
      trip.driverCancellationCounts ||
      (confirmedOn.get(trip.id) ?? []).some(
        (booking) =>
          booking.status === "cancelled" &&
          booking.cancelledBy === "driver" &&
          booking.countsOnReliability,
      ),
  );

  const lateOrAbsent = confirmed.filter(
    (booking) =>
      booking.status === "no_show" ||
      (booking.status === "cancelled" &&
        booking.cancelledBy === "passenger" &&
        booking.countsOnReliability),
  );

  // Each passenger's first booking confirmed in the week, and whether another came before it.
  const firstInWeek = new Map<string, number>();
  for (const booking of confirmed) {
    const at = (booking.confirmedAt as Date).getTime();
    firstInWeek.set(booking.passengerId, Math.min(firstInWeek.get(booking.passengerId) ?? at, at));
  }
  const repeatMs = repeatWithinDays * 24 * 60 * 60 * 1000;
  const repeat = [...firstInWeek].filter(([passengerId, first]) =>
    records.bookings.some((booking) => {
      if (booking.passengerId !== passengerId || booking.confirmedAt === null) return false;
      const at = booking.confirmedAt.getTime();
      return at < first && at >= first - repeatMs;
    }),
  );

  const reports = records.reports.filter((report) => inWeek(report.createdAt));
  const answered = reports.filter((report) => report.closedAt !== null);
  const minutesTo = (report: { createdAt: Date; closedAt: Date | null }, until: Date) =>
    ((report.closedAt ?? until).getTime() - report.createdAt.getTime()) / 60_000;
  const late = reports.filter((report) => minutesTo(report, now) > reportAnswerHours * 60);

  const left = leaving.filter((trip) => trip.cancelledAt === null);
  const leftIds = new Set(left.map((trip) => trip.id));
  const rode = records.bookings.filter(
    (booking) =>
      leftIds.has(booking.tripId) &&
      (booking.status === "confirmed" ||
        booking.status === "completed" ||
        booking.status === "no_show"),
  );

  // Bookings still completed count; one found a no-show since does not (spec 34, R34.3).
  const completedBookings = records.bookings.filter(
    (booking) => booking.status === "completed" && inWeek(booking.completedAt),
  );

  return {
    searches: count(searches.length),
    searches_with_result: { numerator: withResult, denominator: searches.length },
    requests_per_search_with_result: { numerator: requests, denominator: withResult },
    trips_posted: count(posted.length),
    seats_offered: count(sum(posted.map((trip) => trip.capacity))),
    bookings_confirmed: count(confirmed.length),
    seats_booked: count(sum(confirmed.map((booking) => booking.seats))),
    seat_fill: {
      numerator: sum(completed.map((trip) => trip.bookedSeatM)),
      denominator: sum(completed.map((trip) => trip.offeredSeatM)),
    },
    driver_cancellations: {
      numerator: driverCancelled.length,
      denominator: withPassengers.length,
    },
    passenger_late_cancellations: {
      numerator: lateOrAbsent.length,
      denominator: confirmed.length,
    },
    repeat_passengers: { numerator: repeat.length, denominator: firstInWeek.size },
    reports_per_trip: { numerator: reports.length, denominator: left.length },
    report_answer_minutes: {
      numerator: Math.round(sum(answered.map((report) => minutesTo(report, now)))),
      denominator: answered.length,
    },
    reports_answered_late: { numerator: late.length, denominator: reports.length },
    money_paid: count(sum(records.payments.filter(({ at }) => inWeek(at)).map((p) => p.amount))),
    money_refunded: count(
      sum(records.refunds.filter(({ at }) => inWeek(at)).map((refund) => refund.amount)),
    ),
    active_drivers: count(new Set(left.map((trip) => trip.driverId)).size),
    active_passengers: count(new Set(rode.map((booking) => booking.passengerId)).size),
    car_km_saved: count(Math.floor(sum(completedBookings.map((b) => b.distanceM)) / 1000)),
    co2_saved_grams: count(sum(completedBookings.map((booking) => booking.co2Grams ?? 0))),
  };
}

// The beta's exit criteria (spec 10, 3.4.3; decision 2), over the last 4
// complete weeks.

export const exitCriteriaWeeks = 4;

export const exitCriteria = [
  /** At least half of searches show a trip. */
  { key: "searches_with_result", atLeast: 0.5 },
  /** At least 1 in 5 searches with a result leads to a request. */
  { key: "requests_per_search_with_result", atLeast: 0.2 },
  /** Driver cancellations under 10%, weather aside. */
  { key: "driver_cancellations", under: 0.1 },
  /** Seat fill of at least 30%. */
  { key: "seat_fill", atLeast: 0.3 },
  /** At least 30% of passengers book again within 60 days. */
  { key: "repeat_passengers", atLeast: 0.3 },
  /** Every report answered within 24 hours. */
  { key: "reports_answered_late", under: Number.MIN_VALUE },
] as const satisfies readonly (
  { key: MetricKey; atLeast: number } | { key: MetricKey; under: number }
)[];

export type ExitCriterionKey = (typeof exitCriteria)[number]["key"];
export type ExitStatus = "met" | "not_met" | "no_data";

export interface ExitCriterionResult {
  readonly key: ExitCriterionKey;
  readonly status: ExitStatus;
  readonly numerator: number;
  readonly denominator: number;
}

/**
 * Each criterion over the weeks given, whose figures are added up first:
 * `no_data` while there is nothing to divide by.
 */
export function checkExitCriteria(weeks: readonly WeekMetrics[]): ExitCriterionResult[] {
  return exitCriteria.map((criterion) => {
    const numerator = sum(weeks.map((week) => week[criterion.key].numerator));
    const denominator = sum(weeks.map((week) => week[criterion.key].denominator ?? 0));
    if (denominator === 0) return { key: criterion.key, status: "no_data", numerator, denominator };
    const share = numerator / denominator;
    const met = "atLeast" in criterion ? share >= criterion.atLeast : share < criterion.under;
    return { key: criterion.key, status: met ? "met" : "not_met", numerator, denominator };
  });
}

const noRecords: MetricRecords = {
  searches: [],
  trips: [],
  bookings: [],
  reports: [],
  payments: [],
  refunds: [],
};

/** A week in which nothing happened. */
export const emptyWeekMetrics: WeekMetrics = weekMetrics(
  noRecords,
  { year: 2026, week: 1 },
  new Date(0),
);

/** The figures of several scopes added together, such as the active corridors'. */
export function addWeekMetrics(scopes: readonly WeekMetrics[]): WeekMetrics {
  const parts = [emptyWeekMetrics, ...scopes];
  const total = {} as Record<MetricKey, MetricValue>;
  for (const key of metricKeys) {
    const denominators = parts.map((part) => part[key].denominator);
    total[key] = {
      numerator: sum(parts.map((part) => part[key].numerator)),
      denominator: denominators.some((value) => value === null)
        ? null
        : sum(denominators.map((value) => value ?? 0)),
    };
  }
  return total;
}
