// A time of day on a 24-hour clock, as chosen on a time wheel.
import { defaultTripSettings } from "@shareride/domain";

export interface Clock {
  readonly hour: number;
  readonly minute: number;
}

/** Times are chosen in steps of this many minutes (spec 3, 3.5). */
export const minuteStep = defaultTripSettings.timeRoundingMinutes;

/**
 * The time up to the next 5 minutes; after 23:55 that is 00:00. With
 * `keepDay`, as for a departure on a chosen day, it stays at 23:55 instead.
 */
export function roundUpClock(clock: Clock, keepDay = false): Clock {
  const day = 24 * 60;
  const minutes = Math.ceil((clock.hour * 60 + clock.minute) / minuteStep) * minuteStep;
  const kept = keepDay ? Math.min(minutes, day - minuteStep) : minutes % day;
  return { hour: Math.floor(kept / 60), minute: kept % 60 };
}

/** "09:05": two digits for the hour and two for the minutes. */
export function clockText(clock: Clock): string {
  return `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
}
