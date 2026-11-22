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
 * out of it. Phones use React Native's `RefreshControl` instead. A mouse
 * does not pull; the logo refreshes the front page (spec 16, 3.9).
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
    // Where the finger was when the pull could start, and how far it came.
    let start: { readonly x: number; readonly y: number } | null = null;
    let distance = 0;
    let pulling = false;
    // A touch inside a part that scrolls on its own, such as a list in a
    // card, scrolls that part first.
    let inner = false;
    const reset = () => {
      start = null;
      distance = 0;
      pulling = false;
    };
    const atTop = () => node.scrollTop <= 0;
    const onStart = (event: TouchEvent) => {
      reset();
      inner = scrollsOnItsOwn(event.target, node);
      const [touch] = event.touches;
      if (event.touches.length === 1 && touch !== undefined && atTop() && !inner) {
        start = { x: touch.clientX, y: touch.clientY };
      }
    };
    const onMove = (event: TouchEvent) => {
      const [touch] = event.touches;
      if (event.touches.length !== 1 || touch === undefined || inner) return;
      // A finger that scrolled back up to the top pulls from there on.
      if (start === null) {
        if (atTop()) start = { x: touch.clientX, y: touch.clientY };
        return;
      }
      const moved = touch.clientY - start.y;
      if (!pulling) {
        // Up, or more sideways than down, as on a row of chips: not a pull.
        if (moved < 0 || !atTop() || Math.abs(touch.clientX - start.x) > moved) start = null;
        if (moved <= 0 || start === null) return;
        pulling = true;
      }
      if (event.cancelable) event.preventDefault();
      distance = pulled(moved);
      latest.current.move(distance);
    };
    const onEnd = () => {
      if (pulling) latest.current.release(distance);
      reset();
    };
    const onCancel = () => {
      if (pulling) latest.current.release(0);
      reset();
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
