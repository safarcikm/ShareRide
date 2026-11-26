import { clockOf, earliestDeparture, firstDeparture, onOrAfter } from "./clock-input";

describe("clockOf", () => {
  it("reads the clock in Iceland, rounded up to 5 minutes", () => {
    expect(clockOf(new Date("2026-11-15T09:32:10Z"))).toEqual({ hour: 9, minute: 35 });
    expect(clockOf(new Date("2026-11-15T09:30:00Z"))).toEqual({ hour: 9, minute: 30 });
  });

  it("keeps a departure late in the evening on its day", () => {
    expect(clockOf(new Date("2026-11-15T23:58:00Z"))).toEqual({ hour: 0, minute: 0 });
    expect(clockOf(new Date("2026-11-15T23:58:00Z"), true)).toEqual({ hour: 23, minute: 55 });
  });
});

describe("earliestDeparture", () => {
  it("is the first 5-minute mark at least 30 minutes from now", () => {
    expect(earliestDeparture(new Date("2026-11-14T12:00:00Z"))).toEqual({ hour: 12, minute: 30 });
    expect(earliestDeparture(new Date("2026-11-14T12:01:00Z"))).toEqual({ hour: 12, minute: 35 });
  });
});

describe("firstDeparture", () => {
  // Twenty to four at night, Saturday 14 November 2026 in Iceland.
  const atNight = new Date("2026-11-14T03:40:00Z");

  it("is 08:00 for a day other than today (spec 31, 3.11)", () => {
    expect(firstDeparture({ year: 2026, month: 11, day: 15 }, atNight)).toEqual({
      hour: 8,
      minute: 0,
    });
    expect(firstDeparture({ year: 2026, month: 12, day: 1 }, atNight)).toEqual({
      hour: 8,
      minute: 0,
    });
  });

  it("is the first time one can leave at for today, and before a day is chosen", () => {
    expect(firstDeparture({ year: 2026, month: 11, day: 14 }, atNight)).toEqual({
      hour: 4,
      minute: 10,
    });
    expect(firstDeparture(null, atNight)).toEqual({ hour: 4, minute: 10 });
  });

  it("takes today as the day it is in Iceland", () => {
    // Half past eleven at night in Iceland is the same day there.
    const late = new Date("2026-11-14T23:30:00Z");
    expect(firstDeparture({ year: 2026, month: 11, day: 15 }, late)).toEqual({
      hour: 8,
      minute: 0,
    });
    expect(firstDeparture({ year: 2026, month: 11, day: 14 }, late)).toEqual({
      hour: 0,
      minute: 0,
    });
  });
});

describe("onOrAfter", () => {
  const previous = new Date("2026-11-15T22:30:00Z");

  it("keeps a later time on the same day", () => {
    expect(onOrAfter(previous, { hour: 23, minute: 10 })).toEqual(new Date("2026-11-15T23:10:00Z"));
  });

  it("moves an earlier time to the next day", () => {
    expect(onOrAfter(previous, { hour: 0, minute: 40 })).toEqual(new Date("2026-11-16T00:40:00Z"));
  });

  it("keeps the same time on the same day", () => {
    expect(onOrAfter(previous, { hour: 22, minute: 30 })).toEqual(previous);
  });
});
