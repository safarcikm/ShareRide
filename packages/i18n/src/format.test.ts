import { describe, expect, it } from "vitest";
import { formatDate, formatDistance, formatMoney, formatMonth } from "./format.ts";

describe("formatMoney (ADR 0011)", () => {
  it("shows whole krónur in Icelandic as 2.500 kr.", () => {
    expect(formatMoney({ amount: 2500, currency: "ISK" }, "is")).toBe("2.500 kr.");
  });

  it("shows whole krónur in English as 2,500 ISK", () => {
    expect(formatMoney({ amount: 2500, currency: "ISK" }, "en")).toBe("2,500 ISK");
  });

  it("shows a free trip as 0", () => {
    expect(formatMoney({ amount: 0, currency: "ISK" }, "en")).toBe("0 ISK");
  });
});

describe("formatDistance", () => {
  it("rounds short distances to 100 m, and shows at least 100 m", () => {
    expect(formatDistance(0, "en")).toBe("100 m");
    expect(formatDistance(349, "en")).toBe("300 m");
    expect(formatDistance(940, "is")).toBe("900 m");
  });

  it("shows kilometres with one decimal under 10 km", () => {
    expect(formatDistance(950, "en")).toBe("1 km");
    expect(formatDistance(2440, "en")).toBe("2.4 km");
    expect(formatDistance(2440, "is")).toBe("2,4 km");
  });

  it("shows whole kilometres from 10 km", () => {
    expect(formatDistance(9960, "en")).toBe("10 km");
    expect(formatDistance(385_400, "en")).toBe("385 km");
    expect(formatDistance(1_385_400, "is")).toBe("1.385 km");
  });
});

describe("formatMonth", () => {
  it("names a month (1 to 12) as it reads in a sentence", () => {
    expect(formatMonth(5, "en")).toBe("May");
    expect(formatMonth(5, "is")).toBe("maí");
    expect(formatMonth(12, "is")).toBe("desember");
  });
});

describe("formatDate", () => {
  it("shows a calendar date with the month in words", () => {
    expect(formatDate("2026-11-14", "en")).toBe("14 November 2026");
    expect(formatDate("2026-11-14", "is")).toBe("14. nóvember 2026");
  });

  it("does not move the date in any time zone", () => {
    expect(formatDate("2026-01-01", "en")).toBe("1 January 2026");
  });
});
