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

// Roads meet where one ends at another: make those points exactly the same,
// so the app can follow the roads from one to the next. Natural Earth draws
// most of them within 2 km of each other.
const snap = 4;
for (const road of roads) {
  for (const end of [0, road.points.length - 1]) {
    const point = road.points[end] as MapXY;
    let nearest: MapXY | undefined;
    for (const other of roads) {
      if (other === road) continue;
      for (const candidate of other.points) {
        if (gap(candidate, point) <= Math.min(snap, nearest ? gap(nearest, point) : snap)) {
          nearest = candidate;
        }
      }
    }
    if (nearest !== undefined) road.points[end] = nearest;
  }
}
// Split roads where another road joins them, so each junction is an end.
const junctions = new Set(roads.flatMap((road) => [road.points[0], road.points.at(-1)]));
const pieces = roads.flatMap((road) => {
  const parts: { ring: boolean; points: MapXY[] }[] = [];
  let start = 0;
  road.points.forEach((point, index) => {
    if (index > start && index < road.points.length - 1 && junctions.has(point)) {
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
const roadData = [...drawn.values()];

const count = (shapes: MapXY[][]) => shapes.reduce((sum, shape) => sum + shape.length, 0);

/** How many separate road networks there are, largest first: a check on the joins. */
function networks(): number[] {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    const up = parent.get(key) ?? key;
    if (up === key) return key;
    const top = find(up);
    parent.set(key, top);
    return top;
  };
  for (const road of roadData) {
    const keys = text(road.points).split(" ");
    for (const key of keys) if (!parent.has(key)) parent.set(key, key);
    for (const key of keys.slice(1)) parent.set(find(key), find(keys[0] ?? key));
  }
  const sizes = new Map<string, number>();
  for (const key of parent.keys()) sizes.set(find(key), (sizes.get(find(key)) ?? 0) + 1);
  return [...sizes.values()].sort((a, b) => b - a);
}
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
    `in networks of ${networks().slice(0, 8).join(", ")} points.\n`,
);
