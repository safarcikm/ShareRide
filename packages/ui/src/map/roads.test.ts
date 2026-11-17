import { describe, expect, it } from "vitest";
import { alongRoads, pathLength } from "./roads.ts";
import { kilometresPerUnit, project } from "./projection.ts";

const reykjavik = project({ longitude: -21.86, latitude: 64.13 });
const borgarnes = project({ longitude: -21.92, latitude: 64.54 });
const akureyri = project({ longitude: -18.09, latitude: 65.68 });
const km = (points: readonly { x: number; y: number }[]) => pathLength(points) * kilometresPerUnit;

describe("A route along the drawn roads", () => {
  it("follows the Ring Road from Reykjavík to Akureyri, about as far as by car", () => {
    const route = alongRoads([reykjavik, akureyri]);
    expect(route[0]).toEqual(reykjavik);
    expect(route.at(-1)).toEqual(akureyri);
    expect(route.length).toBeGreaterThan(20);
    // About 390 km by road; the drawn roads are generalised.
    expect(km(route)).toBeGreaterThan(360);
    expect(km(route)).toBeLessThan(460);
  });

  it("goes along the roads from each stop to the next, in order", () => {
    const first = alongRoads([reykjavik, borgarnes]);
    const second = alongRoads([borgarnes, akureyri]);
    // Road points between the stops on both legs, not straight lines.
    expect(first.length).toBeGreaterThan(10);
    expect(second.length).toBeGreaterThan(10);
    expect(alongRoads([reykjavik, borgarnes, akureyri])).toEqual([...first, ...second.slice(1)]);
  });

  it("joins a stop far from any drawn road with a straight line", () => {
    const grimsey = project({ longitude: -18.0, latitude: 66.54 });
    expect(alongRoads([akureyri, grimsey])).toEqual([akureyri, grimsey]);
  });

  // Sample meeting points (packages/db/src/sample), and Höfn.
  const at = (latitude: number, longitude: number) => project({ latitude, longitude });
  const bsi = at(64.1374, -21.9356);
  const borgarnesN1 = at(64.5462, -21.9046);
  const hveragerdi = at(64.0003, -21.1878);
  const selfoss = at(63.9349, -20.9988);
  const hella = at(63.8353, -20.4002);
  const hlemmur = at(64.1431, -21.9149);
  const blonduos = at(65.6603, -20.2797);
  const hof = at(65.6832, -18.0871);
  const varmahlid = at(65.553, -19.4503);
  const vik = at(63.4191, -19.0061);
  const hofn = at(64.2539, -15.2082);

  it.each([
    ["BSÍ", "Borgarnes", bsi, borgarnesN1, 74],
    ["Hveragerði", "Selfoss", hveragerdi, selfoss, 12],
    ["Selfoss", "Hella", selfoss, hella, 36],
    // Hof is across the fjord from the Ring Road's nearest stretch: it joins
    // the road on its own shore instead of going round the head of the fjord.
    ["Hof, Akureyri", "Varmahlíð", hof, varmahlid, 94],
    ["Blönduós", "Hof, Akureyri", blonduos, hof, 143],
  ])("goes about the way the road does from %s to %s", (_from, _to, from, to, byRoad) => {
    const length = km(alongRoads([from, to]));
    // Within a tenth, plus about 3 km for the joins from the stops to the road.
    expect(length).toBeGreaterThan(byRoad * 0.9 - 3);
    expect(length).toBeLessThan(byRoad * 1.1 + 3);
  });

  it("reaches Höfn along the Ring Road and the road into town", () => {
    const route = alongRoads([vik, hofn]);
    expect(route.length).toBeGreaterThan(10);
    // About 270 km by road.
    expect(km(route)).toBeGreaterThan(230);
    expect(km(route)).toBeLessThan(330);
    // The last road point is in town, not out on the Ring Road.
    expect(km([route.at(-2) ?? vik, hofn])).toBeLessThan(3);
  });

  it("goes straight between stops nearer each other than the roads", () => {
    // BSÍ and Hlemmur are 1.2 km apart, each about 4 km from the drawn roads.
    expect(alongRoads([bsi, hlemmur])).toEqual([bsi, hlemmur]);
  });

  it("is just the point for a single stop", () => {
    expect(alongRoads([akureyri])).toEqual([akureyri]);
    expect(alongRoads([])).toEqual([]);
  });
});
