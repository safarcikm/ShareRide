// The operator's values as each module's rules take them (ADR 0032; plan
// 4.8): the module's settings object with the operator's values laid over
// the code's other defaults.
import type { Money } from "../money.ts";
import { highestPriceLevel, segmentPrice, suggestedPriceLevel } from "../trips/prices.ts";
import type { PriceSettings } from "../trips/prices.ts";
import { defaultTripSettings, type TripSettings } from "../trips/settings.ts";
import type { SettingKey } from "./catalogue.ts";
import type { SettingValues } from "./values.ts";

/** The four price values a published trip keeps (R10.3). */
export function priceSettingsFrom(values: SettingValues): PriceSettings {
  return {
    suggestedRatePerKm: values.suggested_rate,
    referenceCostPerKm: values.reference_cost_per_km,
    priceStep: values.price_step,
    priceLevelStep: values.price_level_step,
  };
}

/**
 * A trip's settings: everything as it is now, and the four price values
 * as they were when the trip was published, when it has been (`published`).
 */
export function tripSettingsFrom(now: SettingValues, published: SettingValues = now): TripSettings {
  return {
    ...defaultTripSettings,
    ...priceSettingsFrom(published),
    maxSeats: now.max_capacity,
  };
}

/** The example a price value's effect is shown on: Reykjavík to Akureyri, 3 seats. */
export const pricePreviewExample = { distanceM: 388_000, seats: 3 } as const;

export interface PricePreview {
  /** One seat for the whole example route at 100%. */
  readonly price: Money;
  /** The highest level a driver offering the example's seats can choose. */
  readonly highestLevel: number;
}

/** The settings whose effect is shown as the example's price. */
export const priceSettingKeys = [
  "suggested_rate",
  "reference_cost_per_km",
  "price_step",
  "price_level_step",
] as const satisfies readonly SettingKey[];

export function isPriceSettingKey(key: string): key is (typeof priceSettingKeys)[number] {
  return (priceSettingKeys as readonly string[]).includes(key);
}

/** What the example costs under these values (spec 10, 3.2.2). */
export function pricePreview(values: SettingValues): PricePreview {
  const settings = priceSettingsFrom(values);
  const { distanceM, seats } = pricePreviewExample;
  return {
    price: segmentPrice(distanceM, suggestedPriceLevel, seats, settings),
    highestLevel: highestPriceLevel(seats, settings),
  };
}
