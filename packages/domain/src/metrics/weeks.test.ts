import { describe, expect, it } from "vitest";
import {
  addIsoWeeks,
  endOfIsoWeek,
  formatIsoWeek,
  isoWeekOf,
  isoWeeksBetween,
  parseIsoWeek,
  startOfIsoWeek,
  weekStartOf,
} from "./weeks.ts";

const at = (iso: string) => new Date(iso);

describe("ISO weeks in Iceland time", () => {
  it("starts a week on Monday at midnight", () => {
    expect(weekStartOf(at("2026-11-18T10:30:00Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(weekStartOf(at("2026-11-16T00:00:00Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(weekStartOf(at("2026-11-22T23:59:59Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });

  it("numbers a week by the year its Thursday is in", () => {
    expect(isoWeekOf(at("2026-11-18T10:30:00Z"))).toEqual({ year: 2026, week: 47 });
    // Thursday 1 January 2026: week 1 starts on Monday 29 December 2025.
    expect(isoWeekOf(at("2025-12-29T00:00:00Z"))).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOf(at("2025-12-28T23:59:59Z"))).toEqual({ year: 2025, week: 52 });
    // 2026 has 53 weeks: 1 January 2027 is a Friday.
    expect(isoWeekOf(at("2027-01-01T12:00:00Z"))).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf(at("2027-01-04T00:00:00Z"))).toEqual({ year: 2027, week: 1 });
  });

  it("gives a week's start and end, and the weeks around it", () => {
    const week = { year: 2026, week: 47 };
    expect(startOfIsoWeek(week).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(endOfIsoWeek(week).toISOString()).toBe("2026-11-23T00:00:00.000Z");
    expect(addIsoWeeks(week, -2)).toEqual({ year: 2026, week: 45 });
    expect(addIsoWeeks({ year: 2026, week: 53 }, 1)).toEqual({ year: 2027, week: 1 });
    expect(addIsoWeeks({ year: 2026, week: 1 }, -1)).toEqual({ year: 2025, week: 52 });
  });

  it("writes and reads a week as 2026-W07", () => {
    expect(formatIsoWeek({ year: 2026, week: 7 })).toBe("2026-W07");
    expect(parseIsoWeek("2026-W07")).toEqual({ year: 2026, week: 7 });
    expect(parseIsoWeek("2026-W53")).toEqual({ year: 2026, week: 53 });
    expect(parseIsoWeek("2025-W53")).toBeNull();
    expect(parseIsoWeek("2026-W00")).toBeNull();
    expect(parseIsoWeek("2026-7")).toBeNull();
  });

  it("lists the weeks between two, across a year's end", () => {
    expect(isoWeeksBetween({ year: 2026, week: 52 }, { year: 2027, week: 2 })).toEqual([
      { year: 2026, week: 52 },
      { year: 2026, week: 53 },
      { year: 2027, week: 1 },
      { year: 2027, week: 2 },
    ]);
    expect(isoWeeksBetween({ year: 2026, week: 3 }, { year: 2026, week: 2 })).toEqual([]);
  });
});
