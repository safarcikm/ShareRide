import { describe, expect, it } from "vitest";
import { metresBetween, readRoadFile, type RoadFile } from "./road-file.ts";
import { joinRoad, legsFrom } from "./routing.ts";

// A made-up corner of roads, in 1e-5 degrees: A and B on a fast road, B on to
// C one way only, B up to D, and a slow gravel road straight from A to D.
// E and F are a road of their own, not joined to the rest.
//
//          G
//          |
//          D
//         /|
//  gravel/ |
//       /  |
//      A---B--->C        E---F
const at = (longitude: number, latitude: number) => [
  Math.round(longitude / 1e-5),
  Math.round(latitude / 1e-5),
];
const points = [
  at(-21.9, 64.1), // A 0
  at(-21.8, 64.1), // B 1
  at(-21.7, 64.1), // C 2
  at(-21.8, 64.2), // D 3
  at(-21.0, 64.1), // E 4
  at(-20.9, 64.1), // F 5
  at(-21.8, 64.25), // G 6, on north from D
];
const nodes = points.flatMap(([x, y], index) => {
  const [px, py] = index === 0 ? [0, 0] : (points[index - 1] ?? [0, 0]);
  return [(x ?? 0) - (px ?? 0), (y ?? 0) - (py ?? 0)];
});

const file: RoadFile = {
  format: 1,
  mapDate: "2026-11-16T21:21:02Z",
  source: "© OpenStreetMap contributors",
  nodes,
  edges: [
    [0, 1, 4880, 90, 0, []],
    [1, 2, 4880, 90, 1, []],
    // B to D bends east on the way: one point between.
    [1, 3, 11_500, 60, 0, [1000, 5000]],
    [0, 3, 12_500, 20, 0, []],
    [4, 5, 4880, 50, 0, []],
    [3, 6, 5560, 90, 0, []],
  ],
};

const graph = readRoadFile(file);

describe("readRoadFile", () => {
  it("reads the nodes, the roads' shapes and their driving times", () => {
    expect(graph.nodeCount).toBe(7);
    expect(graph.mapDate).toBe("2026-11-16T21:21:02Z");
    const bend = graph.edges[2];
    expect(Array.from(bend?.shape ?? [])).toEqual([
      expect.closeTo(-21.8, 6),
      expect.closeTo(64.1, 6),
      expect.closeTo(-21.79, 6),
      expect.closeTo(64.15, 6),
      expect.closeTo(-21.8, 6),
      expect.closeTo(64.2, 6),
    ]);
    // 4.88 km at 90 km/h.
    expect(graph.edges[0]?.durationS).toBeCloseTo(195.2, 6);
    expect(graph.edges[1]?.oneWay).toBe(true);
    expect(graph.touching[1]).toEqual([0, 1, 2]);
  });

  it("refuses a file it cannot read", () => {
    expect(() => readRoadFile({ ...file, format: 2 as 1 })).toThrow(/format/);
    expect(() => readRoadFile({ ...file, edges: [[0, 9, 10, 50, 0, []]] })).toThrow(/node/);
    expect(() => readRoadFile({ ...file, edges: [[0, 1, 0, 50, 0, []]] })).toThrow(/length/);
  });
});

describe("metresBetween", () => {
  it("measures along the earth", () => {
    // A tenth of a degree of longitude at 64.1° north.
    expect(
      metresBetween({ latitude: 64.1, longitude: -21.9 }, { latitude: 64.1, longitude: -21.8 }),
    ).toBeCloseTo(4855, -1);
  });
});

describe("joinRoad", () => {
  it("joins the nearest road, part of the way along it", () => {
    const joined = joinRoad(graph, { latitude: 64.101, longitude: -21.875 });
    expect(joined?.edge).toBe(0);
    expect(joined?.along).toBeCloseTo(0.25, 3);
    expect(joined?.metresFromRoad).toBeCloseTo(111, 0);
  });

  it("follows a road's bends", () => {
    const joined = joinRoad(graph, { latitude: 64.15, longitude: -21.789 });
    expect(joined?.edge).toBe(2);
    expect(joined?.along).toBeCloseTo(0.5, 2);
  });

  it("joins no road more than a kilometre away", () => {
    expect(joinRoad(graph, { latitude: 64.12, longitude: -21.5 })).toBeNull();
  });
});

describe("legsFrom", () => {
  const near = (latitude: number, longitude: number) => {
    const joined = joinRoad(graph, { latitude, longitude });
    if (joined === null) throw new Error("No road near the test point.");
    return joined;
  };
  const a = near(64.1, -21.9);
  const c = near(64.1, -21.7);
  const d = near(64.2, -21.8);
  const e = near(64.1, -21.0);
  const g = near(64.25, -21.8);

  it("takes the fastest way, not the shortest, and gives its distance", () => {
    const [toD, toG] = legsFrom(graph, a, [d, g]);
    // A to B to D (4.88 + 11.5 km) beats the slow gravel road (12.5 km)...
    expect(toD).toEqual({ distanceM: 16_380, durationS: Math.round(195.2 + 690) });
    // ...and so on to G.
    expect(toG).toEqual({ distanceM: 21_940, durationS: Math.round(195.2 + 690 + 222.4) });
  });

  it("drives one-way roads only their way", () => {
    expect(legsFrom(graph, a, [c])).toEqual([{ distanceM: 9760, durationS: 390 }]);
    expect(legsFrom(graph, c, [a])).toEqual([null]);
  });

  it("finds no leg to a road of its own", () => {
    expect(legsFrom(graph, a, [e, d])).toEqual([null, expect.objectContaining({})]);
  });

  it("measures between two points on the same road", () => {
    const first = { edge: 0, along: 0.2, metresFromRoad: 0 };
    const second = { edge: 0, along: 0.7, metresFromRoad: 0 };
    expect(legsFrom(graph, first, [second])).toEqual([{ distanceM: 2440, durationS: 98 }]);
    expect(legsFrom(graph, second, [first])).toEqual([{ distanceM: 2440, durationS: 98 }]);
    const oneWayAhead = { edge: 1, along: 0.6, metresFromRoad: 0 };
    const oneWayBehind = { edge: 1, along: 0.1, metresFromRoad: 0 };
    expect(legsFrom(graph, oneWayBehind, [oneWayAhead])).toEqual([
      { distanceM: 2440, durationS: 98 },
    ]);
    expect(legsFrom(graph, oneWayAhead, [oneWayBehind])).toEqual([null]);
  });

  it("gives at least a metre and a second", () => {
    expect(legsFrom(graph, a, [a])).toEqual([{ distanceM: 1, durationS: 1 }]);
  });
});
