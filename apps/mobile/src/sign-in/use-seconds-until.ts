import { useEffect, useState } from "react";

const secondsUntil = (time: number) => Math.max(0, Math.ceil((time - Date.now()) / 1000));

/** Whole seconds left until `time` (milliseconds), updated every second. */
export function useSecondsUntil(time: number): number {
  const [seconds, setSeconds] = useState(() => secondsUntil(time));
  const [counting, setCounting] = useState(time);
  if (counting !== time) {
    // A new time: start again from it in this render, not a second later.
    setCounting(time);
    setSeconds(secondsUntil(time));
  }
  useEffect(() => {
    const timer = setInterval(() => {
      const left = secondsUntil(time);
      setSeconds(left);
      if (left === 0) clearInterval(timer);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [time]);
  return seconds;
}
