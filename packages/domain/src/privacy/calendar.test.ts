import { describe, expect, it } from "vitest";
import { addIcelandMonths } from "./calendar.ts";

describe("calendar months in Iceland", () => {
  const plus = (moment: string, months: number) =>
    addIcelandMonths(new Date(moment), months).toISOString();

  it("keeps the day and time", () => {
    expect(plus("2026-11-16T21:40:15.250Z", 1)).toBe("2026-12-16T21:40:15.250Z");
    expect(plus("2026-12-16T08:00:00.000Z", 1)).toBe("2027-01-16T08:00:00.000Z");
    expect(plus("2029-11-16T08:00:00.000Z", -36)).toBe("2026-11-16T08:00:00.000Z");
  });

  it("ends on the last day of a shorter month", () => {
    expect(plus("2027-01-31T12:00:00.000Z", 1)).toBe("2027-02-28T12:00:00.000Z");
    expect(plus("2028-01-31T12:00:00.000Z", 1)).toBe("2028-02-29T12:00:00.000Z");
    expect(plus("2028-02-29T12:00:00.000Z", -36)).toBe("2025-02-28T12:00:00.000Z");
  });
});
