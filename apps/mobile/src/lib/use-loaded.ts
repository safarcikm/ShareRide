import { useFocusEffect } from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

interface Loaded<T> {
  /** Undefined while the first result is on its way and after `reload`. */
  readonly value: T | undefined;
  /** Loads again, showing the loading state meanwhile, such as after a failure. */
  readonly reload: () => void;
  /** Loads again and keeps the last result on screen until the new one comes. */
  readonly refresh: () => void;
  /**
   * Loads again for pulling down to refresh (spec 16, 3.9), keeping the
   * last result on screen meanwhile. A result that is `ok` takes its place
   * and gives true. One that is not gives false and leaves the last result
   * on screen, unless there was none. Null when the result no longer
   * fits the screen, which loads its own: `load` changed meanwhile
   * (another list, another search) or the screen closed.
   */
  readonly pull: (ok: (loaded: T) => boolean) => Promise<boolean | null>;
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

/** `pull` of `useLoaded` and `useLoadedOnFocus`, with the current `load`. */
function usePull<T>(
  load: () => Promise<T>,
  setValue: Dispatch<SetStateAction<T | undefined>>,
): Loaded<T>["pull"] {
  const current = useRef<(() => Promise<T>) | null>(load);
  useEffect(() => {
    current.current = load;
    return () => {
      // Until the next `load`, or for good once the screen closes.
      current.current = null;
    };
  }, [load]);
  return useCallback(
    async (ok) => {
      const asked = load;
      const loaded = await asked();
      if (current.current !== asked) return null;
      const better = ok(loaded);
      setValue((last) => (better || last === undefined ? loaded : last));
      return better;
    },
    [load, setValue],
  );
}
