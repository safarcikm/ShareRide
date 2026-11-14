// The map's projection: plain longitude and latitude, with longitude
// shortened by the cosine of 65° north, so Iceland keeps its shape. The map
// covers only Iceland, where this is close enough. Shared with
// scripts/build-iceland-map.ts, so it has no imports.

/** The edges of the drawn map, in degrees. */
export const mapEdges = { west: -24.7, east: -13.2, south: 63.2, north: 66.7 } as const;

const widthOfLongitude = Math.cos((65 * Math.PI) / 180);

/** Map units per degree of latitude; the map is 1000 units wide. */
export const unitsPerDegree = 1000 / ((mapEdges.east - mapEdges.west) * widthOfLongitude);

/** The whole map's size, in map units. */
export const mapSize = {
  width: 1000,
  height: (mapEdges.north - mapEdges.south) * unitsPerDegree,
} as const;

/** Kilometres per map unit, along a meridian. */
export const kilometresPerUnit = 111.2 / unitsPerDegree;

export interface Position {
  readonly longitude: number;
  readonly latitude: number;
}

export interface MapXY {
  readonly x: number;
  readonly y: number;
}

/** A position on the map, in map units from the top left. */
export function project(position: Position): MapXY {
  return {
    x: (position.longitude - mapEdges.west) * widthOfLongitude * unitsPerDegree,
    y: (mapEdges.north - position.latitude) * unitsPerDegree,
  };
}
