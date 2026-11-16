import { describe, expect, it } from "vitest";
import {
  arrivalOf,
  checkCheckIn,
  checkDriverAbsent,
  checkInWindow,
  checkNoShow,
  completesAt,
  completesWithTrip,
  dayPhase,
  defaultTripDaySettings as settings,
  tripStatusAt,
} from "./day.ts";

const minute = 60_000;
const firstStopAt = new Date("2026-11-20T08:00:00Z");
const boardsAt = new Date("2026-11-20T08:45:00Z");
const lastStopAt = new Date("2026-11-20T09:30:00Z");
const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * minute);

describe("when a trip departs and completes (R8.1)", () => {
  it("completes 2 hours after the planned time of its last stop", () => {
    expect(completesAt(lastStopAt, settings)).toEqual(new Date("2026-11-20T11:30:00Z"));
  });

  it.each([
    [-1, "published"],
    [0, "departed"],
    [90 + 119, "departed"],
    [90 + 120, "completed"],
  ] as const)("a published trip, %i minutes after its first stop, is %s", (minutes, status) => {
    const trip = { status: "published", firstStopAt, lastStopAt } as const;
    expect(tripStatusAt(trip, at(firstStopAt, minutes), settings)).toBe(status);
  });

  it("moves a departed trip on to completed", () => {
    const trip = { status: "departed", firstStopAt, lastStopAt } as const;
    expect(tripStatusAt(trip, at(lastStopAt, 120), settings)).toBe("completed");
  });

  it.each(["draft", "cancelled", "completed"] as const)("leaves a %s trip as it is", (status) => {
    const trip = { status, firstStopAt, lastStopAt };
    expect(tripStatusAt(trip, at(lastStopAt, 600), settings)).toBe(status);
  });
});

describe("the trip day (spec 8, 3.1)", () => {
  it.each([
    [-181, "upcoming"],
    [-180, "trip_day"],
    [0, "trip_day"],
  ] as const)("%i minutes from the boarding stop is %s", (minutes, phase) => {
    expect(dayPhase(boardsAt, lastStopAt, at(boardsAt, minutes), settings)).toBe(phase);
  });

  it("stays the trip day until the trip completes, then is over", () => {
    expect(dayPhase(boardsAt, lastStopAt, at(lastStopAt, 119), settings)).toBe("trip_day");
    expect(dayPhase(boardsAt, lastStopAt, at(lastStopAt, 120), settings)).toBe("completed");
  });
});

describe("I'm here (R8.3)", () => {
  const passenger = {
    stopAt: boardsAt,
    tripStatus: "departed",
    bookingStatus: "confirmed",
  } as const;
  const driver = { stopAt: boardsAt, tripStatus: "published", bookingStatus: null } as const;

  it("opens 30 minutes before the stop's planned time and closes 60 minutes after", () => {
    expect(checkInWindow(boardsAt, settings)).toEqual({
      opensAt: at(boardsAt, -30),
      closesAt: at(boardsAt, 60),
    });
  });

  it("works from 30 minutes before to 60 minutes after the stop's planned time", () => {
    for (const who of [passenger, driver]) {
      expect(checkCheckIn(who, at(boardsAt, -30), settings)).toEqual({ ok: true, value: null });
      expect(checkCheckIn(who, at(boardsAt, 60), settings)).toEqual({ ok: true, value: null });
    }
  });

  it("is not open earlier, and says when it opens", () => {
    expect(checkCheckIn(passenger, at(boardsAt, -31), settings)).toEqual({
      ok: false,
      error: { code: "check_in_not_open", opensAt: at(boardsAt, -30) },
    });
  });

  it("is closed later", () => {
    expect(checkCheckIn(passenger, at(boardsAt, 61), settings)).toEqual({
      ok: false,
      error: { code: "check_in_closed" },
    });
  });

  it.each([
    "requested",
    "accepted",
    "declined",
    "expired",
    "cancelled",
    "completed",
    "no_show",
  ] as const)("is only for a confirmed passenger, not a %s booking", (bookingStatus) => {
    expect(checkCheckIn({ ...passenger, bookingStatus }, boardsAt, settings)).toEqual({
      ok: false,
      error: { code: "not_confirmed" },
    });
  });

  it.each(["draft", "completed", "cancelled"] as const)(
    "is only on a trip that runs, not a %s one",
    (tripStatus) => {
      for (const who of [passenger, driver]) {
        expect(checkCheckIn({ ...who, tripStatus }, boardsAt, settings)).toEqual({
          ok: false,
          error: { code: "trip_not_running" },
        });
      }
    },
  );
});

describe("who is at their stop (spec 8, 3.1)", () => {
  it("is here once checked in, a no-show once marked, and otherwise not here yet", () => {
    expect(arrivalOf({ status: "confirmed", checkedIn: false })).toBe("not_here");
    expect(arrivalOf({ status: "confirmed", checkedIn: true })).toBe("here");
    expect(arrivalOf({ status: "completed", checkedIn: true })).toBe("here");
    expect(arrivalOf({ status: "no_show", checkedIn: false })).toBe("no_show");
    // A no-show contested as "they rode" completes; marked, it stays a no-show.
    expect(arrivalOf({ status: "no_show", checkedIn: true })).toBe("no_show");
  });
});

describe("marking a no-show (R8.4)", () => {
  const ready = {
    bookingStatus: "confirmed",
    boardsAt,
    lastStopAt,
    driverCheckedIn: true,
    reported: false,
  } as const;

  it("is allowed after the 10-minute wait at the passenger's boarding stop", () => {
    expect(checkNoShow(ready, at(boardsAt, 10), settings)).toEqual({ ok: true, value: null });
  });

  it("is refused before the wait has passed, saying when it can be marked", () => {
    expect(checkNoShow(ready, at(boardsAt, 9), settings)).toEqual({
      ok: false,
      error: { code: "no_show_too_early", allowedAt: at(boardsAt, 10) },
    });
  });

  it("is refused until the driver has checked in at that stop", () => {
    expect(checkNoShow({ ...ready, driverCheckedIn: false }, at(boardsAt, 20), settings)).toEqual({
      ok: false,
      error: { code: "driver_not_checked_in" },
    });
  });

  it.each(["requested", "accepted", "cancelled", "completed", "no_show"] as const)(
    "is refused for a %s booking",
    (bookingStatus) => {
      expect(checkNoShow({ ...ready, bookingStatus }, at(boardsAt, 20), settings)).toEqual({
        ok: false,
        error: { code: "not_confirmed" },
      });
    },
  );

  it("is refused once the passenger has reported that the driver didn't come", () => {
    expect(checkNoShow({ ...ready, reported: true }, at(boardsAt, 20), settings)).toEqual({
      ok: false,
      error: { code: "already_reported" },
    });
  });

  it("is allowed until the trip completes, and refused from then on", () => {
    expect(checkNoShow(ready, at(lastStopAt, 119), settings)).toEqual({ ok: true, value: null });
    expect(checkNoShow(ready, at(lastStopAt, 120), settings)).toEqual({
      ok: false,
      error: { code: "trip_completed" },
    });
  });
});

describe("the driver didn't come (R8.5)", () => {
  const confirmed = { bookingStatus: "confirmed", boardsAt, lastStopAt, reported: false } as const;

  it("is refused once the booking has been reported, open or decided", () => {
    for (const bookingStatus of ["confirmed", "completed"] as const) {
      expect(
        checkDriverAbsent(
          { ...confirmed, bookingStatus, reported: true },
          at(boardsAt, 20),
          settings,
        ),
      ).toEqual({ ok: false, error: { code: "already_reported" } });
    }
  });

  it("can be reported from the wait after the boarding time", () => {
    expect(checkDriverAbsent(confirmed, at(boardsAt, 10), settings)).toEqual({
      ok: true,
      value: null,
    });
    expect(checkDriverAbsent(confirmed, at(boardsAt, 9), settings)).toEqual({
      ok: false,
      error: { code: "report_too_early", allowedAt: at(boardsAt, 10) },
    });
  });

  it("can be reported on a completed booking until 24 hours after the trip completes", () => {
    const completed = { ...confirmed, bookingStatus: "completed" } as const;
    const completion = at(lastStopAt, 120);
    expect(checkDriverAbsent(completed, at(completion, 24 * 60), settings)).toEqual({
      ok: true,
      value: null,
    });
    expect(checkDriverAbsent(completed, at(completion, 24 * 60 + 1), settings)).toEqual({
      ok: false,
      error: { code: "report_too_late" },
    });
  });

  it.each(["requested", "accepted", "cancelled", "no_show", "declined", "expired"] as const)(
    "is refused for a %s booking",
    (bookingStatus) => {
      expect(
        checkDriverAbsent({ ...confirmed, bookingStatus }, at(boardsAt, 20), settings),
      ).toEqual({ ok: false, error: { code: "not_boarding" } });
    },
  );
});

describe("which bookings complete with the trip (R8.2)", () => {
  it("completes a confirmed booking without an open report", () => {
    expect(completesWithTrip({ status: "confirmed", openReport: false })).toBe(true);
  });

  it("leaves a booking with an open report, a no-show and every other status as they are", () => {
    expect(completesWithTrip({ status: "confirmed", openReport: true })).toBe(false);
    for (const status of ["requested", "accepted", "cancelled", "no_show", "completed"] as const) {
      expect(completesWithTrip({ status, openReport: false })).toBe(false);
    }
  });
});
