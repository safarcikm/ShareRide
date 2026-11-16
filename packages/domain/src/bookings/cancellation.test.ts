import { describe, expect, it } from "vitest";
import {
  cancellationTerms,
  driverCancelReasons,
  passengerCancelReasons,
  tripCancelReasons,
  type BookingToCancel,
} from "./cancellation.ts";
import { bookingStatuses } from "./lifecycle.ts";

const kr = (amount: number) => ({ amount, currency: "ISK" as const });
const minuteMs = 60_000;
// The passenger boards in Borgarnes on Sunday morning, an hour after the
// trip leaves Reykjavík.
const departsAt = new Date("2026-11-15T09:00:00Z");
const boardsAt = new Date("2026-11-15T10:00:00Z");
const before = (minutes: number) => new Date(boardsAt.getTime() - minutes * minuteMs);
const minutesFrom = (moment: Date, minutes: number) =>
  new Date(moment.getTime() + minutes * minuteMs);

const paid: BookingToCancel = {
  status: "confirmed",
  total: kr(2600),
  boardsAt,
  departsAt,
  departsAtWhenBooked: departsAt,
};
/** The same booking after the driver moved the departure by some minutes. */
const moved = (minutes: number): BookingToCancel => ({
  ...paid,
  boardsAt: minutesFrom(boardsAt, minutes),
  departsAt: minutesFrom(departsAt, minutes),
});
const full = { refund: kr(2600) };
const none = { refund: kr(0) };

describe("the reasons (spec 6, 3.3 to 3.5)", () => {
  it("are the trip's, the driver's for one booking, and the passenger's", () => {
    expect(tripCancelReasons).toEqual([
      "weather",
      "road_closed",
      "car_problem",
      "illness",
      "plans_changed",
      "other",
    ]);
    expect(driverCancelReasons).toEqual([...tripCancelReasons, "passenger_asked", "car_smaller"]);
    expect(passengerCancelReasons).toEqual([
      "plans_changed",
      "found_another",
      "trip_changed",
      "weather",
      "other",
    ]);
  });
});

describe("a passenger cancelling a paid booking (rules M2 and R6.8)", () => {
  const byPassenger = { by: "passenger", reason: "plans_changed" } as const;

  it("is refunded in full and does not count two days before boarding", () => {
    expect(cancellationTerms(paid, byPassenger, before(2 * 24 * 60))).toEqual({
      ok: true,
      value: { ...full, countsOnReliability: false },
    });
  });

  it("does not count exactly 24 hours before boarding, and counts a minute later", () => {
    expect(cancellationTerms(paid, byPassenger, before(24 * 60))).toEqual({
      ok: true,
      value: { ...full, countsOnReliability: false },
    });
    expect(cancellationTerms(paid, byPassenger, before(24 * 60 - 1))).toEqual({
      ok: true,
      value: { ...full, countsOnReliability: true },
    });
  });

  it("is refunded in full exactly 15 minutes before boarding, and not a minute later", () => {
    expect(cancellationTerms(paid, byPassenger, before(15))).toEqual({
      ok: true,
      value: { ...full, countsOnReliability: true },
    });
    expect(cancellationTerms(paid, byPassenger, before(14))).toEqual({
      ok: true,
      value: { ...none, countsOnReliability: true },
    });
  });

  it("follows the boarding stop's time, not the trip's departure", () => {
    // 20 minutes before boarding is 40 minutes after the trip left Reykjavík.
    expect(cancellationTerms(paid, byPassenger, before(20))).toEqual({
      ok: true,
      value: { ...full, countsOnReliability: true },
    });
  });

  it("never counts for weather, and the refund still follows the time", () => {
    const forWeather = { by: "passenger", reason: "weather" } as const;
    expect(cancellationTerms(paid, forWeather, before(60))).toEqual({
      ok: true,
      value: { ...full, countsOnReliability: false },
    });
    expect(cancellationTerms(paid, forWeather, before(10))).toEqual({
      ok: true,
      value: { ...none, countsOnReliability: false },
    });
  });

  it("is refunded in full without counting after a move of more than 30 minutes (R6.3)", () => {
    const late = moved(31);
    expect(cancellationTerms(late, byPassenger, before(-21))).toEqual({
      ok: true,
      value: { ...full, countsOnReliability: false },
    });
    const early = moved(-31);
    expect(cancellationTerms(early, byPassenger, before(41))).toEqual({
      ok: true,
      value: { ...full, countsOnReliability: false },
    });
  });

  it("gets nothing more after a move of exactly 30 minutes", () => {
    // 10 minutes before the new boarding time.
    expect(cancellationTerms(moved(30), byPassenger, before(-20))).toEqual({
      ok: true,
      value: { ...none, countsOnReliability: true },
    });
  });

  it("counts the move from the departure when booked: two moves of 20 minutes are 40", () => {
    expect(cancellationTerms(moved(40), byPassenger, before(-35))).toEqual({
      ok: true,
      value: { ...full, countsOnReliability: false },
    });
  });

  it("gets nothing more once the trip is moved back near the time booked", () => {
    expect(cancellationTerms(moved(10), byPassenger, before(-5))).toEqual({
      ok: true,
      value: { ...none, countsOnReliability: true },
    });
  });

  it("is refunded after a big move only until boarding (R6.3), and never counts", () => {
    const late = moved(45);
    expect(cancellationTerms(late, byPassenger, late.boardsAt)).toEqual({
      ok: true,
      value: { ...none, countsOnReliability: false },
    });
    expect(cancellationTerms(late, byPassenger, new Date(late.boardsAt.getTime() - 1))).toEqual({
      ok: true,
      value: { ...full, countsOnReliability: false },
    });
  });

  it("refunds nothing for a free ride, by the same rules", () => {
    expect(cancellationTerms({ ...paid, total: kr(0) }, byPassenger, before(60))).toEqual({
      ok: true,
      value: { refund: kr(0), countsOnReliability: true },
    });
  });
});

describe("a passenger cancelling a booking not yet paid (spec 6, 3.5.4)", () => {
  const unpaid: BookingToCancel = { ...paid, status: "accepted" };

  it("refunds nothing and never counts, even at the last minute", () => {
    for (const minutes of [2 * 24 * 60, 60, 5]) {
      expect(
        cancellationTerms(unpaid, { by: "passenger", reason: "found_another" }, before(minutes)),
      ).toEqual({ ok: true, value: { refund: kr(0), countsOnReliability: false } });
    }
  });
});

describe("the driver cancelling a booking (rules M2 and R6.7)", () => {
  it("refunds in full and counts, whenever it is", () => {
    for (const minutes of [7 * 24 * 60, 60, 5, -5]) {
      expect(
        cancellationTerms(paid, { by: "driver", reason: "car_problem" }, before(minutes)),
      ).toEqual({ ok: true, value: { ...full, countsOnReliability: true } });
    }
  });

  it("counts when the passenger asked (spec 6, 3.4): the passenger can cancel it instead", () => {
    expect(
      cancellationTerms(paid, { by: "driver", reason: "passenger_asked" }, before(60)),
    ).toEqual({ ok: true, value: { ...full, countsOnReliability: true } });
  });

  it.each(["weather", "road_closed"] as const)("does not count for %s", (reason) => {
    expect(cancellationTerms(paid, { by: "driver", reason }, before(10))).toEqual({
      ok: true,
      value: { ...full, countsOnReliability: false },
    });
  });

  it("refunds nothing and does not count for a booking not yet paid", () => {
    expect(
      cancellationTerms(
        { ...paid, status: "accepted" },
        { by: "driver", reason: "car_smaller" },
        before(60),
      ),
    ).toEqual({ ok: true, value: { refund: kr(0), countsOnReliability: false } });
  });
});

describe("a booking that cannot be cancelled", () => {
  it.each(bookingStatuses.filter((status) => status !== "accepted" && status !== "confirmed"))(
    "is refused when %s: a request is withdrawn or declined instead",
    (status) => {
      expect(
        cancellationTerms({ ...paid, status }, { by: "passenger", reason: "other" }, before(60)),
      ).toEqual({ ok: false, error: { code: "not_allowed", status, event: "cancel" } });
      expect(
        cancellationTerms({ ...paid, status }, { by: "driver", reason: "other" }, before(60)),
      ).toEqual({ ok: false, error: { code: "not_allowed", status, event: "cancel" } });
    },
  );
});
