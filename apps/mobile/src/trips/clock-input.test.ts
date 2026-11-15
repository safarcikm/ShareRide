import { clockOf, earliestDeparture, onOrAfter } from "./clock-input";

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
