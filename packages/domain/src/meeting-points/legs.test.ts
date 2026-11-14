import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { legsFromRoadGraph, type RoadEdge } from "./legs.ts";

// Reykjavík (A), Borgarnes (B), Blönduós (C), Akureyri (D), as in the worked
// example of pricing and seats, with a side road from B to Stykkishólmur (S).
const edges: RoadEdge[] = [
  { from: "A", to: "B", distanceM: 74_000, durationS: 3_600 },
  { from: "B", to: "C", distanceM: 171_000, durationS: 7_800 },
  { from: "C", to: "D", distanceM: 143_000, durationS: 6_600 },
  { from: "B", to: "S", distanceM: 98_000, durationS: 4_500 },
];

describe("legsFromRoadGraph (spec 2, section 3.7, with a sample road graph)", () => {
  const legs = legsFromRoadGraph(edges);
  const leg = (from: string, to: string) =>
    legs.find((candidate) => candidate.from === from && candidate.to === to);

  it("adds up the road between two points", () => {
    expect(leg("A", "D")).toEqual({ from: "A", to: "D", distanceM: 388_000, durationS: 18_000 });
    expect(leg("S", "C")).toEqual({ from: "S", to: "C", distanceM: 269_000, durationS: 12_300 });
  });

  it("gives a leg each way for every pair connected by road, and none to itself", () => {
    expect(legs).toHaveLength(5 * 4);
    expect(leg("D", "A")).toMatchObject({ distanceM: 388_000 });
    expect(leg("A", "A")).toBeUndefined();
  });

  it("leaves out points with no road between them", () => {
    const island = legsFromRoadGraph([
      ...edges,
      { from: "V", to: "W", distanceM: 5_000, durationS: 600 },
    ]);
    expect(
      island.find((candidate) => candidate.from === "A" && candidate.to === "V"),
    ).toBeUndefined();
    expect(
      island.find((candidate) => candidate.from === "V" && candidate.to === "W"),
    ).toBeDefined();
  });

  it("takes the shorter of two roads", () => {
    const shortcut = legsFromRoadGraph([
      ...edges,
      { from: "A", to: "C", distanceM: 200_000, durationS: 9_000 },
    ]);
    expect(
      shortcut.find((candidate) => candidate.from === "A" && candidate.to === "C"),
    ).toMatchObject({
      distanceM: 200_000,
      durationS: 9_000,
    });
  });

  it("never makes a detour shorter than the direct leg", () => {
    const point = fc.constantFrom("A", "B", "C", "D", "S");
    fc.assert(
      fc.property(point, point, point, (from, via, to) => {
        if (from === to || via === from || via === to) return;
        const direct = leg(from, to)?.distanceM ?? 0;
        const detour = (leg(from, via)?.distanceM ?? 0) + (leg(via, to)?.distanceM ?? 0);
        expect(detour).toBeGreaterThanOrEqual(direct);
      }),
    );
  });
});
