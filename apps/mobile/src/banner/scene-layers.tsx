/* eslint-disable @typescript-eslint/no-deprecated -- `x` and `y` on SVG shapes are
   coordinates; the types mark the transform style of the same name as deprecated. */
import {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { motionMark } from "@/theme/motion";
import {
  bannerDrawing,
  bannerHouse,
  motion,
  people,
  puffin,
  puffinCar,
  spacing,
  type ColorScheme,
} from "@/theme/tokens";
import { seeded } from "./random";

// The layers of the Iceland scene in its season (spec 36, 3.3), drawn as the
// preview draws them (docs/specs/images/seasonal-banner/preview.html,
// `scene()`). Each takes what it needs; `IcelandScene` puts them in order.
// The parts that move in the moment (spec 36, 3.6) carry their marks
// (`motionMark`); without the moment, they stand where it leaves them.

/** A point as SVG path numbers, to one decimal. */
export const at = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;

/** The part of the width where the small things go: [from, to]. */
export type Room = readonly [number, number];

/**
 * Where the drawing has room for small things along the hills' foot: on
 * a phone at both sides, clear of the car in the middle; on a laptop in
 * the car's room.
 */
export function footZones(width: number, room: Room, wide: boolean): readonly Room[] {
  return wide
    ? [[room[0] + 6, room[1] - 6]]
    : [
        [4, width * 0.27],
        [width * 0.73, width - 4],
      ];
}

/** How far a laptop's car stands from its panel's right edge. */
export const panelCarFromEdge = spacing.xxl * 2;

type Point = readonly [number, number];

/**
 * The front hills' line: two curves, from the left edge to the dip under
 * the car and on to the right edge, the second turning on as smoothly as
 * the first ends.
 */
function frontHillCurves(width: number, ground: number) {
  const first: readonly [Point, Point, Point, Point] = [
    [0, ground - 16],
    [width * 0.22, ground - 40],
    [width * 0.4, ground - 2],
    [width * 0.58, ground - 18],
  ];
  const second: readonly [Point, Point, Point, Point] = [
    first[3],
    [2 * first[3][0] - first[2][0], 2 * first[3][1] - first[2][1]],
    [width * 0.86, ground - 36],
    [width, ground - 12],
  ];
  return [first, second] as const;
}

/** The front hills, down to the ground: the shape `IcelandScene` fills. */
export function frontHills(width: number, ground: number): string {
  const [first, second] = frontHillCurves(width, ground);
  return [
    `M0 ${String(ground)} L${at(...first[0])}`,
    `C${at(...first[1])} ${at(...first[2])} ${at(...first[3])}`,
    `S${at(...second[2])} ${at(...second[3])}`,
    `L${String(width)} ${String(ground)} Z`,
  ].join(" ");
}

/** The front hills' line at `x`, where something stands behind them. */
export function frontHillAt(x: number, width: number, ground: number): number {
  const [first, second] = frontHillCurves(width, ground);
  const [p0, p1, p2, p3] = x <= first[3][0] ? first : second;
  const along = (t: number, a: number, b: number, c: number, d: number) =>
    (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
  // Each curve only goes right, so halving finds where it is at x.
  let low = 0;
  let high = 1;
  for (let step = 0; step < 32; step += 1) {
    const middle = (low + high) / 2;
    if (along(middle, p0[0], p1[0], p2[0], p3[0]) < x) low = middle;
    else high = middle;
  }
  return along((low + high) / 2, p0[1], p1[1], p2[1], p3[1]);
}

/** The back hill's line at `x`: a long low wave, higher on a laptop's width. */
export function backHillAt(x: number, width: number, ground: number, wide: boolean): number {
  return ground - (28 + 12 * Math.sin(2 * Math.PI * ((x / width) * (wide ? 2.4 : 1.15) + 0.15)));
}

/** The sky, from its top to where it meets the land, paler down there. */
export function SkyGradient({
  id,
  ground,
  top,
  low,
}: {
  readonly id: string;
  readonly ground: number;
  readonly top: string;
  readonly low: string;
}) {
  return (
    <Defs>
      <LinearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1={0}
        y1={0}
        x2={0}
        y2={ground * 0.85}
      >
        <Stop offset={0} stopColor={top} />
        <Stop offset={1} stopColor={low} />
      </LinearGradient>
    </Defs>
  );
}

/** Stars in a night sky, in the room, under the name and the language on a phone. */
export function Stars({
  room,
  ground,
  wide,
}: {
  readonly room: Room;
  readonly ground: number;
  readonly wide: boolean;
}) {
  const next = seeded(7);
  const top = wide ? 10 : 52;
  const bottom = Math.max(top + 10, ground * 0.45);
  const stars = Array.from({ length: wide ? 18 : 12 }, () => ({
    x: room[0] + next() * (room[1] - room[0]),
    y: top + next() * (bottom - top),
    r: 0.6 + next() * 0.8,
    opacity: 0.35 + next() * 0.5,
  }));
  return (
    <G testID="stars">
      {stars.map(({ x, y, r, opacity }) => (
        <Circle
          key={`${x.toFixed(1)}-${y.toFixed(1)}`}
          cx={x}
          cy={y}
          r={r}
          fill={bannerDrawing.star}
          opacity={opacity}
        />
      ))}
    </G>
  );
}

/**
 * The northern lights: two ribbons across the room, thin at both ends so
 * they fade into the sky rather than stopping.
 */
export function Aurora({
  id,
  room,
  ground,
  wide,
}: {
  readonly id: string;
  readonly room: Room;
  readonly ground: number;
  readonly wide: boolean;
}) {
  const [from, to] = room;
  const middle = wide ? ground * 0.3 : Math.max(58, ground * 0.44);
  const ribbon = (dy: number, swing: number, thick: number, phase: number) => {
    const top: string[] = [];
    const bottom: string[] = [];
    for (let x = from; x <= to + 8; x += 8) {
      const along = Math.min(x, to);
      const k = (along - from) / Math.max(1, to - from);
      const y = middle + dy + swing * Math.sin(k * Math.PI * 2.2 + phase) - k * 6;
      const taper = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, k))), 0.6);
      top.push(at(along, y - thick * taper));
      bottom.unshift(at(along, y));
    }
    return `M${top.join(" L")} L${bottom.join(" L")} Z`;
  };
  return (
    <G testID="aurora" opacity={0.9}>
      <Defs>
        <LinearGradient id={id} x1={0} y1={0} x2={0} y2={1}>
          <Stop offset={0} stopColor={bannerDrawing.aurora} stopOpacity={0} />
          <Stop offset={0.65} stopColor={bannerDrawing.aurora} stopOpacity={0.75} />
          <Stop offset={1} stopColor={bannerDrawing.aurora2} stopOpacity={0.25} />
        </LinearGradient>
      </Defs>
      <G {...motionMark("aurora")}>
        <Path d={ribbon(0, 5, 16, 0)} fill={`url(#${id})`} />
        <Path d={ribbon(8, 4, 11, 1.7)} fill={`url(#${id})`} opacity={0.6} />
      </G>
    </G>
  );
}

/** A summer's day sun, high at the right, with a soft glow. */
export function HighSun({
  width,
  room,
  ground,
  wide,
}: {
  readonly width: number;
  readonly room: Room;
  readonly ground: number;
  readonly wide: boolean;
}) {
  const x = wide ? room[1] - 62 : width * 0.84;
  const y = wide ? 40 : Math.max(64, ground * 0.44);
  return (
    <G testID="sun">
      <G {...motionMark("glow")}>
        <Circle cx={x} cy={y} r={17} fill={people.sun} opacity={0.22} />
      </G>
      <Circle cx={x} cy={y} r={10} fill={people.sun} />
    </G>
  );
}

/** The midnight sun, low on the mountains in a summer night. */
export function MidnightSun({
  width,
  room,
  ground,
  wide,
}: {
  readonly width: number;
  readonly room: Room;
  readonly ground: number;
  readonly wide: boolean;
}) {
  const x = wide ? room[1] - 70 : width * 0.8;
  const y = wide ? ground * 0.5 : ground * 0.66;
  return (
    <G testID="midnight-sun">
      <Circle cx={x} cy={y} r={22} fill={bannerDrawing.sunLow} opacity={0.2} />
      <Circle cx={x} cy={y} r={12} fill={bannerDrawing.sunLow} />
    </G>
  );
}

/** The farmhouse on the back hill, its windows lit at night, snow on its roof in winter. */
export function Farmhouse({
  x,
  y,
  roof,
  snow,
  scheme,
}: {
  readonly x: number;
  readonly y: number;
  readonly roof: string;
  readonly snow: string | undefined;
  readonly scheme: ColorScheme;
}) {
  const house = bannerHouse[scheme];
  return (
    <G testID="farmhouse">
      <Rect x={x - 7} y={y - 8} width={14} height={8.4} fill={house.wall} />
      <Path
        d={`M${at(x - 8.6, y - 7.4)} L${at(x - 3.4, y - 13.4)} L${at(x + 3.4, y - 13.4)} L${at(x + 8.6, y - 7.4)} Z`}
        fill={roof}
      />
      {snow === undefined ? null : (
        <Path
          d={`M${at(x - 3.4, y - 13.4)} L${at(x + 3.4, y - 13.4)} L${at(x + 5.6, y - 10.8)} L${at(x - 5.6, y - 10.8)} Z`}
          fill={snow}
        />
      )}
      <Rect x={x - 4.6} y={y - 5.6} width={3} height={3} fill={house.window} />
      <Rect x={x + 1.4} y={y - 5.6} width={3} height={5.6} fill={house.window} />
    </G>
  );
}

/** Heather red and birch gold on the hills, kept inside their outline. */
export function Heather({
  id,
  hills,
  zones,
  ground,
  scheme,
}: {
  readonly id: string;
  readonly hills: string;
  readonly zones: readonly Room[];
  readonly ground: number;
  readonly scheme: ColorScheme;
}) {
  const next = seeded(13);
  const blobs = zones.flatMap(([from, to]) =>
    Array.from({ length: Math.round((to - from) / 5) }, () => ({
      x: from + next() * (to - from),
      y: ground - 2 - next() * 34,
      r: 1.6 + next() * 2.6,
      fill: next() < 0.55 ? bannerDrawing.heather : bannerDrawing.birch,
    })),
  );
  return (
    <G testID="heather">
      <Defs>
        <ClipPath id={id}>
          <Path d={hills} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id})`} opacity={scheme === "dark" ? 0.6 : 0.85}>
        {blobs.map(({ x, y, r, fill }) => (
          <Circle key={`${x.toFixed(2)}-${y.toFixed(2)}`} cx={x} cy={y} r={r} fill={fill} />
        ))}
      </G>
    </G>
  );
}

/** Places `count` small things evenly along each zone, a little apart from even. */
function along(zones: readonly Room[], count: number, seed: number) {
  const next = seeded(seed);
  return zones.flatMap(([from, to], zone) =>
    Array.from({ length: count }, (_, index) => ({
      x: from + ((index + 0.5) / count) * (to - from) + (next() - 0.5) * 6,
      zone,
      index,
    })),
  );
}

/** Purple lupines along the hills' foot, three spikes each. */
export function Lupines({
  zones,
  ground,
  wide,
}: {
  readonly zones: readonly Room[];
  readonly ground: number;
  readonly wide: boolean;
}) {
  return (
    <>
      {along(zones, wide ? 9 : 4, 11).map(({ x, zone, index }) => (
        <G
          key={`${String(zone)}-${String(index)}`}
          testID="lupine"
          {...motionMark("lupine", { delay: Math.min(1500, 120 + index * 90 + zone * 60) })}
        >
          {[-4, 0, 4].map((dx, spike) => {
            const tall = 7 + ((index + spike) % 3) * 1.6;
            return (
              <G key={dx}>
                <Path
                  d={`M${at(x + dx, ground - 2)} V${(ground - 3 - tall).toFixed(1)}`}
                  stroke={bannerDrawing.stem}
                  strokeWidth={1}
                />
                <Ellipse
                  cx={x + dx}
                  cy={ground - 4 - tall}
                  rx={1.8}
                  ry={tall * 0.55}
                  fill={spike === 1 ? bannerDrawing.lupineLight : bannerDrawing.lupine}
                />
              </G>
            );
          })}
        </G>
      ))}
    </>
  );
}

/** Small yellow and white flowers in spring's grass. */
export function Flowers({
  zones,
  ground,
  wide,
}: {
  readonly zones: readonly Room[];
  readonly ground: number;
  readonly wide: boolean;
}) {
  return (
    <>
      {along(zones, wide ? 12 : 5, 17).map(({ x, zone, index }) => {
        const y = ground - 4 - (index % 3) * 3;
        return (
          <G
            key={`${String(zone)}-${String(index)}`}
            testID="flower"
            {...motionMark("flower", { delay: Math.min(1500, 300 + index * 110 + zone * 70) })}
          >
            <Path
              d={`M${at(x, ground - 1)} V${y.toFixed(1)}`}
              stroke={bannerDrawing.stem}
              strokeWidth={0.9}
            />
            <Circle
              cx={x}
              cy={y - 1.4}
              r={2.1}
              fill={index % 2 === 0 ? people.sun : puffin.white}
            />
            <Circle cx={x} cy={y - 1.4} r={0.8} fill={puffinCar.wing} />
          </G>
        );
      })}
    </>
  );
}

/** Snow heaped along the road's edge, in little mounds. */
export function SnowBanks({
  width,
  ground,
  snow,
}: {
  readonly width: number;
  readonly ground: number;
  readonly snow: string;
}) {
  const mounds = Array.from(
    { length: Math.ceil(width / 18) + 1 },
    (_, index) => `Q${at(index * 18 + 9, ground - 3)} ${at(index * 18 + 18, ground + 2)}`,
  ).join(" ");
  return (
    <Path
      testID="snow-banks"
      d={`M0 ${String(ground + 2)} ${mounds} L${String(width)} ${String(ground + 3.5)} L0 ${String(ground + 3.5)} Z`}
      fill={snow}
    />
  );
}

/** The first day of summer's sun, rising over the mountains with its rays and a smile. */
export function Sunrise({
  width,
  room,
  ground,
  wide,
}: {
  readonly width: number;
  readonly room: Room;
  readonly ground: number;
  readonly wide: boolean;
}) {
  const x = wide ? room[1] - 46 : width * 0.2;
  const y = wide ? 42 : Math.max(66, ground * 0.46);
  const rays = Array.from({ length: 12 }, (_, index) => {
    const angle = (index * Math.PI) / 6;
    return `M${at(x + 15 * Math.cos(angle), y + 15 * Math.sin(angle))} L${at(x + 22 * Math.cos(angle), y + 22 * Math.sin(angle))}`;
  }).join(" ");
  return (
    <G testID="sunrise" {...motionMark("sunrise")}>
      <G {...motionMark("rays")}>
        <Path d={rays} stroke={people.sun} strokeWidth={3} strokeLinecap="round" />
      </G>
      <Circle cx={x} cy={y} r={12} fill={people.sun} />
      <Path
        d={`M${at(x - 5, y + 2)} Q${at(x, y + 6.5)} ${at(x + 5, y + 2)}`}
        stroke={puffinCar.wing}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx={x - 4} cy={y - 3} r={1.3} fill={puffinCar.wing} />
      <Circle cx={x + 4} cy={y - 3} r={1.3} fill={puffinCar.wing} />
    </G>
  );
}

/**
 * Where New Year's three fireworks burst, and how big: on a phone across
 * the sky, on a laptop in the car's room; with Jólakötturinn over the
 * farmhouse (spec 36, 3.11), clear of him.
 */
export function fireworkBursts(
  width: number,
  room: Room,
  ground: number,
  wide: boolean,
  cat: boolean,
) {
  const span = room[1] - room[0];
  if (wide) {
    return cat
      ? ([
          [room[0] + 40, 40, 20, people.crowberry],
          [room[0] + span * 0.6, 36, 22, people.sun],
          [room[0] + span * 0.32, 22, 14, bannerDrawing.aurora2],
        ] as const)
      : ([
          [room[0] + 50, 40, 20, people.crowberry],
          [room[1] - 60, 34, 24, people.sun],
          [room[0] + span * 0.52, 26, 14, bannerDrawing.aurora2],
        ] as const);
  }
  return cat
    ? ([
        [width * 0.64, Math.max(62, ground * 0.4), 12, people.crowberry],
        [width * 0.86, Math.max(64, ground * 0.48), 17, people.sun],
        [width * 0.44, 58, 9, bannerDrawing.aurora2],
      ] as const)
    : ([
        [width * 0.15, Math.max(62, ground * 0.47), 15, people.crowberry],
        [width * 0.86, Math.max(64, ground * 0.48), 17, people.sun],
        [width * 0.31, 58, 9, bannerDrawing.aurora2],
      ] as const);
}

/**
 * New Year's three fireworks, burst in the sky: on a phone across it, on a
 * laptop in the car's room, clear of the cat when he shows. While
 * `rising`, in the moment, each goes up on a trail first and bursts in its
 * turn.
 */
export function Fireworks({
  width,
  room,
  ground,
  wide,
  rising = false,
  cat = false,
}: {
  readonly width: number;
  readonly room: Room;
  readonly ground: number;
  readonly wide: boolean;
  readonly rising?: boolean;
  readonly cat?: boolean;
}) {
  const turns = motion.moments.burst.at;
  const bursts = fireworkBursts(width, room, ground, wide, cat);
  return (
    <>
      {bursts.map(([x, y, r, colour], turn) => {
        const delay = turns[turn] ?? 0;
        const rays = Array.from({ length: 12 }, (_, index) => {
          const angle = (index * Math.PI) / 6 + 0.2;
          return `M${at(x + r * 0.35 * Math.cos(angle), y + r * 0.35 * Math.sin(angle))} L${at(x + r * Math.cos(angle), y + r * Math.sin(angle))}`;
        }).join(" ");
        return (
          <G key={`${x.toFixed(1)}-${y.toFixed(1)}`}>
            {rising ? (
              <Path
                testID="trail"
                {...motionMark("trail", { delay })}
                d={`M${at(x, y + 26)} L${at(x, y + 4)}`}
                stroke={colour}
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            ) : null}
            <G testID="firework" {...motionMark("burst", { delay })}>
              <Path d={rays} stroke={colour} strokeWidth={2.2} strokeLinecap="round" />
              {Array.from({ length: 12 }, (_, index) => {
                const angle = (index * Math.PI) / 6 + 0.2 + Math.PI / 12;
                return (
                  <Circle
                    key={index}
                    cx={x + r * 0.78 * Math.cos(angle)}
                    cy={y + r * 0.78 * Math.sin(angle)}
                    r={1.3}
                    fill={puffin.white}
                  />
                );
              })}
              <Circle cx={x} cy={y} r={2} fill={colour} />
            </G>
          </G>
        );
      })}
    </>
  );
}
