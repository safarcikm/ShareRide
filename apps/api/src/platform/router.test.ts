import { samplePoints } from "@shareride/db/seed";
import { describe, expect, it } from "vitest";
import { createRoadFileRouter, createStraightLineRouter } from "./router.ts";

const at = (key: string) => {
  const point = samplePoints.find((sample) => sample.key === key);
  if (point === undefined) throw new Error(`No sample point ${key}.`);
  return point.position;
};
// In the sea west of Reykjavík, 3 km from any road.
const sea = { latitude: 64.15, longitude: -22.1 };

describe("the road file router", () => {
  const router = createRoadFileRouter();

  it("names the map data its legs come from", async () => {
    const mapData = await router.mapData();
    expect(mapData.source).toMatch(/^road file 2026-/);
    expect(mapData.mapDate).toMatch(/^2026-/);
    expect(mapData.attribution).toMatch(/© OpenStreetMap contributors/);
  });

  it("finds legs both ways between real meeting points", async () => {
    const [toBorgarnes, toSea] = await router.legsFrom(at("bsi"), [at("borgarnes"), sea]);
    expect(toBorgarnes?.distanceM).toBeGreaterThan(70_000);
    expect(toBorgarnes?.distanceM).toBeLessThan(80_000);
    expect(toSea).toBeNull();
    const [fromBorgarnes] = await router.legsTo(at("bsi"), [at("borgarnes")]);
    expect(fromBorgarnes?.distanceM).toBeGreaterThan(70_000);
  });

  it("knows which places are near a road", async () => {
    expect(await router.nearRoad(at("kef"))).toBe(true);
    expect(await router.nearRoad(sea)).toBe(false);
    expect(await router.legsFrom(sea, [at("bsi")])).toEqual([null]);
    expect(await router.legsTo(sea, [at("bsi")])).toEqual([null]);
  });

  it("loads the file once, and again after a failure", async () => {
    let loads = 0;
    const failing = createRoadFileRouter(() => {
      loads += 1;
      return Promise.reject(new Error("No file."));
    });
    await expect(failing.mapData()).rejects.toThrow("No file.");
    await expect(failing.mapData()).rejects.toThrow("No file.");
    expect(loads).toBe(2);
  });
});

describe("the straight line router", () => {
  it("goes a quarter further than the straight line, at 60 km/h", async () => {
    const router = createStraightLineRouter();
    const [leg] = await router.legsFrom({ latitude: 64, longitude: -22 }, [
      { latitude: 64.1, longitude: -22 },
    ]);
    // 11.12 km in a straight line.
    expect(leg).toEqual({ distanceM: 13_899, durationS: 834 });
    expect((await router.mapData()).source).toBe("straight lines");
  });

  it("finds no leg to or from a place it is told has no road", async () => {
    const router = createStraightLineRouter({ offRoad: (position) => position.latitude < 63 });
    const island = { latitude: 62.9, longitude: -20 };
    const town = { latitude: 64, longitude: -22 };
    expect(await router.legsFrom(town, [island, town])).toEqual([
      null,
      { distanceM: 1, durationS: 1 },
    ]);
    expect(await router.legsTo(island, [town])).toEqual([null]);
    expect(await router.nearRoad(island)).toBe(false);
  });
});
