import { useEffect, useRef, type ComponentRef, type RefObject } from "react";
import { Platform, type ScrollView } from "react-native";
import { spacing } from "@/theme/tokens";

/** How far the mark comes down before letting go refreshes (spec 16, 3.9). */
export const pullTrigger = spacing.xxl + spacing.md;
/** The furthest the mark comes down, however far the finger goes. */
export const pullMost = spacing.xxl * 2;

/** How far the mark has come down for a finger `moved` down from where it started. */
export function pulled(moved: number): number {
  return Math.min(Math.max(moved, 0) / 2, pullMost);
}

/** Whether letting go at `distance` refreshes. */
export function pullReady(distance: number): boolean {
  return distance >= pullTrigger;
}

/** How far a finger moves before a touch at the top is a pull or a scroll. */
export const pullSlop = spacing.sm;

/** Where a touch stands in pulling down (the web's own pull, below). */
export type PullPhase =
  /** Not at the top: it scrolls, and pulls once the scroll is back at the top. */
  | { readonly kind: "waiting" }
  /** At the top, where the finger was; it has not moved enough to tell. */
  | { readonly kind: "deciding"; readonly x: number; readonly y: number }
  /** Pulling, from where the finger was at the top. */
  | { readonly kind: "pulling"; readonly y: number }
  /** Sideways, as on a row of chips, or in a part that scrolls on its own: it scrolls. */
  | { readonly kind: "out" };

/** Where a touch stands once the finger is at `point`, the scroll at its top or not. */
export function nextPullPhase(
  phase: PullPhase,
  point: { readonly x: number; readonly y: number },
  atTop: boolean,
): PullPhase {
  switch (phase.kind) {
    case "out":
      return phase;
    case "waiting":
      return atTop ? { kind: "deciding", x: point.x, y: point.y } : phase;
    case "deciding": {
      const down = point.y - phase.y;
      const sideways = Math.abs(point.x - phase.x);
      if (Math.max(Math.abs(down), sideways) < pullSlop) return phase;
      if (!atTop || down < 0) return { kind: "waiting" };
      // Mostly down: within about 27 degrees of straight down.
      return down >= 2 * sideways ? { kind: "pulling", y: phase.y } : { kind: "out" };
    }
    case "pulling":
      // Back up past where it started: the finger scrolls again.
      return point.y > phase.y ? phase : { kind: "waiting" };
  }
}

interface PullHandlers {
  /** The finger moved while pulling: how far the mark has come down. */
  readonly move: (distance: number) => void;
  /** The finger let go, or the browser took the touch (0). */
  readonly release: (distance: number) => void;
}

/**
 * Pulling down at the top of a scroll on the web, where React Native has no
 * pull to refresh: a finger that moves down while the scroll is at its top
 * pulls instead of scrolling, and the browser's own bounce and reload stay
 * out of it (`nextPullPhase` tells a pull from a scroll). Phones use React
 * Native's `RefreshControl` instead. A mouse does not pull; the logo
 * refreshes the front page (spec 16, 3.9).
 */
export function usePullOnWeb(
  scrollRef: RefObject<ComponentRef<typeof ScrollView> | null>,
  on: boolean,
  handlers: PullHandlers,
) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    if (Platform.OS !== "web" || !on) return;
    const node = scrollRef.current?.getScrollableNode() as HTMLElement | null | undefined;
    if (node === null || node === undefined) return;
    let phase: PullPhase = { kind: "out" };
    let distance = 0;
    const atTop = () => node.scrollTop <= 0;
    const onStart = (event: TouchEvent) => {
      const [touch] = event.touches;
      distance = 0;
      phase =
        event.touches.length !== 1 || touch === undefined || scrollsOnItsOwn(event.target, node)
          ? { kind: "out" }
          : nextPullPhase({ kind: "waiting" }, { x: touch.clientX, y: touch.clientY }, atTop());
    };
    const onMove = (event: TouchEvent) => {
      const [touch] = event.touches;
      if (event.touches.length !== 1 || touch === undefined) {
        phase = { kind: "out" };
        return;
      }
      const was = phase;
      phase = nextPullPhase(phase, { x: touch.clientX, y: touch.clientY }, atTop());
      if (phase.kind === "pulling") {
        if (event.cancelable) event.preventDefault();
        distance = pulled(touch.clientY - phase.y);
        latest.current.move(distance);
      } else if (was.kind === "pulling") {
        distance = 0;
        latest.current.move(0);
      }
    };
    const onEnd = () => {
      if (phase.kind === "pulling") latest.current.release(distance);
      phase = { kind: "out" };
    };
    const onCancel = () => {
      if (phase.kind === "pulling") latest.current.release(0);
      phase = { kind: "out" };
    };
    node.addEventListener("touchstart", onStart, { passive: true });
    // Not passive, so the pull can keep the page from bouncing.
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onCancel);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onCancel);
    };
  }, [scrollRef, on]);
}

/** Whether `target` is inside a part of `scroll` that scrolls up and down on its own and is not at its top. */
function scrollsOnItsOwn(target: EventTarget | null, scroll: HTMLElement): boolean {
  for (
    let part = target instanceof Element ? target : null;
    part !== null && part !== scroll;
    part = part.parentElement
  ) {
    const { overflowY } = getComputedStyle(part);
    const scrolls = overflowY === "auto" || overflowY === "scroll";
    if (scrolls && part.scrollHeight > part.clientHeight && part.scrollTop > 0) return true;
  }
  return false;
}
