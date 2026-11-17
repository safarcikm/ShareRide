// Builds our road file (ADR 0030) from OpenStreetMap data in OPL, the text
// format `osmium cat -f opl` writes: one node or way a line. It keeps the
// roads cars may use, splits them where they meet, and writes each road
// between two junctions with its length, typical speed and shape.
import { roadFileDegreeUnit, type RoadFile, type RoadFileEdge } from "@shareride/domain";

export const roadFileSource =
  "© OpenStreetMap contributors (ODbL 1.0), Iceland extract by Geofabrik";

/** Typical speed in km/h for each road class cars may use. */
const classSpeeds: Readonly<Record<string, number>> = {
  motorway: 90,
  trunk: 90,
  primary: 90,
  secondary: 80,
  tertiary: 70,
  unclassified: 60,
  residential: 30,
  living_street: 10,
  // Roads to airports, fuel stations and car parks; not parking aisles or
  // driveways (below).
  service: 20,
  motorway_link: 50,
  trunk_link: 50,
  primary_link: 50,
  secondary_link: 50,
  tertiary_link: 50,
};

/** Typical speed on a road without a hard surface. */
const unpavedSpeed = 60;
const unpaved = new Set([
  "unpaved",
  "gravel",
  "fine_gravel",
  "compacted",
  "dirt",
  "earth",
  "ground",
  "grass",
  "mud",
  "sand",
  "pebblestone",
  "rock",
]);
/** Speed limits written as a kind of road (Iceland's rules). */
const namedLimits: Readonly<Record<string, number>> = {
  "IS:urban": 50,
  "IS:rural": 90,
};
/** Service ways that lead nowhere a meeting point is: aisles, driveways. */
const minorService = new Set([
  "parking_aisle",
  "driveway",
  "drive-through",
  "emergency_access",
  "alley",
]);
/** Access values that close a road to cars. */
const closed = new Set(["no", "private", "agricultural", "forestry", "emergency", "military"]);

export interface RoadFileBuildOptions {
  readonly mapDate: string;
  /** Leave out shape points closer than this to the line between their neighbours. */
  readonly simplifyM?: number;
  /** Leave out a network of roads joined to nothing else that is shorter than this. */
  readonly minNetworkM?: number;
}

export interface RoadFileSummary {
  readonly ways: number;
  readonly keptWays: number;
  readonly incompleteWays: number;
  readonly nodes: number;
  readonly edges: number;
  readonly shapePoints: number;
  readonly lengthKm: number;
  readonly leftOutNetworks: number;
  /** One-way roads into or out of a dead end, which cars could not drive back from. */
  readonly leftOutOneWay: number;
}

interface Road {
  readonly refs: readonly number[];
  readonly speedKmh: number;
  readonly direction: "both" | "forward" | "backward";
}

/** Reads OPL a line at a time; `finish` gives the road file. */
export function createRoadFileBuilder() {
  const positions = new Map<number, readonly [number, number]>();
  const roads: Road[] = [];
  let ways = 0;

  return {
    add(line: string): void {
      const kind = line[0];
      if (kind !== "n" && kind !== "w") return;
      const fields = line.trimEnd().split(" ");
      const id = Number(fields[0]?.slice(1));
      if (kind === "n") {
        const x = fields.find((field) => field.startsWith("x"));
        const y = fields.find((field) => field.startsWith("y"));
        if (x === undefined || y === undefined || x.length < 2 || y.length < 2) return;
        positions.set(id, [Number(x.slice(1)), Number(y.slice(1))]);
        return;
      }
      ways += 1;
      const tags = readTags(fields.find((field) => field.startsWith("T"))?.slice(1) ?? "");
      const refs = (fields.find((field) => field.startsWith("N"))?.slice(1) ?? "")
        .split(",")
        .filter((ref) => ref.length > 1)
        .map((ref) => Number(ref.slice(1)));
      const road = carRoad(tags);
      if (road !== null && refs.length >= 2) roads.push({ refs, ...road });
    },

    finish(options: RoadFileBuildOptions): {
      readonly file: RoadFile;
      readonly summary: RoadFileSummary;
    } {
      return assemble(positions, roads, ways, options);
    },
  };
}

function readTags(text: string): Map<string, string> {
  const tags = new Map<string, string>();
  if (text === "") return tags;
  for (const pair of text.split(",")) {
    const equals = pair.indexOf("=");
    if (equals < 0) continue;
    tags.set(unescape(pair.slice(0, equals)), unescape(pair.slice(equals + 1)));
  }
  return tags;
}

/** OPL writes special characters as `%` + hexadecimal code point + `%`. */
const unescape = (text: string) =>
  text.replace(/%([0-9a-fA-F]+)%/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));

/** Whether cars may use a way, and if so how fast and which way. */
function carRoad(tags: ReadonlyMap<string, string>): Omit<Road, "refs"> | null {
  const highway = tags.get("highway") ?? "";
  const classSpeed = classSpeeds[highway];
  if (classSpeed === undefined) return null;
  if (tags.get("area") === "yes") return null;
  if (highway === "service" && minorService.has(tags.get("service") ?? "")) return null;
  const refs = (tags.get("ref") ?? "").split(";").map((ref) => ref.trim());
  if (refs.some((ref) => /^F\s*\d/i.test(ref))) return null;
  // The most specific access tag decides.
  const access = ["motorcar", "motor_vehicle", "vehicle", "access"]
    .map((key) => tags.get(key))
    .find((value) => value !== undefined);
  if (access !== undefined && closed.has(access)) return null;

  let speedKmh = classSpeed;
  if (unpaved.has(tags.get("surface") ?? "")) speedKmh = Math.min(speedKmh, unpavedSpeed);
  const limit = speedLimit(tags.get("maxspeed"));
  if (limit !== null) speedKmh = Math.min(speedKmh, limit);

  const oneway = tags.get("oneway");
  const impliedOneWay =
    highway === "motorway" ||
    tags.get("junction") === "roundabout" ||
    tags.get("junction") === "circular";
  const direction =
    oneway === "-1" || oneway === "reverse"
      ? "backward"
      : oneway === "yes" || oneway === "true" || oneway === "1"
        ? "forward"
        : oneway === undefined && impliedOneWay
          ? "forward"
          : "both";
  return { speedKmh, direction };
}

function speedLimit(value: string | undefined): number | null {
  if (value === undefined) return null;
  const named = namedLimits[value];
  if (named !== undefined) return named;
  const match = /^(\d+)(\s*mph)?$/.exec(value.trim());
  if (match === null) return null;
  const number = Number(match[1]);
  const kmh = match[2] === undefined ? number : Math.round(number * 1.609344);
  return kmh > 0 ? kmh : null;
}

const metresPerDegree = (6_371_008.8 * Math.PI) / 180;
/** Stands in for a point the data must have, to satisfy the types. */
const nowhere = [0, 0] as const;

function metresBetween(a: readonly [number, number], b: readonly [number, number]): number {
  const toRadians = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRadians;
  const dLon = (b[0] - a[0]) * toRadians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRadians) * Math.cos(b[1] * toRadians) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface Stretch {
  from: number;
  to: number;
  lengthM: number;
  speedKmh: number;
  oneWay: boolean;
  points: (readonly [number, number])[];
}

function assemble(
  positions: ReadonlyMap<number, readonly [number, number]>,
  roads: readonly Road[],
  ways: number,
  options: RoadFileBuildOptions,
): { file: RoadFile; summary: RoadFileSummary } {
  const simplifyM = options.simplifyM ?? 10;
  const minNetworkM = options.minNetworkM ?? 2000;

  const complete = roads.filter((road) => road.refs.every((ref) => positions.has(ref)));
  // A node is a junction where roads meet, at a road's end, or where a road
  // passes twice.
  const uses = new Map<number, number>();
  for (const road of complete) {
    road.refs.forEach((ref, at) => {
      const ends = at === 0 || at === road.refs.length - 1 ? 2 : 1;
      uses.set(ref, (uses.get(ref) ?? 0) + ends);
    });
  }
  const junction = (ref: number) => (uses.get(ref) ?? 0) >= 2;

  const stretches: Stretch[] = [];
  for (const road of complete) {
    let start = 0;
    for (let at = 1; at < road.refs.length; at += 1) {
      const ref = road.refs[at] ?? 0;
      if (!junction(ref)) continue;
      const refs = road.refs.slice(start, at + 1);
      if (road.direction === "backward") refs.reverse();
      const points = refs.map((id) => positions.get(id) ?? nowhere);
      let lengthM = 0;
      for (let p = 1; p < points.length; p += 1) {
        lengthM += metresBetween(points[p - 1] ?? nowhere, points[p] ?? nowhere);
      }
      // A loop of no length leads nowhere; a short road between two
      // junctions may be the only link between them.
      if (lengthM >= 0.5 || refs[0] !== refs[refs.length - 1]) {
        stretches.push({
          from: refs[0] ?? 0,
          to: refs[refs.length - 1] ?? 0,
          lengthM: Math.round(lengthM),
          speedKmh: road.speedKmh,
          oneWay: road.direction !== "both",
          points: simplify(points, simplifyM),
        });
      }
      start = at;
    }
  }

  // Keep only roads from which cars can drive to every other road of their
  // network: a strongly connected part of the roads. A one-way road between
  // two parts leads into a dead end or out of one, and a part shorter than
  // `minNetworkM` is joined to nothing else.
  const part = stronglyConnectedParts(stretches);
  const partLength = new Map<number, number>();
  let leftOutOneWay = 0;
  const within: Stretch[] = [];
  for (const stretch of stretches) {
    const from = part.get(stretch.from) ?? -1;
    if (from !== part.get(stretch.to)) {
      leftOutOneWay += 1;
      continue;
    }
    within.push(stretch);
    partLength.set(from, (partLength.get(from) ?? 0) + stretch.lengthM);
  }
  const kept = within.filter(
    (stretch) => (partLength.get(part.get(stretch.from) ?? -1) ?? 0) >= minNetworkM,
  );
  const leftOutNetworks = [...partLength.values()].filter((length) => length < minNetworkM).length;

  // Number the nodes in rows of a twentieth of a degree, west to east, so
  // that neighbours are near in the file and their differences small.
  const unit = (degrees: number) => Math.round(degrees / roadFileDegreeUnit);
  const nodeIds = [...new Set(kept.flatMap((stretch) => [stretch.from, stretch.to]))];
  const at = (id: number) => positions.get(id) ?? nowhere;
  nodeIds.sort((a, b) => {
    const rowA = Math.floor(at(a)[1] * 20);
    const rowB = Math.floor(at(b)[1] * 20);
    return rowA - rowB || at(a)[0] - at(b)[0] || a - b;
  });
  const index = new Map(nodeIds.map((id, position) => [id, position]));
  const nodes: number[] = [];
  let px = 0;
  let py = 0;
  for (const id of nodeIds) {
    const x = unit(at(id)[0]);
    const y = unit(at(id)[1]);
    nodes.push(x - px, y - py);
    px = x;
    py = y;
  }

  let shapePoints = 0;
  const edges: RoadFileEdge[] = kept
    .map((stretch): RoadFileEdge => {
      const between: number[] = [];
      let sx = unit(stretch.points[0]?.[0] ?? 0);
      let sy = unit(stretch.points[0]?.[1] ?? 0);
      for (const point of stretch.points.slice(1, -1)) {
        const x = unit(point[0]);
        const y = unit(point[1]);
        between.push(x - sx, y - sy);
        sx = x;
        sy = y;
      }
      shapePoints += between.length / 2;
      return [
        index.get(stretch.from) ?? 0,
        index.get(stretch.to) ?? 0,
        Math.max(1, stretch.lengthM),
        stretch.speedKmh,
        stretch.oneWay ? 1 : 0,
        between,
      ];
    })
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);

  const lengthM = kept.reduce((sum, stretch) => sum + stretch.lengthM, 0);
  return {
    file: { format: 1, mapDate: options.mapDate, source: roadFileSource, nodes, edges },
    summary: {
      ways,
      keptWays: complete.length,
      incompleteWays: roads.length - complete.length,
      nodes: nodeIds.length,
      edges: edges.length,
      shapePoints,
      lengthKm: Math.round(lengthM / 1000),
      leftOutNetworks,
      leftOutOneWay,
    },
  };
}

/**
 * Numbers the strongly connected parts of the roads (Tarjan's algorithm,
 * without recursion): within a part, cars can drive from every node to
 * every other. Gives each node's part.
 */
function stronglyConnectedParts(stretches: readonly Stretch[]): Map<number, number> {
  const ids = [...new Set(stretches.flatMap((stretch) => [stretch.from, stretch.to]))];
  const indexOf = new Map(ids.map((id, index) => [id, index]));
  const onward: number[][] = ids.map(() => []);
  for (const stretch of stretches) {
    const from = indexOf.get(stretch.from) ?? 0;
    const to = indexOf.get(stretch.to) ?? 0;
    onward[from]?.push(to);
    if (!stretch.oneWay) onward[to]?.push(from);
  }

  const unvisited = -1;
  const order = new Int32Array(ids.length).fill(unvisited);
  const low = new Int32Array(ids.length);
  const onStack = new Uint8Array(ids.length);
  const stack: number[] = [];
  const work: { node: number; next: number }[] = [];
  const part = new Map<number, number>();
  let visited = 0;
  let parts = 0;
  const visit = (node: number) => {
    order[node] = visited;
    low[node] = visited;
    visited += 1;
    stack.push(node);
    onStack[node] = 1;
    work.push({ node, next: 0 });
  };

  for (let root = 0; root < ids.length; root += 1) {
    if (order[root] !== unvisited) continue;
    visit(root);
    for (let top = work.at(-1); top !== undefined; top = work.at(-1)) {
      const { node } = top;
      const roads = onward[node] ?? [];
      if (top.next < roads.length) {
        const to = roads[top.next] ?? 0;
        top.next += 1;
        if (order[to] === unvisited) visit(to);
        else if (onStack[to] === 1) low[node] = Math.min(low[node] ?? 0, order[to] ?? 0);
        continue;
      }
      work.pop();
      const caller = work.at(-1);
      if (caller !== undefined) {
        low[caller.node] = Math.min(low[caller.node] ?? 0, low[node] ?? 0);
      }
      if (low[node] !== order[node]) continue;
      for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
        onStack[member] = 0;
        part.set(ids[member] ?? 0, parts);
        if (member === node) break;
      }
      parts += 1;
    }
  }
  return part;
}

/** Douglas–Peucker: keeps the points that bend the line more than `toleranceM`. */
function simplify(
  points: readonly (readonly [number, number])[],
  toleranceM: number,
): (readonly [number, number])[] {
  if (points.length <= 2 || toleranceM <= 0) return [...points];
  const origin = points[0] ?? nowhere;
  const xScale = metresPerDegree * Math.cos((origin[1] * Math.PI) / 180);
  const local = points.map(
    ([x, y]) => [(x - origin[0]) * xScale, (y - origin[1]) * metresPerDegree] as const,
  );
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() ?? nowhere;
    const [ax, ay] = local[first] ?? nowhere;
    const [bx, by] = local[last] ?? nowhere;
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let farthest = -1;
    let farthestM = toleranceM;
    for (let at = first + 1; at < last; at += 1) {
      const [x, y] = local[at] ?? nowhere;
      const offM =
        length === 0
          ? Math.hypot(x - ax, y - ay)
          : Math.abs(dx * (ay - y) - dy * (ax - x)) / length;
      if (offM > farthestM) {
        farthestM = offM;
        farthest = at;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, at) => keep[at]);
}
