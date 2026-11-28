import { motion, spacing } from "./tokens";

const arrive = '[data-motion="arrive"]';
const room = '[data-motion="arrive-room"]';

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
    "@media (prefers-reduced-motion: reduce){[data-motion]{animation:none !important;" +
      "-webkit-mask-image:none !important;mask-image:none !important}}",
  ].join("");
}
