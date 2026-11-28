import { motion, spacing } from "./tokens";

const arrive = '[data-motion="arrive"]';
const room = '[data-motion="arrive-room"]';
const moment = '[data-motion="moment"]';

/**
 * What moves last as the car arrives, so its animation's end is the
 * arrival's end: the driver's hop (`motion.arrival.hops`).
 */
export const lastOfArrival = `${arrive} [data-motion="puffin-driver"]`;

/**
 * The website's motion (spec 33, ADR 0052): CSS keyframes in one style
 * sheet, for the parts marked with `data-motion` (`motionMark` and
 * `arrivalProps` in `./motion`). The browser runs them off the main
 * thread, they start with the first frame, and with reduce motion on
 * nothing moves. Only `transform` and `opacity` animate (R33.2).
 *
 * The car's arrival on the front page (3.2): it drives in from `--from`
 * and slows to a stop; its body bobs on the road and dips its nose as it
 * stops; then the passenger hops, then the driver. On a laptop the car
 * comes out of its own room beside the title, which hides what is left
 * of it and softens its left edge, so it never passes under the words.
 */
export function motionCss(): string {
  const { arrival, curves } = motion;
  const [you, driver] = arrival.hops;
  const [bump, smallerBump] = arrival.bumps;
  const [dip, back] = arrival.dip;
  const up = (by: number) => `transform:translateY(${String(-by)}px)`;
  const tilt = (by: number) => `transform:rotate(${String(by)}deg)`;
  // A mask's colour is never seen, only how much of what is under it shows.
  const edge = `linear-gradient(to right,transparent,#000 ${String(spacing.lg)}px)`;
  const hop = (part: string, at: number) =>
    `${arrive} [data-motion="${part}"]{animation:pr-hop ${String(arrival.hop)}ms ${String(at)}ms both}`;
  return [
    `${arrive}{animation:pr-arrive ${String(arrival.drive)}ms ${curves.brake} both}`,
    // The body turns about where its wheels stand on the road.
    `${arrive} [data-motion="car-body"]{transform-box:fill-box;transform-origin:50% 92%;` +
      `animation:pr-settle ${String(arrival.settle)}ms linear both}`,
    hop("puffin-you", you),
    hop("puffin-driver", driver),
    `${room}{overflow:hidden;-webkit-mask-image:${edge};mask-image:${edge}}`,
    `${room} ${arrive}{animation-name:pr-arrive-fade}`,
    "@keyframes pr-arrive{from{transform:translateX(var(--from))}to{transform:none}}",
    "@keyframes pr-arrive-fade{0%{transform:translateX(var(--from));opacity:0}" +
      "40%{opacity:1}100%{transform:none;opacity:1}}",
    // Two bumps on the road while it drives, then the dip as it brakes.
    `@keyframes pr-settle{0%{transform:none}12%{${up(bump)}}24%{transform:none}` +
      `38%{${up(smallerBump)}}50%,73%{transform:none}83%{${tilt(dip)}}93%{${tilt(back)}}` +
      "100%{transform:none}}",
    // Up quickly, down as things fall.
    `@keyframes pr-hop{0%{transform:none;animation-timing-function:${curves.rise}}` +
      `45%{${up(arrival.hopHeight)};animation-timing-function:${curves.fall}}` +
      "100%{transform:none}}",
    ...momentCss(),
    "@media (prefers-reduced-motion: reduce){[data-motion]{animation:none !important;" +
      "-webkit-mask-image:none !important;mask-image:none !important}}",
  ].join("");
}

/**
 * Each part of a season's or day's moment (spec 36, 3.6), with its
 * keyframes and how it turns: about its middle, its foot or its edge.
 * Its timing is in `motion.moments`; where each drawn thing has its own,
 * the part reads it from `--d` and `--t` (`motionMark`), and how far it
 * goes from `--dx`, `--dy` and `--r`.
 */
const moments = {
  flake: {
    frames:
      "0%{opacity:0;transform:translate(0,-16px)}15%{opacity:.95}80%{opacity:.95}" +
      "100%{opacity:0;transform:translate(var(--dx,0px),var(--dy,0px))}",
    curve: "linear",
  },
  leaf: {
    frames:
      "0%{opacity:0;transform:translate(0,0) rotate(0deg)}12%{opacity:1}78%{opacity:1}" +
      "100%{opacity:0;transform:translate(var(--dx,0px),var(--dy,0px)) rotate(var(--r,0deg))}",
    curve: "cubic-bezier(0.3, 0.5, 0.6, 1)",
  },
  flyer: {
    frames:
      "0%{opacity:1;transform:translateX(0)}100%{opacity:1;transform:translateX(var(--dx,0px))}",
    curve: "linear",
  },
  "flyer-bob": {
    frames: "0%{transform:translateY(-3px)}100%{transform:translateY(3px)}",
    curve: "ease-in-out",
    alternate: true,
  },
  "flyer-wing": {
    frames: "0%{transform:scaleY(1)}100%{transform:scaleY(-0.6)}",
    curve: "linear",
    turn: "50% 100%",
    alternate: true,
  },
  aurora: {
    frames:
      "0%{opacity:0;transform:translateX(-14px) scaleY(0.6)}55%{opacity:1}" +
      "100%{opacity:1;transform:none}",
    turn: "50% 100%",
  },
  sunrise: { frames: "0%{transform:translateY(46px)}100%{transform:none}", turn: "50% 50%" },
  rays: {
    frames: "0%,45%{opacity:0;transform:rotate(-30deg) scale(0.8)}100%{opacity:1;transform:none}",
    turn: "50% 50%",
  },
  glow: {
    frames: "0%{opacity:0;transform:scale(0.7)}100%{opacity:1;transform:none}",
    turn: "50% 50%",
  },
  burst: {
    frames: "0%{opacity:0;transform:scale(0.2)}14%{opacity:1}100%{opacity:1;transform:none}",
    turn: "50% 50%",
  },
  // Each trail rises in the time before its burst, from `--d`, its burst's.
  trail: {
    frames: "0%{opacity:0;transform:translateY(26px)}30%{opacity:1}100%{opacity:0;transform:none}",
    curve: "ease-out",
  },
  bulb: {
    frames: "0%{opacity:.15}60%{opacity:1}80%{opacity:.5}100%{opacity:1}",
    curve: "ease-out",
  },
  chick: {
    frames: "0%,55%{transform:translateY(11px)}78%{transform:translateY(-3px)}100%{transform:none}",
  },
  cloth: {
    frames:
      "0%{transform:none}18%{transform:skewY(10deg) scaleX(0.9)}" +
      "38%{transform:skewY(-7deg) scaleX(0.95)}58%{transform:skewY(5deg)}" +
      "78%{transform:skewY(-2deg)}100%{transform:none}",
    curve: "ease-in-out",
    turn: "100% 50%",
  },
  balloons: {
    frames:
      "0%,46%{transform:rotate(-20deg)}68%{transform:rotate(9deg)}" +
      "85%{transform:rotate(-4deg)}100%{transform:none}",
    curve: "ease-in-out",
    turn: "50% 50%",
  },
  // The load rocks forward as the car stops, and settles.
  load: {
    frames:
      "0%,70%{transform:none}80%{transform:rotate(5deg)}90%{transform:rotate(-2.5deg)}" +
      "100%{transform:none}",
    curve: "linear",
    turn: "50% 100%",
  },
  heart: {
    frames:
      "0%,62%{opacity:0;transform:translateY(8px) scale(0.6)}" +
      "82%{opacity:1;transform:translateY(-2px) scale(1.08)}100%{opacity:1;transform:none}",
    turn: "50% 50%",
  },
  sparkle: {
    frames:
      "0%,62%{opacity:0;transform:scale(0.4) rotate(-40deg)}" +
      "82%{opacity:1;transform:scale(1.15)}100%{opacity:1;transform:none}",
    turn: "50% 50%",
  },
  flower: {
    frames: "0%{opacity:0;transform:scale(0.4)}100%{opacity:1;transform:none}",
    turn: "50% 100%",
  },
  lupine: {
    frames:
      "0%{transform:none}25%{transform:rotate(7deg)}50%{transform:rotate(-4deg)}" +
      "75%{transform:rotate(2deg)}100%{transform:none}",
    curve: "ease-in-out",
    turn: "50% 100%",
  },
  cover: { frames: "0%,18%{opacity:0}100%{opacity:1}", curve: "ease-out" },
} as const satisfies Record<
  string,
  { frames: string; curve?: string; turn?: string; alternate?: boolean }
>;

/** The parts of the moments, each marked with `motionMark`. */
export type MomentPart = keyof typeof moments;

export const momentParts = Object.keys(moments) as readonly MomentPart[];

/** Unseen until their moment shows them, and gone after. */
const hidden: readonly MomentPart[] = ["flake", "leaf", "trail", "flyer"];

/** A time in `motion.moments`: one, or the earliest and the latest. */
type Time = number | readonly [number, number];

const ms = (value: number) => `${String(value)}ms`;
const latest = (value: Time) => (typeof value === "number" ? value : value[1]);

/** How long a part plays and when it starts: its own, or as its drawn thing says. */
function timingOf(part: MomentPart): string {
  const timing = motion.moments[part] as {
    readonly duration: Time;
    readonly delay?: Time;
    readonly at?: readonly number[];
    readonly times?: number;
  };
  const { duration, delay, at, times } = timing;
  const length = typeof duration === "number" ? ms(duration) : `var(--t,${ms(duration[1])})`;
  // A trail ends as its burst starts; what comes at set times reads `--d`.
  const start =
    part === "trail"
      ? `calc(var(--d,0ms) - ${ms(latest(duration))})`
      : at !== undefined || (delay !== undefined && typeof delay !== "number")
        ? "var(--d,0ms)"
        : delay === undefined
          ? ""
          : ms(delay);
  const repeat = times === undefined ? "" : ` ${String(times)}`;
  return [length, start].filter((value) => value !== "").join(" ") + repeat;
}

/** The moments' rules and keyframes, for the car as it arrives and the scene whose moment plays. */
function momentCss(): string[] {
  const rules = hidden.map((part) => `[data-motion="${part}"]{opacity:0}`);
  for (const part of momentParts) {
    const look: { frames: string; curve?: string; turn?: string; alternate?: boolean } =
      moments[part];
    const curve = look.curve ?? motion.curves.out;
    const turn =
      look.turn === undefined ? "" : `transform-box:fill-box;transform-origin:${look.turn};`;
    const alternate = look.alternate === true ? " alternate" : "";
    rules.push(
      `${arrive} [data-motion="${part}"],${moment} [data-motion="${part}"]{${turn}` +
        `animation:pr-${part} ${timingOf(part)} ${curve}${alternate} both}`,
      `@keyframes pr-${part}{${look.frames}}`,
    );
  }
  return rules;
}
