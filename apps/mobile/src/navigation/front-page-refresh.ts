import { useSyncExternalStore } from "react";

let asked = 0;
const listeners = new Set<() => void>();

/**
 * Asks Find to load again from its top, with what a pull to refresh shows
 * (spec 16, 3.9): pressing the logo, on Find on a phone or in the top bar
 * on a wide screen, does.
 */
export function refreshFrontPage() {
  asked += 1;
  for (const listener of listeners) listener();
}

/** Counts the times Find was asked to load again, for its `Screen`'s `refreshAsked`. */
export function useFrontPageRefreshes(): number {
  return useSyncExternalStore(subscribe, current, current);
}

const current = () => asked;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
