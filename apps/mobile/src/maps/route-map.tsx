import { IcelandMap, type MapDot, type MapLine } from "./iceland-map";
import type { Position } from "@shareride/ui/map";

/**
 * A trip's stops on our map, in the part of Iceland the trip needs (ADR
 * 0024). The line follows the drawn roads. With a passenger's `part`, the
 * rest of the trip is muted and the part is solid, with its ends standing
 * out; without one, the whole route is the part, as a driver sees it.
 * `wide` draws it as a band, for the main column of a wide page.
 */
export function RouteMap({
  label,
  stops,
  part = { board: 0, alight: stops.length - 1 },
  wide = false,
}: {
  readonly label: string;
  readonly stops: readonly Position[];
  readonly part?: { readonly board: number; readonly alight: number };
  readonly wide?: boolean;
}) {
  const dots: MapDot[] = stops.map((position, index) => ({
    id: String(index),
    position,
    look:
      index === part.board || index === part.alight
        ? "chosen"
        : index > part.board && index < part.alight
          ? "plain"
          : "muted",
  }));
  const whole = part.board === 0 && part.alight === stops.length - 1;
  const lines: MapLine[] = [
    ...(whole ? [] : [{ id: "route", positions: stops, look: "route" as const }]),
    { id: "part", positions: stops.slice(part.board, part.alight + 1), look: "part" },
  ];
  return <IcelandMap label={label} dots={dots} lines={lines} fit={wide ? "wide" : true} />;
}
