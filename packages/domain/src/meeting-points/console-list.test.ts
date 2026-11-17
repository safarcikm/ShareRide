import { describe, expect, it } from "vitest";
import { isReviewOverdue, matchesConsoleFilters, type ListedMeetingPoint } from "./console-list.ts";
import { searchTextFor } from "./search.ts";

const point: ListedMeetingPoint = {
  status: "active",
  region: "south",
  type: "fuel-station",
  seasonStartMonth: null,
  seasonEndMonth: null,
  reviewDueOn: "2027-06-01",
  searchText: searchTextFor(["Olís Hveragerði", "Olis Hveragerdi", "Hveragerði"]),
};

// 17 November 2026: month 11.
const now = { month: 11, today: "2026-11-17" };

describe("matchesConsoleFilters (spec 2, 3.6.1)", () => {
  it("matches every point without filters", () => {
    expect(matchesConsoleFilters(point, {}, now)).toBe(true);
  });

  it.each([
    [{ status: "active" }, true],
    [{ status: "draft" }, false],
    [{ region: "south" }, true],
    [{ region: "west" }, false],
    [{ type: "fuel-station" }, true],
    [{ type: "bus-hub" }, false],
  ] as const)("filters by status, region and type: %j", (filters, matches) => {
    expect(matchesConsoleFilters(point, filters, now)).toBe(matches);
  });

  it("finds a point by any of its names as typed, accents or not (R2.6)", () => {
    expect(matchesConsoleFilters(point, { q: "hverager" }, now)).toBe(true);
    expect(matchesConsoleFilters(point, { q: "HVERAGERÐI" }, now)).toBe(true);
    expect(matchesConsoleFilters(point, { q: "olis hv" }, now)).toBe(true);
    expect(matchesConsoleFilters(point, { q: "selfoss" }, now)).toBe(false);
    // Only spaces or signs: no filter.
    expect(matchesConsoleFilters(point, { q: " - " }, now)).toBe(true);
  });

  it("filters by season: all year, in season this month, or out of season this month", () => {
    const summer = { ...point, seasonStartMonth: 5, seasonEndMonth: 9 };
    const winter = { ...point, seasonStartMonth: 10, seasonEndMonth: 4 };
    expect(matchesConsoleFilters(point, { season: "all-year" }, now)).toBe(true);
    expect(matchesConsoleFilters(summer, { season: "all-year" }, now)).toBe(false);
    expect(matchesConsoleFilters(summer, { season: "out-of-season" }, now)).toBe(true);
    expect(matchesConsoleFilters(summer, { season: "in-season" }, now)).toBe(false);
    expect(matchesConsoleFilters(winter, { season: "in-season" }, now)).toBe(true);
    // A point in use all year is never out of season.
    expect(matchesConsoleFilters(point, { season: "out-of-season" }, now)).toBe(false);
    expect(matchesConsoleFilters(point, { season: "in-season" }, now)).toBe(true);
  });

  it("filters points whose yearly review is overdue (R2.9)", () => {
    const overdue = { ...point, reviewDueOn: "2026-11-16" };
    expect(matchesConsoleFilters(overdue, { reviewOverdue: true }, now)).toBe(true);
    expect(matchesConsoleFilters(point, { reviewOverdue: true }, now)).toBe(false);
  });

  it("needs every filter given to match", () => {
    expect(matchesConsoleFilters(point, { status: "active", region: "west" }, now)).toBe(false);
    expect(
      matchesConsoleFilters(point, { status: "active", region: "south", q: "olis" }, now),
    ).toBe(true);
  });
});

describe("isReviewOverdue (R2.9)", () => {
  it("is overdue from the day after the review was due", () => {
    expect(isReviewOverdue("2026-11-17", "2026-11-17")).toBe(false);
    expect(isReviewOverdue("2026-11-16", "2026-11-17")).toBe(true);
  });

  it("is never overdue without a review date, as for a draft", () => {
    expect(isReviewOverdue(null, "2026-11-17")).toBe(false);
  });
});
