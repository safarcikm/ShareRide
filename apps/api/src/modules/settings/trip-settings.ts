import { schema } from "@shareride/db";
import {
  defaultTripSettings,
  priceSettingsFrom,
  tripSettingsFrom,
  valuesAt,
  type PriceSettings,
  type TripSettings,
} from "@shareride/domain";
import { lte } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";
import type { SettingsService } from "./service.ts";

// The operator's values as the trip rules take them (ADR 0032; plan 4.8).
// A route being planned and a trip being published use the values now; a
// published trip keeps the four price values of its version (R10.3).

const { settingChanges } = schema;

export interface TripSettingsSource {
  /** The values now, and the version a trip published with them records. */
  current(): Promise<{ readonly version: number; readonly settings: TripSettings }>;
  /** For a trip published under `version`: its price values, and the rest as it is now. */
  at(version: number): Promise<TripSettings>;
}

export function tripSettingsSource(
  settings: Pick<SettingsService, "current" | "at">,
): TripSettingsSource {
  return {
    async current() {
      const { version, values } = await settings.current();
      return { version, settings: tripSettingsFrom(values) };
    },
    async at(version) {
      const [now, published] = await Promise.all([settings.current(), settings.at(version)]);
      return tripSettingsFrom(now.values, published);
    },
  };
}

/** The same settings whatever the version: for a test of one module. */
export function fixedTripSettings(
  settings: TripSettings = defaultTripSettings,
): TripSettingsSource {
  return {
    current: () => Promise.resolve({ version: 0, settings }),
    at: () => Promise.resolve(settings),
  };
}

/**
 * The four price values of a version, read where the trip is locked: for
 * work on a trip's prices deep inside another module's transaction.
 */
export async function priceSettingsAt(q: Queryable, version: number): Promise<PriceSettings> {
  if (version === 0) return priceSettingsFrom(valuesAt(0, []));
  const changes = await q
    .select({
      version: settingChanges.version,
      key: settingChanges.key,
      newValue: settingChanges.newValue,
    })
    .from(settingChanges)
    .where(lte(settingChanges.version, version));
  return priceSettingsFrom(valuesAt(version, changes));
}
