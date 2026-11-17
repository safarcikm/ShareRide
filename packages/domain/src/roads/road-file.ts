// Our own road file (ADR 0030): the roads cars may use in Iceland, from
// OpenStreetMap, as a graph of junctions and the roads between them. The
// file is JSON; this reads it into arrays that are quick to route on.
import type { Position } from "../meeting-points/coordinates.ts";

/** Coordinates in the file are whole numbers of this many degrees. */
export const roadFileDegreeUnit = 1e-5;

/** The file as stored (format 1). */
export interface RoadFile {
  readonly format: 1;
  /** When the OpenStreetMap data was taken, as an ISO timestamp. */
  readonly mapDate: string;
  /** Where the data comes from, for the attribution its licence asks for. */
  readonly source: string;
  /**
   * Junctions and road ends as longitude and latitude pairs in
   * `roadFileDegreeUnit`, each pair the difference from the one before.
   */
  readonly nodes: readonly number[];
  readonly edges: readonly RoadFileEdge[];
}

/**
 * A road between two nodes: [from, to, length in metres, typical speed in
 * km/h, 1 when cars may drive it only from `from` to `to` (else 0), the
 * points between as longitude and latitude differences in
 * `roadFileDegreeUnit`, the first from `from`].
 */
export type RoadFileEdge = readonly [
  from: number,
  to: number,
  lengthM: number,
  speedKmh: number,
  oneWay: 0 | 1,
  shape: readonly number[],
];

export interface RoadGraphEdge {
  readonly from: number;
  readonly to: number;
  readonly lengthM: number;
  readonly durationS: number;
  /** Cars may drive it only from `from` to `to`. */
  readonly oneWay: boolean;
  /** Longitude and latitude pairs from `from` to `to`, both ends included. */
  readonly shape: Float64Array;
}

export interface RoadGraph {
  readonly mapDate: string;
  readonly source: string;
  readonly nodeCount: number;
  readonly edges: readonly RoadGraphEdge[];
  /** For each node, the edges that touch it. */
  readonly touching: readonly (readonly number[])[];
}

/** Reads a road file into a graph, or says why it cannot. */
export function readRoadFile(file: RoadFile): RoadGraph {
  const format: unknown = file.format;
  if (format !== 1) throw new Error(`Unknown road file format ${String(format)}.`);
  if (file.nodes.length % 2 !== 0) throw new Error("The road file's nodes are not in pairs.");
  const nodeCount = file.nodes.length / 2;
  const longitude = new Float64Array(nodeCount);
  const latitude = new Float64Array(nodeCount);
  let x = 0;
  let y = 0;
  for (let node = 0; node < nodeCount; node += 1) {
    x += file.nodes[node * 2] ?? 0;
    y += file.nodes[node * 2 + 1] ?? 0;
    longitude[node] = x * roadFileDegreeUnit;
    latitude[node] = y * roadFileDegreeUnit;
  }

  const touching: number[][] = Array.from({ length: nodeCount }, () => []);
  const edges = file.edges.map(([from, to, lengthM, speedKmh, oneWay, between], index) => {
    if (from >= nodeCount || to >= nodeCount || from < 0 || to < 0) {
      throw new Error(`Road ${String(index)} joins a node the file does not have.`);
    }
    if (lengthM <= 0 || speedKmh <= 0) {
      throw new Error(`Road ${String(index)} has no length or speed.`);
    }
    const startX = Math.round((longitude[from] ?? 0) / roadFileDegreeUnit);
    const startY = Math.round((latitude[from] ?? 0) / roadFileDegreeUnit);
    const shape = new Float64Array(between.length + 4);
    shape[0] = longitude[from] ?? 0;
    shape[1] = latitude[from] ?? 0;
    let px = startX;
    let py = startY;
    for (let at = 0; at < between.length; at += 2) {
      px += between[at] ?? 0;
      py += between[at + 1] ?? 0;
      shape[at + 2] = px * roadFileDegreeUnit;
      shape[at + 3] = py * roadFileDegreeUnit;
    }
    shape[between.length + 2] = longitude[to] ?? 0;
    shape[between.length + 3] = latitude[to] ?? 0;
    touching[from]?.push(index);
    if (to !== from) touching[to]?.push(index);
    return {
      from,
      to,
      lengthM,
      durationS: (lengthM / 1000 / speedKmh) * 3600,
      oneWay: oneWay === 1,
      shape,
    };
  });
  return { mapDate: file.mapDate, source: file.source, nodeCount, edges, touching };
}

const earthRadiusM = 6_371_008.8;

/** The distance in metres between two points on the earth (haversine). */
export function metresBetween(a: Position, b: Position): number {
  const toRadians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * toRadians;
  const dLon = (b.longitude - a.longitude) * toRadians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * toRadians) * Math.cos(b.latitude * toRadians) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}
