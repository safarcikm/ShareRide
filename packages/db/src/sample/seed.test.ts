import { describe, expect, it } from "vitest";
import { samplePlaces, samplePoints, sampleRoads } from "./meeting-points.ts";
import { sampleId } from "./seed.ts";

describe("sampleId", () => {
  it("gives the same version 8 UUID for the same key, and another for another key", () => {
    expect(sampleId("point:bsi")).toBe(sampleId("point:bsi"));
    expect(sampleId("point:bsi")).not.toBe(sampleId("point:kef"));
    expect(sampleId("point:bsi")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("the sample data", () => {
  it("has unique keys", () => {
    const keys = [...samplePoints, ...samplePlaces].map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("connects every sample point by road, and names only known points or junctions", () => {
    const points = new Set(samplePoints.map((point) => point.key));
    const ends = new Set(sampleRoads.flatMap(([from, to]) => [from, to]));
    for (const point of points) expect(ends).toContain(point);
    for (const end of ends) expect(points.has(end) || end.startsWith("junction-")).toBe(true);
  });

  it("keeps every position in Iceland", () => {
    for (const { position } of [...samplePoints, ...samplePlaces]) {
      expect(position.latitude).toBeGreaterThan(63.2);
      expect(position.latitude).toBeLessThan(66.6);
      expect(position.longitude).toBeGreaterThan(-24.6);
      expect(position.longitude).toBeLessThan(-13.4);
    }
  });
});
