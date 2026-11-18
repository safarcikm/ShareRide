import { defaultSettingValues, defaultTripDaySettings } from "@shareride/domain";
import { describe, expect, it } from "vitest";
import { liveRuleSettings } from "./live.ts";

describe("liveRuleSettings", () => {
  it("gives each field as the values are when it is asked for", () => {
    let values = defaultSettingValues;
    const { tripDay, reliability } = liveRuleSettings(() => values);
    expect({ ...tripDay }).toEqual(defaultTripDaySettings);
    expect(reliability.watchPercent).toBe(80);

    values = { ...values, no_show_wait: 15, reliability_watch_level: 70 };
    expect(tripDay.noShowWaitMinutes).toBe(15);
    expect(reliability.watchPercent).toBe(70);
  });

  it("keeps the values a copy was made with", () => {
    let values = defaultSettingValues;
    const copy = { ...liveRuleSettings(() => values).reliability };
    values = { ...values, reliability_period: 6 };
    expect(copy.periodMonths).toBe(12);
  });
});
