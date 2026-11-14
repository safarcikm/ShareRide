// Builds src/maps/iceland-data.ts, the data of our own map of Iceland
// (ADR 0024), from Natural Earth's 1:10m GeoJSON files (public domain):
//   node scripts/build-iceland-map.ts <folder with the three files>
// The files are in https://github.com/nvkelso/natural-earth-vector, folder
// geojson: ne_10m_admin_0_countries.geojson, ne_10m_roads.geojson and
// ne_10m_glaciated_areas.geojson. Run it again when Natural Earth updates.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { format, resolveConfig } from "prettier";
import { project, type MapXY } from "../src/maps/projection.ts";

type Coordinates = [number, number][];
interface Feature {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

const folder = process.argv[2];
if (folder === undefined) {
  process.stderr.write("Usage: node scripts/build-iceland-map.ts <folder>\n");
  process.exit(1);
}
const read = (name: string): Feature[] =>
  (JSON.parse(readFileSync(join(folder, name), "utf8")) as { features: Feature[] }).features;

const inIceland = ([longitude, latitude]: [number, number]) =>
  longitude > -25 && longitude < -13 && latitude > 63 && latitude < 67;

/** The outer rings of a polygon or multipolygon. */
function rings(feature: Feature): Coordinates[] {
  const { type, coordinates } = feature.geometry;
  if (type === "Polygon") return [(coordinates as Coordinates[])[0] ?? []];
  if (type === "MultiPolygon") return (coordinates as Coordinates[][]).map((p) => p[0] ?? []);
  return [];
}

function lines(feature: Feature): Coordinates[] {
  const { type, coordinates } = feature.geometry;
  if (type === "LineString") return [coordinates as Coordinates];
  if (type === "MultiLineString") return coordinates as Coordinates[];
  return [];
}

const toMap = (line: Coordinates): MapXY[] =>
  line.map(([longitude, latitude]) => project({ longitude, latitude }));

const gap = (a: MapXY, b: MapXY) => Math.hypot(a.x - b.x, a.y - b.y);

/** Distance from a point to the segment a–b. */
function offLine(point: MapXY, a: MapXY, b: MapXY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (length === 0) return gap(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return gap(point, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Douglas–Peucker: drops points closer than `tolerance` to the line, keeping both ends. */
function simplify(points: MapXY[], tolerance: number): MapXY[] {
  if (points.length < 3) return points;
  const first = points[0] as MapXY;
  const last = points.at(-1) as MapXY;
  let furthest = 0;
  let at = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const distance = offLine(points[index] as MapXY, first, last);
    if (distance > furthest) {
      furthest = distance;
      at = index;
    }
  }
  if (furthest <= tolerance) return [first, last];
  return [
    ...simplify(points.slice(0, at + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(at), tolerance),
  ];
}

const text = (points: MapXY[]) =>
  points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

// Land: Iceland and its islands. Glaciers: the ice caps.
const iceland = read("ne_10m_admin_0_countries.geojson").find(
  (feature) => feature.properties["ADM0_A3"] === "ISL",
);
if (iceland === undefined) throw new Error("Iceland is not in the countries file.");
const land = rings(iceland)
  .map((ring) => simplify(toMap(ring), 0.8))
  .filter((ring) => ring.length >= 4);
const glaciers = read("ne_10m_glaciated_areas.geojson")
  .flatMap(rings)
  .filter((ring) => ring.some(inIceland))
  .map((ring) => simplify(toMap(ring), 1))
  .filter((ring) => ring.length >= 4);

// Roads: every road in Iceland but ferries; route 1 is the Ring Road.
const roads = read("ne_10m_roads.geojson")
  .filter((feature) => feature.properties["type"] !== "Ferry Route")
  .flatMap((feature) =>
    lines(feature)
      .filter((line) => line.some(inIceland))
      .map((line) => ({ ring: feature.properties["label"] === "1", points: toMap(line) })),
  );

// Natural Earth's roads meet without sharing a point: one ends near
// another, or two cross between their points. Join them so the app can
// follow the roads from one to the next: add the point where they meet to
// both roads, then split the roads there.
/** A road end this close to another road (about 3.5 km) meets it. */
const snap = 6.5;

interface Cut {
  readonly segment: number;
  readonly along: number;
  readonly point: MapXY;
}
const cuts = roads.map((): Cut[] => []);

/** The point on segment a–b nearest `point`, and how far along it (0 to 1). */
function onSegment(point: MapXY, a: MapXY, b: MapXY) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const along =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  const at = { x: a.x + along * dx, y: a.y + along * dy };
  return { along, at, away: gap(point, at) };
}

/** Where segments a–b and c–d cross inside both, as how far along each. */
function crossing(a: MapXY, b: MapXY, c: MapXY, d: MapXY) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const across = r.x * s.y - r.y * s.x;
  if (across === 0) return undefined;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / across;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / across;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { t, u } : undefined;
}

// Crossings first, on the roads as drawn.
roads.forEach((road, i) => {
  roads.slice(i + 1).forEach((other, offset) => {
    const j = i + 1 + offset;
    for (let k = 0; k < road.points.length - 1; k++) {
      const a = road.points[k] as MapXY;
      const b = road.points[k + 1] as MapXY;
      for (let m = 0; m < other.points.length - 1; m++) {
        const c = other.points[m] as MapXY;
        const d = other.points[m + 1] as MapXY;
        if (
          Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
          Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
          Math.max(a.y, b.y) < Math.min(c.y, d.y) ||
          Math.max(c.y, d.y) < Math.min(a.y, b.y)
        ) {
          continue;
        }
        const crossed = crossing(a, b, c, d);
        if (crossed === undefined) continue;
        const point = { x: a.x + crossed.t * (b.x - a.x), y: a.y + crossed.t * (b.y - a.y) };
        cuts[i]?.push({ segment: k, along: crossed.t, point });
        cuts[j]?.push({ segment: m, along: crossed.u, point });
      }
    }
  });
});

// Then each road end joins the nearest point of another road within reach.
roads.forEach((road, i) => {
  for (const end of [0, road.points.length - 1]) {
    const point = road.points[end] as MapXY;
    let best: { road: number; cut: Cut; away: number } | undefined;
    roads.forEach((other, j) => {
      if (j === i) return;
      for (let m = 0; m < other.points.length - 1; m++) {
        const found = onSegment(point, other.points[m] as MapXY, other.points[m + 1] as MapXY);
        if (found.away <= snap && (best === undefined || found.away < best.away)) {
          best = {
            road: j,
            cut: { segment: m, along: found.along, point: found.at },
            away: found.away,
          };
        }
      }
    });
    if (best !== undefined) {
      road.points[end] = best.cut.point;
      cuts[best.road]?.push(best.cut);
    }
  }
});

const same = (a: MapXY, b: MapXY) => a.x === b.x && a.y === b.y;
// Put the cuts into their roads, in order along each segment.
const joined = roads.map((road, i) => {
  const points: MapXY[] = [];
  road.points.forEach((point, k) => {
    points.push(point);
    const here = (cuts[i] ?? [])
      .filter((cut) => cut.segment === k)
      .sort((a, b) => a.along - b.along)
      .map((cut) => cut.point);
    for (const cut of here) {
      const last = points.at(-1) as MapXY;
      const next = road.points[k + 1];
      if (!same(cut, last) && (next === undefined || !same(cut, next))) points.push(cut);
    }
  });
  return { ring: road.ring, points };
});

// Split the roads where they meet, so each junction is the end of a piece.
const key = ({ x, y }: MapXY) => `${String(x)},${String(y)}`;
const roadsAt = new Map<string, number>();
joined.forEach((road) => {
  for (const at of new Set(road.points.map(key))) roadsAt.set(at, (roadsAt.get(at) ?? 0) + 1);
});
const junctions = new Set([
  ...joined.flatMap((road) => [road.points[0], road.points.at(-1)]).map((at) => key(at as MapXY)),
  ...[...roadsAt].filter(([, count]) => count > 1).map(([at]) => at),
]);
const pieces = joined.flatMap((road) => {
  const parts: { ring: boolean; points: MapXY[] }[] = [];
  let start = 0;
  road.points.forEach((point, index) => {
    if (index > start && index < road.points.length - 1 && junctions.has(key(point))) {
      parts.push({ ring: road.ring, points: road.points.slice(start, index + 1) });
      start = index;
    }
  });
  parts.push({ ring: road.ring, points: road.points.slice(start) });
  return parts;
});
// Natural Earth draws a few stretches twice; keep one, the Ring Road's if either is.
const drawn = new Map<string, { ring: boolean; points: MapXY[] }>();
for (const piece of pieces) {
  const points = simplify(piece.points, 0.6);
  if (points.length < 2) continue;
  const key = [text(points), text([...points].reverse())].sort().join("|");
  const known = drawn.get(key);
  drawn.set(key, { ring: piece.ring || known?.ring === true, points: known?.points ?? points });
}
// Keep the roads that join up into one network, as the app sees them (points
// to one decimal). A group of roads apart from it joins it where the two come
// nearest, if that is within reach: at Höfn, the two short roads to the town
// joined each other's ends above instead of the Ring Road's. No route could
// reach a group left further away, so it is left out, and a stop near one
// joins the nearest road of the network straight.
const parent = new Map<string, string>();
const find = (at: string): string => {
  const up = parent.get(at) ?? at;
  if (up === at) return at;
  const top = find(up);
  parent.set(at, top);
  return top;
};
const allRoads = [...drawn.values()];
for (const road of allRoads) {
  const keys = text(road.points).split(" ");
  for (const at of keys) if (!parent.has(at)) parent.set(at, at);
  for (const at of keys.slice(1)) parent.set(find(at), find(keys[0] ?? at));
}
const sizes = new Map<string, number>();
for (const at of parent.keys()) sizes.set(find(at), (sizes.get(find(at)) ?? 0) + 1);
const [main] = [...sizes].sort((a, b) => b[1] - a[1])[0] ?? [""];
const groups = new Map<string, typeof allRoads>();
for (const road of allRoads) {
  const top = find(text(road.points).split(" ")[0] ?? "");
  groups.set(top, [...(groups.get(top) ?? []), road]);
}
const network = groups.get(main) ?? [];
const roadData = [...network];
const leftOut: typeof allRoads = [];
for (const [top, group] of groups) {
  if (top === main) continue;
  let nearest: { road: MapXY[]; segment: number; from: MapXY; at: MapXY; away: number } | undefined;
  for (const point of group.flatMap((road) => road.points)) {
    for (const road of network) {
      for (let m = 0; m < road.points.length - 1; m++) {
        const found = onSegment(point, road.points[m] as MapXY, road.points[m + 1] as MapXY);
        if (found.away <= snap && (nearest === undefined || found.away < nearest.away)) {
          nearest = { road: road.points, segment: m, from: point, at: found.at, away: found.away };
        }
      }
    }
  }
  if (nearest === undefined) {
    leftOut.push(...group);
    continue;
  }
  const { road, segment, from, at } = nearest;
  if (!same(at, road[segment] as MapXY) && !same(at, road[segment + 1] as MapXY)) {
    road.splice(segment + 1, 0, at);
  }
  roadData.push(...group, { ring: false, points: [from, at] });
}

const count = (shapes: MapXY[][]) => shapes.reduce((sum, shape) => sum + shape.length, 0);

const output = resolve(import.meta.dirname, "..", "src", "maps", "iceland-data.ts");
const source = `// Generated by scripts/build-iceland-map.ts from Natural Earth's 1:10m data
// (public domain, naturalearthdata.com). Do not edit by hand. Each shape is
// "x,y" points in map units (projection.ts), separated by spaces.

/** Iceland and its islands. */
export const land: readonly string[] = ${JSON.stringify(land.map(text), null, 2)};

/** The ice caps. */
export const glaciers: readonly string[] = ${JSON.stringify(glaciers.map(text), null, 2)};

/** Main roads from junction to junction; \`ring\` marks the Ring Road (route 1). */
export const roads: readonly { readonly ring: boolean; readonly points: string }[] = ${JSON.stringify(
  roadData.map((road) => ({ ring: road.ring, points: text(road.points) })),
  null,
  2,
)};
`;
// Formatted as the repository's Prettier would, so its check passes.
writeFileSync(output, await format(source, { ...(await resolveConfig(output)), filepath: output }));
process.stdout.write(
  `Wrote ${output}: ${String(land.length)} land shapes (${String(count(land))} points), ` +
    `${String(glaciers.length)} glaciers (${String(count(glaciers))}), ` +
    `${String(roadData.length)} roads (${String(count(roadData.map((road) => road.points)))}), ` +
    `in one network; left out ${String(leftOut.length)} roads apart from it ` +
    `(${String(count(leftOut.map((road) => road.points)))} points).\n`,
);
