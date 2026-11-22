/* eslint-disable @typescript-eslint/no-deprecated -- `x` and `y` on SVG shapes are
   coordinates; the types mark the transform style of the same name as deprecated. */
import { useId } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import { carDrawing, people, puffin, puffinCar } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Puffin } from "./puffin";

// Spec 15, section 5.3, "Puffin scenes": drawings around the screens, drawn
// like the board Martin saw (2026-11-22). Only pictures: the words beside
// them say what matters, so screen readers skip them.

/** The car's own drawing area, and how far the lines behind a moving car reach. */
const car = { left: 4, top: 9, width: 190, height: 108 } as const;
const behind = 32;

/** The side windows, the back one first: the puffins show through them. */
const windows = "M42 66 C44 50 56 39 77 37 L77 66 Z M83 37 C103 37 116 47 124 66 L83 66 Z";

/** A puffin drawn straight on the screen: basalt, or lifted on the night screen. */
function useScene() {
  const scheme: "light" | "dark" = useColorScheme() === "dark" ? "dark" : "light";
  return { scheme, black: scheme === "dark" ? puffin.nightBlack : people.face };
}

/**
 * Two puffins in a round little car, from the side and driving right: the
 * driver in a crowberry hat in front, you in a moss scarf behind, both seen
 * through the side windows, and a case on the roof. `moving` draws three
 * lines behind it, for a seat just booked. `width` is the whole drawing's,
 * lines included.
 */
export function PuffinsInCar({
  width,
  moving = false,
}: {
  readonly width: number;
  readonly moving?: boolean;
}) {
  const palette = usePalette();
  const { black } = useScene();
  // Its own name for the windows' outline, as two cars can be on one page.
  const clip = `windows-${useId().replaceAll(":", "")}`;
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
        <Defs>
          <ClipPath id={clip}>
            <Path d={windows} />
          </ClipPath>
        </Defs>
        {moving ? (
          <Path
            testID="moving-lines"
            d="M-4 78 H-24 M0 88 H-28 M-6 98 H-20"
            stroke={palette.control}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ) : null}
        {/* The case on the roof rack. */}
        <Rect x={58} y={16} width={42} height={12} rx={3} fill={people.crowberry} />
        <Rect
          x={75}
          y={13}
          width={9}
          height={4}
          rx={2}
          fill="none"
          stroke={black}
          strokeWidth={1.6}
        />
        <Path d="M64 16 V28 M94 16 V28" stroke={puffinCar.strap} strokeWidth={2} />
        <Path
          d="M52 29 H106 M60 29 V33 M98 29 V33"
          stroke={black}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        {/* The body: a round roof, a short round back and a sloping bonnet. */}
        <Path
          d="M14 98 C10 86 16 74 30 69 C34 46 54 31 80 31 C106 31 122 44 130 64 C152 65 172 70 182 81 C186 86 186 92 185 98 Z"
          fill={puffinCar.body}
        />
        <Path d={windows} fill={puffinCar.glass} />
        {/* The puffins sit inside, so the glass's edges cut them. */}
        <G clipPath={`url(#${clip})`}>
          <Puffin
            testID="puffin-you"
            x={58}
            y={57}
            size={0.54}
            look={{ kind: "colour", scarf: people.mossLight }}
          />
          <Puffin
            testID="puffin-driver"
            x={96}
            y={58}
            size={0.58}
            look={{ kind: "colour", hat: people.crowberry }}
          />
        </G>
        {/* A glint on the windscreen, the door and its handle. */}
        <Path
          d="M114 48 L107 62"
          stroke={puffin.white}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.7}
        />
        <Path d="M80 68 V91" stroke={puffinCar.wing} strokeWidth={1.6} strokeLinecap="round" />
        <Rect x={85} y={72} width={8} height={2.6} rx={1.3} fill={puffinCar.wing} />
        {/* The wings over the wheels, and the step between them. */}
        <Path d="M26 98 C26 80 38 72 52 72 C66 72 77 80 78 98 Z" fill={puffinCar.wing} />
        <Path d="M124 98 C125 80 137 72 151 72 C165 72 176 80 178 98 Z" fill={puffinCar.wing} />
        <Rect x={74} y={93} width={54} height={6} rx={3} fill={puffinCar.trim} />
        {/* The headlight, the back light and the bumpers. */}
        <Circle
          cx={170}
          cy={80}
          r={6.2}
          fill={puffinCar.headlight}
          stroke={puffinCar.trim}
          strokeWidth={2}
        />
        <Rect x={11} y={78} width={6} height={9} rx={3} fill={people.crowberry} />
        <Rect x={178} y={93} width={14} height={5.5} rx={2.75} fill={puffinCar.trim} />
        <Rect x={6} y={93} width={14} height={5.5} rx={2.75} fill={puffinCar.trim} />
        {[52, 151].map((cx) => (
          <Wheel key={cx} cx={cx} tyre={black} />
        ))}
      </Svg>
    </View>
  );
}

function Wheel({ cx, tyre }: { readonly cx: number; readonly tyre: string }) {
  return (
    <>
      <Circle cx={cx} cy={100} r={15} fill={tyre} />
      <Circle cx={cx} cy={100} r={7} fill={puffinCar.hub} />
      <Circle cx={cx} cy={100} r={2.4} fill={tyre} />
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
