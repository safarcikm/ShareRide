import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

interface Loaded<T> {
  /** Undefined while the first result is on its way and after `reload`. */
  readonly value: T | undefined;
  /** Loads again, showing the loading state meanwhile, such as after a failure. */
  readonly reload: () => void;
  /** Loads again and keeps the last result on screen until the new one comes. */
  readonly refresh: () => void;
  /**
   * Loads again as `refresh` does, for pulling down to refresh (spec 16,
   * 3.9): the result is on screen when the promise settles, with it.
   */
  readonly pull: () => Promise<T>;
}

/**
 * Runs `load` when the screen opens and whenever `load` changes (wrap it in
 * useCallback), and keeps the latest result.
 */
export function useLoaded<T>(load: () => Promise<T>): Loaded<T> {
  const [value, setValue] = useState<T>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => loadInto(load, setValue), [load, attempt]);
  const pull = usePull(load, setValue);
  return {
    value,
    reload: () => {
      setValue(undefined);
      setAttempt((count) => count + 1);
    },
    refresh: () => {
      setAttempt((count) => count + 1);
    },
    pull,
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
  const pull = usePull(load, setValue);
  return {
    value,
    reload: () => {
      setValue(undefined);
      setRound((count) => count + 1);
    },
    refresh: () => {
      setRound((count) => count + 1);
    },
    pull,
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

/**
 * Loads with the current `load` and shows the result, unless `load` changed
 * meanwhile (another search, another list) or the screen closed: that
 * result is for what was on screen before.
 */
function usePull<T>(load: () => Promise<T>, setValue: (value: T) => void): () => Promise<T> {
  const current = useRef<(() => Promise<T>) | null>(load);
  useEffect(() => {
    current.current = load;
  }, [load]);
  useEffect(
    () => () => {
      current.current = null;
    },
    [],
  );
  return useCallback(async () => {
    const asked = load;
    const loaded = await asked();
    if (current.current === asked) setValue(loaded);
    return loaded;
  }, [load, setValue]);
}
