import { useEffect, useState } from "react";

/**
 * Runs `load` when the screen opens and whenever `load` changes (wrap it in
 * useCallback), and keeps the latest result. `value` is undefined while the
 * first result is on its way and after `reload`.
 */
export function useLoaded<T>(load: () => Promise<T>): {
  readonly value: T | undefined;
  readonly reload: () => void;
} {
  const [value, setValue] = useState<T>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    void load().then((loaded) => {
      if (current) setValue(loaded);
    });
    return () => {
      current = false;
    };
  }, [load, attempt]);
  return {
    value,
    reload: () => {
      setValue(undefined);
      setAttempt((count) => count + 1);
    },
  };
}
