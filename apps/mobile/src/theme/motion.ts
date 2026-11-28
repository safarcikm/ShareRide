import { useEffect, useState } from "react";
import type { ViewProps } from "react-native";
import { onWebsite } from "@/lib/on-website";
import { whenArrived } from "./motion-sheet";

/*
 * Marks for the website's motion style sheet (spec 33, ADR 0052;
 * `motionCss`). React Native Web writes `dataSet` as `data-*` attributes
 * and passes a custom property in `style` through; React Native's types
 * lack both. The phone apps get nothing yet: their motion comes with the
 * motion kit after the first App Store release (spec 33, 3.11), so their
 * car stands still as before.
 */

/** A part of the puffins' car that moves on its own. */
export type MotionPart = "car-body" | "puffin-you" | "puffin-driver";

/** The mark of a moving part, spread on its group: nothing in the apps. */
interface Mark {
  readonly dataSet?: { readonly motion: MotionPart };
}

/** Marks a moving part of a drawing, such as the car's body. */
export function motionMark(part: MotionPart): Mark {
  return onWebsite() ? { dataSet: { motion: part } } : {};
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
