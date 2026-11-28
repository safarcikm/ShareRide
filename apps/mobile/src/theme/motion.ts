import { useEffect, useState } from "react";
import type { ViewProps } from "react-native";
import { onWebsite } from "@/lib/on-website";
import type { MomentPart } from "./motion-css";
import { whenArrived } from "./motion-sheet";

/*
 * Marks for the website's motion style sheet (spec 33, ADR 0052;
 * `motionCss`). React Native Web writes `dataSet` as `data-*` attributes
 * and passes a custom property in `style` through; React Native's types
 * lack both. The phone apps get nothing yet: their motion comes with the
 * motion kit after the first App Store release (spec 33, 3.11), so their
 * car stands still as before.
 */

/**
 * A part of the puffins' car that moves on its own as it arrives, or a
 * part of a season's or day's moment (spec 36, 3.6).
 */
export type MotionPart = "car-body" | "puffin-you" | "puffin-driver" | MomentPart;

/**
 * When a drawn thing of a moment starts and how long it takes, in
 * milliseconds, and how far it goes: across and down in points, and how
 * far it turns in degrees.
 */
export interface MotionTiming {
  readonly delay?: number;
  readonly duration?: number;
  readonly dx?: number;
  readonly dy?: number;
  readonly turn?: number;
}

/** The mark of a moving part, spread on its group: nothing in the apps. */
interface Mark {
  readonly dataSet?: { readonly motion: MotionPart };
  readonly style?: Readonly<Record<string, string>>;
}

/**
 * Marks a moving part of a drawing, such as the car's body, with its own
 * `timing` as the style sheet reads it (`--d`, `--t`, `--dx`, `--dy`, `--r`).
 */
export function motionMark(part: MotionPart, timing: MotionTiming = {}): Mark {
  if (!onWebsite()) return {};
  const { delay, duration, dx, dy, turn } = timing;
  const style: Record<string, string> = {};
  if (delay !== undefined) style["--d"] = `${String(delay)}ms`;
  if (duration !== undefined) style["--t"] = `${String(duration)}ms`;
  if (dx !== undefined) style["--dx"] = `${String(dx)}px`;
  if (dy !== undefined) style["--dy"] = `${String(dy)}px`;
  if (turn !== undefined) style["--r"] = `${String(turn)}deg`;
  return Object.keys(style).length === 0
    ? { dataSet: { motion: part } }
    : { dataSet: { motion: part }, style };
}

/**
 * Marks a car that arrives, starting `from` points to the left of its
 * place (negative), or nothing for `null`.
 */
export function arrivalProps(from: number | null): ViewProps {
  if (from === null || !onWebsite()) return {};
  return {
    dataSet: { motion: "arrive" },
    style: { "--from": `${String(from)}px` },
  } as unknown as ViewProps;
}

/**
 * Marks the room a laptop's car arrives in, beside the title, while it
 * arrives: what of the car is still outside it stays hidden.
 */
export function roomProps(arriving: boolean): ViewProps {
  return arriving && onWebsite()
    ? ({ dataSet: { motion: "arrive-room" } } as unknown as ViewProps)
    : {};
}

/**
 * Marks the front page's scene while its moment plays with the car's
 * arrival (spec 36, 3.6): what the season or day adds moves once.
 */
export function momentProps(playing: boolean): ViewProps {
  return playing && onWebsite() ? ({ dataSet: { motion: "moment" } } as unknown as ViewProps) : {};
}

/** Whether the car has arrived on the front page since the page loaded. */
let arrived = false;

/**
 * Whether the front page's car arrives now (spec 33, 3.2): the first time
 * Find shows after the website loads, until the page has shown the
 * arrival to its end (`whenArrived`). Coming back to Find, pulling to
 * refresh and the logo never play it again. Phones: never, for now.
 */
export function useArrival(): boolean {
  const [arriving, setArriving] = useState(() => !arrived && onWebsite());
  useEffect(() => {
    if (!arriving) return undefined;
    arrived = true;
    return whenArrived(() => {
      setArriving(false);
    });
  }, [arriving]);
  return arriving;
}

/** As if the page had just loaded: for tests. */
export function forgetArrival(): void {
  arrived = false;
}
