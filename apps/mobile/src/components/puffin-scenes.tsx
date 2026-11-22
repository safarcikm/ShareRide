/* eslint-disable @typescript-eslint/no-deprecated -- `x` and `y` on SVG shapes are
   coordinates; the types mark the transform style of the same name as deprecated. */
import { StyleSheet, useColorScheme, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { carDrawing, people, puffin } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Puffin } from "./puffin";

// Spec 15, section 5.3, "Puffin scenes": drawings around the screens, drawn
// like the board Martin saw (2026-11-22). Only pictures: the words beside
// them say what matters, so screen readers skip them.

/** The car's own drawing area, and how far the lines behind a moving car reach. */
const car = { left: 2, top: 26, width: 96, height: 62 } as const;
const behind = 29;

/** A puffin drawn straight on the screen: basalt, or lifted on the night screen. */
function useScene() {
  const scheme: "light" | "dark" = useColorScheme() === "dark" ? "dark" : "light";
  return { scheme, black: scheme === "dark" ? puffin.nightBlack : people.face };
}

/**
 * Two puffins in a little open car, from the side and driving right: the
 * driver in a crowberry hat in front, you in a moss scarf behind. `moving`
 * draws three lines behind it, for a seat just booked. `width` is the whole
 * drawing's, lines included.
 */
export function PuffinsInCar({
  width,
  moving = false,
}: {
  readonly width: number;
  readonly moving?: boolean;
}) {
  const palette = usePalette();
  const { scheme, black } = useScene();
  const colours = carDrawing[scheme];
  // In light mode the car is the seat view's pale cabin with a line of its
  // body; in dark mode its body with a line of the seats, lighter than night.
  const body = scheme === "dark" ? colours.body : colours.cabin;
  const line = scheme === "dark" ? colours.seat : colours.body;
  const left = moving ? car.left - behind : car.left;
  const across = moving ? car.width + behind : car.width;
  return (
    <View
      testID="puffins-in-car"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={styles.scene}
    >
      <Svg
        width={width}
        height={(width * car.height) / across}
        viewBox={`${String(left)} ${String(car.top)} ${String(across)} ${String(car.height)}`}
      >
        {moving ? (
          <Path
            testID="moving-lines"
            d="M-3 51 H-21 M0 56 H-25 M-4 61 H-18"
            stroke={palette.control}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ) : null}
        <Puffin
          testID="puffin-you"
          x={27}
          y={42.5}
          size={0.55}
          look={{ kind: "colour", scarf: people.mossLight, black }}
        />
        <Puffin
          testID="puffin-driver"
          x={61}
          y={44}
          size={0.6}
          look={{ kind: "colour", hat: people.crowberry, black }}
        />
        {/* The windscreen, with a glint. */}
        <Path
          d="M79.5 55 L83.5 37.5 Q84.3 35 86.8 35.6 Q89.2 36.4 88.6 39 L86 55 Z"
          fill={colours.glass}
          fillOpacity={0.85}
          stroke={body}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        <Path
          d="M84.6 39.5 L82.6 49"
          stroke={puffin.white}
          strokeWidth={1.4}
          strokeLinecap="round"
          opacity={0.9}
        />
        <Path
          d="M6 62 C6 56 10 54 16 54 L84 54 C91 54 95 58 95 64 L95 72 C95 75.5 93 77 89.5 77 L11 77 C8 77 6 75 6 72 Z"
          fill={body}
        />
        <Path d="M6 66.5 L95 66.5" stroke={line} strokeWidth={2.2} />
        <Rect x={44} y={60} width={8} height={2.6} rx={1.3} fill={line} />
        {/* The front light, then the back light. */}
        <Rect x={89} y={58.5} width={6} height={5} rx={2.5} fill={people.sun} />
        <Rect x={6} y={58.5} width={5} height={5} rx={2.5} fill={people.crowberry} />
        {[25, 75].map((cx) => (
          <Wheel key={cx} cx={cx} tyre={colours.wheel} hub={colours.taken} />
        ))}
      </Svg>
    </View>
  );
}

function Wheel({
  cx,
  tyre,
  hub,
}: {
  readonly cx: number;
  readonly tyre: string;
  readonly hub: string;
}) {
  return (
    <>
      <Circle cx={cx} cy={77} r={10.5} fill={tyre} />
      <Circle cx={cx} cy={77} r={4.2} fill={hub} />
    </>
  );
}

/** The standing puffin's drawing area, its head's middle at 0, 0. */
const stand = { left: -38, top: -42, width: 100, height: 104 } as const;

/**
 * A whole puffin standing, three-quarters to the right, in a crowberry
 * scarf, beside a map pin: for a screen with nothing on it yet, over its
 * sentence and lined up with it. `height` is the drawing's.
 */
export function PuffinByPin({
  height,
  align = "center",
}: {
  readonly height: number;
  readonly align?: "center" | "start";
}) {
  const palette = usePalette();
  const { scheme, black } = useScene();
  return (
    <View
      testID="puffin-by-pin"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={align === "start" ? styles.start : styles.scene}
    >
      <Svg
        width={(height * stand.width) / stand.height}
        height={height}
        viewBox={`${String(stand.left)} ${String(stand.top)} ${String(stand.width)} ${String(stand.height)}`}
      >
        {/* Feet, body, its white front and a wing, then the head. */}
        <Path d="M-9 50 Q-12 57 -17 58.4 L-1 58.4 Q-3 54 -3 50 Z" fill={puffin.beak} />
        <Path d="M7 50 Q6 56 2 58.4 L18 58.4 Q12 55 12 50 Z" fill={puffin.beak} />
        <Path d="M-19 12 C-27 24 -26 44 -14 51 Q-2 55 10 52 C22 47 25 30 17 13 Z" fill={black} />
        <Path
          d="M-4 18 C-9 28 -8 42 -1 49 Q5 51 10 49 C19 43 21 30 15 18 Q6 14 -4 18 Z"
          fill={puffin.white}
        />
        <Path
          d="M-18 22 C-24 30 -22 41 -14 46 C-15 38 -13 30 -10 24"
          stroke={puffin.eyeMark}
          strokeOpacity={0.5}
          strokeWidth={1.2}
          strokeLinecap="round"
          fill="none"
        />
        <Puffin
          testID="puffin-standing"
          x={0}
          y={0}
          size={1}
          look={{ kind: "colour", scarf: people.crowberry, black }}
        />
        {/* The pin on its pole. */}
        <Rect x={43} y={-10} width={3.2} height={68} rx={1.6} fill={carDrawing[scheme].steering} />
        <Path
          d="M44.6 -4 C40 -10 34 -15 34 -23 C34 -29 38.6 -33.6 44.6 -33.6 C50.6 -33.6 55.2 -29 55.2 -23 C55.2 -15 49.2 -10 44.6 -4 Z"
          fill={palette.primary}
        />
        <Circle cx={44.6} cy={-23} r={4.4} fill={palette.surface} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { alignItems: "center" },
  start: { alignItems: "flex-start" },
});
