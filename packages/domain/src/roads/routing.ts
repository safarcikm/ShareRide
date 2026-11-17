// Finding legs on our own road file (ADR 0031): a meeting point joins the
// nearest road, and the fastest way between two points gives the leg's
// distance and typical driving time.
import type { Position } from "../meeting-points/coordinates.ts";
import type { RoadGraph, RoadGraphEdge } from "./road-file.ts";

/** How far from a road a meeting point may be and still join it. */
export const maxMetresFromRoad = 1000;

/** Where a meeting point joins the road network. */
export interface RoadPosition {
  readonly edge: number;
  /** How far along the edge, from its `from` node: 0 to 1. */
  readonly along: number;
  /** How far the point is from that road, in metres. */
  readonly metresFromRoad: number;
}

export interface RoadLeg {
  readonly distanceM: number;
  readonly durationS: number;
}

const metresPerDegree = (6_371_008.8 * Math.PI) / 180;

/** The nearest place on a road, or null when no road is within `maxM`. */
export function joinRoad(
  graph: RoadGraph,
  position: Position,
  maxM = maxMetresFromRoad,
): RoadPosition | null {
  const xScale = metresPerDegree * Math.cos((position.latitude * Math.PI) / 180);
  const toX = (longitude: number) => (longitude - position.longitude) * xScale;
  const toY = (latitude: number) => (latitude - position.latitude) * metresPerDegree;
  const latitudeMargin = maxM / metresPerDegree;

  let best: RoadPosition | null = null;
  let bestSquared = maxM * maxM;
  graph.edges.forEach((edge, index) => {
    const { shape } = edge;
    let shapeLength = 0;
    let nearestAlong = -1;
    let nearestSquared = bestSquared;
    for (let at = 0; at + 3 < shape.length; at += 2) {
      const lat1 = shape[at + 1] ?? 0;
      const lat2 = shape[at + 3] ?? 0;
      const ax = toX(shape[at] ?? 0);
      const ay = toY(lat1);
      const bx = toX(shape[at + 2] ?? 0);
      const by = toY(lat2);
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      const tooFar =
        Math.min(lat1, lat2) > position.latitude + latitudeMargin ||
        Math.max(lat1, lat2) < position.latitude - latitudeMargin;
      if (!tooFar) {
        const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length ** 2));
        const px = ax + t * dx;
        const py = ay + t * dy;
        const squared = px * px + py * py;
        if (squared < nearestSquared) {
          nearestSquared = squared;
          nearestAlong = shapeLength + t * length;
        }
      }
      shapeLength += length;
    }
    if (nearestAlong >= 0) {
      bestSquared = nearestSquared;
      best = {
        edge: index,
        along: shapeLength === 0 ? 0 : nearestAlong / shapeLength,
        metresFromRoad: Math.sqrt(nearestSquared),
      };
    }
  });
  return best;
}

/** A part of an edge: its distance and time. */
const part = (edge: RoadGraphEdge, share: number) => ({
  distanceM: edge.lengthM * share,
  durationS: edge.durationS * share,
});

/** A point this close to the end of a road is at the junction there. */
const atJunctionM = 1;

/**
 * The fastest way by road from `start` to each of `ends`: its distance and
 * time, rounded up to at least 1 metre and 1 second, or null when no road
 * connects them.
 */
export function legsFrom(
  graph: RoadGraph,
  start: RoadPosition,
  ends: readonly RoadPosition[],
): (RoadLeg | null)[] {
  const reached = search(graph, start, "out");
  return ends.map((end) => fastest(graph, reached, start, end, "out"));
}

/**
 * The fastest way by road from each of `starts` to `end`, as `legsFrom`
 * gives it, found in one search: roads are followed backwards from `end`.
 */
export function legsTo(
  graph: RoadGraph,
  end: RoadPosition,
  starts: readonly RoadPosition[],
): (RoadLeg | null)[] {
  const reached = search(graph, end, "in");
  return starts.map((start) => fastest(graph, reached, end, start, "in"));
}

/**
 * Whether a search follows roads the way cars drive them, from its origin
 * ("out"), or backwards, to its origin ("in").
 */
type Way = "out" | "in";

interface Reached {
  /** For each node, the fastest time from the origin (or to it, "in"). */
  readonly time: Float64Array;
  readonly distance: Float64Array;
}

function edgeAt(graph: RoadGraph, position: RoadPosition): RoadGraphEdge {
  const edge = graph.edges[position.edge];
  if (edge === undefined) throw new Error("A point is on a road the graph does not have.");
  return edge;
}

/**
 * Whether cars may drive an edge from `to` to `from` at a point on it: on a
 * two-way road, or within a metre of the junction at its `from` end, where
 * they are free to go any way.
 */
const backwardsFrom = (edge: RoadGraphEdge, along: number) =>
  !edge.oneWay || along * edge.lengthM < atJunctionM;

/** Whether cars may arrive at a point on an edge from its `to` end. */
const arriveFromTo = (edge: RoadGraphEdge, along: number) =>
  !edge.oneWay || (1 - along) * edge.lengthM < atJunctionM;

/** Dijkstra by time from `origin` over the whole graph, either way. */
function search(graph: RoadGraph, origin: RoadPosition, way: Way): Reached {
  const time = new Float64Array(graph.nodeCount).fill(Infinity);
  const distance = new Float64Array(graph.nodeCount).fill(Infinity);
  const heap = new MinHeap();
  const reach = (node: number, durationS: number, distanceM: number) => {
    if (durationS < (time[node] ?? Infinity)) {
      time[node] = durationS;
      distance[node] = distanceM;
      heap.push(durationS, node);
    }
  };

  const edge = edgeAt(graph, origin);
  const toTo = part(edge, 1 - origin.along);
  const toFrom = part(edge, origin.along);
  if (way === "out") {
    reach(edge.to, toTo.durationS, toTo.distanceM);
    if (backwardsFrom(edge, origin.along)) reach(edge.from, toFrom.durationS, toFrom.distanceM);
  } else {
    reach(edge.from, toFrom.durationS, toFrom.distanceM);
    if (arriveFromTo(edge, origin.along)) reach(edge.to, toTo.durationS, toTo.distanceM);
  }

  for (;;) {
    const next = heap.pop();
    if (next === undefined) break;
    const [durationS, node] = next;
    if (durationS > (time[node] ?? Infinity)) continue;
    const distanceM = distance[node] ?? Infinity;
    for (const index of graph.touching[node] ?? []) {
      const road = graph.edges[index];
      if (road === undefined) continue;
      // Out, a road leads on from its `from` end; in, it is reached from it.
      const onward = way === "out" ? road.from : road.to;
      const other = way === "out" ? road.to : road.from;
      if (onward === node) reach(other, durationS + road.durationS, distanceM + road.lengthM);
      if (other === node && !road.oneWay) {
        reach(onward, durationS + road.durationS, distanceM + road.lengthM);
      }
    }
  }
  return { time, distance };
}

/**
 * The fastest leg between a search's origin and another point: out, from
 * the origin to `point`; in, from `point` to the origin.
 */
function fastest(
  graph: RoadGraph,
  reached: Reached,
  origin: RoadPosition,
  point: RoadPosition,
  way: Way,
): RoadLeg | null {
  const edge = edgeAt(graph, point);
  const via = (node: number, share: number): RoadLeg => ({
    durationS: (reached.time[node] ?? Infinity) + edge.durationS * share,
    distanceM: (reached.distance[node] ?? Infinity) + edge.lengthM * share,
  });
  const ways: RoadLeg[] = [];
  if (way === "out") {
    // Arriving at `point` along its road from either end.
    ways.push(via(edge.from, point.along));
    if (arriveFromTo(edge, point.along)) ways.push(via(edge.to, 1 - point.along));
  } else {
    // Setting off from `point` along its road to either end.
    ways.push(via(edge.to, 1 - point.along));
    if (backwardsFrom(edge, point.along)) ways.push(via(edge.from, point.along));
  }
  if (point.edge === origin.edge) {
    const [start, end] = way === "out" ? [origin, point] : [point, origin];
    const share = end.along - start.along;
    if (share >= 0 || !edge.oneWay) ways.push(part(edge, Math.abs(share)));
  }
  const best = ways.reduce((a, b) => (b.durationS < a.durationS ? b : a));
  if (!Number.isFinite(best.durationS)) return null;
  return {
    distanceM: Math.max(1, Math.round(best.distanceM)),
    durationS: Math.max(1, Math.round(best.durationS)),
  };
}

/** A binary heap of [key, value] pairs, smallest key first. */
class MinHeap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];

  push(key: number, value: number): void {
    let at = this.keys.length;
    this.keys.push(key);
    this.values.push(value);
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if ((this.keys[parent] ?? 0) <= key) break;
      this.keys[at] = this.keys[parent] ?? 0;
      this.values[at] = this.values[parent] ?? 0;
      at = parent;
    }
    this.keys[at] = key;
    this.values[at] = value;
  }

  pop(): [number, number] | undefined {
    if (this.keys.length === 0) return undefined;
    const top: [number, number] = [this.keys[0] ?? 0, this.values[0] ?? 0];
    const lastKey = this.keys.pop() ?? 0;
    const lastValue = this.values.pop() ?? 0;
    const size = this.keys.length;
    if (size > 0) {
      let at = 0;
      for (;;) {
        const left = at * 2 + 1;
        if (left >= size) break;
        const right = left + 1;
        const child =
          right < size && (this.keys[right] ?? 0) < (this.keys[left] ?? 0) ? right : left;
        if ((this.keys[child] ?? 0) >= lastKey) break;
        this.keys[at] = this.keys[child] ?? 0;
        this.values[at] = this.values[child] ?? 0;
        at = child;
      }
      this.keys[at] = lastKey;
      this.values[at] = lastValue;
    }
    return top;
  }
}
