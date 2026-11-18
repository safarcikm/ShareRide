import { describe, expect, it } from "vitest";
import { checkCorridor, onCorridor } from "./corridors.ts";

const [reykjavik, hveragerdi, selfoss, akranes] = ["r", "h", "s", "a"];
const south = { placeIds: [reykjavik, hveragerdi, selfoss] };

describe("checkCorridor", () => {
  it("takes a name and two places or more, and trims the name", () => {
    expect(checkCorridor({ name: "  South  ", placeIds: ["r", "s"] })).toEqual({
      ok: true,
      value: { name: "South", placeIds: ["r", "s"] },
    });
  });

  it("refuses a missing or long name", () => {
    expect(checkCorridor({ name: "  ", placeIds: ["r", "s"] })).toEqual({
      ok: false,
      error: { code: "name_missing" },
    });
    expect(checkCorridor({ name: "x".repeat(81), placeIds: ["r", "s"] })).toEqual({
      ok: false,
      error: { code: "name_too_long" },
    });
  });

  it("refuses fewer than 2 places, more than 12, and a place twice", () => {
    expect(checkCorridor({ name: "South", placeIds: ["r"] })).toEqual({
      ok: false,
      error: { code: "too_few_places" },
    });
    const many = Array.from({ length: 13 }, (_, index) => String(index));
    expect(checkCorridor({ name: "South", placeIds: many })).toEqual({
      ok: false,
      error: { code: "too_many_places" },
    });
    expect(checkCorridor({ name: "South", placeIds: ["r", "s", "r"] })).toEqual({
      ok: false,
      error: { code: "place_twice" },
    });
  });
});

describe("onCorridor", () => {
  it("holds when both ends are places on it, in either direction", () => {
    expect(onCorridor(south, [reykjavik], [selfoss])).toBe(true);
    expect(onCorridor(south, [selfoss], [hveragerdi])).toBe(true);
  });

  it("does not hold when an end is off it", () => {
    expect(onCorridor(south, [reykjavik], [akranes])).toBe(false);
    expect(onCorridor(south, [], [selfoss])).toBe(false);
  });

  it("counts a meeting point as each place that covers it", () => {
    expect(onCorridor(south, [akranes, reykjavik], [selfoss])).toBe(true);
  });

  it("needs two different places: a trip inside one town is on no corridor", () => {
    expect(onCorridor(south, [reykjavik], [reykjavik])).toBe(false);
    expect(onCorridor(south, [reykjavik, hveragerdi], [reykjavik])).toBe(true);
  });
});
