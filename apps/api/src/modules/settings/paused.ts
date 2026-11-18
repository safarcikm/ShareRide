import { isPaused, type PausedPart } from "@shareride/domain";
import type { Context } from "hono";
import { errorResponse } from "../../errors.ts";
import type { SettingsService } from "./service.ts";

// The switches for emergencies (spec 10, 3.3; R10.5): what is paused is
// refused where it starts, and nothing that exists is changed.

/** Whether the operator has paused this part for now. */
export type PausedCheck = (part: PausedPart) => Promise<boolean>;

export function createPausedCheck(settings: SettingsService): PausedCheck {
  return async (part) => isPaused((await settings.current()).values, part);
}

/** Nothing is paused: for code that runs without the operator's settings. */
export const neverPaused: PausedCheck = () => Promise.resolve(false);

export const pausedCodes = {
  signups: "signups_paused",
  trips: "trips_paused",
  bookings: "bookings_paused",
  sms: "sms_paused",
} as const satisfies Record<PausedPart, string>;

export const pausedMessages = {
  signups_paused: "New accounts are paused for a short while. Try again later.",
  trips_paused: "Posting trips is paused for a short while. Try again later.",
  bookings_paused: "Booking and paying are paused for a short while. Try again later.",
  sms_paused: "Text messages are paused for a short while, so no code can be sent.",
} as const;

/** 503 with `<part>_paused`: the app shows its banner, and trying later works. */
export function pausedResponse(c: Context, part: PausedPart) {
  const code = pausedCodes[part];
  return errorResponse(c, 503, code, pausedMessages[code]);
}
