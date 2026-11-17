// Finding legs on our own road file (ADR 0030): a meeting point joins the
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

  const startEdge = graph.edges[start.edge];
  if (startEdge === undefined) throw new Error("The start is on a road the graph does not have.");
  const ahead = part(startEdge, 1 - start.along);
  reach(startEdge.to, ahead.durationS, ahead.distanceM);
  // A start at the beginning of a one-way road is at its junction, free to
  // set off any way.
  if (!startEdge.oneWay || start.along * startEdge.lengthM < atJunctionM) {
    const behind = part(startEdge, start.along);
    reach(startEdge.from, behind.durationS, behind.distanceM);
  }

  for (;;) {
    const next = heap.pop();
    if (next === undefined) break;
    const [durationS, node] = next;
    if (durationS > (time[node] ?? Infinity)) continue;
    const distanceM = distance[node] ?? Infinity;
    for (const index of graph.touching[node] ?? []) {
      const edge = graph.edges[index];
      if (edge === undefined) continue;
      if (edge.from === node) reach(edge.to, durationS + edge.durationS, distanceM + edge.lengthM);
      if (edge.to === node && !edge.oneWay) {
        reach(edge.from, durationS + edge.durationS, distanceM + edge.lengthM);
      }
    }
  }

  return ends.map((end) => {
    const edge = graph.edges[end.edge];
    if (edge === undefined) throw new Error("An end is on a road the graph does not have.");
    const ways: RoadLeg[] = [];
    const viaFrom = part(edge, end.along);
    ways.push({
      durationS: (time[edge.from] ?? Infinity) + viaFrom.durationS,
      distanceM: (distance[edge.from] ?? Infinity) + viaFrom.distanceM,
    });
    // An end at the end of a one-way road is at its junction, which cars can
    // reach from any way.
    if (!edge.oneWay || (1 - end.along) * edge.lengthM < atJunctionM) {
      const viaTo = part(edge, 1 - end.along);
      ways.push({
        durationS: (time[edge.to] ?? Infinity) + viaTo.durationS,
        distanceM: (distance[edge.to] ?? Infinity) + viaTo.distanceM,
      });
    }
    if (end.edge === start.edge) {
      const share = end.along - start.along;
      if (share >= 0 || !edge.oneWay) ways.push(part(edge, Math.abs(share)));
    }
    const fastest = ways.reduce((a, b) => (b.durationS < a.durationS ? b : a));
    if (!Number.isFinite(fastest.durationS)) return null;
    return {
      distanceM: Math.max(1, Math.round(fastest.distanceM)),
      durationS: Math.max(1, Math.round(fastest.durationS)),
    };
  });
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
