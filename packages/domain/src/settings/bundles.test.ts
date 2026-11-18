import { describe, expect, it } from "vitest";
import { defaultTripSettings } from "../trips/settings.ts";
import { pricePreview, priceSettingsFrom, tripSettingsFrom } from "./bundles.ts";
import { defaultSettingValues } from "./values.ts";

describe("tripSettingsFrom", () => {
  it("is the code's defaults while nothing was changed", () => {
    expect(tripSettingsFrom(defaultSettingValues)).toEqual(defaultTripSettings);
  });

  it("lays the operator's values over the defaults", () => {
    const values = {
      ...defaultSettingValues,
      suggested_rate: 20,
      reference_cost_per_km: 140,
      price_step: 50,
      price_level_step: 5,
      max_capacity: 6,
    };
    expect(tripSettingsFrom(values)).toEqual({
      ...defaultTripSettings,
      suggestedRatePerKm: 20,
      referenceCostPerKm: 140,
      priceStep: 50,
      priceLevelStep: 5,
      maxSeats: 6,
    });
    expect(priceSettingsFrom(values)).toEqual({
      suggestedRatePerKm: 20,
      referenceCostPerKm: 140,
      priceStep: 50,
      priceLevelStep: 5,
    });
  });

  it("keeps a published trip's four price values, and reads the seat limit as it is now (R10.3)", () => {
    const published = { ...defaultSettingValues, suggested_rate: 12, price_step: 50 };
    const now = { ...defaultSettingValues, suggested_rate: 20, max_capacity: 6 };
    expect(tripSettingsFrom(now, published)).toMatchObject({
      suggestedRatePerKm: 12,
      priceStep: 50,
      maxSeats: 6,
    });
  });
});

describe("pricePreview", () => {
  it("prices Reykjavík to Akureyri for 3 seats at 100%, with the highest level", () => {
    // 388 km at 15 kr: 5 820, to the nearest 100. The cap for 3 seats is
    // 150 / 4 = 37.5 kr per km, 250% of 15.
    expect(pricePreview(defaultSettingValues)).toEqual({
      price: { amount: 5800, currency: "ISK" },
      highestLevel: 250,
    });
    expect(pricePreview({ ...defaultSettingValues, suggested_rate: 16 })).toEqual({
      price: { amount: 6200, currency: "ISK" },
      highestLevel: 230,
    });
  });
});
