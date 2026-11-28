import { describe, expect, it } from "vitest";
import { mapSize, project } from "./projection.ts";
import { dotsNear, viewFor, wholeMap, wideShape } from "./view.ts";

const reykjavik = project({ longitude: -21.86, latitude: 64.13 });
const keflavik = project({ longitude: -22.6, latitude: 63.99 });
const akureyri = project({ longitude: -18.09, latitude: 65.68 });
const vik = project({ longitude: -19.0, latitude: 63.42 });

describe("The part of the map shown", () => {
  it("is the whole of Iceland without points to fit", () => {
    expect(viewFor([])).toEqual(wholeMap);
    expect(wholeMap).toEqual({ x: 0, y: 0, width: mapSize.width, height: mapSize.height });
  });

  it("holds every point with room around them", () => {
    const view = viewFor([reykjavik, akureyri]);
    for (const point of [reykjavik, akureyri]) {
      expect(point.x).toBeGreaterThan(view.x);
      expect(point.x).toBeLessThan(view.x + view.width);
      expect(point.y).toBeGreaterThan(view.y);
      expect(point.y).toBeLessThan(view.y + view.height);
    }
    expect(view.width).toBeLessThan(mapSize.width);
  });

  it("shows at least a region around a short trip, and never a thin strip", () => {
    const short = viewFor([reykjavik, keflavik]);
    expect(short.width).toBeGreaterThanOrEqual(160);
    const ratio = (view: { width: number; height: number }) => view.width / view.height;
    expect(ratio(short)).toBeGreaterThanOrEqual(1);
    expect(ratio(short)).toBeLessThanOrEqual(1.6);
    const southCoast = viewFor([keflavik, vik]);
    expect(ratio(southCoast)).toBeLessThanOrEqual(1.6);
  });

  it("is a band for a wide page's column, from 1.8 to 2.4 times as wide as tall (spec 31, 3.8)", () => {
    const ratio = (view: { width: number; height: number }) => view.width / view.height;
    const short = viewFor([reykjavik, keflavik], wideShape);
    expect(short.width).toBeGreaterThanOrEqual(160);
    expect(ratio(short)).toBeGreaterThanOrEqual(1.8);
    expect(ratio(short)).toBeLessThanOrEqual(2.4);
    const southCoast = viewFor([keflavik, vik], wideShape);
    expect(ratio(southCoast)).toBeGreaterThanOrEqual(1.8);
    expect(ratio(southCoast)).toBeLessThanOrEqual(2.4);
    for (const point of [keflavik, vik]) {
      expect(point.x).toBeGreaterThan(southCoast.x);
      expect(point.x).toBeLessThan(southCoast.x + southCoast.width);
      expect(point.y).toBeGreaterThan(southCoast.y);
      expect(point.y).toBeLessThan(southCoast.y + southCoast.height);
    }
    // Nearly as wide as Iceland, it is a band across the whole of it.
    const north = viewFor([reykjavik, akureyri], wideShape);
    expect(north).toMatchObject({ x: 0, width: mapSize.width });
    expect(ratio(north)).toBeGreaterThanOrEqual(1.8);
    expect(ratio(north)).toBeLessThanOrEqual(2.4);
    for (const point of [reykjavik, akureyri]) {
      expect(point.y).toBeGreaterThan(north.y);
      expect(point.y).toBeLessThan(north.y + north.height);
    }
    // One as tall as the country is the whole of it, in either shape.
    const top = project({ longitude: -16.0, latitude: 66.5 });
    expect(viewFor([vik, top], wideShape)).toEqual(wholeMap);
    expect(viewFor([vik, top])).toEqual(wholeMap);
  });

  it("stays on the map", () => {
    const view = viewFor([keflavik]);
    expect(view.x).toBeGreaterThanOrEqual(0);
    expect(view.y).toBeGreaterThanOrEqual(0);
    expect(view.x + view.width).toBeLessThanOrEqual(mapSize.width);
    expect(view.y + view.height).toBeLessThanOrEqual(mapSize.height);
  });
});

describe("The dots a tap means", () => {
  const dots = [
    { id: "reykjavik", at: reykjavik },
    { id: "keflavik", at: keflavik },
    { id: "akureyri", at: akureyri },
  ];
  it("are the dots within reach, nearest first", () => {
    expect(dotsNear(dots, { x: akureyri.x + 3, y: akureyri.y - 2 }, 10)).toEqual(["akureyri"]);
    const between = { x: (reykjavik.x + keflavik.x) / 2 + 5, y: (reykjavik.y + keflavik.y) / 2 };
    expect(dotsNear(dots, between, 200)).toEqual(["reykjavik", "keflavik"]);
  });
  it("are none when the tap is far from every dot", () => {
    expect(dotsNear(dots, { x: vik.x, y: vik.y }, 10)).toEqual([]);
  });
});
