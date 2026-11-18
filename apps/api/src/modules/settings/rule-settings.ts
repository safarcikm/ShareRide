import { schema } from "@shareride/db";
import {
  bookingSettingsFrom,
  cancellationSettingsFrom,
  defaultSettingValues,
  searchSettingsFrom,
  valuesAt,
  type BookingSettings,
  type CancellationSettings,
  type SearchSettings,
  type SettingValues,
} from "@shareride/domain";
import { lte } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";
import type { SettingsService } from "./service.ts";

// The operator's values as the booking, search and change rules take them
// (ADR 0032; plan 4.8). Who can book until when, a request's and a
// payment's deadline and how far a departure can move are read as they are
// now; a booking keeps the cancellation values of the settings version it
// was made under (R10.3).

const { settingChanges } = schema;

export interface RuleSettingsSource {
  /** Booking's values now, and the version a booking made with them records. */
  booking(): Promise<{ readonly version: number; readonly settings: BookingSettings }>;
  /** Search's values now. */
  search(): Promise<SearchSettings>;
  /** With bookings, how many minutes a departure can move from when each was made (R6.4), now. */
  maxMoveMinutes(): Promise<number>;
  /** The cancellation values of a booking made under `version`. */
  cancellationAt(version: number): Promise<CancellationSettings>;
}

export function ruleSettingsSource(
  settings: Pick<SettingsService, "current" | "at">,
): RuleSettingsSource {
  return {
    async booking() {
      const { version, values } = await settings.current();
      return { version, settings: bookingSettingsFrom(values) };
    },
    search: async () => searchSettingsFrom((await settings.current()).values),
    maxMoveMinutes: async () => (await settings.current()).values.max_time_change,
    cancellationAt: async (version) => cancellationSettingsFrom(await settings.at(version)),
  };
}

/** The same values whatever the version: for a test of one module. */
export function fixedRuleSettings(
  values: SettingValues = defaultSettingValues,
): RuleSettingsSource {
  return {
    booking: () => Promise.resolve({ version: 0, settings: bookingSettingsFrom(values) }),
    search: () => Promise.resolve(searchSettingsFrom(values)),
    maxMoveMinutes: () => Promise.resolve(values.max_time_change),
    cancellationAt: () => Promise.resolve(cancellationSettingsFrom(values)),
  };
}

/**
 * The cancellation values of each of some bookings' versions, for showing
 * a list of bookings: each version is read once.
 */
export async function cancellationSettingsOf(
  source: Pick<RuleSettingsSource, "cancellationAt">,
  versions: readonly number[],
): Promise<(version: number) => CancellationSettings> {
  const known = new Map<number, CancellationSettings>();
  for (const version of new Set(versions)) {
    known.set(version, await source.cancellationAt(version));
  }
  return (version) => {
    const settings = known.get(version);
    if (settings === undefined) throw new Error("The booking's settings version was not read.");
    return settings;
  };
}

/**
 * The cancellation values of a booking made under `version`, read where
 * the work is: for a module that has the database and no settings service.
 */
export async function cancellationSettingsIn(
  q: Queryable,
  version: number,
): Promise<CancellationSettings> {
  if (version === 0) return cancellationSettingsFrom(defaultSettingValues);
  const changes = await q
    .select({
      version: settingChanges.version,
      key: settingChanges.key,
      newValue: settingChanges.newValue,
    })
    .from(settingChanges)
    .where(lte(settingChanges.version, version));
  return cancellationSettingsFrom(valuesAt(version, changes));
}

/**
 * The values now, read where a change to them is being made: for what must
 * follow a change inside its transaction, which holds the table.
 */
export async function settingValuesIn(q: Queryable): Promise<SettingValues> {
  const changes = await q
    .select({
      version: settingChanges.version,
      key: settingChanges.key,
      newValue: settingChanges.newValue,
    })
    .from(settingChanges);
  return valuesAt(Math.max(0, ...changes.map((change) => change.version)), changes);
}
