import { mapSize, type MapXY } from "./projection.ts";

/** A part of the map, in map units: what the drawing's view box shows. */
export interface MapView {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const wholeMap: MapView = { x: 0, y: 0, width: mapSize.width, height: mapSize.height };

/** The narrowest part shown, about 85 km, and the widest and tallest shapes. */
const smallest = 160;
const ratio = { tallest: 1, widest: 1.6 };

/**
 * The part of the map that holds the points with room around them: at least
 * a region wide, never a thin strip, and never off the map. The map does not
 * zoom (ADR 0024); this only chooses what one drawing shows.
 */
export function viewFor(points: readonly MapXY[]): MapView {
  if (points.length === 0) return wholeMap;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const spanX = Math.max(...xs) - left;
  const spanY = Math.max(...ys) - top;
  const room = Math.max(spanX, spanY) * 0.15 + 20;
  let width = Math.max(spanX + 2 * room, smallest);
  let height = Math.max(spanY + 2 * room, smallest / ratio.widest);
  if (width / height > ratio.widest) height = width / ratio.widest;
  if (width / height < ratio.tallest) width = height * ratio.tallest;
  if (width >= mapSize.width * 0.8 || height >= mapSize.height * 0.8) return wholeMap;
  const clamp = (start: number, size: number, limit: number) =>
    Math.min(Math.max(start, 0), limit - size);
  return {
    x: clamp(left + spanX / 2 - width / 2, width, mapSize.width),
    y: clamp(top + spanY / 2 - height / 2, height, mapSize.height),
    width,
    height,
  };
}

/**
 * The dots within `reach` map units of a tap, nearest first. Without zoom,
 * points close together share a spot on the map, so a tap means all of them.
 */
export function dotsNear(
  dots: readonly { readonly id: string; readonly at: MapXY }[],
  tap: MapXY,
  reach: number,
): string[] {
  return dots
    .map((dot) => ({ id: dot.id, away: Math.hypot(dot.at.x - tap.x, dot.at.y - tap.y) }))
    .filter((dot) => dot.away <= reach)
    .sort((a, b) => a.away - b.away)
    .map((dot) => dot.id);
}
