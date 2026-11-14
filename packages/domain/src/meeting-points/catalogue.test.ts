import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isInSeason,
  isOfferedForNewTrips,
  isVisible,
  meetingPointStatuses,
  monthInIceland,
} from "./catalogue.ts";

describe("isInSeason (rule R2.5)", () => {
  it("is always in season without a season", () => {
    for (let month = 1; month <= 12; month += 1) {
      expect(isInSeason({ seasonStartMonth: null, seasonEndMonth: null }, month)).toBe(true);
    }
  });

  it("covers whole months from start to end", () => {
    const summer = { seasonStartMonth: 5, seasonEndMonth: 9 };
    expect([4, 5, 7, 9, 10].map((month) => isInSeason(summer, month))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it("may cross the new year", () => {
    const winter = { seasonStartMonth: 11, seasonEndMonth: 3 };
    expect([10, 11, 12, 1, 3, 4].map((month) => isInSeason(winter, month))).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it("puts every month in exactly one of a season and its opposite", () => {
    const month = fc.integer({ min: 1, max: 12 });
    fc.assert(
      fc.property(month, month, month, (start, end, at) => {
        if (start === (end % 12) + 1) return; // A season of all twelve months has no opposite.
        const season = { seasonStartMonth: start, seasonEndMonth: end };
        const opposite = {
          seasonStartMonth: (end % 12) + 1,
          seasonEndMonth: ((start + 10) % 12) + 1,
        };
        expect(isInSeason(season, at)).not.toBe(isInSeason(opposite, at));
      }),
    );
  });
});

describe("monthInIceland", () => {
  it("takes the month in Iceland time", () => {
    expect(monthInIceland(new Date("2026-11-30T23:59:00Z"))).toBe(11);
    expect(monthInIceland(new Date("2026-12-01T00:00:00Z"))).toBe(12);
  });
});

describe("meeting point status (spec 2, sections 3.1 and 3.6)", () => {
  it("shows active, paused and retiring points, and hides drafts and retired ones", () => {
    expect(meetingPointStatuses.filter(isVisible)).toEqual(["active", "paused", "retiring"]);
  });

  it("offers only active points for new trips (rule R2.4)", () => {
    expect(meetingPointStatuses.filter(isOfferedForNewTrips)).toEqual(["active"]);
  });
});
