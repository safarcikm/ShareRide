import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { defaultTripSettings as settings } from "./settings.ts";
import { checkTimes, plannedTimes, stopTimeBetween } from "./times.ts";

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

describe("stopTimeBetween (spec 6, 3.2: a stop added to a published trip)", () => {
  const place = (before: string, after: string, thereS: number, onwardsS: number) => {
    const time = stopTimeBetween(at(before), at(after), thereS, onwardsS, settings);
    return time === undefined ? undefined : clock([time])[0];
  };

  it("shares the time between the neighbours by the typical times, rounded to 5 minutes", () => {
    // 2 hours between 10:00 and 12:00; 30 and 60 minutes typical: a third of the way.
    expect(place("10:00", "12:00", minutes(30), minutes(60))).toBe("10:40");
    // Half way on a 70-minute stretch is 10:35, already on 5 minutes.
    expect(place("10:00", "11:10", minutes(30), minutes(30))).toBe("10:35");
  });

  it("rounds the other way, or to the minute, when 5 minutes would ask for speeding (R3.6)", () => {
    // About 10:58 rounds to 11:00, which leaves under 90% of the 12 minutes
    // on; 10:55 leaves enough each way.
    expect(place("10:00", "11:10", minutes(60), 733)).toBe("10:55");
    // From 10:11 to 10:13 fits, and no time on 5 minutes does: the nearest minute.
    expect(place("10:00", "10:24", 733, 667)).toBe("10:13");
  });

  it("does not fit when the new stretches need more than the gap (R3.6's 90%)", () => {
    // 100 minutes between; 60 and 60 typical need at least 54 each.
    expect(place("10:00", "11:40", minutes(60), minutes(60))).toBeUndefined();
    // Exactly 90% of each fits.
    expect(place("10:00", "11:48", minutes(60), minutes(60))).toBe("10:54");
  });

  it("always places a time that passes the checks, or none", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: minutes(300) }),
        fc.integer({ min: 0, max: minutes(200) }),
        fc.integer({ min: 0, max: minutes(200) }),
        (gapS, thereS, onwardsS) => {
          const before = at("10:00");
          const after = new Date(before.getTime() + gapS * 1000);
          const time = stopTimeBetween(before, after, thereS, onwardsS, settings);
          if (time === undefined) {
            // None only when no whole minute leaves 90% each way.
            const earliest =
              before.getTime() + Math.max(Math.ceil(thereS * 10 * settings.timeFloorPercent), 1);
            const latest =
              after.getTime() - Math.max(Math.ceil(onwardsS * 10 * settings.timeFloorPercent), 1);
            expect(Math.ceil(earliest / 60_000) * 60_000).toBeGreaterThan(latest);
            return;
          }
          expect(time.getTime() % 60_000).toBe(0);
          expect(
            checkTimes([before, time, after], [thereS, onwardsS], now, settings).problems,
          ).toEqual([]);
        },
      ),
    );
  });
});
