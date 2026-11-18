import { describe, expect, it } from "vitest";
import {
  addWeekMetrics,
  checkExitCriteria,
  emptyWeekMetrics,
  fewerThanFive,
  metricKeys,
  weekMetrics,
  type MetricBooking,
  type MetricRecords,
  type MetricTrip,
  type WeekMetrics,
} from "./weekly.ts";

// Week 46 of 2026 runs from Monday 9 November to Monday 16 November.
const week = { year: 2026, week: 46 };
const now = new Date("2026-11-18T10:00:00Z");
const at = (iso: string) => new Date(iso);

const trip = (id: string, more: Partial<MetricTrip> = {}): MetricTrip => ({
  id,
  driverId: `driver-of-${id}`,
  publishedAt: at("2026-11-02T09:00:00Z"),
  departsAt: at("2026-11-12T08:00:00Z"),
  completedAt: at("2026-11-12T12:00:00Z"),
  cancelledAt: null,
  capacity: 3,
  driverCancellationCounts: false,
  offeredSeatM: 300_000,
  bookedSeatM: 100_000,
  ...more,
});

const booking = (
  tripId: string,
  passengerId: string,
  more: Partial<MetricBooking> = {},
): MetricBooking => ({
  tripId,
  passengerId,
  seats: 1,
  createdAt: at("2026-11-10T09:00:00Z"),
  confirmedAt: at("2026-11-10T09:05:00Z"),
  status: "completed",
  cancelledBy: null,
  countsOnReliability: false,
  ...more,
});

const none: MetricRecords = {
  searches: [],
  trips: [],
  bookings: [],
  reports: [],
  payments: [],
  refunds: [],
};

describe("weekMetrics", () => {
  it("is all zeros for a week with nothing, with a denominator only where something is divided", () => {
    const empty = weekMetrics(none, week, now);
    expect(empty).toEqual(emptyWeekMetrics);
    expect(Object.keys(empty).sort()).toEqual([...metricKeys].sort());
    expect(empty.searches).toEqual({ numerator: 0, denominator: null });
    expect(empty.searches_with_result).toEqual({ numerator: 0, denominator: 0 });
    expect(empty.money_paid).toEqual({ numerator: 0, denominator: null });
  });

  it("counts the week's searches, those with a result, and the requests per search with one", () => {
    const metrics = weekMetrics(
      {
        ...none,
        searches: [
          { at: at("2026-11-09T00:00:00Z"), results: 2 },
          { at: at("2026-11-11T13:00:00Z"), results: 0 },
          { at: at("2026-11-15T23:00:00Z"), results: 1 },
          // The weeks before and after.
          { at: at("2026-11-08T23:00:00Z"), results: 1 },
          { at: at("2026-11-16T00:00:00Z"), results: 1 },
        ],
        bookings: [
          booking("t1", "p1"),
          booking("t1", "p2", { status: "declined", confirmedAt: null }),
          booking("t1", "p3", { createdAt: at("2026-11-16T09:00:00Z"), confirmedAt: null }),
        ],
      },
      week,
      now,
    );
    expect(metrics.searches).toEqual({ numerator: 3, denominator: null });
    expect(metrics.searches_with_result).toEqual({ numerator: 2, denominator: 3 });
    expect(metrics.requests_per_search_with_result).toEqual({ numerator: 2, denominator: 2 });
  });

  it("counts trips published and bookings confirmed in the week, with their seats", () => {
    const metrics = weekMetrics(
      {
        ...none,
        trips: [
          trip("t1", { publishedAt: at("2026-11-09T10:00:00Z"), capacity: 3 }),
          trip("t2", { publishedAt: at("2026-11-13T10:00:00Z"), capacity: 4 }),
          trip("t3", { publishedAt: at("2026-11-02T10:00:00Z") }),
        ],
        bookings: [
          booking("t1", "p1", { seats: 2 }),
          booking("t1", "p2", { confirmedAt: at("2026-11-17T09:00:00Z") }),
          booking("t2", "p3", { confirmedAt: null, status: "requested" }),
        ],
      },
      week,
      now,
    );
    expect(metrics.trips_posted.numerator).toBe(2);
    expect(metrics.seats_offered.numerator).toBe(7);
    expect(metrics.bookings_confirmed.numerator).toBe(1);
    expect(metrics.seats_booked.numerator).toBe(2);
  });

  it("fills seats by kilometre, on the trips completed in the week", () => {
    const metrics = weekMetrics(
      {
        ...none,
        trips: [
          trip("t1", { offeredSeatM: 300_000, bookedSeatM: 100_000 }),
          trip("t2", { offeredSeatM: 100_000, bookedSeatM: 100_000 }),
          trip("t3", { completedAt: null }),
          trip("t4", { completedAt: at("2026-11-16T01:00:00Z") }),
        ],
      },
      week,
      now,
    );
    expect(metrics.seat_fill).toEqual({ numerator: 200_000, denominator: 400_000 });
  });

  it("counts a driver's cancellation that counts, once per trip, of the trips with passengers", () => {
    const cancelled = { status: "cancelled", cancelledBy: "driver" } as const;
    const metrics = weekMetrics(
      {
        ...none,
        trips: [
          trip("ran"),
          trip("trip-cancelled", {
            cancelledAt: at("2026-11-11T08:00:00Z"),
            completedAt: null,
            driverCancellationCounts: true,
          }),
          trip("weather", { cancelledAt: at("2026-11-11T08:00:00Z"), completedAt: null }),
          trip("two-bookings-cancelled"),
          trip("nobody-booked", { driverCancellationCounts: true }),
          trip("next-week", {
            departsAt: at("2026-11-17T08:00:00Z"),
            driverCancellationCounts: true,
          }),
        ],
        bookings: [
          booking("ran", "p1"),
          booking("trip-cancelled", "p2", { ...cancelled, countsOnReliability: false }),
          booking("weather", "p3", cancelled),
          booking("two-bookings-cancelled", "p4", { ...cancelled, countsOnReliability: true }),
          booking("two-bookings-cancelled", "p5", { ...cancelled, countsOnReliability: true }),
          booking("next-week", "p6"),
          // A request the driver never took is not a passenger.
          booking("nobody-booked", "p7", { confirmedAt: null, status: "declined" }),
        ],
      },
      week,
      now,
    );
    expect(metrics.driver_cancellations).toEqual({ numerator: 2, denominator: 4 });
  });

  it("counts late cancellations and no-shows of the bookings confirmed in the week", () => {
    const metrics = weekMetrics(
      {
        ...none,
        bookings: [
          booking("t", "p1"),
          booking("t", "p2", { status: "no_show" }),
          booking("t", "p3", {
            status: "cancelled",
            cancelledBy: "passenger",
            countsOnReliability: true,
          }),
          // In good time, and the driver's own cancellation: neither counts here.
          booking("t", "p4", { status: "cancelled", cancelledBy: "passenger" }),
          booking("t", "p5", {
            status: "cancelled",
            cancelledBy: "driver",
            countsOnReliability: true,
          }),
          booking("t", "p6", { status: "no_show", confirmedAt: at("2026-11-03T09:00:00Z") }),
        ],
      },
      week,
      now,
    );
    expect(metrics.passenger_late_cancellations).toEqual({ numerator: 2, denominator: 5 });
  });

  it("finds the passengers who had booked within the 60 days before", () => {
    const metrics = weekMetrics(
      {
        ...none,
        bookings: [
          booking("t", "again"),
          booking("t", "again", { confirmedAt: at("2026-10-01T09:00:00Z") }),
          booking("t", "first-time"),
          booking("t", "long-ago"),
          booking("t", "long-ago", { confirmedAt: at("2026-09-01T09:00:00Z") }),
          // Twice in the week itself: the second is a repeat of the first, but the
          // passenger is counted from their first booking of the week.
          booking("t", "twice-this-week"),
          booking("t", "twice-this-week", { confirmedAt: at("2026-11-12T09:00:00Z") }),
          booking("t", "only-asked-before"),
          booking("t", "only-asked-before", { confirmedAt: null, status: "declined" }),
        ],
      },
      week,
      now,
    );
    expect(metrics.repeat_passengers).toEqual({ numerator: 1, denominator: 5 });
  });

  it("counts reports per trip that left, the minutes to an answer, and those answered late or not yet", () => {
    const metrics = weekMetrics(
      {
        ...none,
        trips: [trip("t1"), trip("t2"), trip("t3", { cancelledAt: at("2026-11-10T08:00:00Z") })],
        reports: [
          { createdAt: at("2026-11-10T10:00:00Z"), closedAt: at("2026-11-10T12:00:00Z") },
          { createdAt: at("2026-11-11T10:00:00Z"), closedAt: at("2026-11-12T10:00:01Z") },
          // Open for more than a day now.
          { createdAt: at("2026-11-15T10:00:00Z"), closedAt: null },
          { createdAt: at("2026-11-17T10:00:00Z"), closedAt: null },
        ],
      },
      week,
      now,
    );
    expect(metrics.reports_per_trip).toEqual({ numerator: 3, denominator: 2 });
    expect(metrics.report_answer_minutes).toEqual({ numerator: 120 + 1440, denominator: 2 });
    expect(metrics.reports_answered_late).toEqual({ numerator: 2, denominator: 3 });
  });

  it("does not call an open report late before its 24 hours are up", () => {
    const records = {
      ...none,
      reports: [{ createdAt: at("2026-11-15T10:00:00Z"), closedAt: null }],
    };
    expect(weekMetrics(records, week, at("2026-11-16T09:00:00Z")).reports_answered_late).toEqual({
      numerator: 0,
      denominator: 1,
    });
  });

  it("adds up the money paid and refunded in the week", () => {
    const metrics = weekMetrics(
      {
        ...none,
        payments: [
          { at: at("2026-11-10T10:00:00Z"), amount: 2500 },
          { at: at("2026-11-11T10:00:00Z"), amount: 1500 },
          { at: at("2026-11-17T10:00:00Z"), amount: 9000 },
        ],
        refunds: [{ at: at("2026-11-12T10:00:00Z"), amount: 1250 }],
      },
      week,
      now,
    );
    expect(metrics.money_paid).toEqual({ numerator: 4000, denominator: null });
    expect(metrics.money_refunded).toEqual({ numerator: 1250, denominator: null });
  });

  it("counts the drivers and passengers of the trips that left in the week, each once", () => {
    const metrics = weekMetrics(
      {
        ...none,
        trips: [
          trip("t1", { driverId: "anna" }),
          trip("t2", { driverId: "anna" }),
          trip("t3", { driverId: "jon" }),
          trip("t4", { driverId: "sigga", cancelledAt: at("2026-11-10T08:00:00Z") }),
        ],
        bookings: [
          booking("t1", "p1"),
          booking("t2", "p1"),
          booking("t3", "p2", { status: "no_show" }),
          booking("t3", "p3", { status: "cancelled", cancelledBy: "passenger" }),
          booking("t4", "p4", { status: "cancelled", cancelledBy: "driver" }),
        ],
      },
      week,
      now,
    );
    expect(metrics.active_drivers.numerator).toBe(2);
    expect(metrics.active_passengers.numerator).toBe(2);
  });
});

describe("fewerThanFive", () => {
  it("holds for 1 to 4 people, not for none or for 5", () => {
    expect([0, 1, 4, 5].map(fewerThanFive)).toEqual([false, true, true, false]);
  });
});

const weekOf = (figures: Partial<Record<keyof WeekMetrics, [number, number]>>): WeekMetrics => ({
  ...emptyWeekMetrics,
  ...Object.fromEntries(
    Object.entries(figures).map(([key, [numerator, denominator]]) => [
      key,
      { numerator, denominator },
    ]),
  ),
});

describe("checkExitCriteria", () => {
  it("has no data while there is nothing to divide by", () => {
    expect(checkExitCriteria([emptyWeekMetrics]).map((criterion) => criterion.status)).toEqual(
      Array.from({ length: 6 }, () => "no_data"),
    );
  });

  it("adds the weeks up before comparing with each target", () => {
    const statuses = Object.fromEntries(
      checkExitCriteria([
        weekOf({
          searches_with_result: [1, 10],
          requests_per_search_with_result: [1, 10],
          driver_cancellations: [1, 10],
          seat_fill: [30, 100],
          repeat_passengers: [2, 10],
          reports_answered_late: [0, 2],
        }),
        weekOf({
          searches_with_result: [9, 10],
          requests_per_search_with_result: [2, 10],
          driver_cancellations: [1, 10],
          repeat_passengers: [3, 10],
          reports_answered_late: [0, 1],
        }),
      ]).map((criterion) => [criterion.key, criterion]),
    );
    expect(statuses["searches_with_result"]).toEqual({
      key: "searches_with_result",
      status: "met",
      numerator: 10,
      denominator: 20,
    });
    expect(statuses["requests_per_search_with_result"]?.status).toBe("not_met");
    // Exactly 10% is not under 10%.
    expect(statuses["driver_cancellations"]?.status).toBe("not_met");
    expect(statuses["seat_fill"]?.status).toBe("met");
    expect(statuses["repeat_passengers"]?.status).toBe("not_met");
    expect(statuses["reports_answered_late"]?.status).toBe("met");
  });

  it("fails the report target on one late answer", () => {
    const [late] = checkExitCriteria([weekOf({ reports_answered_late: [1, 40] })]).filter(
      (criterion) => criterion.key === "reports_answered_late",
    );
    expect(late?.status).toBe("not_met");
  });
});

describe("addWeekMetrics", () => {
  it("adds numerators and denominators, and keeps a plain count plain", () => {
    const total = addWeekMetrics([
      weekOf({ seat_fill: [1, 4] }),
      { ...weekOf({ seat_fill: [2, 4] }), searches: { numerator: 7, denominator: null } },
    ]);
    expect(total.seat_fill).toEqual({ numerator: 3, denominator: 8 });
    expect(total.searches).toEqual({ numerator: 7, denominator: null });
    expect(addWeekMetrics([])).toEqual(emptyWeekMetrics);
  });
});
