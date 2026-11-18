// The switches for emergencies (spec 10, 3.3; R10.5): what is paused, and
// when a switch left off reminds the operator.
import { settingDefinitions, settingKeys, type SettingKey } from "./catalogue.ts";
import type { SettingValues } from "./values.ts";

export type SwitchKey = {
  [Key in SettingKey]: (typeof settingDefinitions)[Key]["group"] extends "switches" ? Key : never;
}[SettingKey];

export const switchKeys = settingKeys.filter(
  (key): key is SwitchKey => settingDefinitions[key].group === "switches",
);

export function isSwitchKey(key: string): key is SwitchKey {
  return switchKeys.some((one) => one === key);
}

/** What the apps show as paused, with a banner where it starts. */
export const pausedParts = ["signups", "trips", "bookings", "sms"] as const;
export type PausedPart = (typeof pausedParts)[number];

const switchOf = {
  signups: "signups_open",
  trips: "trips_open",
  bookings: "bookings_open",
  sms: "sms_sending",
} as const satisfies Record<PausedPart, SwitchKey>;

export function isPaused(values: SettingValues, part: PausedPart): boolean {
  return values[switchOf[part]] === 0;
}

/** The parts that are paused now, in the order of `pausedParts`. */
export function pausedNow(values: SettingValues): PausedPart[] {
  return pausedParts.filter((part) => isPaused(values, part));
}

/** The channels the notification worker sends on, each with its switch. */
export const channelSwitches = {
  sms: "sms_sending",
  email: "email_sending",
  push: "push_sending",
} as const satisfies Record<string, SwitchKey>;

export const switchReminderRules = {
  /** A switch off this long reminds the operator... */
  firstAfterMinutes: 60,
  /** ...and again this often while it stays off. */
  thenEveryMinutes: 24 * 60,
} as const;

/**
 * Which reminder a switch that has been off since `offSince` is due now:
 * none (null) within the hour, the first (0) from one hour, and the next
 * each day after that. One reminder goes out per number, so a late run
 * sends the newest one once.
 */
export function switchReminderNumber(offSince: Date, now: Date): number | null {
  const minutes = (now.getTime() - offSince.getTime()) / 60_000;
  const { firstAfterMinutes, thenEveryMinutes } = switchReminderRules;
  if (minutes < firstAfterMinutes) return null;
  return Math.floor((minutes - firstAfterMinutes) / thenEveryMinutes);
}
