/* eslint-disable @typescript-eslint/no-deprecated -- `x` and `y` on SVG shapes are
   coordinates; the types mark the transform style of the same name as deprecated. */
import { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { star } from "@/components/puffin";
import { bannerDrawing, people, puffin, puffinCar } from "@/theme/tokens";

// What rides on the car on the front page's days (spec 36, 3.4 and 3.5),
// drawn as the preview draws them (preview.html, `loads`, `flag()`,
// `balloons()`), in the car's drawing units: its roof rack runs from 52 to
// 106 at 29.

/** The case on the roof rack, with snow on its lid in winter. */
export function RoofCase({ tyre, snow }: { readonly tyre: string; readonly snow?: string }) {
  return (
    <G testID="roof-case">
      <Rect x={58} y={16} width={42} height={12} rx={3} fill={people.crowberry} />
      <Rect x={75} y={13} width={9} height={4} rx={2} fill="none" stroke={tyre} strokeWidth={1.6} />
      <Path d="M64 16 V28 M94 16 V28" stroke={puffinCar.strap} strokeWidth={2} />
      {snow === undefined ? null : (
        <Path
          testID="roof-snow"
          d="M57 18.5 Q56.4 14 60.6 14.2 Q66 12.6 70.6 14 Q74.4 12.8 76.8 14 L82.4 14 Q86.4 12.6 90.6 14 Q95.6 12.8 98.2 14.2 Q102 14.4 101 18.5 Z"
          fill={snow}
        />
      )}
    </G>
  );
}

const bulbs = [
  [73, 6.5, people.sun],
  [84, 7.5, people.crowberry],
  [69, 15.5, bannerDrawing.aurora2],
  [79, 16.5, puffin.white],
  [90, 15.5, people.sun],
  [65, 25, people.crowberry],
  [74, 25.5, puffin.white],
  [84, 25.5, bannerDrawing.aurora2],
  [93.5, 24.5, people.sun],
] as const;

/** A little Christmas tree with its lights and a star on top. */
export function Tree() {
  return (
    <G testID="tree">
      <Path d="M79 -5 L91.5 10 L66.5 10 Z" fill={bannerDrawing.tree} />
      <Path d="M79 2 L95.5 19.5 L62.5 19.5 Z" fill={bannerDrawing.tree} />
      <Path d="M79 10 L98.5 28.6 L59.5 28.6 Z" fill={bannerDrawing.tree} />
      <Path
        d="M79 -5 L84 1 L79 0 Z M79 2 L86 9.6 L79 8.6 Z M79 10 L88 18.6 L79 17.8 Z"
        fill={bannerDrawing.treeLight}
      />
      <Path
        d="M68 9 Q79 13 90 8 M64 18.6 Q79 23 94 18 M61 27.6 Q79 31 97 27"
        stroke={people.wool}
        strokeWidth={0.9}
        fill="none"
        opacity={0.8}
      />
      {bulbs.map(([cx, cy, fill]) => (
        <Circle key={`${String(cx)}-${String(cy)}`} cx={cx} cy={cy} r={2.1} fill={fill} />
      ))}
      <Path d={star(79, -6.5, 5.4)} fill={people.sun} stroke={puffinCar.wing} strokeWidth={0.8} />
    </G>
  );
}

/** A big chocolate Easter egg, its chick on top. */
export function Egg() {
  return (
    <G testID="egg">
      <G testID="chick">
        <Circle cx={79} cy={-9} r={6.2} fill={people.sun} />
        <Circle cx={81.4} cy={-10.6} r={1.1} fill={people.face} />
        <Path d="M84.6 -9.6 L88.4 -8.4 L84.6 -7.2 Z" fill={puffin.beak} />
        <Path
          d="M74.4 -7.6 Q76.6 -11 78.6 -7.4"
          stroke={puffinCar.wing}
          strokeWidth={1.3}
          fill="none"
          strokeLinecap="round"
        />
      </G>
      <Ellipse cx={79} cy={11} rx={14.5} ry={18.5} fill={bannerDrawing.choc} />
      <Ellipse
        cx={73.2}
        cy={2.6}
        rx={2.6}
        ry={6}
        fill={puffin.white}
        opacity={0.18}
        transform="rotate(18 73.2 2.6)"
      />
      <Path
        d="M65.2 8 L69.6 4 L74.4 8 L79 4 L83.6 8 L88.4 4 L92.8 8"
        stroke={people.crowberry}
        strokeWidth={2.4}
        fill="none"
        strokeLinejoin="round"
      />
      <Circle cx={72} cy={17} r={2.3} fill={people.sun} />
      <Circle cx={86} cy={17} r={2.3} fill={people.sun} />
      <Circle cx={79} cy={21.5} r={2.3} fill={puffin.white} />
    </G>
  );
}

/** A tent, a sleeping bag and a guitar, for the long weekend. */
export function Tent() {
  return (
    <G testID="tent">
      <Rect x={55} y={18} width={46} height={11} rx={5.5} fill={bannerDrawing.tent} />
      <Path d="M63 18 V29 M93 18 V29" stroke={bannerDrawing.tentDark} strokeWidth={1.8} />
      <Rect x={60} y={8.6} width={32} height={10.4} rx={5.2} fill={bannerDrawing.bag} />
      <Path d="M68 8.6 V19 M84 8.6 V19" stroke={bannerDrawing.bagDark} strokeWidth={1.5} />
      <G transform="rotate(-8 82 4)">
        <Rect x={80} y={2.2} width={22} height={3.2} rx={1.2} fill={bannerDrawing.chocDark} />
        <Circle cx={72} cy={4} r={5.6} fill={bannerDrawing.guitar} />
        <Circle cx={79} cy={3.8} r={4.3} fill={bannerDrawing.guitar} />
        <Circle cx={75.6} cy={3.9} r={1.6} fill={bannerDrawing.chocDark} />
        <Rect x={101} y={1.4} width={4} height={4.8} rx={1} fill={bannerDrawing.chocDark} />
      </G>
    </G>
  );
}

/** A cream bun with jam, its top in chocolate. */
export function Bun() {
  return (
    <G testID="bun">
      <Path
        d="M60 22 C60 18 66 17 79 17 C92 17 98 18 98 22 L97 26 C96 29.4 62 29.4 61 26 Z"
        fill={bannerDrawing.bun}
      />
      <Path
        d="M59.5 21.6 Q59.6 17 63.2 17.8 Q66.8 15.2 70.4 17.6 Q74 15.2 77.6 17.6 Q81.2 15.2 84.8 17.6 Q88.4 15.2 92 17.6 Q95.6 15.6 98.4 17.8 Q99 20 98.5 21.6 Z"
        fill={bannerDrawing.cream}
      />
      <Path d="M61 21.2 H97" stroke={bannerDrawing.jam} strokeWidth={1.8} />
      <Path d="M60 17 C60 4 70 0 79 0 C88 0 98 4 98 17 Z" fill={bannerDrawing.bun} />
      <Path
        d="M61.5 12 C62 4.2 70 1.4 79 1.4 C88 1.4 96 4.2 96.5 12 C93 9.4 89 13.6 85 10.4 C81 13.8 77 9.6 73 12.6 C69 9.6 65.4 13.6 61.5 12 Z"
        fill={bannerDrawing.chocDark}
      />
      <Circle cx={70} cy={5} r={0.9} fill={puffin.white} />
      <Circle cx={83} cy={4} r={0.9} fill={puffin.white} />
      <Circle cx={90} cy={7} r={0.9} fill={puffin.white} />
    </G>
  );
}

/** A tulip's head, its top at `top`. */
const tulip = (x: number, top: number) =>
  [
    `M${String(x - 3.6)} ${String(top + 1)}`,
    `Q${String(x - 3.8)} ${String(top - 5)} ${String(x - 1.7)} ${String(top - 6)}`,
    `L${String(x)} ${String(top - 3.4)}`,
    `L${String(x + 1.7)} ${String(top - 6)}`,
    `Q${String(x + 3.8)} ${String(top - 5)} ${String(x + 3.6)} ${String(top + 1)}`,
    `Q${String(x)} ${String(top + 4.4)} ${String(x - 3.6)} ${String(top + 1)} Z`,
  ].join(" ");

const tulips = [
  [65, 7, people.crowberry],
  [72, 3, bannerDrawing.red],
  [79, 1, people.sun],
  [86, 3, people.crowberry],
  [93, 7, puffin.white],
] as const;

/** Tulips in a box, for Bóndadagur and Konudagur. */
export function Bouquet() {
  return (
    <G testID="bouquet">
      <Path
        d="M65 18 V7 M72 18 V3 M79 18 V1 M86 18 V3 M93 18 V7"
        stroke={bannerDrawing.stem}
        strokeWidth={1.8}
      />
      <Path
        d="M68 16 Q66 11 69.6 9 Q70.6 13 68 16 Z M90 16 Q92 11 88.4 9 Q87.4 13 90 16 Z"
        fill={bannerDrawing.stem}
      />
      {tulips.map(([x, top, fill]) => (
        <Path key={x} d={tulip(x, top)} fill={fill} />
      ))}
      <Rect x={58} y={16} width={42} height={12} rx={3} fill={people.wool} />
      <Path d="M58 21.2 H100" stroke={people.crowberry} strokeWidth={2.4} />
    </G>
  );
}

/** Iceland's flag on a pole at `x`, its cloth from `top`, streaming back to the left. */
export function Flag({
  x,
  top,
  pole,
  size,
}: {
  readonly x: number;
  readonly top: number;
  readonly pole: number;
  readonly size: number;
}) {
  return (
    <G testID="flag">
      <Path
        d={`M${String(x)} ${String(top + pole)} V${String(top - 1)}`}
        stroke={puffinCar.trim}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Circle cx={x} cy={top - 1.4} r={1.3} fill={people.sun} />
      <G
        transform={`translate(${String(x)} ${String(top)}) scale(${String(-size)} ${String(size)})`}
      >
        <Rect width={25} height={18} fill={bannerDrawing.flagBlue} />
        <Rect x={7} width={4} height={18} fill={puffin.white} />
        <Rect y={7} width={25} height={4} fill={puffin.white} />
        <Rect x={8} width={2} height={18} fill={bannerDrawing.flagRed} />
        <Rect y={8} width={25} height={2} fill={bannerDrawing.flagRed} />
      </G>
    </G>
  );
}

/** Where the balloons are tied, at the car's back. */
const tie = [13, 79] as const;
const balloons = [
  [-4, 36, bannerDrawing.flagBlue],
  [9, 27, puffin.white],
  [-17, 47, bannerDrawing.flagRed],
] as const;

/** Balloons in the flag's colours, tied at the car's back and trailing behind it. */
export function Balloons() {
  return (
    <G testID="balloons">
      {balloons.map(([x, y]) => (
        <Path
          key={`string-${String(x)}`}
          d={`M${String(tie[0])} ${String(tie[1])} Q${String((x + tie[0]) / 2 + 4)} ${String((y + tie[1]) / 2 + 6)} ${String(x)} ${String(y + 9.4)}`}
          stroke={puffinCar.trim}
          strokeWidth={1}
          fill="none"
        />
      ))}
      {balloons.map(([x, y, fill]) => (
        <G key={`balloon-${String(x)}`}>
          <Ellipse cx={x} cy={y} rx={7.6} ry={9.2} fill={fill} />
          <Path
            d={`M${String(x - 1.6)} ${String(y + 9.6)} L${String(x + 1.6)} ${String(y + 9.6)} L${String(x)} ${String(y + 7.6)} Z`}
            fill={fill}
          />
          <Ellipse cx={x - 2.6} cy={y - 3.4} rx={1.6} ry={2.8} fill={puffin.white} opacity={0.45} />
        </G>
      ))}
    </G>
  );
}

/** A red heart over the puffin it is for. */
export function Heart({ over, high }: { readonly over: "driver" | "you"; readonly high: boolean }) {
  const x = over === "you" ? 62 : 104;
  const y = high ? -6 : 8;
  return (
    <Path
      testID={`heart-${over}`}
      transform={`translate(${String(x)} ${String(y)}) scale(1.25)`}
      d="M0 4 C-7 -1 -7 -8.4 -2.4 -8.4 C-0.8 -8.4 0 -7 0 -6 C0 -7 0.8 -8.4 2.4 -8.4 C7 -8.4 7 -1 0 4 Z"
      fill={bannerDrawing.red}
    />
  );
}
