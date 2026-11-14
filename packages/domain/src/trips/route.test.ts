import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { legsFromRoadGraph, type RoadEdge } from "../meeting-points/legs.ts";
import {
  checkRoute,
  insertionLegPairs,
  insertStop,
  lookUpLegs,
  routeLegPairs,
  stopsOnTheWay,
  stopsOutOfSeason,
  type LegLookup,
} from "./route.ts";
import { defaultTripSettings as settings } from "./settings.ts";

const km = (value: number) => value * 1000;
const road = (from: string, to: string, distanceKm: number, minutes = distanceKm): RoadEdge => ({
  from,
  to,
  distanceM: km(distanceKm),
  durationS: minutes * 60,
});

// A main road A–B–C–D of 200 km, with E 1.5 km off it by C, F 6 km off it by
// B and G past the end beyond D.
const legs = lookUpLegs(
  legsFromRoadGraph([
    road("A", "B", 60),
    road("B", "C", 70),
    road("C", "D", 70),
    road("C", "E", 1.5),
    road("B", "F", 6),
    road("D", "G", 30),
  ]),
);

describe("stopsOnTheWay (spec 3, 3.4.2)", () => {
  it("adds the points on the way in route order, but not the ends", () => {
    // 5% of 200 km is 10 km, so 3 km is the limit: E adds 3 km and F 12 km.
    expect(stopsOnTheWay("A", "D", ["D", "E", "C", "F", "B", "A", "G"], legs, settings)).toEqual({
      ok: true,
      value: ["B", "C", "E"],
    });
  });

  it("allows 5% on a short trip, where 3 km is more", () => {
    const short = lookUpLegs(
      legsFromRoadGraph([
        road("P", "Q", 1),
        road("Q", "R", 9),
        road("Q", "S", 0.25),
        road("Q", "T", 1),
      ]),
    );
    // P to R is 10 km, 5% is 500 m: S adds 500 m, T adds 2 km.
    expect(stopsOnTheWay("P", "R", ["Q", "S", "T"], short, settings)).toEqual({
      ok: true,
      value: ["Q", "S"],
    });
  });

  it("leaves out a point whose distances are not worked out yet", () => {
    expect(stopsOnTheWay("A", "D", ["B", "unknown"], legs, settings)).toEqual({
      ok: true,
      value: ["B"],
    });
  });

  it("needs the distance between the ends", () => {
    expect(stopsOnTheWay("A", "unknown", ["B"], legs, settings)).toEqual({
      ok: false,
      error: { code: "distances_missing", pairs: [["A", "unknown"]] },
    });
  });

  it("puts a point down a side road before the main road beyond it", () => {
    // A main road A–X–Y–B of 100 km, with P 1 km off it at X. Going out to P
    // from X, then on through Y, drives 102 km; P after Y would drive back.
    const sideRoad = lookUpLegs(
      legsFromRoadGraph([
        road("A", "X", 10),
        road("X", "Y", 0.8),
        road("Y", "B", 89.2),
        road("X", "P", 1),
      ]),
    );
    const found = stopsOnTheWay("A", "B", ["Y", "X", "P"], sideRoad, settings);
    expect(found).toEqual({ ok: true, value: ["P", "X", "Y"] });
    if (!found.ok) return;
    expect(checkRoute(["A", ...found.value, "B"], sideRoad, settings)).toMatchObject({
      ok: true,
      value: { distanceM: km(102) },
    });
  });

  it("adds every point within the allowance and no other, in route order", () => {
    const points = ["A", "B", "C", "D", "E", "F", "G"] as const;
    const pick = fc.constantFrom(...points);
    const distance = (from: string, to: string) => legs(from, to)?.distanceM ?? 0;
    fc.assert(
      fc.property(pick, pick, fc.uniqueArray(pick), (from, to, candidates) => {
        fc.pre(from !== to);
        const found = stopsOnTheWay(from, to, candidates, legs, settings);
        if (!found.ok) throw new Error("All the distances are known.");
        const direct = distance(from, to);
        const expected = candidates.filter((stop) => {
          const detour = distance(from, stop) + distance(stop, to) - direct;
          return stop !== from && stop !== to && detour <= 3000 && 100 * detour <= 5 * direct;
        });
        expect([...found.value].sort()).toEqual([...expected].sort());
        // How far along the way a point is: nearer the start, nearer the front.
        const along = found.value.map((stop) => distance(from, stop) - distance(stop, to));
        expect(along).toEqual([...along].sort((a, b) => a - b));
      }),
    );
  });
});

describe("insertStop (spec 3, 3.4.3)", () => {
  it("puts an added point where it adds the least distance", () => {
    expect(insertStop(["A", "B", "D"], "E", legs)).toEqual({
      ok: true,
      value: ["A", "B", "E", "D"],
    });
    expect(insertStop(["A", "C", "D"], "F", legs)).toEqual({
      ok: true,
      value: ["A", "F", "C", "D"],
    });
  });

  it("keeps the first and last stops", () => {
    const inserted = insertStop(["B", "C"], "A", legs);
    expect(inserted).toEqual({ ok: true, value: ["B", "A", "C"] });
  });

  it("does not add a point twice", () => {
    expect(insertStop(["A", "B", "D"], "B", legs)).toEqual({ ok: true, value: ["A", "B", "D"] });
  });
});

describe("checkRoute (R3.2, R3.4, spec 3, 3.4.5)", () => {
  it("adds up the segments and compares with the direct distance", () => {
    const checked = checkRoute(["A", "B", "C", "D"], legs, settings);
    expect(checked).toMatchObject({
      ok: true,
      value: {
        distanceM: km(200),
        durationS: 200 * 60,
        directDistanceM: km(200),
        problems: [],
        warnings: [],
      },
    });
    if (!checked.ok) return;
    expect(checked.value.segments).toEqual([
      { from: "A", to: "B", distanceM: km(60), durationS: 3600 },
      { from: "B", to: "C", distanceM: km(70), durationS: 4200 },
      { from: "C", to: "D", distanceM: km(70), durationS: 4200 },
    ]);
  });

  it("warns about a stop that adds more than 20% and 20 km to its stretch", () => {
    // G adds 60 km to the 70 km from C to D; E adds 3 km, under 20 km.
    expect(checkRoute(["A", "C", "G", "D"], legs, settings)).toMatchObject({
      ok: true,
      value: { problems: [], warnings: [{ code: "stop_adds_distance", stop: 2, addedM: km(60) }] },
    });
    expect(checkRoute(["A", "C", "E", "D"], legs, settings)).toMatchObject({
      ok: true,
      value: { warnings: [] },
    });
  });

  it("refuses a route over 1.5 times the direct distance", () => {
    // 230 + 100 + 70 = 400 km against 200 km direct.
    expect(checkRoute(["A", "G", "C", "D"], legs, settings)).toMatchObject({
      ok: true,
      value: { problems: [{ code: "route_too_long" }] },
    });
  });

  it("needs two stops, each used once", () => {
    expect(checkRoute(["A"], legs, settings)).toMatchObject({
      ok: true,
      value: { problems: [{ code: "too_few_stops" }] },
    });
    expect(checkRoute(["A", "B", "B", "D"], legs, settings)).toMatchObject({
      ok: true,
      value: { problems: [{ code: "stop_repeated", stop: 2 }] },
    });
  });

  it("names the distances that are missing", () => {
    expect(checkRoute(["A", "unknown", "D"], legs, settings)).toEqual({
      ok: false,
      error: {
        code: "distances_missing",
        pairs: [
          ["A", "unknown"],
          ["unknown", "D"],
        ],
      },
    });
  });
});

/** A lookup that remembers every pair it was asked for. */
function recording(lookup: LegLookup) {
  const asked = new Set<string>();
  const legsAsked: LegLookup = (from, to) => {
    if (from !== to) asked.add(`${from} ${to}`);
    return lookup(from, to);
  };
  return { legsAsked, asked };
}

const keys = (pairs: readonly (readonly [string, string])[]) =>
  new Set(pairs.map(([from, to]) => `${from} ${to}`));

describe("routeLegPairs and insertionLegPairs", () => {
  const points = ["A", "B", "C", "D", "E", "F", "G"] as const;
  const route = fc.array(fc.constantFrom(...points), { minLength: 0, maxLength: 7 });

  it("name every leg that checkRoute looks up", () => {
    fc.assert(
      fc.property(route, (stops) => {
        const { legsAsked, asked } = recording(legs);
        checkRoute(stops, legsAsked, settings);
        const named = keys(routeLegPairs(stops));
        expect([...asked].filter((pair) => !named.has(pair))).toEqual([]);
      }),
    );
  });

  it("name every leg that insertStop looks up", () => {
    fc.assert(
      fc.property(route, fc.constantFrom(...points), (stops, stop) => {
        const { legsAsked, asked } = recording(legs);
        insertStop(stops, stop, legsAsked);
        const named = keys(insertionLegPairs(stops, stop));
        expect([...asked].filter((pair) => !named.has(pair))).toEqual([]);
      }),
    );
  });

  it("name each pair once", () => {
    expect(routeLegPairs(["A", "B", "C"])).toEqual([
      ["A", "B"],
      ["A", "C"],
      ["B", "C"],
    ]);
    expect(insertionLegPairs(["A", "B", "C"], "E")).toEqual([
      ["A", "E"],
      ["E", "B"],
      ["A", "B"],
      ["B", "E"],
      ["E", "C"],
      ["B", "C"],
    ]);
  });
});

describe("stopsOutOfSeason (R3.2)", () => {
  const allYear = { seasonStartMonth: null, seasonEndMonth: null };
  const summer = { seasonStartMonth: 6, seasonEndMonth: 9 };
  const winter = { seasonStartMonth: 11, seasonEndMonth: 2 };

  it("names the stops, by position, not in use on the day of departure in Iceland", () => {
    const stops = [allYear, summer, winter];
    expect(stopsOutOfSeason(stops, new Date("2027-07-01T12:00:00Z"))).toEqual([
      { code: "stop_out_of_season", stop: 2 },
    ]);
    expect(stopsOutOfSeason(stops, new Date("2027-01-15T12:00:00Z"))).toEqual([
      { code: "stop_out_of_season", stop: 1 },
    ]);
    // 23:30 on 30 September in Iceland is still September.
    expect(stopsOutOfSeason(stops, new Date("2027-09-30T23:30:00Z"))).toEqual([
      { code: "stop_out_of_season", stop: 2 },
    ]);
  });
});
