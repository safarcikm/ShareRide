import { memo, useMemo, useState } from "react";
import {
  type GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";
import Svg, { Circle, G, Polygon, Polyline } from "react-native-svg";
import { cardLift } from "@/theme/pressable";
import { mapDrawing, radii } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import {
  alongRoads,
  dotsNear,
  glaciers,
  land,
  project,
  roads,
  viewFor,
  wholeMap,
  type MapXY,
  type Position,
} from "@shareride/ui/map";

/** On the web a label counts only on an element with a role. */
const imageRole: object = Platform.OS === "web" ? { role: "img" } : {};

/**
 * A meeting point on the map: `plain` by default, `chosen` to stand out,
 * such as the ends of a passenger's part, or `muted`, such as a stop off it.
 */
export interface MapDot {
  readonly id: string;
  readonly position: Position;
  readonly look?: "plain" | "chosen" | "muted";
}

/**
 * A line through positions in order, along the drawn roads: a trip's whole
 * `route`, muted, or the `part` a passenger rides or a driver drives.
 */
export interface MapLine {
  readonly id: string;
  readonly positions: readonly Position[];
  readonly look: "route" | "part";
}

// Sizes on screen, in points, whatever part of the map is shown.
const strokes = {
  coast: 1,
  road: 1.25,
  ringRoad: 2.25,
  route: 3,
  dash: 5,
  part: 4,
  casing: 2,
} as const;
const dot = { radius: 5, outline: 1.5 } as const;
const mutedDot = { radius: 4, outline: 1.5 } as const;
const chosenDot = { radius: 7, outline: 2.5, halo: 14 } as const;
/** How far from a tap a dot still counts: half the smallest touch target. */
const reach = 22;
/** Until the map knows its width, it guesses a phone's. */
const guessedWidth = 343;

/**
 * Our own map of Iceland (ADR 0024): the land, glaciers, main roads and the
 * Ring Road, with meeting points as dots and routes as lines along the
 * roads. It shows the whole of Iceland, or with `fit` the part that holds
 * its dots and lines, and does not zoom. One image for screen readers;
 * every screen with a map also lists its points. With `onPressDots`, a tap
 * tells which dots are near it, nearest first, or none.
 */
export function IcelandMap({
  label,
  dots,
  lines = [],
  fit = false,
  onPressDots,
}: {
  readonly label: string;
  readonly dots: readonly MapDot[];
  readonly lines?: readonly MapLine[];
  readonly fit?: boolean;
  readonly onPressDots?: (ids: string[]) => void;
}) {
  const palette = usePalette();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const [width, setWidth] = useState(0);
  const placed = dots.map((one) => ({ ...one, at: project(one.position) }));
  const drawn = useDrawnLines(lines);
  const view = fit
    ? viewFor([...placed.map((one) => one.at), ...drawn.flatMap((line) => line.points)])
    : wholeMap;
  const unitsPerPoint = view.width / (width > 0 ? width : guessedWidth);
  const units = (points: number) => points * unitsPerPoint;
  const ofLook = (look: MapDot["look"]) => placed.filter((one) => (one.look ?? "plain") === look);

  const onPress = (event: GestureResponderEvent) => {
    if (onPressDots === undefined || width === 0) return;
    const tap = tapPoint(event);
    onPressDots(
      dotsNear(placed, { x: view.x + units(tap.x), y: view.y + units(tap.y) }, units(reach)),
    );
  };

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      {...imageRole}
      testID="iceland-map"
      style={[styles.frame, { backgroundColor: mapDrawing[scheme].sea }, cardLift(scheme).face]}
    >
      <View
        testID="map-area"
        style={{ aspectRatio: view.width / view.height }}
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
        }}
      >
        <Svg
          testID="map-drawing"
          width="100%"
          height="100%"
          viewBox={[view.x, view.y, view.width, view.height].join(" ")}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Base scheme={scheme} unitsPerPoint={unitsPerPoint} />
          {drawn
            .filter((line) => line.look === "route")
            .map((line) => (
              <G key={line.id}>
                {/* Dashes on a casing, so the rest of the trip never reads as a road. */}
                <Polyline
                  points={line.text}
                  fill="none"
                  stroke={palette.surface}
                  strokeWidth={units(strokes.route + 2 * strokes.casing)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Polyline
                  testID="map-line-route"
                  points={line.text}
                  fill="none"
                  stroke={palette.control}
                  strokeWidth={units(strokes.route)}
                  strokeDasharray={[units(strokes.dash), units(strokes.dash)].join(" ")}
                  strokeLinejoin="round"
                />
              </G>
            ))}
          {drawn
            .filter((line) => line.look === "part")
            .map((line) => (
              <G key={line.id}>
                {/* A casing in the surface colour keeps the line clear of the roads under it. */}
                <Polyline
                  points={line.text}
                  fill="none"
                  stroke={palette.surface}
                  strokeWidth={units(strokes.part + 2 * strokes.casing)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Polyline
                  testID="map-line-part"
                  points={line.text}
                  fill="none"
                  stroke={palette.primary}
                  strokeWidth={units(strokes.part)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </G>
            ))}
          {ofLook("muted").map((one) => (
            <Circle
              key={one.id}
              testID="map-dot-muted"
              cx={one.at.x}
              cy={one.at.y}
              r={units(mutedDot.radius)}
              fill={palette.control}
              stroke={palette.surface}
              strokeWidth={units(mutedDot.outline)}
            />
          ))}
          {ofLook("plain").map((one) => (
            <Circle
              key={one.id}
              testID="map-dot"
              cx={one.at.x}
              cy={one.at.y}
              r={units(dot.radius)}
              fill={palette.primary}
              stroke={palette.surface}
              strokeWidth={units(dot.outline)}
            />
          ))}
          {ofLook("chosen").map((one) => (
            <G key={one.id} testID="map-dot-chosen">
              <Circle
                cx={one.at.x}
                cy={one.at.y}
                r={units(chosenDot.halo)}
                fill={palette.primary}
                opacity={0.25}
              />
              <Circle
                cx={one.at.x}
                cy={one.at.y}
                r={units(chosenDot.radius)}
                fill={palette.primary}
                stroke={palette.surface}
                strokeWidth={units(chosenDot.outline)}
              />
            </G>
          ))}
        </Svg>
        {onPressDots === undefined ? null : (
          <Pressable
            testID="map-touch"
            accessible={false}
            focusable={false}
            importantForAccessibility="no"
            style={StyleSheet.absoluteFill}
            onPress={onPress}
          />
        )}
      </View>
    </View>
  );
}

/** A line's way along the roads, as points and as the text a polyline takes. */
interface Way {
  readonly points: readonly MapXY[];
  readonly text: string;
}

/**
 * The ways found before, by their positions. Finding a way along the roads
 * takes a little while, and a map that changes one line, as search results
 * do when they show another trip, must not find the others again. The
 * newest few are kept.
 */
const ways = new Map<string, Way>();
const waysKept = 64;

function wayAlong(positions: readonly Position[]): Way {
  const key = JSON.stringify(positions);
  const known = ways.get(key);
  if (known !== undefined) return known;
  const points = alongRoads(positions.map(project));
  const way = {
    points,
    text: points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
  };
  const oldest = ways.keys().next();
  if (ways.size >= waysKept && oldest.done !== true) ways.delete(oldest.value);
  ways.set(key, way);
  return way;
}

/** The lines along the roads, put together again only when a line changes. */
function useDrawnLines(lines: readonly MapLine[]) {
  const key = JSON.stringify(lines);
  return useMemo(
    () => (JSON.parse(key) as MapLine[]).map((line) => ({ ...line, ...wayAlong(line.positions) })),
    [key],
  );
}

/** The sea, land, glaciers and roads: the same for every map, so drawn once. */
const Base = memo(function Base({
  scheme,
  unitsPerPoint,
}: {
  readonly scheme: "light" | "dark";
  readonly unitsPerPoint: number;
}) {
  const colours = mapDrawing[scheme];
  const line = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <>
      <G testID="map-land" fill={colours.land} stroke={colours.coast}>
        {land.map((shape) => (
          <Polygon
            key={shape}
            points={shape}
            strokeWidth={strokes.coast * unitsPerPoint}
            strokeLinejoin="round"
          />
        ))}
      </G>
      <G testID="map-glaciers" fill={colours.glacier}>
        {glaciers.map((shape) => (
          <Polygon key={shape} points={shape} />
        ))}
      </G>
      <G testID="map-roads" stroke={colours.road}>
        {roads
          .filter((road) => !road.ring)
          .map((road) => (
            <Polyline
              key={road.points}
              points={road.points}
              strokeWidth={strokes.road * unitsPerPoint}
              {...line}
            />
          ))}
      </G>
      <G testID="map-ring-road" stroke={colours.ringRoad}>
        {roads
          .filter((road) => road.ring)
          .map((road) => (
            <Polyline
              key={road.points}
              points={road.points}
              strokeWidth={strokes.ringRoad * unitsPerPoint}
              {...line}
            />
          ))}
      </G>
    </>
  );
});

/**
 * Where a tap was, from the map's top left. Phones give it; a browser's
 * click gives it from the element clicked, which is the touch area itself.
 */
function tapPoint(event: GestureResponderEvent) {
  const native = event.nativeEvent as {
    readonly locationX?: number;
    readonly locationY?: number;
    readonly offsetX?: number;
    readonly offsetY?: number;
  };
  return { x: native.locationX ?? native.offsetX ?? 0, y: native.locationY ?? native.offsetY ?? 0 };
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    borderRadius: radii.card,
  },
});
