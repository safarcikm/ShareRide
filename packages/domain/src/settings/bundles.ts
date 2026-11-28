// The operator's values as each module's rules take them (ADR 0032; plan
// 4.8): the module's settings object with the operator's values laid over
// the code's other defaults.
import type { CancellationSettings } from "../bookings/cancellation.ts";
import { defaultBookingSettings, type BookingSettings } from "../bookings/settings.ts";
import type { Money } from "../money.ts";
import type { ReliabilitySettings } from "../people/reliability.ts";
import { defaultTripDaySettings, type TripDaySettings } from "../trips/day.ts";
import { defaultSearchSettings, type SearchSettings } from "../trips/search.ts";
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

/**
 * Booking's settings as they are now. A request made close to boarding
 * keeps its own two numbers, which are not the operator's.
 */
export function bookingSettingsFrom(now: SettingValues): BookingSettings {
  return {
    ...defaultBookingSettings,
    bookingCutoffMinutes: now.booking_cutoff,
    requestExpiryMinutes: now.request_expiry * 60,
    paymentWindowMinutes: now.payment_window,
    paymentMethod: now.pay_in_person === 1 ? "in_person" : "in_app",
  };
}

/** Search's settings as they are now: the cut-off is the booking's. */
export function searchSettingsFrom(now: SettingValues): SearchSettings {
  return { ...defaultSearchSettings, bookingCutoffMinutes: now.booking_cutoff };
}

/** The cancellation values a booking keeps: those of the version it was made under (R10.3). */
export function cancellationSettingsFrom(made: SettingValues): CancellationSettings {
  return {
    freeCancellationMoveMinutes: made.major_time_change,
    refundCutoffMinutes: made.free_cancellation_until,
    reliabilityWindowHours: made.reliability_cancellation_window,
  };
}

/**
 * The trip day's settings as they are now. When the pages become the trip
 * day, when "I'm here" opens and the time to answer a report are not the
 * operator's.
 */
export function tripDaySettingsFrom(now: SettingValues): TripDaySettings {
  return {
    ...defaultTripDaySettings,
    noShowWaitMinutes: now.no_show_wait,
    completionDelayMinutes: now.trip_completion_delay * 60,
  };
}

/** The reliability figure's settings as they are now. */
export function reliabilitySettingsFrom(now: SettingValues): ReliabilitySettings {
  return {
    periodMonths: now.reliability_period,
    minCount: now.reliability_min_count,
    watchPercent: now.reliability_watch_level,
  };
}

/** The CO2 figures' value (spec 34, 3.3; ADR 0054). */
export interface Co2Settings {
  /** Grams per car kilometre; 0 hides every figure. */
  readonly gramsPerCarKm: number;
}

/** The CO2 figures' value as it is now: a booking keeps the grams counted when it completed. */
export function co2SettingsFrom(now: SettingValues): Co2Settings {
  return { gramsPerCarKm: now.co2_grams_per_car_km };
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
