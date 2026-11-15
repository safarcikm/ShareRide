// Times the driver chooses on the time step, as a clock in Iceland.
import { defaultTripSettings, fromIceland, inIceland } from "@shareride/domain";
import { minuteStep, roundUpClock, type Clock } from "@/lib/clock-time";
import { addDays, dayOf, type Day } from "@/lib/days";

export type { Clock } from "@/lib/clock-time";

/** The moment of a clock time on a day in Iceland. */
export const at = (day: Day, clock: Clock): Date => fromIceland({ ...day, ...clock });

/**
 * The clock in Iceland at a moment, rounded up to 5 minutes, as the wheel
 * shows it; with `keepDay`, never past 23:55 (see `roundUpClock`).
 */
export function clockOf(moment: Date, keepDay = false): Clock {
  const { hour, minute } = inIceland(moment);
  // Iceland's offset is whole hours, so the part of a minute is that of UTC.
  const pastTheMinuteMs = moment.getTime() % 60_000;
  return roundUpClock({ hour, minute: pastTheMinuteMs > 0 ? minute + 1 : minute }, keepDay);
}

/** The first 5-minute mark one can leave at: at least 30 minutes from now (R3.5). */
export function earliestDeparture(now: Date): Clock {
  const stepMs = minuteStep * 60_000;
  const earliest = now.getTime() + defaultTripSettings.minNoticeMinutes * 60_000;
  return clockOf(new Date(Math.ceil(earliest / stepMs) * stepMs));
}

/**
 * The first moment at a clock time not before `previous`, so a stop after
 * midnight falls on the next day. The same time as `previous` stays on its
 * day, where the time check says it must be later.
 */
export function onOrAfter(previous: Date, clock: Clock): Date {
  const sameDay = at(dayOf(previous), clock);
  return sameDay < previous ? at(addDays(dayOf(previous), 1), clock) : sameDay;
}
