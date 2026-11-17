// Checks the road file in the repository (ADR 0030): real distances, and
// that every sample meeting point still gets its legs.
import { joinRoad, legsFrom, type RoadGraph, type RoadPosition } from "@shareride/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { samplePoints } from "../sample/meeting-points.ts";
import { loadRoadGraph } from "./load.ts";

let graph: RoadGraph;
beforeAll(async () => {
  graph = await loadRoadGraph();
});

const town = {
  reykjavik: { latitude: 64.1466, longitude: -21.9426 }, // the city hall
  akureyri: { latitude: 65.6835, longitude: -18.0878 },
  selfoss: { latitude: 63.9331, longitude: -20.9971 },
  borgarnes: { latitude: 64.5383, longitude: -21.9206 },
  vik: { latitude: 63.4186, longitude: -19.006 },
  egilsstadir: { latitude: 65.2653, longitude: -14.3948 },
  isafjordur: { latitude: 66.0748, longitude: -23.135 },
} as const;

const joined = (place: keyof typeof town): RoadPosition => {
  const position = joinRoad(graph, town[place]);
  if (position === null) throw new Error(`No road near ${place}.`);
  return position;
};

const kmBetween = (from: keyof typeof town, to: keyof typeof town) => {
  const [leg] = legsFrom(graph, joined(from), [joined(to)]);
  return (leg?.distanceM ?? 0) / 1000;
};

/** Within `share` of `expected`, either way. */
const within = (actual: number, expected: number, share: number) =>
  Math.abs(actual - expected) <= expected * share;

describe("the road file of Iceland", () => {
  it("is recent OpenStreetMap data with its attribution", () => {
    expect(Date.parse(graph.mapDate)).toBeGreaterThan(Date.parse("2026-01-01"));
    expect(graph.source).toMatch(/© OpenStreetMap contributors/);
  });

  it("puts Akureyri 390 km from Reykjavík by road, both ways", () => {
    // "Reykjavík, which is 390 kilometres away" (Wikipedia, Akureyri). The
    // road authority's own table of distances was not online to check.
    expect(within(kmBetween("reykjavik", "akureyri"), 390, 0.03)).toBe(true);
    expect(within(kmBetween("akureyri", "reykjavik"), 390, 0.03)).toBe(true);
  });

  it("keeps the distances of the first file, to within 3%", () => {
    // Computed on the first file (OpenStreetMap data of 16 November 2026).
    // A new file or a change to the builder that moves one by more than 3%
    // needs a look before it is committed.
    const first = {
      selfoss: 58.8,
      borgarnes: 75.5,
      vik: 186.9,
      egilsstadir: 622.5,
      isafjordur: 413.9,
    } as const;
    for (const [place, km] of Object.entries(first)) {
      const actual = kmBetween("reykjavik", place as keyof typeof first);
      expect({ place, km: actual, close: within(actual, km, 0.03) }).toEqual({
        place,
        km: actual,
        close: true,
      });
    }
  });

  it("joins every sample meeting point to a road and connects every pair", () => {
    const joins = samplePoints.map((point) => ({
      key: point.key,
      position: joinRoad(graph, point.position),
    }));
    expect(joins.filter((join) => join.position === null).map((join) => join.key)).toEqual([]);
    const onRoad = joins.flatMap(({ key, position }) =>
      position === null ? [] : [{ key, position }],
    );
    const missing: string[] = [];
    for (const start of onRoad) {
      const ends = onRoad.filter((end) => end !== start);
      legsFrom(
        graph,
        start.position,
        ends.map((end) => end.position),
      ).forEach((leg, index) => {
        if (leg === null) missing.push(`${start.key} to ${ends[index]?.key ?? "?"}`);
      });
    }
    expect(missing).toEqual([]);
  });
});
