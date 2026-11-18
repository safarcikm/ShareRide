import { schema } from "@shareride/db";
import { isPaused, type PausedPart } from "@shareride/domain";
import { sql } from "drizzle-orm";
import type { Context } from "hono";
import { errorResponse } from "../../errors.ts";
import type { Transaction } from "../bookings/seats.ts";
import { settingValuesIn } from "./rule-settings.ts";
import type { SettingsService } from "./service.ts";

// The switches for emergencies (spec 10, 3.3; R10.5): what is paused is
// refused where it starts, and nothing that exists is changed.

/** Whether the operator has paused this part for now. */
export type PausedCheck = (part: PausedPart) => Promise<boolean>;

export function createPausedCheck(settings: SettingsService): PausedCheck {
  return async (part) => isPaused((await settings.current()).values, part);
}

/**
 * Whether this part is paused, read in the transaction and held as it is
 * until the transaction ends: a change to the settings waits for it. For
 * what stores something the switch's own change moves, as a payment
 * deadline (spec 10, 3.3), where the cached answer of `PausedCheck` could
 * be a few seconds old. Call it first in the transaction, before any row
 * is locked: the change holds the settings while it takes the bookings.
 */
export async function pausedHeldIn(tx: Transaction, part: PausedPart): Promise<boolean> {
  await tx.execute(sql`lock table ${schema.settingChanges} in row share mode`);
  return isPaused(await settingValuesIn(tx), part);
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
