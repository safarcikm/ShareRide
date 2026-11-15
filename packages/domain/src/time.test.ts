import { describe, expect, it } from "vitest";
import { fromIceland, inIceland } from "./time.ts";

describe("inIceland", () => {
  it("reads a moment on a clock in Iceland", () => {
    expect(inIceland(new Date("2026-11-30T23:59:00Z"))).toEqual({
      year: 2026,
      month: 11,
      day: 30,
      hour: 23,
      minute: 59,
    });
    expect(inIceland(new Date("2027-01-01T00:05:00Z"))).toMatchObject({
      year: 2027,
      month: 1,
      day: 1,
      hour: 0,
    });
  });
});

describe("fromIceland", () => {
  it("is the moment a clock in Iceland shows those parts", () => {
    const parts = { year: 2027, month: 3, day: 2, hour: 9, minute: 30 };
    expect(fromIceland(parts)).toEqual(new Date("2027-03-02T09:30:00Z"));
    expect(inIceland(fromIceland(parts))).toEqual(parts);
  });

  it("rolls over a day past the end of the month", () => {
    expect(fromIceland({ year: 2026, month: 12, day: 32, hour: 1, minute: 0 })).toEqual(
      new Date("2027-01-01T01:00:00Z"),
    );
  });
});
