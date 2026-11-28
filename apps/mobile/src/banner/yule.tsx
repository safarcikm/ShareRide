/* eslint-disable @typescript-eslint/no-deprecated -- `x` and `y` on SVG shapes are
   coordinates; the types mark the transform style of the same name as deprecated. */
import { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { yuleLads, type Yule, type YuleLad } from "@shareride/domain";
import { motionMark } from "@/theme/motion";
import {
  bannerDrawing,
  bannerYule,
  minTouchTarget,
  people,
  puffin,
  sizes,
  spacing,
  type ColorScheme,
} from "@/theme/tokens";
import { backHillAt, frontHillAt, panelCarFromEdge, type Room } from "./scene-layers";

// The Yule Lads and Jólakötturinn at Christmas (spec 36, 3.11), drawn as
// their sketch draws them (docs/specs/images/seasonal-banner/yule-preview.html):
// the Lad of the night from the chest up behind the front hill with what he
// is after, the heads of those who came before over the back hill, and the
// giant cat standing over the farmhouse.

/** The cat's height in his own units, from his paws to the tips of his ears. */
export const catHeight = 72;

/**
 * How high the cat may reach from the scene's top: on a phone just under
 * the name's row, on a laptop near the panel's top.
 */
export const catTop = {
  phone: spacing.md + minTouchTarget + spacing.xs,
  panel: spacing.md,
} as const;

/** How far the cat reaches left of where he stands, and right, his tail up. */
const catLeft = 32;
const catRight = 42;

/** Where a drawn thing stands, and how big it is drawn. */
export interface Place {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** The part of the width the cat takes, from his left side to his tail. */
export function catReach({ x, scale }: Place): readonly [number, number] {
  return [x - catLeft * scale, x + catRight * scale];
}

/**
 * How much wider a laptop's car room is on a night a Lad comes, for him to
 * stand left of the car and not under the words (R36.5).
 */
export const ladRoom = spacing.xxl;

/** Where the Lad stands from his middle: what he holds reaches this far. */
const ladLeft = 22;
const ladRight = 26;

/** The Lad as he is drawn: Stúfur, Stubby, is the small one. */
const ladScale = (lad: YuleLad) => (lad === "stufur" ? 0.78 : 1);

/** How close the heads may stand, on a phone and on a laptop. */
const headStep = { phone: 6, panel: 9 } as const;

export interface YulePlaces {
  readonly lad: Place | null;
  readonly heads: readonly { readonly x: number; readonly y: number }[];
  readonly cat: Place | null;
}

/**
 * Where the Yule folk stand in a scene `width` wide on `ground`: the Lad
 * on the front hill, right of a phone's car or left of a laptop's in its
 * room; the cat over the farmhouse at `house`, as tall as the room above
 * it allows; and as many of the Lads who came before as fit over the back
 * hill, clear of the car, the Lad and the farmhouse or the cat.
 */
export function yulePlaces({
  yule,
  width,
  ground,
  room,
  wide,
  house,
}: {
  readonly yule: Yule | null;
  readonly width: number;
  readonly ground: number;
  readonly room: Room;
  readonly wide: boolean;
  readonly house: number;
}): YulePlaces {
  if (yule === null) return { lad: null, heads: [], cat: null };
  const car: Room = wide
    ? [room[1] - panelCarFromEdge - sizes.sceneCarWide, room[1] - panelCarFromEdge]
    : [
        Math.min(width * 0.27, (width - sizes.sceneCar) / 2),
        Math.max(width * 0.73, (width + sizes.sceneCar) / 2),
      ];
  const kept: Room[] = [car];
  let lad: Place | null = null;
  if (yule.lad !== null) {
    const x = wide ? room[0] + 28 : width * 0.865;
    lad = { x, y: frontHillAt(x, width, ground) - 7, scale: ladScale(yule.lad) };
    kept.push([x - ladLeft, x + ladRight]);
  }
  let cat: Place | null = null;
  const base = backHillAt(house, width, ground, wide) + 2;
  if (yule.cat) {
    const tall = (base - (wide ? catTop.panel : catTop.phone)) / catHeight;
    // His tail clear of the panel's rounded edge.
    const fits = (room[1] - spacing.xs - house) / catRight;
    cat = { x: house, y: base, scale: Math.max(0.6, Math.min(1.1, tall, fits)) };
    kept.push(catReach(cat));
  } else kept.push([house - 12, house + 12]);
  const others = yule.lad === null ? 0 : yuleLads.indexOf(yule.lad);
  const zone: Room = wide ? [room[0] + 6, room[1] - 6] : [4, width - 4];
  const free: number[] = [];
  for (let x = Math.ceil(zone[0] + 4); x <= zone[1] - 4; x += 1) {
    if (!kept.some(([from, to]) => x >= from && x <= to)) free.push(x);
  }
  const step =
    others === 0
      ? 1
      : Math.max(wide ? headStep.panel : headStep.phone, Math.floor(free.length / others));
  const heads: { x: number; y: number }[] = [];
  for (
    let index = Math.floor(step / 2);
    index < free.length && heads.length < others;
    index += step
  ) {
    const x = free[index] ?? 0;
    heads.push({ x, y: backHillAt(x, width, ground, wide) + 0.6 });
  }
  return { lad, heads, cat };
}

const colours = bannerYule;

/** What each Lad comes for, around his face at (0, -11), his hands at (±9, -5.5). */
function LadItem({ lad }: { readonly lad: YuleLad }) {
  const face = people.face;
  switch (lad) {
    case "stekkjastaur":
      return (
        <G stroke={colours.lambEdge} strokeWidth={0.7}>
          <Ellipse cx={18} cy={-4} rx={6.4} ry={4.4} fill={colours.lamb} />
          <Circle cx={13.6} cy={-6.6} r={2.6} fill={colours.lamb} />
          <Circle cx={22.6} cy={-6.6} r={2.6} fill={colours.lamb} />
          <Circle cx={18} cy={-8} r={2.8} fill={colours.lamb} />
          <Ellipse cx={24} cy={-7.6} rx={2.4} ry={2.8} fill={face} />
          <Circle cx={24.6} cy={-8.2} r={0.6} fill={colours.lamb} />
        </G>
      );
    case "giljagaur":
      return (
        <>
          <Path d="M-6 -6 H6 L5 1.6 H-5 Z" fill={colours.pail} />
          <Path
            d="M-6.6 -6.4 Q-4.4 -9.6 -2 -7.4 Q0 -10.4 2.4 -7.6 Q4.6 -9.8 6.6 -6.4 Z"
            fill={colours.lamb}
          />
          <Path d="M-6 -4 H6" stroke={colours.tin} strokeWidth={0.8} />
        </>
      );
    case "stufur":
      return (
        <>
          <Path d="M9 -5.5 L14 -9" stroke={face} strokeWidth={1.6} strokeLinecap="round" />
          <Circle cx={17.6} cy={-11.4} r={4.6} fill={colours.pan} />
          <Circle cx={17.6} cy={-11.4} r={3} fill={colours.panLight} />
        </>
      );
    case "thvorusleikir":
      return (
        <>
          <Path
            d="M9.4 -4 L13.6 -23"
            stroke={colours.woodLight}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Ellipse cx={14} cy={-25.4} rx={2.4} ry={3.4} fill={colours.woodLight} />
        </>
      );
    case "pottaskefill":
      return (
        <>
          <Path
            d="M-7.4 -7 H7.4 V-1.6 Q7.4 2.2 3.6 2.2 H-3.6 Q-7.4 2.2 -7.4 -1.6 Z"
            fill={colours.pan}
          />
          <Path d="M-7.4 -7 H7.4" stroke={colours.panLight} strokeWidth={1.4} />
          <Path d="M-9.6 -5.6 H-7.4 M7.4 -5.6 H9.6" stroke={colours.pan} strokeWidth={1.6} />
        </>
      );
    case "askasleikir":
      return (
        <>
          <Path d="M9 -11 H19.6 L18.6 -5.4 Q14.3 -3.2 10 -5.4 Z" fill={colours.wood} />
          <Path d="M8.6 -11.4 Q14.3 -16 20 -11.4 Z" fill={colours.woodLight} />
          <Circle cx={14.3} cy={-15} r={1.2} fill={colours.woodLight} />
          <Path d="M10 -8.4 H18.6" stroke={colours.woodLight} strokeWidth={0.7} />
        </>
      );
    case "hurdaskellir":
      return (
        <>
          <Rect x={13} y={-21} width={10} height={22} rx={1} fill={colours.wood} />
          <Rect x={14.8} y={-19} width={6.4} height={7.4} fill={colours.woodLight} />
          <Rect x={14.8} y={-9.6} width={6.4} height={8} fill={colours.woodLight} />
          <Circle cx={21.4} cy={-10.6} r={0.9} fill={people.sun} />
          <Path
            d="M25.6 -18 L29 -20.4 M26.2 -12 L30.4 -12 M25.6 -6 L29 -3.6"
            stroke={face}
            strokeWidth={1}
            strokeLinecap="round"
          />
        </>
      );
    case "skyrgamur":
      return (
        <>
          <Path d="M-7.4 -6 H7.4 L6.2 1.6 H-6.2 Z" fill={colours.woodLight} />
          <Path d="M-6.8 -2 H6.8" stroke={colours.wood} strokeWidth={0.8} />
          <Ellipse cx={0} cy={-6} rx={7.4} ry={1.8} fill={colours.lamb} />
          <Path
            d="M3 -6.4 L8 -12"
            stroke={colours.woodLight}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <Circle cx={-3} cy={-4.4} r={0.9} fill={colours.lamb} />
        </>
      );
    case "bjugnakraekir":
      return (
        <>
          <Path d="M9 -5.5 Q12 -10 12 -14" stroke={face} strokeWidth={0.6} fill="none" />
          {(
            [
              [12.4, -17.6, 20],
              [17, -13, -30],
              [19.6, -6.4, 15],
            ] as const
          ).map(([x, y, turn]) => (
            <Ellipse
              key={`${String(x)}-${String(y)}`}
              cx={x}
              cy={y}
              rx={2.2}
              ry={3.8}
              fill={colours.sausage}
              transform={`rotate(${String(turn)} ${String(x)} ${String(y)})`}
            />
          ))}
        </>
      );
    case "gluggagaegir":
      return (
        <>
          <Rect
            x={-11.6}
            y={-22.6}
            width={23.2}
            height={19.4}
            rx={1.4}
            fill="none"
            stroke={colours.beard}
            strokeWidth={2.6}
          />
          <Path d="M0 -22.6 V-3.2 M-11.6 -12.9 H11.6" stroke={colours.beard} strokeWidth={1.4} />
          <Rect
            x={-12.9}
            y={-23.9}
            width={25.8}
            height={22}
            rx={2}
            fill="none"
            stroke={bannerDrawing.red}
            strokeWidth={0.8}
          />
        </>
      );
    case "gattathefur":
      return (
        <>
          <Path
            d="M-12 -15 q-2.4 1.6 0 3.2 M-15 -16.4 q-3 2.2 0 4.4"
            stroke={colours.tin}
            strokeWidth={0.8}
            fill="none"
          />
          <Circle cx={-19} cy={-9} r={4.4} fill={colours.laufabraud} />
          <Path
            d="M-21.4 -9 L-16.6 -9 M-19 -11.4 L-19 -6.6 M-20.6 -10.6 L-17.4 -7.4 M-17.4 -10.6 L-20.6 -7.4"
            stroke={colours.laufabraudCut}
            strokeWidth={0.6}
          />
        </>
      );
    case "ketkrokur":
      return (
        <>
          <Path
            d="M9.4 -4 L15.6 -26"
            stroke={colours.wood}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Path
            d="M15.6 -26 Q19.6 -27.6 19.4 -23.4 Q19.2 -21.6 17.6 -21.4"
            stroke={colours.tin}
            strokeWidth={1}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M17.8 -21.6 Q23.4 -19.6 22.4 -13 Q21 -9 18.4 -10.6 Q15.4 -13.6 17.8 -21.6 Z"
            fill={colours.hangikjot}
          />
          <Path
            d="M18.4 -10.6 L17.4 -8"
            stroke={colours.beard}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </>
      );
    case "kertasnikir":
      return (
        <>
          <Circle cx={10.8} cy={-24} r={6} fill={people.sun} opacity={0.28} />
          <Rect x={9.2} y={-20.6} width={3.2} height={13} rx={1} fill={colours.candle} />
          <Ellipse cx={10.8} cy={-23.4} rx={1.9} ry={3.1} fill={people.sun} />
          <Ellipse cx={10.8} cy={-22.6} rx={0.9} ry={1.6} fill={puffin.beak} />
        </>
      );
  }
}

/** The Lads who hold what they come for in front of them, over their mittens. */
const heldInFront: readonly YuleLad[] = ["giljagaur", "pottaskefill", "skyrgamur"];

/**
 * The Lad of the night from the chest up, behind the front hill at `place`,
 * in his red cap, with what he is after. In the moment he pops up over the
 * hill as the car stops.
 */
export function YuleLadFigure({ lad, place }: { readonly lad: YuleLad; readonly place: Place }) {
  const nose = lad === "gattathefur" ? 4.4 : 2.4;
  const item = (
    <G testID={`lad-item-${lad}`}>
      <LadItem lad={lad} />
    </G>
  );
  const hands = (
    <>
      <Circle cx={-9} cy={-5.5} r={2.6} fill={colours.mitten} />
      <Circle cx={9} cy={-5.5} r={2.6} fill={colours.mitten} />
    </>
  );
  return (
    <G
      testID="yule-lad"
      transform={`translate(${place.x.toFixed(1)} ${place.y.toFixed(1)}) scale(${String(place.scale)})`}
    >
      <G testID="lad-rises" {...motionMark("lad")}>
        <Path d="M-11.4 9 Q-11.4 -5.6 0 -5.6 Q11.4 -5.6 11.4 9 Z" fill={colours.coat} />
        <Circle cx={0} cy={-11} r={7} fill={colours.skin} />
        <Path
          d="M-6.9 -10 Q-8.6 -1.6 -3.6 1.4 Q0 3.4 3.6 1.4 Q8.6 -1.6 6.9 -10 Q3.6 -6.4 0 -6.8 Q-3.6 -6.4 -6.9 -10 Z"
          fill={colours.beard}
        />
        <Circle cx={-2.6} cy={-12.2} r={1} fill={people.face} />
        <Circle cx={2.6} cy={-12.2} r={1} fill={people.face} />
        <Circle cx={0.4} cy={lad === "gattathefur" ? -8.8 : -9.4} r={nose} fill={colours.nose} />
        <Path
          d="M-7.6 -15.6 Q-7.4 -22.8 0 -23.2 Q6.4 -23.6 9.6 -29.2 Q12 -25.8 9 -20.6 Q8.2 -17.2 7.6 -15.6 Z"
          fill={bannerDrawing.red}
        />
        <Rect x={-8.2} y={-17.4} width={16.4} height={3} rx={1.5} fill={colours.beard} />
        <Circle cx={10} cy={-29.4} r={2.3} fill={colours.beard} />
        {heldInFront.includes(lad) ? (
          <>
            {item}
            {hands}
          </>
        ) : (
          <>
            {hands}
            {item}
          </>
        )}
      </G>
    </G>
  );
}

/**
 * The Lads who came on the nights before, peeking over the back hill: the
 * top of each head under an upright red cap, the caps leaning both ways.
 */
export function LadsInTown({ heads }: { readonly heads: YulePlaces["heads"] }) {
  return (
    <>
      {heads.map(({ x, y }, index) => {
        const left = index % 2 === 1;
        return (
          <G
            key={x}
            testID="lad-in-town"
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(1.4)`}
          >
            <Path d="M-3.6 1.4 A3.6 3.6 0 0 1 3.6 1.4 Z" fill={colours.skin} />
            <Circle cx={-1.3} cy={0.2} r={0.55} fill={people.face} />
            <Circle cx={1.3} cy={0.2} r={0.55} fill={people.face} />
            <Path
              d={`M-3.8 -1.4 Q-3.4 -5.6 0.4 -8.6 Q${left ? "-2.2" : "3"} -9.6 ${left ? "-3.2" : "4"} -7.4 Q3.6 -4.6 3.8 -1.4 Z`}
              fill={bannerDrawing.red}
            />
            <Rect x={-4} y={-2.2} width={8} height={1.6} rx={0.8} fill={colours.beard} />
            <Circle cx={left ? -3.4 : 4.2} cy={-7.2} r={1.1} fill={colours.beard} />
          </G>
        );
      })}
    </>
  );
}

/** One of the cat's huge yellow eyes, on `side` -1 or 1, under a sly lid. */
function CatEye({ side, fur }: { readonly side: -1 | 1; readonly fur: string }) {
  const at = (x: number) => (x * side).toFixed(1);
  return (
    <>
      <Ellipse cx={7.6 * side} cy={-47} rx={5.8} ry={6.2} fill={colours.eye} />
      <Ellipse cx={7.2 * side} cy={-46.4} rx={1.7} ry={4.6} fill={fur} />
      <Circle cx={6 * side} cy={-49.4} r={1.1} fill={puffin.white} />
      <Path
        d={`M${at(13.8)} -53.6 L${at(1.8)} -51 L${at(1.8)} -54.4 L${at(13.8)} -54.4 Z`}
        fill={fur}
      />
    </>
  );
}

/**
 * Jólakötturinn as Icelandic pictures show him, far too big for the farm:
 * a shaggy black cat standing on the back hill at `place`, the farmhouse
 * between his front paws, his head over its roof and his tail up behind.
 * Huge yellow eyes and a sly grin, but no teeth. In the moment he swishes
 * his tail and blinks.
 */
export function YuleCat({
  place,
  scheme,
}: {
  readonly place: Place;
  readonly scheme: ColorScheme;
}) {
  const { fur, edge, line, toe } = colours.cat[scheme];
  return (
    <G
      testID="yule-cat"
      transform={`translate(${place.x.toFixed(1)} ${place.y.toFixed(1)}) scale(${place.scale.toFixed(2)})`}
    >
      <G testID="cat-tail" {...motionMark("cat-tail")}>
        <Path
          d="M20 -8 Q34 -11 33 -31 Q32.4 -43 25 -48"
          stroke={fur}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
        />
        <Path d="M36.4 -22 L40.6 -24.6 L36.8 -28.4 L40.6 -32.4 L35.8 -35" fill={fur} />
      </G>
      <Path
        d="M-27 0 C-29 -14 -24 -31 -13 -37 L13 -37 C24 -31 29 -14 27 0 Z"
        fill={fur}
        stroke={edge}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      <Path
        d="M-26.4 -14 L-31.4 -19.4 L-25.6 -21 L-28.6 -28.4 L-20.6 -30 Z M26.4 -14 L31.4 -19.4 L25.6 -21 L28.6 -28.4 L20.6 -30 Z"
        fill={fur}
        stroke={edge}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      <Path d="M-27 0 C-29 -14 -24 -31 -13 -37 L13 -37 C24 -31 29 -14 27 0 Z" fill={fur} />
      <Ellipse cx={-15.2} cy={-1.6} rx={5.4} ry={3.2} fill={fur} />
      <Ellipse cx={15.2} cy={-1.6} rx={5.4} ry={3.2} fill={fur} />
      <Path
        d="M-17 -3.4 V-1 M-13.4 -3.4 V-1 M13.4 -3.4 V-1 M17 -3.4 V-1"
        stroke={toe}
        strokeWidth={0.8}
        strokeLinecap="round"
      />
      <Path
        d="M-17 -52 L-20.4 -72 L-5 -60.4 Z M17 -52 L20.4 -72 L5 -60.4 Z"
        fill={fur}
        stroke={edge}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      <Path
        d="M-15.4 -55 L-17.8 -67.4 L-8.4 -59.8 Z M15.4 -55 L17.8 -67.4 L8.4 -59.8 Z"
        fill={colours.catEar}
      />
      <Path
        d="M-18 -54 Q-10 -63.4 0 -63.4 Q10 -63.4 18 -54 L21.4 -46.6 L25.6 -42.6 L19.6 -39.6 L22.6 -34.4 L14.4 -32.4 Q0 -27.6 -14.4 -32.4 L-22.6 -34.4 L-19.6 -39.6 L-25.6 -42.6 L-21.4 -46.6 Z"
        fill={fur}
        stroke={edge}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      <G testID="cat-eyes" {...motionMark("cat-eyes")}>
        <CatEye side={-1} fur={fur} />
        <CatEye side={1} fur={fur} />
      </G>
      <Path d="M-1.8 -40.4 H1.8 L0 -38.6 Z" fill={colours.nose} />
      <Path
        d="M-7.6 -37.6 Q-3.8 -33.8 0 -37 Q3.8 -33.8 7.6 -37.6"
        stroke={line}
        strokeWidth={0.8}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M-4.6 -38.8 L-31 -42.4 M-4.6 -37.8 L-31.4 -37.4 M-4.6 -36.8 L-29 -32.4 M4.6 -38.8 L31 -42.4 M4.6 -37.8 L31.4 -37.4 M4.6 -36.8 L29 -32.4"
        stroke={line}
        strokeWidth={0.6}
      />
    </G>
  );
}
