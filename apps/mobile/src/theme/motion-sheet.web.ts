import { lastOfArrival, motionCss } from "./motion-css";

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
 * Calls `done` once the car has arrived (spec 33, 3.2): when the
 * driver's hop, which moves last, ends or stops, as when Find is left
 * meanwhile or reduce motion is turned on. So the arrival is over when
 * the page shows it over, even when its first frame came late or the
 * page waited in a tab behind. With reduce motion on nothing moves, and
 * it is over at once. Gives back what stops listening.
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
    if (event.target instanceof Element && event.target.matches(lastOfArrival)) done();
  };
  document.addEventListener("animationend", ended);
  document.addEventListener("animationcancel", ended);
  return () => {
    document.removeEventListener("animationend", ended);
    document.removeEventListener("animationcancel", ended);
  };
}
