import { describe, expect, it } from "vitest";
import { defaultSettingValues } from "./values.ts";
import { isPaused, isSwitchKey, pausedNow, switchKeys, switchReminderNumber } from "./switches.ts";

const at = (time: string) => new Date(`2027-03-01T${time}Z`);

describe("the switches", () => {
  it("are the six of spec 10, all on by default", () => {
    expect(switchKeys).toEqual([
      "signups_open",
      "trips_open",
      "bookings_open",
      "sms_sending",
      "email_sending",
      "push_sending",
    ]);
    expect(switchKeys.every((key) => defaultSettingValues[key] === 1)).toBe(true);
    expect(isSwitchKey("trips_open")).toBe(true);
    // A switch of another kind: the closed beta's.
    expect(isSwitchKey("invite_code_required")).toBe(false);
  });

  it("pause nothing by default", () => {
    expect(pausedNow(defaultSettingValues)).toEqual([]);
  });

  it("say what is paused, for the app's banners", () => {
    const values = { ...defaultSettingValues, bookings_open: 0, sms_sending: 0, email_sending: 0 };
    expect(pausedNow(values)).toEqual(["bookings", "sms"]);
    expect(isPaused(values, "bookings")).toBe(true);
    expect(isPaused(values, "trips")).toBe(false);
  });
});

describe("a switch left off", () => {
  const offSince = at("10:00:00");

  it("does not remind within the hour", () => {
    expect(switchReminderNumber(offSince, at("10:59:59"))).toBeNull();
  });

  it("reminds at one hour", () => {
    expect(switchReminderNumber(offSince, at("11:00:00"))).toBe(0);
  });

  it("does not remind again the same day", () => {
    expect(switchReminderNumber(offSince, new Date("2027-03-02T10:59:59Z"))).toBe(0);
  });

  it("reminds again each day after that", () => {
    expect(switchReminderNumber(offSince, new Date("2027-03-02T11:00:00Z"))).toBe(1);
    expect(switchReminderNumber(offSince, new Date("2027-03-04T12:00:00Z"))).toBe(3);
  });
});
