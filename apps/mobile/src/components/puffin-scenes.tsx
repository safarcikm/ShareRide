/* eslint-disable @typescript-eslint/no-deprecated -- `x` and `y` on SVG shapes are
   coordinates; the types mark the transform style of the same name as deprecated. */
import { useId, useState } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import type { BannerSeason } from "@shareride/domain";
import { seasonLooks, sceneTop } from "@/banner/season-looks";
import {
  at,
  Aurora,
  backHillAt,
  Farmhouse,
  Flowers,
  footZones,
  Heather,
  HighSun,
  Lupines,
  MidnightSun,
  SkyGradient,
  SnowBanks,
  Stars,
  type Room,
} from "@/banner/scene-layers";
import {
  carDrawing,
  icelandSeasons,
  pageMaxWidth,
  people,
  puffin,
  puffinCar,
  radii,
  sizes,
} from "@/theme/tokens";
import { arrivalProps, motionMark } from "@/theme/motion";
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
 *
 * On the website, `arriveFrom` makes it arrive (spec 33, 3.2): it drives in
 * from that many points to the left of its place, its body bobbing and
 * dipping as it stops, then its puffins hop (`motionCss`). Its body and
 * each puffin are groups of their own for that; the drawing is the same.
 */
export function PuffinsInCar({
  width,
  moving = false,
  arriveFrom = null,
}: {
  readonly width: number;
  readonly moving?: boolean;
  readonly arriveFrom?: number | null;
}) {
  const palette = usePalette();
  const { black } = useScene();
  // Its own name for the windows' outline, as two cars can be on one page.
  const clip = `windows-${useId().replaceAll(":", "")}`;
  const left = moving ? car.left - behind : car.left;
  const across = moving ? car.width + behind : car.width;
  const arrival = arrivalProps(arriveFrom);
  return (
    <View
      testID="puffins-in-car"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      {...arrival}
      style={[styles.scene, arrival.style]}
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
        {/* The body: everything but the wheels, which stay on the road. */}
        <G {...motionMark("car-body")}>
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
            <G {...motionMark("puffin-you")}>
              <Puffin
                testID="puffin-you"
                x={58}
                y={57}
                size={0.54}
                look={{ kind: "colour", scarf: people.mossLight }}
              />
            </G>
            <G {...motionMark("puffin-driver")}>
              <Puffin
                testID="puffin-driver"
                x={96}
                y={58}
                size={0.58}
                look={{ kind: "colour", hat: people.crowberry }}
              />
            </G>
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
        </G>
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

/**
 * The ridge of the mountains: points across the width, each at a part of
 * the height over the ground. A screen as wide as a page has more of them,
 * and a valley in the middle, under the title. The far range behind is
 * lower and paler (spec 36, 3.1).
 */
const ridges = {
  narrow: [
    [0, 0.8],
    [0.12, 0.55],
    [0.24, 0.72],
    [0.38, 0.45],
    [0.52, 0.7],
    [0.68, 0.5],
    [0.84, 0.74],
    [0.94, 0.6],
    [1, 0.72],
  ],
  wide: [
    [0, 0.62],
    [0.05, 0.42],
    [0.1, 0.56],
    [0.17, 0.3],
    [0.25, 0.6],
    [0.31, 0.5],
    [0.37, 0.72],
    [0.5, 0.82],
    [0.63, 0.7],
    [0.7, 0.45],
    [0.77, 0.62],
    [0.84, 0.28],
    [0.91, 0.55],
    [0.96, 0.4],
    [1, 0.55],
  ],
} as const;

const farRidges = {
  narrow: [
    [0, 0.6],
    [0.1, 0.42],
    [0.22, 0.6],
    [0.31, 0.38],
    [0.46, 0.58],
    [0.6, 0.4],
    [0.76, 0.62],
    [0.9, 0.46],
    [1, 0.58],
  ],
  wide: [
    [0, 0.5],
    [0.08, 0.36],
    [0.14, 0.48],
    [0.22, 0.27],
    [0.3, 0.46],
    [0.42, 0.38],
    [0.56, 0.55],
    [0.66, 0.34],
    [0.74, 0.5],
    [0.8, 0.27],
    [0.88, 0.42],
    [0.95, 0.3],
    [1, 0.45],
  ],
} as const;

/** A ridge as an outline closed along the ground. */
function range(points: readonly (readonly [number, number])[], width: number, ground: number) {
  return `M0 ${String(ground)} ${points.map(([x, y]) => `L${at(x, y)}`).join(" ")} L${String(width)} ${String(ground)} Z`;
}

/**
 * Glaciers on the `count` highest peaks, never at the edges: each a cap
 * down `depth` of each side of its peak, with a ragged lower edge.
 */
function glaciersOn(points: readonly (readonly [number, number])[], count: number, depth: number) {
  return points
    .map(([, y], index) => ({ y, index }))
    .slice(1, -1)
    .sort((a, b) => a.y - b.y)
    .slice(0, count)
    .map(({ index }) => {
      const [px, py] = points[index] ?? [0, 0];
      const [lx, ly] = points[index - 1] ?? [0, 0];
      const [rx, ry] = points[index + 1] ?? [0, 0];
      const left = [px + (lx - px) * depth, py + (ly - py) * depth] as const;
      const right = [px + (rx - px) * depth, py + (ry - py) * depth] as const;
      const dip = (left[1] + right[1]) / 2 - py;
      return [
        `M${at(...left)}`,
        `L${at(px, py)}`,
        `L${at(...right)}`,
        `L${at(px + (right[0] - px) / 2, py + dip * 0.7)}`,
        `L${at(px, py + dip)}`,
        `L${at(px + (left[0] - px) / 2, py + dip * 0.7)}`,
        "Z",
      ].join(" ");
    });
}

/**
 * Iceland behind the front page's top in its season (decision 15; spec
 * 36, 3.1 and 3.3): a sky paling towards the land, a far range, mountains
 * with glaciers, a back hill with a farmhouse, the front hills, and from
 * `ground` down a road with a dashed line, where the car drives; or, with
 * `road={false}`, the hills go on down, as under a wide page's search.
 * Each season brings its own (`seasonLooks`): snow, flowers, lupines and
 * the sun, heather, stars and the northern lights. The small things go in
 * `room`, the part of the width given to them: all of it on a phone, the
 * car's room on a laptop (R36.5). `layout` says which the scene is behind,
 * a phone's top or a laptop's panel, as the name's row and the title stand
 * where the layout puts them, whatever the window's width. `width` and
 * `height` are the drawing's.
 */
export function IcelandScene({
  season,
  width,
  height,
  ground = height - sizes.sceneRoad,
  road = true,
  room = [0, width],
  layout = "phone",
}: {
  readonly season: BannerSeason;
  readonly width: number;
  readonly height: number;
  readonly ground?: number;
  readonly road?: boolean;
  readonly room?: Room;
  readonly layout?: "phone" | "panel";
}) {
  const { scheme } = useScene();
  const ids = useId().replaceAll(":", "");
  const land = icelandSeasons[season][scheme];
  const snow = "snow" in land ? land.snow : undefined;
  const look = seasonLooks[season][scheme];
  if (width <= 0 || height <= 0) return null;
  const wide = layout === "panel";
  const shape = (points: readonly (readonly [number, number])[]) =>
    points.map(([x, y]) => [x * width, y * ground] as const);
  const peaks = shape(wide ? ridges.wide : ridges.narrow);
  const hills = [
    `M0 ${String(ground)} L0 ${String(ground - 16)}`,
    `C${at(width * 0.22, ground - 40)} ${at(width * 0.4, ground - 2)} ${at(width * 0.58, ground - 18)}`,
    `S${at(width * 0.86, ground - 36)} ${at(width, ground - 12)}`,
    `L${String(width)} ${String(ground)} Z`,
  ].join(" ");
  const back: string[] = [];
  for (let x = 0; x <= width + 6; x += 6) {
    const along = Math.min(x, width);
    back.push(`L${at(along, backHillAt(along, width, ground, wide))}`);
  }
  const house = wide ? room[1] - 44 : width * 0.1;
  const zones = footZones(width, room, wide);
  const below = height - ground;
  return (
    <View
      testID="iceland-scene"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height }}
    >
      <Svg width={width} height={height}>
        <SkyGradient id={`sky-${ids}`} ground={ground} top={land.skyTop} low={land.sky} />
        <Rect x={0} y={0} width={width} height={height} fill={`url(#sky-${ids})`} />
        {look.stars ? <Stars room={room} ground={ground} wide={wide} /> : null}
        {look.aurora ? (
          <Aurora id={`aurora-${ids}`} room={room} ground={ground} wide={wide} />
        ) : null}
        {look.sun === "high" ? (
          <HighSun width={width} room={room} ground={ground} wide={wide} />
        ) : null}
        {look.sun === "midnight" ? (
          <MidnightSun width={width} room={room} ground={ground} wide={wide} />
        ) : null}
        <Path
          d={range(shape(wide ? farRidges.wide : farRidges.narrow), width, ground)}
          fill={land.far}
          stroke={land.far}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <Path
          d={range(peaks, width, ground)}
          fill={land.mountain}
          stroke={land.mountain}
          strokeWidth={4}
          strokeLinejoin="round"
        />
        {glaciersOn(peaks, look.caps, look.capDepth).map((d) => (
          <Path
            key={d}
            testID="glacier"
            d={d}
            fill={land.glacier}
            stroke={land.glacier}
            strokeWidth={3}
            strokeLinejoin="round"
          />
        ))}
        <Path
          d={`M0 ${String(ground)} ${back.join(" ")} L${String(width)} ${String(ground)} Z`}
          fill={land.hillBack}
        />
        <Farmhouse
          x={house}
          y={backHillAt(house, width, ground, wide) + 1.5}
          roof={land.roof}
          snow={snow}
          scheme={scheme}
        />
        <Path d={hills} fill={land.hill} />
        {look.heather ? (
          <Heather
            id={`hills-${ids}`}
            hills={hills}
            zones={zones}
            ground={ground}
            scheme={scheme}
          />
        ) : null}
        {look.lupines ? <Lupines zones={zones} ground={ground} wide={wide} /> : null}
        {look.flowers ? <Flowers zones={zones} ground={ground} wide={wide} /> : null}
        {road ? (
          <>
            <Rect
              testID="scene-road"
              x={0}
              y={ground}
              width={width}
              height={below}
              fill={land.road}
            />
            {snow === undefined ? null : <SnowBanks width={width} ground={ground} snow={snow} />}
            <Path
              d={`M${String(spacingOnRoad)} ${String(ground + below / 2)} H${String(width)}`}
              stroke={land.roadLine}
              strokeWidth={2.5}
              strokeDasharray="14 12"
              strokeLinecap="round"
            />
          </>
        ) : (
          <Rect
            testID="scene-ground"
            x={0}
            y={ground}
            width={width}
            height={below}
            fill={land.hill}
          />
        )}
      </Svg>
    </View>
  );
}

/**
 * The scene in a rounded panel as wide as its room, for a wide front page
 * (spec 18): the sky first, so the panel shows at once, then the land once
 * its width is known; the hills go on from `ground` to the bottom. The
 * small things go in the car's room, `room` wide at the right (R36.5).
 */
export function IcelandPanel({
  season,
  height,
  ground,
  room,
}: {
  readonly season: BannerSeason;
  readonly height: number;
  readonly ground: number;
  readonly room: number;
}) {
  const { scheme } = useScene();
  const [width, setWidth] = useState(0);
  return (
    <View
      testID="scene-panel"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
      style={[styles.panel, { height, backgroundColor: sceneTop(season, scheme) }]}
    >
      <IcelandScene
        season={season}
        width={width}
        height={height}
        ground={ground}
        road={false}
        room={[Math.max(0, width - room), width]}
        layout="panel"
      />
    </View>
  );
}

/** The height of `PuffinsInCar` drawn `width` wide, standing still. */
export function carHeight(width: number) {
  return (width * car.height) / car.width;
}

/** Where the road's line starts, from the left edge. */
const spacingOnRoad = 8;

const styles = StyleSheet.create({
  scene: { alignItems: "center" },
  start: { alignItems: "flex-start" },
  panel: { width: "100%", maxWidth: pageMaxWidth, borderRadius: radii.card, overflow: "hidden" },
});
