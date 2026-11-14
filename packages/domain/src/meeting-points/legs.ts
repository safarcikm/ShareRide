// Legs: the road distance and typical driving time between two meeting
// points, computed ahead and stored (spec 2, section 3.7; ADR 0009).

export interface Leg {
  readonly from: string;
  readonly to: string;
  readonly distanceM: number;
  readonly durationS: number;
}

/** A stretch of road between two neighbouring points, the same both ways. */
export type RoadEdge = Leg;

/**
 * Legs for every ordered pair of points connected by road: the shortest
 * way along the edges, with the driving time along that way. Used with the
 * sample road graph until the routing engine computes legs (spec 2, 3.7).
 */
export function legsFromRoadGraph(edges: readonly RoadEdge[]): Leg[] {
  const neighbours = new Map<string, RoadEdge[]>();
  const connect = (edge: RoadEdge) => {
    neighbours.set(edge.from, [...(neighbours.get(edge.from) ?? []), edge]);
  };
  for (const edge of edges) {
    connect(edge);
    connect({ ...edge, from: edge.to, to: edge.from });
  }

  const legs: Leg[] = [];
  for (const start of [...neighbours.keys()].sort()) {
    // Dijkstra: the graph has tens of points, so a plain list is quick enough.
    const best = new Map<string, { distanceM: number; durationS: number }>([
      [start, { distanceM: 0, durationS: 0 }],
    ]);
    const done = new Set<string>();
    for (;;) {
      let current: string | undefined;
      for (const [point, reach] of best) {
        if (done.has(point)) continue;
        if (current === undefined || reach.distanceM < (best.get(current)?.distanceM ?? Infinity)) {
          current = point;
        }
      }
      if (current === undefined) break;
      done.add(current);
      const reached = best.get(current) ?? { distanceM: 0, durationS: 0 };
      for (const edge of neighbours.get(current) ?? []) {
        const distanceM = reached.distanceM + edge.distanceM;
        if (distanceM < (best.get(edge.to)?.distanceM ?? Infinity)) {
          best.set(edge.to, { distanceM, durationS: reached.durationS + edge.durationS });
        }
      }
    }
    for (const [end, reach] of [...best].sort(([a], [b]) => a.localeCompare(b))) {
      if (end !== start) legs.push({ from: start, to: end, ...reach });
    }
  }
  return legs;
}
