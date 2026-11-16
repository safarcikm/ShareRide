import { describe, expect, it } from "vitest";
import {
  cancellationTerms,
  cancelReasons,
  cancelReasonsFor,
  driverCancelReasons,
  excusedByReason,
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

  it("are each stored once, whoever gave them", () => {
    expect(cancelReasons).toEqual([
      "weather",
      "road_closed",
      "car_problem",
      "illness",
      "plans_changed",
      "other",
      "passenger_asked",
      "car_smaller",
      "found_another",
      "trip_changed",
    ]);
  });

  it("are offered by who cancels", () => {
    expect(cancelReasonsFor("passenger")).toBe(passengerCancelReasons);
    expect(cancelReasonsFor("driver")).toBe(driverCancelReasons);
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

  it("is refunded after a big move until boarding (R6.3), and never counts", () => {
    const late = moved(45);
    expect(cancellationTerms(late, byPassenger, new Date(late.boardsAt.getTime() - 1))).toEqual({
      ok: true,
      value: { ...full, countsOnReliability: false },
    });
  });

  it("can cancel until the planned time at the boarding stop, then no more (spec 8 takes over)", () => {
    const lastMoment = new Date(boardsAt.getTime() - 1);
    expect(cancellationTerms(paid, byPassenger, lastMoment)).toEqual({
      ok: true,
      value: { ...none, countsOnReliability: true },
    });
    for (const now of [boardsAt, before(-5), before(-3 * 24 * 60)]) {
      expect(cancellationTerms(paid, byPassenger, now)).toEqual({
        ok: false,
        error: { code: "boarding_passed" },
      });
      expect(cancellationTerms({ ...paid, status: "accepted" }, byPassenger, now)).toEqual({
        ok: false,
        error: { code: "boarding_passed" },
      });
    }
    // After a move, the new time at the boarding stop.
    expect(cancellationTerms(moved(45), byPassenger, boardsAt).ok).toBe(true);
    expect(cancellationTerms(moved(45), byPassenger, moved(45).boardsAt)).toEqual({
      ok: false,
      error: { code: "boarding_passed" },
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
  it("refunds in full and counts, whenever it is before boarding", () => {
    for (const minutes of [7 * 24 * 60, 60, 5]) {
      expect(
        cancellationTerms(paid, { by: "driver", reason: "car_problem" }, before(minutes)),
      ).toEqual({ ok: true, value: { ...full, countsOnReliability: true } });
    }
  });

  it("cannot cancel from the time to get in: a passenger who did not come is a no-show (spec 8)", () => {
    for (const minutes of [0, -5]) {
      expect(
        cancellationTerms(paid, { by: "driver", reason: "car_problem" }, before(minutes)),
      ).toEqual({ ok: false, error: { code: "boarding_passed" } });
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

describe("a cancellation the operator can overrule (R8.11)", () => {
  it("is one that counts but for its weather or road-closure reason", () => {
    expect(excusedByReason(paid, { by: "passenger", reason: "weather" }, before(60))).toBe(true);
    expect(excusedByReason(paid, { by: "driver", reason: "road_closed" }, before(60))).toBe(true);
  });

  it("is not one that would not count anyway, or that counts", () => {
    // Two days before boarding, a passenger's cancellation never counts.
    expect(excusedByReason(paid, { by: "passenger", reason: "weather" }, before(2 * 24 * 60))).toBe(
      false,
    );
    // After a big move, it never counts either (R6.3).
    expect(excusedByReason(moved(31), { by: "passenger", reason: "weather" }, before(60))).toBe(
      false,
    );
    expect(excusedByReason(paid, { by: "driver", reason: "car_problem" }, before(60))).toBe(false);
    expect(
      excusedByReason(
        { ...paid, status: "accepted" },
        { by: "driver", reason: "weather" },
        before(60),
      ),
    ).toBe(false);
  });
});
