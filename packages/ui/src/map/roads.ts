import { land, roads } from "./iceland-data.ts";
import { kilometresPerUnit, type MapXY } from "./projection.ts";

/** The points of a shape in the map's data ("x,y x,y …"). */
export function parsePoints(text: string): MapXY[] {
  return text.split(" ").map((pair) => {
    const [x = "0", y = "0"] = pair.split(",");
    return { x: Number(x), y: Number(y) };
  });
}

export function pathLength(points: readonly MapXY[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1] as MapXY;
    const b = points[index] as MapXY;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

interface Graph {
  readonly nodes: readonly MapXY[];
  readonly next: readonly { readonly to: number; readonly length: number }[][];
  /** Every stretch of road between two neighbouring nodes, once. */
  readonly segments: readonly { readonly a: number; readonly b: number }[];
}

let built: Graph | undefined;

/** Every point of every road, joined to its neighbours; roads share their junctions. */
function graph(): Graph {
  if (built !== undefined) return built;
  const index = new Map<string, number>();
  const nodes: MapXY[] = [];
  const next: { to: number; length: number }[][] = [];
  const segments: { a: number; b: number }[] = [];
  const node = (pair: string, point: MapXY) => {
    const known = index.get(pair);
    if (known !== undefined) return known;
    index.set(pair, nodes.length);
    nodes.push(point);
    next.push([]);
    return nodes.length - 1;
  };
  for (const road of roads) {
    const pairs = road.points.split(" ");
    const points = parsePoints(road.points);
    let previous: number | undefined;
    points.forEach((point, at) => {
      const current = node(pairs[at] ?? "", point);
      if (previous !== undefined && previous !== current) {
        const from = nodes[previous] as MapXY;
        const length = Math.hypot(point.x - from.x, point.y - from.y);
        next[previous]?.push({ to: current, length });
        next[current]?.push({ to: previous, length });
        segments.push({ a: previous, b: current });
      }
      previous = current;
    });
  }
  built = { nodes, next, segments };
  return built;
}

/** Where a point meets the roads: a point on one stretch, and how far it is. */
interface OnRoad {
  readonly at: MapXY;
  readonly away: number;
  readonly segment: number;
  /** The stretch's two nodes and how far `at` is from each. */
  readonly ends: readonly { readonly node: number; readonly length: number }[];
}

let landShapes: readonly MapXY[][] | undefined;

/** Even-odd rule: whether the point is inside one of the land shapes. */
function insideLand(point: MapXY, shapes: readonly MapXY[][]): boolean {
  let inside = false;
  for (const shape of shapes) {
    for (let index = 0, previous = shape.length - 1; index < shape.length; previous = index++) {
      const a = shape[index] as MapXY;
      const b = shape[previous] as MapXY;
      if (a.y > point.y !== b.y > point.y) {
        const crossX = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
        if (point.x < crossX) inside = !inside;
      }
    }
  }
  return inside;
}

/** The nearest point to `point` on the stretch from `from` to `to`, and how far along it is (0 to 1). */
function onStretch(point: MapXY, from: MapXY, to: MapXY) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const squared = dx * dx + dy * dy;
  const along =
    squared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / squared));
  const at = { x: from.x + along * dx, y: from.y + along * dy };
  return { at, along, away: Math.hypot(point.x - at.x, point.y - at.y) };
}

function coastDistance(point: MapXY, shapes: readonly MapXY[][]): number {
  let nearest = Infinity;
  for (const shape of shapes) {
    for (let index = 1; index < shape.length; index++) {
      const { away } = onStretch(point, shape[index - 1] as MapXY, shape[index] as MapXY);
      nearest = Math.min(nearest, away);
    }
  }
  return nearest;
}

/** The drawn coast is simplified: a point this near it (about 400 m) counts as land. */
const coastSlack = 0.8;

/** Whether a straight line stays on land, as far as the drawn coast can tell. */
function overLand(from: MapXY, to: MapXY): boolean {
  landShapes ??= land.map(parsePoints);
  const shapes = landShapes;
  for (let step = 1; step < 20; step++) {
    const point = {
      x: from.x + ((to.x - from.x) * step) / 20,
      y: from.y + ((to.y - from.y) * step) / 20,
    };
    if (!insideLand(point, shapes) && coastDistance(point, shapes) > coastSlack) return false;
  }
  return true;
}

/**
 * The nearest stretch of road the point can reach without crossing the sea,
 * so a stop on one side of a fjord joins the road on its own side; the
 * nearest stretch of all when none is in reach.
 */
function nearestOnRoads(point: MapXY, { nodes, segments }: Graph): OnRoad | undefined {
  const candidates = segments.map(({ a, b }, segment) => {
    const from = nodes[a] as MapXY;
    const to = nodes[b] as MapXY;
    const { at, along, away } = onStretch(point, from, to);
    const full = Math.hypot(to.x - from.x, to.y - from.y);
    return {
      at,
      away,
      segment,
      ends: [
        { node: a, length: along * full },
        { node: b, length: (1 - along) * full },
      ],
    };
  });
  const nearest = candidates.reduce<OnRoad | undefined>(
    (best, candidate) => (best === undefined || candidate.away < best.away ? candidate : best),
    undefined,
  );
  const dry = candidates
    .filter((candidate) => candidate.away <= farFromRoads)
    .sort((one, other) => one.away - other.away)
    .find((candidate) => overLand(point, candidate.at));
  return dry ?? nearest;
}

/**
 * The shortest way between two places on the roads (Dijkstra with a small
 * binary heap), starting from either node of one stretch and ending at
 * either node of another, as the nodes passed; or undefined if no road
 * joins them.
 */
function shortestWay(
  { nodes, next }: Graph,
  starts: OnRoad["ends"],
  ends: OnRoad["ends"],
): MapXY[] | undefined {
  const distance = new Float64Array(nodes.length).fill(Infinity);
  const previous = new Int32Array(nodes.length).fill(-1);
  const heap: [number, number][] = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    let at = heap.length - 1;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if ((heap[parent] as [number, number])[0] <= item[0]) break;
      heap[at] = heap[parent] as [number, number];
      at = parent;
    }
    heap[at] = item;
  };
  const pop = () => {
    const top = heap[0] as [number, number];
    const last = heap.pop() as [number, number];
    if (heap.length > 0) {
      let at = 0;
      for (;;) {
        const left = 2 * at + 1;
        if (left >= heap.length) break;
        const right = left + 1;
        const child =
          right < heap.length &&
          (heap[right] as [number, number])[0] < (heap[left] as [number, number])[0]
            ? right
            : left;
        if ((heap[child] as [number, number])[0] >= last[0]) break;
        heap[at] = heap[child] as [number, number];
        at = child;
      }
      heap[at] = last;
    }
    return top;
  };
  for (const { node, length } of starts) {
    if (length < (distance[node] ?? Infinity)) {
      distance[node] = length;
      push([length, node]);
    }
  }
  const tails = new Map(ends.map(({ node, length }) => [node, length]));
  let best = Infinity;
  let last = -1;
  while (heap.length > 0) {
    const [reached, current] = pop();
    if (reached >= best) break;
    if (reached > (distance[current] ?? Infinity)) continue;
    const tail = tails.get(current);
    if (tail !== undefined && reached + tail < best) {
      best = reached + tail;
      last = current;
    }
    for (const { to: neighbour, length } of next[current] ?? []) {
      const through = reached + length;
      if (through < (distance[neighbour] ?? Infinity)) {
        distance[neighbour] = through;
        previous[neighbour] = current;
        push([through, neighbour]);
      }
    }
  }
  if (last === -1) return undefined;
  const way: MapXY[] = [];
  for (let at = last; at !== -1; at = previous[at] ?? -1) way.unshift(nodes[at] as MapXY);
  return way;
}

/** Points further than this from every road (about 10 km) join the route straight. */
const farFromRoads = 10 / kilometresPerUnit;

const gap = (a: MapXY, b: MapXY) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * A line through the points in order that follows the drawn roads between
 * them (ADR 0024). Where a point is far from the roads, no road joins two
 * points, or two points are nearer each other than the roads, the line goes
 * straight. Illustrative, like the roads it uses.
 */
export function alongRoads(points: readonly MapXY[]): MapXY[] {
  const roadGraph = graph();
  const line: MapXY[] = points.slice(0, 1);
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1] as MapXY;
    const to = points[index] as MapXY;
    line.push(...wayBetween(roadGraph, from, to), to);
  }
  return line;
}

/** The points on the roads between two places, without the places. */
function wayBetween(roadGraph: Graph, from: MapXY, to: MapXY): MapXY[] {
  const start = nearestOnRoads(from, roadGraph);
  const end = nearestOnRoads(to, roadGraph);
  if (
    start === undefined ||
    end === undefined ||
    start.away > farFromRoads ||
    end.away > farFromRoads ||
    gap(from, to) <= start.away + end.away
  ) {
    return [];
  }
  if (start.segment === end.segment) return [start.at, end.at];
  const way = shortestWay(roadGraph, start.ends, end.ends);
  return way === undefined ? [] : [start.at, ...way, end.at];
}
