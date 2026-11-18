import { describe, expect, it } from "vitest";
import { isSettingKey, settingDefinitions, settingKeys } from "./catalogue.ts";
import {
  checkSettingChange,
  defaultSettingValues,
  highestSuggestedRate,
  settingReasonMaxLength,
  suggestedFitsCap,
  valuesAt,
} from "./values.ts";

describe("the settings catalogue", () => {
  it("starts with the beta's own settings (ADR 0032)", () => {
    expect(settingDefinitions.invite_code_required).toEqual({
      group: "beta",
      kind: "switch",
      unit: null,
      default: 1,
      min: 0,
      max: 1,
      step: 1,
    });
    expect(settingDefinitions.beta_max_testers).toEqual({
      group: "beta",
      kind: "number",
      unit: "people",
      default: 150,
      min: 0,
      max: 1000,
      step: 1,
    });
  });

  it("gives every setting a default inside its range and on its step (R10.1)", () => {
    for (const key of settingKeys) {
      const { default: value, min, max, step } = settingDefinitions[key];
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
      expect((value - min) % step).toBe(0);
    }
  });

  it("knows its keys", () => {
    expect(isSettingKey("beta_max_testers")).toBe(true);
    expect(isSettingKey("toString")).toBe(false);
    expect(isSettingKey("nothing")).toBe(false);
  });
});

describe("valuesAt", () => {
  const changes = [
    { version: 1, key: "beta_max_testers", newValue: 100 },
    { version: 2, key: "invite_code_required", newValue: 0 },
    { version: 3, key: "beta_max_testers", newValue: 120 },
  ];

  it("is the defaults at version 0", () => {
    expect(valuesAt(0, changes)).toEqual(defaultSettingValues);
    expect(defaultSettingValues).toMatchObject({ invite_code_required: 1, beta_max_testers: 150 });
  });

  it("lays each change up to the version over the defaults", () => {
    const changedTo = (changed: object) => ({ ...defaultSettingValues, ...changed });
    expect(valuesAt(1, changes)).toEqual(changedTo({ beta_max_testers: 100 }));
    expect(valuesAt(2, changes)).toEqual(
      changedTo({ invite_code_required: 0, beta_max_testers: 100 }),
    );
    expect(valuesAt(3, changes)).toEqual(
      changedTo({ invite_code_required: 0, beta_max_testers: 120 }),
    );
  });

  it("is the newest values past the last version, in whatever order the changes come", () => {
    expect(valuesAt(9, [...changes].reverse())).toEqual({
      ...defaultSettingValues,
      invite_code_required: 0,
      beta_max_testers: 120,
    });
  });

  it("leaves out a change to a setting that no longer exists", () => {
    expect(valuesAt(1, [{ version: 1, key: "gone", newValue: 7 }])).toEqual(defaultSettingValues);
  });
});

describe("checkSettingChange", () => {
  const current = defaultSettingValues;

  it("accepts a value in the range, with the old value and the reason trimmed", () => {
    expect(checkSettingChange("beta_max_testers", 200, "  A second corridor  ", current)).toEqual({
      ok: true,
      value: {
        key: "beta_max_testers",
        oldValue: 150,
        newValue: 200,
        reason: "A second corridor",
      },
    });
  });

  it("accepts the ends of the range and refuses one past them (R10.1)", () => {
    expect(checkSettingChange("beta_max_testers", 0, "Stop", current).ok).toBe(true);
    expect(checkSettingChange("beta_max_testers", 1000, "Open", current).ok).toBe(true);
    for (const value of [-1, 1001]) {
      expect(checkSettingChange("beta_max_testers", value, "Why", current)).toEqual({
        ok: false,
        error: { code: "out_of_range", min: 0, max: 1000 },
      });
    }
  });

  it("refuses a switch that is neither on nor off", () => {
    expect(checkSettingChange("invite_code_required", 2, "Why", current)).toMatchObject({
      ok: false,
      error: { code: "out_of_range" },
    });
  });

  it("refuses a value that is not a whole number", () => {
    for (const value of [150.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(checkSettingChange("beta_max_testers", value, "Why", current)).toEqual({
        ok: false,
        error: { code: "not_a_step", step: 1 },
      });
    }
  });

  it("refuses a setting it does not know", () => {
    expect(checkSettingChange("constructor", 1, "Why", current)).toEqual({
      ok: false,
      error: { code: "unknown_setting" },
    });
  });

  it("refuses the value it already has", () => {
    expect(checkSettingChange("beta_max_testers", 150, "Why", current)).toEqual({
      ok: false,
      error: { code: "unchanged" },
    });
  });

  it("needs a reason of 1 to 500 characters (R10.2)", () => {
    expect(checkSettingChange("beta_max_testers", 200, "   ", current)).toEqual({
      ok: false,
      error: { code: "reason_missing" },
    });
    expect(
      checkSettingChange("beta_max_testers", 200, "a".repeat(settingReasonMaxLength), current).ok,
    ).toBe(true);
    expect(
      checkSettingChange("beta_max_testers", 200, "a".repeat(settingReasonMaxLength + 1), current),
    ).toEqual({ ok: false, error: { code: "reason_too_long", max: 500 } });
  });
});

describe("the check across the price values (ADR 0032)", () => {
  const change = (key: string, value: number, current = defaultSettingValues) =>
    checkSettingChange(key, value, "A reason.", current);

  it("holds for the defaults", () => {
    expect(suggestedFitsCap(defaultSettingValues)).toBe(true);
    // 150 kr shared by 8 seats and the driver.
    expect(highestSuggestedRate(defaultSettingValues)).toBe(16);
  });

  it("refuses a suggested rate the largest car cannot carry, and says the highest", () => {
    expect(change("suggested_rate", 16).ok).toBe(true);
    expect(change("suggested_rate", 17)).toEqual({
      ok: false,
      error: { code: "suggested_over_cap", highestRate: 16 },
    });
  });

  it("refuses a lower reference cost or more seats when the rate would no longer fit", () => {
    expect(change("reference_cost_per_km", 135).ok).toBe(true);
    expect(change("reference_cost_per_km", 134)).toEqual({
      ok: false,
      error: { code: "suggested_over_cap", highestRate: 14 },
    });
    const small = { ...defaultSettingValues, max_capacity: 6, suggested_rate: 20 };
    expect(suggestedFitsCap(small)).toBe(true);
    expect(change("max_capacity", 7, small)).toEqual({
      ok: false,
      error: { code: "suggested_over_cap", highestRate: 18 },
    });
    expect(change("max_capacity", 5, small).ok).toBe(true);
  });

  it("leaves the other settings alone", () => {
    expect(change("price_step", 50).ok).toBe(true);
    expect(change("beta_max_testers", 10).ok).toBe(true);
  });
});
