import { describe, expect, it } from "vitest";
import { metricsCsv, metricsCsvHeader } from "./csv.ts";
import { emptyWeekMetrics, metricKeys } from "./weekly.ts";

const week = { year: 2026, week: 46 };

describe("metricsCsv", () => {
  it("has a line per metric of each counted week, under the header", () => {
    const csv = metricsCsv("all", [
      { week, metrics: { ...emptyWeekMetrics, seat_fill: { numerator: 30, denominator: 100 } } },
      { week: { year: 2026, week: 47 }, metrics: null },
    ]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(metricsCsvHeader);
    expect(lines).toHaveLength(1 + metricKeys.length);
    expect(lines).toContain('2026-W46,2026-11-09,"all",seat_fill,30,100');
    expect(lines).toContain('2026-W46,2026-11-09,"all",searches,0,');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("says <5 for a figure about fewer than 5 people, and leaves other small figures", () => {
    const csv = metricsCsv("South", [
      {
        week,
        metrics: {
          ...emptyWeekMetrics,
          active_drivers: { numerator: 4, denominator: null },
          active_passengers: { numerator: 5, denominator: null },
          repeat_passengers: { numerator: 1, denominator: 3 },
          trips_posted: { numerator: 2, denominator: null },
        },
      },
    ]);
    expect(csv).toContain(",active_drivers,<5,\r\n");
    expect(csv).toContain(",active_passengers,5,\r\n");
    expect(csv).toContain(",repeat_passengers,<5,<5\r\n");
    expect(csv).toContain(",trips_posted,2,\r\n");
  });

  it("quotes the corridor's name", () => {
    expect(metricsCsv('The "south", east', [{ week, metrics: emptyWeekMetrics }])).toContain(
      ',"The ""south"", east",',
    );
  });
});
