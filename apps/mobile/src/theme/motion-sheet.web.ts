import { lastOfArrival, motionCss, playingParts } from "./motion-css";

const id = "puffinride-motion";

/** Adds the motion style sheet (spec 33, ADR 0052) to the page, once. */
export function installMotion(): void {
  if (typeof document === "undefined" || document.getElementById(id) !== null) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = motionCss();
  document.head.appendChild(style);
}

/**
 * Whether anything of the arriving car, or of the moment its scene plays,
 * still moves or is still to move. Null where the browser cannot list
 * its animations.
 */
function stillPlaying(): boolean | null {
  if (typeof document.getAnimations !== "function") return null;
  return document.getAnimations().some((animation) => {
    if (animation.playState === "finished") return false;
    const target =
      animation.effect !== null && "target" in animation.effect
        ? (animation.effect as KeyframeEffect).target
        : null;
    return target instanceof Element && target.closest(playingParts) !== null;
  });
}

/**
 * Calls `done` once the car has arrived (spec 33, 3.2) and the moment of
 * the day or season has played (spec 36, 3.6): when a part of them ends
 * or stops, as when Find is left meanwhile or reduce motion is turned on,
 * and nothing of them moves or is still to move. Where the browser cannot
 * list its animations, when the driver's hop, which moves last of the
 * car, ends. So the arrival is over when the page shows it over, even
 * when its first frame came late or the page waited in a tab behind.
 * With reduce motion on nothing moves, and it is over at once. Gives back
 * what stops listening.
 */
export function whenArrived(done: () => void): () => void {
  if (
    typeof document === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    done();
    return () => undefined;
  }
  const ended = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const playing = stillPlaying();
    if (playing === null ? event.target.matches(lastOfArrival) : !playing) done();
  };
  document.addEventListener("animationend", ended);
  document.addEventListener("animationcancel", ended);
  return () => {
    document.removeEventListener("animationend", ended);
    document.removeEventListener("animationcancel", ended);
  };
}
