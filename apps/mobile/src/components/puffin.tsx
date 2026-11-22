/* eslint-disable @typescript-eslint/no-deprecated -- `x` and `y` on SVG shapes are
   coordinates; the types mark the transform style of the same name as deprecated. */
import { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { people, puffin } from "@/theme/tokens";

/** The head, in drawing units around its middle; the beak reaches 38.7 to the right. */
const head =
  "M-21 2 C-21.5 -13 -10 -22 2 -21.6 C12 -21.2 18.6 -15 19.6 -7 L19.6 11 C18 19 9 22.6 -1 22.4 C-12.6 22 -21 14.6 -21 2 Z";
const face =
  "M-13 3 C-13.4 -4.6 -7.6 -8.4 1 -8.2 C9 -8 15.4 -8.6 18.4 -9 L18.4 11.4 C15 17.6 8 19.4 0.5 19 C-7.6 18.4 -12.8 11.6 -13 3 Z";
const beak = "M18.2 -11.9 C26.2 -11.9 34.7 -6.9 38.7 2.2 C32.7 6.6 25.7 9.6 18.2 10.2 Z";

/** How a puffin looks: in its colours, or grey with no colour, for a seat someone else took. */
export type PuffinLook =
  | { readonly kind: "colour"; readonly hat?: string; readonly scarf?: string }
  | { readonly kind: "grey"; readonly black: string; readonly face: string };

/**
 * Our puffin (spec 15, section 5.3), the head three-quarters, facing right:
 * the way the car drives in the seat view. A driver wears a knitted hat in
 * their people colour, you a moss scarf. Drawn inside an `Svg`, its head's
 * middle at `x`, `y`; at `size` 1 it is about 60 wide with its beak.
 */
export function Puffin({
  x,
  y,
  size,
  look,
  testID,
}: {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly look: PuffinLook;
  readonly testID?: string;
}) {
  const transform = `translate(${String(x)} ${String(y)}) scale(${String(size)})`;
  if (look.kind === "grey") {
    return (
      <G testID={testID} transform={transform}>
        <Path d={head} fill={look.black} />
        <Path d={face} fill={look.face} />
        <Circle cx={8.4} cy={-2} r={2.9} fill={people.face} />
        <Path d={beak} fill={look.black} />
      </G>
    );
  }
  return (
    <G testID={testID} transform={transform}>
      <Path d={head} fill={people.face} />
      <Path d={face} fill={puffin.white} />
      {/* The eye, with its red ring and the grey marks above and below. */}
      <Path d="M5.4 -6.4 L11.4 -6.4 L8.6 -10.4 Z" fill={puffin.eyeMark} />
      <Path d="M6.4 2.6 L10.6 2.6 L8.4 5.2 Z" fill={puffin.eyeMark} />
      <Circle cx={8.4} cy={-2} r={3.9} fill={puffin.beakGroove} />
      <Circle cx={8.4} cy={-2} r={2.9} fill={people.face} />
      <Circle cx={9.4} cy={-3} r={1} fill={puffin.white} />
      <Ellipse cx={3} cy={9.6} rx={3.8} ry={2.5} fill={people.crowberry} opacity={0.8} />
      {/* The beak: the grey plate, a yellow line, then orange with its grooves. */}
      <Path d={beak} fill={puffin.beak} />
      <Path d="M18.2 -11.9 L22.8 -11.36 L22.8 9.52 L18.2 10.2 Z" fill={puffin.beakPlate} />
      <Path d="M22.8 -11.36 L24.9 -10.75 L24.9 9.01 L22.8 9.52 Z" fill={people.sun} />
      <Path
        d="M29.8 -8.8 Q31.8 -2.4 29.8 8 M34.2 -5 Q35.6 -0.4 34.2 5.2"
        stroke={puffin.beakGroove}
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M18.2 2.2 Q29.2 3.2 38.7 2.2"
        stroke={puffin.beakGroove}
        strokeWidth={1.1}
        fill="none"
      />
      <Circle cx={18.6} cy={7.6} r={2.2} fill={people.sun} />
      {look.hat === undefined ? null : (
        <G transform="translate(-2 1) rotate(-6)">
          <Path d="M-17.5 -9 C-17 -23 17 -23 17.5 -9 Z" fill={look.hat} />
          <Path
            d="M-7 -19.6 L-7 -11 M0 -21 L0 -11 M7 -19.6 L7 -11"
            stroke={people.face}
            strokeOpacity={0.15}
            strokeWidth={1.6}
          />
          <Rect x={-19} y={-12.2} width={38} height={6.6} rx={3.3} fill={people.wool} />
          <Circle cx={0} cy={-23.2} r={4} fill={people.wool} />
        </G>
      )}
      {look.scarf === undefined ? null : (
        <Path d="M-19.4 14.4 Q-1 22.6 18.6 14 L18 20.4 Q-1 29 -18.6 20.6 Z" fill={look.scarf} />
      )}
    </G>
  );
}
