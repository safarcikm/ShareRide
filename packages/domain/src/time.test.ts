import { describe, expect, it } from "vitest";
import { inIceland } from "./time.ts";

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
