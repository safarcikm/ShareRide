import { mapSize, project } from "./projection";
import { dotsNear, viewFor, wholeMap } from "./view";

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
