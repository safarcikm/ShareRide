import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import { now } from "./clock";

/** How often a screen that says how long is left reads the clock again. */
export const clockTickMs = 30_000;

/**
 * The present moment for a screen that counts ("Leaves in 40 minutes",
 * "19 min left to answer"). It is read again every half minute while the
 * screen is in view and in front, and when the screen or the app comes
 * back to the front, so what the screen says keeps counting and a deadline
 * that passes is gone without anything being pressed.
 */
export function useClock(): Date {
  const [at, setAt] = useState(now);
  const opened = useRef(false);
  useFocusEffect(
    useCallback(() => {
      const read = () => {
        setAt(now());
      };
      // Coming back to the screen reads the clock; opening it just did.
      if (opened.current) read();
      opened.current = true;
      const timer = setInterval(() => {
        const state = AppState.currentState;
        if (state !== "background" && state !== "inactive") read();
      }, clockTickMs);
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") read();
      });
      return () => {
        clearInterval(timer);
        listener.remove();
      };
    }, []),
  );
  return at;
}
