import { describe, expect, it } from "vitest";
import { alertChannels } from "./alerts.ts";
import { leavesCapitalArea } from "./before-you-go.ts";
import { defaultSafetySettings } from "./settings.ts";

const at = (time: string) => new Date(`2026-11-20T${time}:00Z`);

describe("alerting the operator to a new report (R9.9, spec 9 decision 4)", () => {
  it("sends an urgent report by push and SMS from 07:00 to 23:00 Reykjavik time", () => {
    for (const time of ["07:00", "12:00", "22:59"]) {
      expect(alertChannels(true, at(time), defaultSafetySettings)).toEqual(["push", "sms"]);
    }
  });

  it("sends it by push only at night", () => {
    for (const time of ["06:59", "23:00", "03:00"]) {
      expect(alertChannels(true, at(time), defaultSafetySettings)).toEqual(["push"]);
    }
  });

  it("never sends an SMS for a report that is not urgent", () => {
    expect(alertChannels(false, at("12:00"), defaultSafetySettings)).toEqual(["push"]);
  });
});

describe("Before you go (3.3.2)", () => {
  it("shows for a trip with any stop outside the capital area", () => {
    expect(leavesCapitalArea(["capital", "west"])).toBe(true);
    expect(leavesCapitalArea(["south", "south"])).toBe(true);
  });

  it("does not show for a trip within the capital area", () => {
    expect(leavesCapitalArea(["capital", "capital"])).toBe(false);
    expect(leavesCapitalArea([])).toBe(false);
  });
});
