import {
  reliabilitySettingsFrom,
  tripDaySettingsFrom,
  type ReliabilitySettings,
  type SettingValues,
  type TripDaySettings,
} from "@shareride/domain";
import type { MiddlewareHandler } from "hono";
import type { SettingsService } from "./service.ts";

// The trip day's and the reliability figure's values are read as they are
// now, by many modules that take their settings as a plain object (ADR
// 0032; plan 4.8). Each gets an object whose fields are the operator's
// values as last read: the settings are read at the start of every request
// (`readSettingsFirst`), from the service's cache of 5 seconds, so a change
// is followed at once on the server it was made on and within 5 seconds on
// another.

/** An object with the fields of `read()`, each read anew when it is asked for. */
function live<T extends object>(read: () => T): T {
  const fields: Record<string, PropertyDescriptor> = {};
  for (const key of Object.keys(read())) {
    fields[key] = { enumerable: true, get: () => read()[key as keyof T] };
  }
  return Object.defineProperties({}, fields) as T;
}

export interface LiveRuleSettings {
  readonly tripDay: TripDaySettings;
  readonly reliability: ReliabilitySettings;
}

/** The trip day's and reliability's settings, always as `values()` has them. */
export function liveRuleSettings(values: () => SettingValues): LiveRuleSettings {
  return {
    tripDay: live(() => tripDaySettingsFrom(values())),
    reliability: live(() => reliabilitySettingsFrom(values())),
  };
}

/** Reads the settings before the request is answered, so `lastRead()` is at most 5 seconds old. */
export function readSettingsFirst(settings: Pick<SettingsService, "current">): MiddlewareHandler {
  return async (_c, next) => {
    await settings.current();
    await next();
  };
}
