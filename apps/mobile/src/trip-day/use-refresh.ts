import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

/**
 * While the trip day shows, its page loads again this often: who is here,
 * and whether "I'm here" is open, change while it stays open (spec 8, 3.1).
 */
export const tripDayRefreshMs = 30_000;

/**
 * Calls `refresh` every 30 seconds while `active` and the screen is in
 * view and in front, and when the app comes back to the front. Each load
 * also reads the clock again, so "I'm here" opens and closes on time.
 */
export function useTripDayRefresh(active: boolean, refresh: () => void): void {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });
  useFocusEffect(
    useCallback(() => {
      if (!active) return undefined;
      const timer = setInterval(() => {
        const state = AppState.currentState;
        if (state !== "background" && state !== "inactive") latest.current();
      }, tripDayRefreshMs);
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") latest.current();
      });
      return () => {
        clearInterval(timer);
        listener.remove();
      };
    }, [active]),
  );
}
