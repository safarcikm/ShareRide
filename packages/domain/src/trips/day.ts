// The trip day (spec 8, 3.1 to 3.6; rules R8.1 to R8.5): when a trip
// departs and completes, when its booking and trip pages become the trip
// day, and when "I'm here", a no-show and "The driver didn't come" are
// allowed. Every time here is a stop's planned time as it is now, after any
// move (spec 6), so the windows follow the trip as it will run.
import type { BookingStatus } from "../bookings/lifecycle.ts";
import { err, ok, type Result } from "../result.ts";
import type { TripStatus } from "./trip.ts";

/** The values the operator will set (spec 8, section 6; feature H4). */
export interface TripDaySettings {
  /** The booking and trip pages become the trip day this many hours before boarding (3.1). */
  readonly tripDayHours: number;
  /** "I'm here" opens this many minutes before a stop's planned time… (R8.3) */
  readonly checkInBeforeMinutes: number;
  /** …and closes this many minutes after it. */
  readonly checkInAfterMinutes: number;
  /** The wait after boarding before a no-show or the driver's absence (R8.4, R8.5; `no_show_wait`). */
  readonly noShowWaitMinutes: number;
  /** A trip completes this many minutes after its last stop (R8.1; `trip_completion_delay`). */
  readonly completionDelayMinutes: number;
  /** The other side has this many hours to answer a report (R8.6; `dispute_answer_window`). */
  readonly answerWindowHours: number;
}

/** The starting values (spec 8, decided 2026-11-13). */
export const defaultTripDaySettings: TripDaySettings = {
  tripDayHours: 3,
  checkInBeforeMinutes: 30,
  checkInAfterMinutes: 60,
  noShowWaitMinutes: 10,
  completionDelayMinutes: 2 * 60,
  answerWindowHours: 24,
};

const minuteMs = 60_000;
const later = (time: Date, minutes: number) => new Date(time.getTime() + minutes * minuteMs);

/** R8.1: a trip completes 2 hours after the planned time of its last stop. */
export function completesAt(lastStopAt: Date, settings: TripDaySettings): Date {
  return later(lastStopAt, settings.completionDelayMinutes);
}

export interface TripTimes {
  readonly status: TripStatus;
  /** The planned time of the first stop: the trip's departure. */
  readonly firstStopAt: Date;
  readonly lastStopAt: Date;
}

/**
 * Where time has taken a published trip (R8.1): departed at its first stop's
 * planned time, completed 2 hours after its last. A draft, a cancelled or a
 * completed trip stays as it is.
 */
export function tripStatusAt(trip: TripTimes, now: Date, settings: TripDaySettings): TripStatus {
  if (trip.status !== "published" && trip.status !== "departed") return trip.status;
  if (now >= completesAt(trip.lastStopAt, settings)) return "completed";
  return now >= trip.firstStopAt ? "departed" : "published";
}

export type DayPhase = "upcoming" | "trip_day" | "completed";

/**
 * Whether a booking or trip page shows the trip day (3.1): from 3 hours
 * before `from`, the passenger's boarding stop or the driver's first stop,
 * until the trip completes.
 */
export function dayPhase(
  from: Date,
  lastStopAt: Date,
  now: Date,
  settings: TripDaySettings,
): DayPhase {
  if (now >= completesAt(lastStopAt, settings)) return "completed";
  return now >= later(from, -settings.tripDayHours * 60) ? "trip_day" : "upcoming";
}

export type CheckInProblem =
  | { readonly code: "check_in_not_open"; readonly opensAt: Date }
  | { readonly code: "check_in_closed" };

/**
 * R8.3: "I'm here" at a stop, from 30 minutes before to 60 minutes after its
 * planned time. It records only the time; nothing checks where anyone is.
 */
export function checkCheckIn(
  stopAt: Date,
  now: Date,
  settings: TripDaySettings,
): Result<null, CheckInProblem> {
  const opensAt = later(stopAt, -settings.checkInBeforeMinutes);
  if (now < opensAt) return err({ code: "check_in_not_open", opensAt });
  if (now > later(stopAt, settings.checkInAfterMinutes)) return err({ code: "check_in_closed" });
  return ok(null);
}

export interface NoShowCheck {
  readonly bookingStatus: BookingStatus;
  /** The planned time at the passenger's boarding stop. */
  readonly boardsAt: Date;
  readonly lastStopAt: Date;
  /** Whether the driver has said "I'm here" at that stop. */
  readonly driverCheckedIn: boolean;
}

export type NoShowProblem =
  | { readonly code: "not_confirmed" }
  | { readonly code: "trip_completed" }
  | { readonly code: "no_show_too_early"; readonly allowedAt: Date }
  | { readonly code: "driver_not_checked_in" };

/**
 * R8.4: the driver marks a confirmed passenger as a no-show 10 minutes after
 * the planned time at their boarding stop, once the driver has said "I'm
 * here" there, and before the trip completes. That the passenger is on the
 * driver's own trip is the caller's to check.
 */
export function checkNoShow(
  booking: NoShowCheck,
  now: Date,
  settings: TripDaySettings,
): Result<null, NoShowProblem> {
  if (booking.bookingStatus !== "confirmed") return err({ code: "not_confirmed" });
  if (now >= completesAt(booking.lastStopAt, settings)) return err({ code: "trip_completed" });
  const allowedAt = later(booking.boardsAt, settings.noShowWaitMinutes);
  if (now < allowedAt) return err({ code: "no_show_too_early", allowedAt });
  if (!booking.driverCheckedIn) return err({ code: "driver_not_checked_in" });
  return ok(null);
}

export interface DriverAbsentCheck {
  readonly bookingStatus: BookingStatus;
  readonly boardsAt: Date;
  readonly lastStopAt: Date;
}

export type DriverAbsentProblem =
  | { readonly code: "not_boarding" }
  | { readonly code: "report_too_early"; readonly allowedAt: Date }
  | { readonly code: "report_too_late" };

/**
 * R8.5: a passenger with a confirmed booking, or one completed since,
 * reports that the driver didn't come, from the same wait after their
 * boarding time until 24 hours after the trip completes: the same 24 hours
 * the other side has to answer a report (R8.6).
 */
export function checkDriverAbsent(
  booking: DriverAbsentCheck,
  now: Date,
  settings: TripDaySettings,
): Result<null, DriverAbsentProblem> {
  if (booking.bookingStatus !== "confirmed" && booking.bookingStatus !== "completed") {
    return err({ code: "not_boarding" });
  }
  const allowedAt = later(booking.boardsAt, settings.noShowWaitMinutes);
  if (now < allowedAt) return err({ code: "report_too_early", allowedAt });
  const closesAt = later(
    completesAt(booking.lastStopAt, settings),
    settings.answerWindowHours * 60,
  );
  if (now > closesAt) return err({ code: "report_too_late" });
  return ok(null);
}
