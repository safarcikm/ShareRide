/* eslint-disable @typescript-eslint/no-deprecated -- `x` and `y` on SVG shapes are
   coordinates; the types mark the transform style of the same name as deprecated. */
import { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { bannerDrawing, people, puffin, puffinCar } from "@/theme/tokens";
import { motionMark } from "@/theme/motion";

/** The head, in drawing units around its middle; the beak reaches 38.7 to the right. */
const head =
  "M-21 2 C-21.5 -13 -10 -22 2 -21.6 C12 -21.2 18.6 -15 19.6 -7 L19.6 11 C18 19 9 22.6 -1 22.4 C-12.6 22 -21 14.6 -21 2 Z";
const face =
  "M-13 3 C-13.4 -4.6 -7.6 -8.4 1 -8.2 C9 -8 15.4 -8.6 18.4 -9 L18.4 11.4 C15 17.6 8 19.4 0.5 19 C-7.6 18.4 -12.8 11.6 -13 3 Z";
const beak = "M18.2 -11.9 C26.2 -11.9 34.7 -6.9 38.7 2.2 C32.7 6.6 25.7 9.6 18.2 10.2 Z";

/**
 * What a puffin wears on its head: the knitted hat in a colour, or on the
 * front page's days a Christmas hat, a party hat, a crown or a sailor's
 * cap (spec 36, 3.4 and 3.5).
 */
export type Headwear =
  | { readonly kind: "wool"; readonly colour: string }
  | { readonly kind: "yule" }
  | { readonly kind: "party"; readonly colour: string }
  | { readonly kind: "crown" }
  | { readonly kind: "sailor" };

/** What a puffin wears for a day: on its head, round its neck, on its eyes. */
export interface PuffinDress {
  readonly headwear?: Headwear;
  readonly scarf?: string;
  readonly glasses?: boolean;
  readonly mask?: boolean;
}

/**
 * How a puffin looks: in its colours, or grey with no colour, for a seat
 * someone else took. `black` is basalt unless given: a puffin drawn straight
 * on the night screen takes `puffin.nightBlack` (spec 15, section 4.2).
 * `hat` is the knitted hat in that colour; `headwear`, a day's, goes over it.
 */
export type PuffinLook =
  | ({
      readonly kind: "colour";
      readonly hat?: string;
      readonly black?: string;
    } & PuffinDress)
  | { readonly kind: "grey"; readonly black: string; readonly face: string };

/** A five-pointed star around `cx`, `cy`, as an SVG path. */
export function star(cx: number, cy: number, r: number): string {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const reach = index % 2 === 0 ? r : r * 0.45;
    return `${(cx + reach * Math.cos(angle)).toFixed(1)} ${(cy + reach * Math.sin(angle)).toFixed(1)}`;
  });
  return `M${points.join(" L")} Z`;
}

/** The hat on a puffin's head, in the head's drawing units. */
function Hat({ headwear }: { readonly headwear: Headwear }) {
  switch (headwear.kind) {
    case "wool":
      return (
        <G testID="hat-wool" transform="translate(-2 1) rotate(-6)">
          <Path d="M-17.5 -9 C-17 -23 17 -23 17.5 -9 Z" fill={headwear.colour} />
          <Path
            d="M-7 -19.6 L-7 -11 M0 -21 L0 -11 M7 -19.6 L7 -11"
            stroke={people.face}
            strokeOpacity={0.15}
            strokeWidth={1.6}
          />
          <Rect x={-19} y={-12.2} width={38} height={6.6} rx={3.3} fill={people.wool} />
          <Circle cx={0} cy={-23.2} r={4} fill={people.wool} />
        </G>
      );
    case "yule":
      return (
        <G testID="hat-yule" transform="translate(-2 1) rotate(-6)">
          <Path
            d="M-17.5 -9 C-17 -22 -6 -27 4 -26 C10 -25.5 15 -20 17.5 -9 Z"
            fill={bannerDrawing.red}
          />
          <Path
            d="M3 -26 C-8 -29.5 -18 -26 -24 -15 L-18.5 -12.5 C-15 -20 -9 -23 -1 -22 Z"
            fill={bannerDrawing.red}
          />
          <Rect x={-19} y={-12.2} width={38} height={6.6} rx={3.3} fill={puffin.white} />
          <Circle cx={-23} cy={-13.5} r={4.4} fill={puffin.white} />
        </G>
      );
    case "party":
      return (
        <G testID="hat-party" transform="translate(1 -15) rotate(10)">
          <Path d="M-10 0 L0 -21 L10 0 Z" fill={headwear.colour} />
          <Path d="M-6.2 -8 L6.2 -8 M-3 -14.5 L3 -14.5" stroke={puffin.white} strokeWidth={2.2} />
          <Circle cx={0} cy={-22} r={3.4} fill={people.sun} />
        </G>
      );
    case "crown":
      return (
        <G testID="hat-crown" transform="translate(-1 -13) rotate(-4)">
          <Path
            d="M-14 4 L-15.5 -10 L-7.5 -3 L0 -13 L7.5 -3 L15.5 -10 L14 4 Z"
            fill={people.sun}
            stroke={puffinCar.wing}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
          <Circle cx={0} cy={-0.5} r={2.2} fill={people.crowberry} />
          <Circle cx={-8} cy={0.5} r={1.6} fill={bannerDrawing.sky} />
          <Circle cx={8} cy={0.5} r={1.6} fill={bannerDrawing.sky} />
          <Path
            testID="crown-sparkle"
            {...motionMark("sparkle")}
            d={star(13, -16, 4.6)}
            fill={puffin.white}
          />
        </G>
      );
    case "sailor":
      return (
        <G testID="hat-sailor" transform="translate(0 -8) rotate(-5)">
          <Path
            d="M-17 -1 C-18 -10 -10 -13.5 0 -13.5 C10 -13.5 18 -10 17 -1 Z"
            fill={puffin.white}
          />
          <Rect x={-17.5} y={-4} width={35} height={6.4} rx={2.2} fill={bannerDrawing.navy} />
          <Path d="M11 2 Q21 2 26 6.5 Q18 7 11 5.5 Z" fill={people.face} />
          <Circle cx={0} cy={-1} r={1.6} fill={people.sun} />
        </G>
      );
  }
}

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
  const headwear: Headwear | undefined =
    look.headwear ?? (look.hat === undefined ? undefined : { kind: "wool", colour: look.hat });
  return (
    <G testID={testID} transform={transform}>
      <Path d={head} fill={look.black ?? people.face} />
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
      {/* A carnival mask round the eye, the eye showing through; sunglasses over it. */}
      {look.mask === true ? (
        <Path
          testID="mask"
          fillRule="evenodd"
          d="M-3 -7 C2 -11 14 -11 17.6 -7.2 C18.6 -3.6 17.4 1.4 14 2.2 C11.4 2.6 10.4 0 8.4 0 C6.4 0 5.4 2.6 2.4 2.2 C-1 1.6 -3.6 -3 -3 -7 Z M11.9 -2 A3.5 3.5 0 1 0 4.9 -2 A3.5 3.5 0 1 0 11.9 -2 Z"
          fill={bannerDrawing.sky}
        />
      ) : null}
      {look.glasses === true ? (
        <G testID="glasses">
          <Path d="M-8 -4.6 L3 -4.4" stroke={people.face} strokeWidth={1.8} />
          <Rect x={2.4} y={-7.4} width={12.4} height={8.6} rx={3.8} fill={people.face} />
          <Path
            d="M5.2 -5.2 L8.6 -5.2"
            stroke={puffin.white}
            strokeWidth={1.3}
            strokeLinecap="round"
            opacity={0.75}
          />
        </G>
      ) : null}
      {headwear === undefined ? null : <Hat headwear={headwear} />}
      {look.scarf === undefined ? null : (
        <Path d="M-19.4 14.4 Q-1 22.6 18.6 14 L18 20.4 Q-1 29 -18.6 20.6 Z" fill={look.scarf} />
      )}
    </G>
  );
}
