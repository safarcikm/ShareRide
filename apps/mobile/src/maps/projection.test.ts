import { kilometresPerUnit, mapSize, project } from "./projection";

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y) * kilometresPerUnit;

describe("The map's projection", () => {
  it("puts Iceland inside the map, north up and east to the right", () => {
    const reykjavik = project({ longitude: -21.94, latitude: 64.15 });
    const akureyri = project({ longitude: -18.09, latitude: 65.68 });
    for (const { x, y } of [reykjavik, akureyri]) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(mapSize.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(mapSize.height);
    }
    expect(akureyri.x).toBeGreaterThan(reykjavik.x);
    expect(akureyri.y).toBeLessThan(reykjavik.y);
  });

  it("keeps distances close to the real ones", () => {
    // Reykjavík to Akureyri is about 250 km as the crow flies.
    const km = distance(
      project({ longitude: -21.94, latitude: 64.15 }),
      project({ longitude: -18.09, latitude: 65.68 }),
    );
    expect(km).toBeGreaterThan(240);
    expect(km).toBeLessThan(260);
  });
});
