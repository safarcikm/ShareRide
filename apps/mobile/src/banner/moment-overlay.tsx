import type { BannerDay, BannerSeason } from "@shareride/domain";
import { Circle, Ellipse, G, Path } from "react-native-svg";
import { Puffin } from "@/components/puffin";
import { motionMark } from "@/theme/motion";
import {
  bannerDrawing,
  icelandSeasons,
  motion,
  puffin,
  puffinCar,
  type ColorScheme,
} from "@/theme/tokens";
import { seeded } from "./random";
import { at, type Room } from "./scene-layers";

// What a moment brings into the scene only while it plays (spec 36, 3.6),
// as the preview draws it (preview.html, `overlay()`): falling snow, leaves
// blowing along behind the car, and two puffins flying past. Each is
// unseen until its animation shows it and gone when it ends, and none of it
// is drawn once the moment has played, nor in the phone apps.

/** What a season's or day's moment brings into the scene. */
export type MomentKind = "snow" | "heavySnow" | "leaves" | "flyers";

const seasonMoments: Readonly<Record<BannerSeason, MomentKind | null>> = {
  winter: "snow",
  spring: "flyers",
  summer: null,
  autumn: "leaves",
};

const dayMoments: Readonly<Partial<Record<BannerDay, MomentKind>>> = {
  christmas: "snow",
  winterday: "heavySnow",
};

/** The moment's things of a day, or of the season on a plain day: a day's replace its season's. */
export function momentOf(day: BannerDay | null, season: BannerSeason): MomentKind | null {
  return day === null ? seasonMoments[season] : (dayMoments[day] ?? null);
}

/** A number between `from` and `to`, as far along as `k` (0 to 1) says, whole. */
const between = ([from, to]: readonly [number, number], k: number) =>
  Math.round(from + (to - from) * k);
const tenth = (value: number) => Math.round(value * 10) / 10;

export interface Flake {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly delay: number;
  readonly duration: number;
  readonly dx: number;
  readonly dy: number;
}

/** Snowflakes over `room`, each falling to near `ground`: a little snow, or more on the first day of winter. */
export function snowfall(kind: "snow" | "heavySnow", room: Room, ground: number): Flake[] {
  const next = seeded(53);
  const span = room[1] - room[0];
  const count = Math.round((kind === "snow" ? 16 : 30) * Math.min(1.6, span / 320));
  const { flake } = motion.moments;
  return Array.from({ length: count }, () => {
    const x = room[0] + next() * span;
    const y = 48 + next() * 26;
    const dy = ground - y + 4 - next() * 22;
    return {
      x: tenth(x),
      y: tenth(y),
      duration: between(flake.duration, next()),
      delay: between(flake.delay, next()),
      dx: tenth((next() - 0.3) * 26),
      dy: tenth(dy),
      r: tenth(1.3 + next() * 1.4),
    };
  });
}

export interface Leaf {
  readonly x: number;
  readonly y: number;
  readonly colour: string;
  readonly delay: number;
  readonly duration: number;
  readonly dx: number;
  readonly dy: number;
  readonly turn: number;
}

/** Eight leaves from the left of `room`, blowing along it behind the car. */
export function leafFall(room: Room, ground: number): Leaf[] {
  const next = seeded(71);
  const span = room[1] - room[0];
  const colours = [bannerDrawing.birch, bannerDrawing.heather, puffinCar.wing];
  const { leaf } = motion.moments;
  return Array.from({ length: 8 }, (_, index) => ({
    x: tenth(room[0] + next() * span * 0.45),
    y: tenth(ground - 30 + next() * 34),
    colour: colours[index % 3] ?? bannerDrawing.birch,
    duration: between(leaf.duration, next()),
    delay: between(leaf.delay, next()),
    dx: tenth(span * (0.35 + next() * 0.3)),
    dy: tenth(-6 + next() * 22),
    turn: Math.round(200 + next() * 300),
  }));
}

export interface Flyer {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly delay: number;
  readonly duration: number;
  readonly dx: number;
}

/**
 * Two puffins flying across, back for the summer: on a phone from beyond
 * the left edge to beyond the right, on a laptop across the car's room
 * only, which they never leave on the words' side.
 */
export function flyersFor(room: Room, ground: number, wide: boolean): Flyer[] {
  const { flyer } = motion.moments;
  const from = wide ? room[0] + 24 : room[0] - 40;
  const to = room[1] + 40;
  return [
    { k: 0.4, delay: flyer.delay[0], duration: flyer.duration[0], size: 1 },
    { k: 0.52, delay: flyer.delay[1], duration: flyer.duration[1], size: 0.82 },
  ].map(({ k, delay, duration, size }) => ({
    x: from,
    y: tenth(wide ? 26 + 40 * (k - 0.4) : Math.max(56, ground * k)),
    size,
    delay,
    duration,
    dx: tenth(to - from),
  }));
}

/** A puffin flying right, its wings beating, bobbing as it goes. */
function FlyingPuffin({ black }: { readonly black: string }) {
  return (
    <G {...motionMark("flyer-bob")}>
      <G transform="scale(0.62)">
        <Path d="M-30 4 L-38 -2 L-37 9 Z" fill={black} />
        <Path d="M-24 10 L-31 16 L-22 14 Z M-19 11 L-24 18 L-15 14 Z" fill={puffin.beak} />
        <Ellipse cx={-6} cy={4} rx={26} ry={12} fill={black} />
        <Path d="M-26 8 C-18 16 6 18 16 10 C6 12 -14 12 -26 8 Z" fill={puffin.white} />
        <Puffin x={16} y={-2} size={0.5} look={{ kind: "colour", black }} />
        <G {...motionMark("flyer-wing")}>
          <Path d="M-14 2 C-14 -16 -2 -26 8 -24 C2 -16 -2 -6 2 2 Z" fill={black} />
        </G>
      </G>
    </G>
  );
}

/**
 * What the moment of `kind` brings into the scene while it plays: drawn
 * over the scene's land, across a phone's width or in a laptop's car room.
 */
export function MomentOverlay({
  kind,
  room,
  ground,
  wide,
  scheme,
  black,
}: {
  readonly kind: MomentKind;
  readonly room: Room;
  readonly ground: number;
  readonly wide: boolean;
  readonly scheme: ColorScheme;
  readonly black: string;
}) {
  if (kind === "snow" || kind === "heavySnow") {
    const fill = scheme === "dark" ? bannerDrawing.nightFlake : icelandSeasons.winter.light.snow;
    return (
      <G testID="moment-snow">
        {snowfall(kind, room, ground).map((flake) => (
          <Circle
            key={`${String(flake.x)}-${String(flake.y)}`}
            testID="flake"
            {...motionMark("flake", flake)}
            cx={flake.x}
            cy={flake.y}
            r={flake.r}
            fill={fill}
            stroke={bannerDrawing.flakeEdge}
            strokeOpacity={scheme === "dark" ? 0 : 0.6}
            strokeWidth={0.6}
          />
        ))}
      </G>
    );
  }
  if (kind === "leaves") {
    return (
      <G testID="moment-leaves">
        {leafFall(room, ground).map(({ x, y, colour, ...timing }) => (
          <Path
            key={`${String(x)}-${String(y)}`}
            testID="leaf"
            {...motionMark("leaf", timing)}
            d={`M${at(x, y - 4)} C${at(x + 3.4, y - 3)} ${at(x + 4, y)} ${at(x, y + 4)} C${at(x - 4, y)} ${at(x - 3.4, y - 3)} ${at(x, y - 4)} Z`}
            fill={colour}
          />
        ))}
      </G>
    );
  }
  return (
    <G testID="moment-flyers">
      {flyersFor(room, ground, wide).map(({ x, y, size, delay, duration, dx }) => (
        <G key={String(delay)} testID="flyer" {...motionMark("flyer", { delay, duration, dx })}>
          <G transform={`translate(${String(x)} ${String(y)}) scale(${String(size)})`}>
            <FlyingPuffin black={black} />
          </G>
        </G>
      ))}
    </G>
  );
}
