// The `Router` port (spec 2, 3.7): what finds the legs between meeting
// points. On servers and locally it is our own road file of Iceland
// (ADR 0031); API tests use straight lines, so they need no map data.
import { loadRoadGraph } from "@shareride/db";
import {
  joinRoad,
  legsFrom,
  legsTo,
  metresBetween,
  type Position,
  type RoadGraph,
  type RoadLeg,
  type RoadPosition,
} from "@shareride/domain";

/** The map data legs come from. */
export interface MapData {
  /** Stored with each leg, so the console can tell legs on older data. */
  readonly source: string;
  /** When the map data was taken; none for a stand-in. */
  readonly mapDate: string | null;
  /** The attribution the data's licence asks for, shown in the console. */
  readonly attribution: string;
}

export interface Router {
  mapData(): Promise<MapData>;
  /** The fastest legs from `start` to each of `ends`; null where no road connects them. */
  legsFrom(start: Position, ends: readonly Position[]): Promise<(RoadLeg | null)[]>;
  /** The fastest legs from each of `starts` to `end`; null where no road connects them. */
  legsTo(end: Position, starts: readonly Position[]): Promise<(RoadLeg | null)[]>;
  /** Whether a place is near enough a road to have legs (1 km). */
  nearRoad(position: Position): Promise<boolean>;
}

/** The road file's source, as stored with each leg: "road file " and the map date. */
export const roadFileSourcePrefix = "road file ";

/**
 * Legs on our road file, read on first use and kept in memory (about
 * 50 MB). A meeting point joins the nearest road within 1 km; where it
 * joins is kept, since points rarely move.
 */
export function createRoadFileRouter(load: () => Promise<RoadGraph> = loadRoadGraph): Router {
  let graph: Promise<RoadGraph> | undefined;
  const loaded = (): Promise<RoadGraph> => {
    graph ??= load().catch((error: unknown) => {
      graph = undefined;
      throw error;
    });
    return graph;
  };
  const joins = new Map<string, RoadPosition | null>();
  const join = (roads: RoadGraph, position: Position) => {
    const key = `${String(position.latitude)},${String(position.longitude)}`;
    let joined = joins.get(key);
    if (joined === undefined) {
      joined = joinRoad(roads, position);
      joins.set(key, joined);
    }
    return joined;
  };
  /** Legs from or to one point, null for every other point off the roads. */
  const legs = async (
    origin: Position,
    others: readonly Position[],
    find: typeof legsFrom,
  ): Promise<(RoadLeg | null)[]> => {
    const roads = await loaded();
    const from = join(roads, origin);
    const joined = others.map((other) => join(roads, other));
    if (from === null) return others.map(() => null);
    const onRoads = joined.flatMap((position) => (position === null ? [] : [position]));
    const found = find(roads, from, onRoads);
    let next = 0;
    return joined.map((position) => (position === null ? null : (found[next++] ?? null)));
  };

  return {
    async mapData() {
      const roads = await loaded();
      return {
        source: `${roadFileSourcePrefix}${roads.mapDate}`,
        mapDate: roads.mapDate,
        attribution: roads.source,
      };
    },
    legsFrom: (start, ends) => legs(start, ends, legsFrom),
    legsTo: (end, starts) => legs(end, starts, legsTo),
    async nearRoad(position) {
      return join(await loaded(), position) !== null;
    },
  };
}

/**
 * Legs a quarter longer than the straight line, at 60 km/h: for tests,
 * which need no map data. `offRoad` names places with no road.
 */
export function createStraightLineRouter(
  options: { readonly offRoad?: (position: Position) => boolean } = {},
): Router {
  const offRoad = options.offRoad ?? (() => false);
  const leg = (from: Position, to: Position): RoadLeg | null => {
    if (offRoad(from) || offRoad(to)) return null;
    const distanceM = metresBetween(from, to) * 1.25;
    return {
      distanceM: Math.max(1, Math.round(distanceM)),
      durationS: Math.max(1, Math.round(distanceM / (60_000 / 3600))),
    };
  };
  return {
    mapData: () =>
      Promise.resolve({ source: "straight lines", mapDate: null, attribution: "Straight lines" }),
    legsFrom: (start, ends) => Promise.resolve(ends.map((end) => leg(start, end))),
    legsTo: (end, starts) => Promise.resolve(starts.map((start) => leg(start, end))),
    nearRoad: (position) => Promise.resolve(!offRoad(position)),
  };
}
