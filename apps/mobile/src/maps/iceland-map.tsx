import { memo, useState } from "react";
import {
  type GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";
import Svg, { Circle, G, Polygon, Polyline } from "react-native-svg";
import { controlOutline, edges, mapDrawing, radii } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { glaciers, land, roads } from "./iceland-data";
import { project, type Position } from "./projection";
import { dotsNear, viewFor, wholeMap } from "./view";

/** On the web a label counts only on an element with a role. */
const imageRole: object = Platform.OS === "web" ? { role: "img" } : {};

/** A meeting point on the map; a chosen one stands out. */
export interface MapDot {
  readonly id: string;
  readonly position: Position;
  readonly chosen?: boolean;
}

// Sizes on screen, in points, whatever part of the map is shown.
const strokes = { coast: 1, road: 1.25, ringRoad: 2.25 } as const;
const dot = { radius: 5, outline: 1.5 } as const;
const chosenDot = { radius: 7, outline: 2.5, halo: 14 } as const;
/** How far from a tap a dot still counts: half the smallest touch target. */
const reach = 22;
/** Until the map knows its width, it guesses a phone's. */
const guessedWidth = 343;

/**
 * Our own map of Iceland (ADR 0024): the land, glaciers, main roads and the
 * Ring Road, with meeting points as dots. It shows the whole of Iceland, or
 * the part around `fit`, and does not zoom. One image for screen readers;
 * every screen with a map also lists its points. With `onPressDots`, a tap
 * tells which dots are near it, nearest first, or none.
 */
export function IcelandMap({
  label,
  dots,
  fit,
  onPressDots,
}: {
  readonly label: string;
  readonly dots: readonly MapDot[];
  readonly fit?: readonly Position[];
  readonly onPressDots?: (ids: string[]) => void;
}) {
  const palette = usePalette();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const [width, setWidth] = useState(0);
  const view = fit === undefined ? wholeMap : viewFor(fit.map(project));
  const unitsPerPoint = view.width / (width > 0 ? width : guessedWidth);
  const placed = dots.map((one) => ({ ...one, at: project(one.position) }));
  const units = (points: number) => points * unitsPerPoint;

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
      style={[
        styles.frame,
        {
          backgroundColor: mapDrawing[scheme].sea,
          borderColor: palette.border,
          borderBottomColor: palette.edge,
        },
      ]}
    >
      <View
        testID="map-area"
        style={{ aspectRatio: view.width / view.height }}
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
        }}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={[view.x, view.y, view.width, view.height].join(" ")}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Base scheme={scheme} unitsPerPoint={unitsPerPoint} />
          {placed
            .filter((one) => one.chosen !== true)
            .map((one) => (
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
          {placed
            .filter((one) => one.chosen === true)
            .map((one) => (
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
    borderWidth: controlOutline,
    borderBottomWidth: edges.card,
  },
});
