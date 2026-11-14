import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { defaultTripSettings as settings } from "./settings.ts";
import { checkTimes, plannedTimes } from "./times.ts";

const at = (time: string) => new Date(`2026-12-01T${time}:00.000Z`);
const minutes = (value: number) => value * 60;
const clock = (moments: readonly Date[]) =>
  moments.map((moment) => moment.toISOString().slice(11, 16));
const now = new Date("2026-11-30T12:00:00.000Z");

describe("plannedTimes (spec 3, 3.5.2)", () => {
  it("adds the typical times to the departure, rounded to 5 minutes", () => {
    // 52, 61 and 47 minutes: 10:52 → 10:50, 11:53 → 11:55, 12:40.
    expect(
      clock(plannedTimes(at("10:00"), [minutes(52), minutes(61), minutes(47)], settings)),
    ).toEqual(["10:00", "10:50", "11:55", "12:40"]);
  });

  it("rounds up where rounding down would ask for speeding", () => {
    // 12 minutes to the next stop: 10:10 would be under 90% of it.
    expect(clock(plannedTimes(at("10:00"), [minutes(12)], settings))).toEqual(["10:00", "10:15"]);
    // Two stops 2 minutes apart are still planned at different times.
    expect(clock(plannedTimes(at("10:00"), [minutes(2), minutes(2)], settings))).toEqual([
      "10:00",
      "10:05",
      "10:10",
    ]);
  });

  it("always plans times that pass the checks", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 * 24 * 59 }),
        fc.array(fc.integer({ min: 0, max: minutes(400) }), { minLength: 1, maxLength: 15 }),
        (startMinutes, typicalS) => {
          const departure = new Date(now.getTime() + minutes(30 + startMinutes) * 1000);
          const times = plannedTimes(departure, typicalS, settings);
          expect(times).toHaveLength(typicalS.length + 1);
          expect(times[0]).toEqual(departure);
          expect(checkTimes(times, typicalS, now, settings).problems).toEqual([]);
        },
      ),
    );
  });
});

describe("checkTimes (R3.5, R3.6, spec 3, 3.5.3)", () => {
  const typicalS = [minutes(60), minutes(60)];

  it("accepts times that keep to the typical times", () => {
    expect(checkTimes([at("10:00"), at("11:00"), at("12:00")], typicalS, now, settings)).toEqual({
      problems: [],
      warnings: [],
    });
  });

  it("needs 30 minutes' notice and at most 60 days ahead", () => {
    const soon = new Date(now.getTime() + minutes(29) * 1000);
    expect(
      checkTimes(
        [soon, new Date(soon.getTime() + minutes(60) * 1000)],
        [minutes(60)],
        now,
        settings,
      ).problems,
    ).toEqual([{ code: "departure_too_soon" }]);
    const far = new Date(now.getTime() + 61 * 24 * 3600 * 1000);
    expect(
      checkTimes([far, new Date(far.getTime() + minutes(60) * 1000)], [minutes(60)], now, settings)
        .problems,
    ).toEqual([{ code: "departure_too_far" }]);
  });

  it("refuses a stretch planned under 90% of its typical time, or going back", () => {
    // 54 minutes is 90% of an hour; 53 is under it.
    expect(
      checkTimes([at("10:00"), at("10:54"), at("11:54")], typicalS, now, settings).problems,
    ).toEqual([]);
    expect(
      checkTimes([at("10:00"), at("10:53"), at("11:53")], typicalS, now, settings).problems,
    ).toEqual([{ code: "stretch_too_fast", segment: 0 }]);
    expect(
      checkTimes([at("10:00"), at("11:00"), at("11:00")], typicalS, now, settings).problems,
    ).toEqual([{ code: "times_not_increasing", segment: 1 }]);
  });

  it("warns about a stretch more than 2 hours longer than typical", () => {
    expect(checkTimes([at("10:00"), at("13:01"), at("14:01")], typicalS, now, settings)).toEqual({
      problems: [],
      warnings: [{ code: "long_break", segment: 0 }],
    });
  });

  it("needs a time for every stop", () => {
    expect(checkTimes([at("10:00"), at("11:00")], typicalS, now, settings).problems).toEqual([
      { code: "times_missing" },
    ]);
  });
});
