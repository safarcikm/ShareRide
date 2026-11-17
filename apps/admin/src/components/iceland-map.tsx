import {
  glaciers,
  land,
  project,
  roads,
  viewFor,
  wholeMap,
  type Position,
} from "@shareride/ui/map";
import { memo } from "react";

/** A meeting point on the map: `plain`, or `chosen` to stand out. */
export interface MapDot {
  readonly id: string;
  readonly position: Position;
  readonly look?: "plain" | "chosen";
}

// Lines in screen pixels whatever part of the map is shown (non-scaling strokes).
const strokes = { coast: 1, road: 1.25, ringRoad: 2.25, dotOutline: 1.5 } as const;
// Dots in parts of the drawing's width, as the console's map is about this wide.
const drawnWidth = 640;
const dot = { plain: 5, chosen: 7, halo: 14 } as const;

/**
 * Our own map of Iceland (ADR 0024), as the app draws it: the land,
 * glaciers, main roads and the Ring Road, with meeting points as dots. The
 * whole of Iceland, or with `fit` the part around its dots; no zoom. One
 * image for screen readers: every page with a map also lists its points.
 */
export function IcelandMap({
  label,
  dots,
  fit = false,
}: {
  readonly label: string;
  readonly dots: readonly MapDot[];
  readonly fit?: boolean;
}) {
  const placed = dots.map((one) => ({ ...one, at: project(one.position) }));
  const view = fit ? viewFor(placed.map((one) => one.at)) : wholeMap;
  const units = (pixels: number) => (pixels * view.width) / drawnWidth;
  const ofLook = (look: NonNullable<MapDot["look"]>) =>
    placed.filter((one) => (one.look ?? "plain") === look);

  return (
    <svg
      className="iceland-map"
      role="img"
      aria-label={label}
      viewBox={[view.x, view.y, view.width, view.height].join(" ")}
      preserveAspectRatio="xMidYMid meet"
    >
      <Base />
      {ofLook("plain").map((one) => (
        <circle
          key={one.id}
          data-dot="plain"
          cx={one.at.x}
          cy={one.at.y}
          r={units(dot.plain)}
          className="map-dot"
          strokeWidth={strokes.dotOutline}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {ofLook("chosen").map((one) => (
        <g key={one.id} data-dot="chosen">
          <circle cx={one.at.x} cy={one.at.y} r={units(dot.halo)} className="map-halo" />
          <circle
            cx={one.at.x}
            cy={one.at.y}
            r={units(dot.chosen)}
            className="map-dot"
            strokeWidth={strokes.dotOutline}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </svg>
  );
}

/** The land, glaciers and roads on the sea (the map's background): drawn once. */
const Base = memo(function Base() {
  const line = {
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    vectorEffect: "non-scaling-stroke",
  } as const;
  return (
    <>
      <g data-part="land" className="map-land">
        {land.map((shape) => (
          <polygon
            key={shape}
            points={shape}
            strokeWidth={strokes.coast}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      <g data-part="glaciers" className="map-glacier">
        {glaciers.map((shape) => (
          <polygon key={shape} points={shape} />
        ))}
      </g>
      <g data-part="roads" className="map-road">
        {roads
          .filter((road) => !road.ring)
          .map((road) => (
            <polyline key={road.points} points={road.points} strokeWidth={strokes.road} {...line} />
          ))}
      </g>
      <g data-part="ring-road" className="map-ring-road">
        {roads
          .filter((road) => road.ring)
          .map((road) => (
            <polyline
              key={road.points}
              points={road.points}
              strokeWidth={strokes.ringRoad}
              {...line}
            />
          ))}
      </g>
    </>
  );
});
