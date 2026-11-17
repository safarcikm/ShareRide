import { readRoadFile, type RoadFile } from "@shareride/domain";
import { describe, expect, it } from "vitest";
import { createRoadFileBuilder } from "./build.ts";

const mapDate = "2026-11-16T21:21:02Z";

// Nodes in a made-up corner of Iceland, a hundredth of a degree apart:
// about 486 m east-west and 1.1 km north-south at 64.1° north.
const node = (id: number, longitude: number, latitude: number) =>
  `n${String(id)} T x${longitude.toFixed(7)} y${latitude.toFixed(7)}`;
const way = (id: number, tags: string, refs: readonly number[]) =>
  `w${String(id)} T${tags} N${refs.map((ref) => `n${String(ref)}`).join(",")}`;

/** A road along the 64.1° parallel, from node 1 at 21.9° W eastwards. */
const row = (ids: readonly number[]) => ids.map((id, at) => node(id, -21.9 + at * 0.01, 64.1));

function build(lines: readonly string[], options = {}): RoadFile {
  const builder = createRoadFileBuilder();
  for (const line of lines) builder.add(line);
  return builder.finish({ mapDate, minNetworkM: 0, ...options }).file;
}

describe("the road file builder", () => {
  it("keeps the roads cars may use and leaves out the rest", () => {
    const kinds = [
      "highway=primary,ref=1",
      "highway=primary,ref=F35", // a mountain road
      "highway=secondary,name=Gamli%20%vegur", // a name with an escaped space
      "highway=service",
      "highway=track",
      "highway=residential,access=private",
      "highway=unclassified,motor_vehicle=no",
      "highway=unclassified,access=no,motorcar=yes",
      "highway=pedestrian,area=yes",
      "highway=tertiary,area=yes",
      "route=ferry",
    ];
    const lines = kinds.flatMap((tags, index) => {
      const first = index * 10 + 1;
      return [
        node(first, -21.9, 64.1 + index * 0.01),
        node(first + 1, -21.89, 64.1 + index * 0.01),
        way(index + 1, tags, [first, first + 1]),
      ];
    });
    const file = build(lines);
    // The primary road, the secondary road with the escaped name, and the
    // road open to cars by `motorcar=yes`.
    expect(file.edges).toHaveLength(3);
    expect(file.format).toBe(1);
    expect(file.mapDate).toBe(mapDate);
    expect(file.source).toMatch(/OpenStreetMap contributors/);
  });

  it("splits roads where they meet and keeps the points between", () => {
    // Way 1 runs east through nodes 1 to 5; way 2 goes north from node 3.
    const lines = [
      ...row([1, 2, 3, 4, 5]),
      node(6, -21.88, 64.12),
      way(1, "highway=primary", [1, 2, 3, 4, 5]),
      way(2, "highway=secondary", [3, 6]),
    ];
    const graph = readRoadFile(build(lines, { simplifyM: 0 }));
    // Junctions and ends: 1, 3, 5 and 6.
    expect(graph.nodeCount).toBe(4);
    expect(graph.edges).toHaveLength(3);
    const lengths = graph.edges.map((edge) => edge.lengthM).sort((a, b) => a - b);
    // Two stretches of two hundredths of a degree east, one of 0.02° north.
    expect(lengths[0]).toBeCloseTo(971, -1);
    expect(lengths[1]).toBeCloseTo(971, -1);
    expect(lengths[2]).toBeCloseTo(2224, -1);
    // Each east stretch keeps the point between its ends.
    const east = graph.edges.filter((edge) => edge.shape.length === 6);
    expect(east).toHaveLength(2);
  });

  it("measures the whole road but keeps only the points the shape needs", () => {
    const ids = Array.from({ length: 11 }, (_, at) => at + 1);
    const lines = [...row(ids), way(1, "highway=primary", ids)];
    const graph = readRoadFile(build(lines, { simplifyM: 5 }));
    expect(graph.edges).toHaveLength(1);
    // A straight road needs only its ends.
    expect(graph.edges[0]?.shape).toHaveLength(4);
    expect(graph.edges[0]?.lengthM).toBeCloseTo(4855, -1);
  });

  it("estimates a typical speed from the speed limit, the road class and its surface", () => {
    const speeds = (tags: string) => {
      const file = build([...row([1, 2]), way(1, tags, [1, 2])]);
      return file.edges[0]?.[3];
    };
    expect(speeds("highway=primary")).toBe(90);
    expect(speeds("highway=primary,maxspeed=70")).toBe(70);
    expect(speeds("highway=primary,maxspeed=IS:urban")).toBe(50);
    expect(speeds("highway=secondary,maxspeed=IS:rural")).toBe(80);
    expect(speeds("highway=tertiary")).toBe(70);
    expect(speeds("highway=unclassified,surface=gravel")).toBe(60);
    expect(speeds("highway=primary,surface=unpaved")).toBe(60);
    expect(speeds("highway=residential")).toBe(30);
    expect(speeds("highway=residential,maxspeed=50")).toBe(30);
    expect(speeds("highway=living_street")).toBe(10);
    expect(speeds("highway=trunk_link")).toBe(50);
    expect(speeds("highway=primary,maxspeed=signals")).toBe(90);
  });

  it("keeps the direction of one-way roads", () => {
    const direction = (tags: string) => {
      const file = build([...row([1, 2]), way(1, tags, [1, 2])]);
      const graph = readRoadFile(file);
      const edge = graph.edges[0];
      if (edge === undefined) return "none";
      if (!edge.oneWay) return "both";
      // Node 1 is the western end.
      return (edge.shape[0] ?? 0) < (edge.shape[2] ?? 0) ? "east" : "west";
    };
    expect(direction("highway=primary")).toBe("both");
    expect(direction("highway=primary,oneway=yes")).toBe("east");
    expect(direction("highway=primary,oneway=-1")).toBe("west");
    expect(direction("highway=primary,junction=roundabout")).toBe("east");
    expect(direction("highway=motorway")).toBe("east");
    expect(direction("highway=motorway,oneway=no")).toBe("both");
  });

  it("leaves out small networks of roads joined to nothing else", () => {
    const lines = [
      ...row([1, 2, 3]),
      way(1, "highway=primary", [1, 2, 3]),
      node(11, -20, 64.5),
      node(12, -20.001, 64.5),
      way(2, "highway=residential", [11, 12]),
    ];
    const builder = createRoadFileBuilder();
    for (const line of lines) builder.add(line);
    const { file, summary } = builder.finish({ mapDate, minNetworkM: 500 });
    expect(file.edges).toHaveLength(1);
    expect(summary.leftOutNetworks).toBe(1);
  });

  it("writes coordinates that read back to the same places", () => {
    const lines = [
      node(1, -21.9358913, 64.1265432),
      node(2, -21.9301, 64.13),
      node(3, -21.92, 64.1302),
      way(1, "highway=primary", [1, 2, 3]),
    ];
    const graph = readRoadFile(build(lines, { simplifyM: 0 }));
    expect(Array.from(graph.edges[0]?.shape ?? [])).toEqual([
      expect.closeTo(-21.93589, 5),
      expect.closeTo(64.12654, 5),
      expect.closeTo(-21.9301, 5),
      expect.closeTo(64.13, 5),
      expect.closeTo(-21.92, 5),
      expect.closeTo(64.1302, 5),
    ]);
  });

  it("skips a road whose points the data does not have", () => {
    const lines = [...row([1, 2]), way(1, "highway=primary", [1, 2, 99])];
    const builder = createRoadFileBuilder();
    for (const line of lines) builder.add(line);
    const { file, summary } = builder.finish({ mapDate, minNetworkM: 0 });
    expect(file.edges).toHaveLength(0);
    expect(summary.incompleteWays).toBe(1);
  });
});
