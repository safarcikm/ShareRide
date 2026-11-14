import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";

interface Loaded<T> {
  /** Undefined while the first result is on its way and after `reload`. */
  readonly value: T | undefined;
  readonly reload: () => void;
}

/**
 * Runs `load` when the screen opens and whenever `load` changes (wrap it in
 * useCallback), and keeps the latest result.
 */
export function useLoaded<T>(load: () => Promise<T>): Loaded<T> {
  const [value, setValue] = useState<T>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => loadInto(load, setValue), [load, attempt]);
  return {
    value,
    reload: () => {
      setValue(undefined);
      setAttempt((count) => count + 1);
    },
  };
}

/**
 * Like `useLoaded`, but loads again each time the screen comes back into
 * view, such as after adding something on the next screen. The last result
 * stays on screen until the new one arrives.
 */
export function useLoadedOnFocus<T>(load: () => Promise<T>): Loaded<T> {
  const [value, setValue] = useState<T>();
  // Counts the times the screen came into view, and reloads.
  const [round, setRound] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRound((count) => count + 1);
    }, []),
  );
  useEffect(() => (round === 0 ? undefined : loadInto(load, setValue)), [load, round]);
  return {
    value,
    reload: () => {
      setValue(undefined);
      setRound((count) => count + 1);
    },
  };
}

/** Starts `load`; the returned clean-up drops a result that comes too late. */
function loadInto<T>(load: () => Promise<T>, setValue: (value: T) => void): () => void {
  let current = true;
  void load().then((loaded) => {
    if (current) setValue(loaded);
  });
  return () => {
    current = false;
  };
}
