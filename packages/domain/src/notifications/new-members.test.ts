import { describe, expect, it } from "vitest";
import { newMembersEmailGapMinutes, newMembersPeriod } from "./new-members.ts";

const at = (time: string) => new Date(`2026-11-23T${time}:00.000Z`);

describe("newMembersPeriod (spec 25, R25.3)", () => {
  it("waits an hour between two emails", () => {
    expect(newMembersEmailGapMinutes).toBe(60);
  });

  it("counts from when the operator turned it on, before any email", () => {
    expect(newMembersPeriod({ onSince: at("09:00"), lastEmailAt: null, now: at("09:01") })).toEqual(
      { from: at("09:00") },
    );
  });

  it("gives nothing within the hour after the last email", () => {
    for (const now of ["14:02", "14:30", "15:01"]) {
      expect(
        newMembersPeriod({ onSince: at("09:00"), lastEmailAt: at("14:02"), now: at(now) }),
      ).toBeNull();
    }
  });

  it("counts from the last email once the hour is over", () => {
    expect(
      newMembersPeriod({ onSince: at("09:00"), lastEmailAt: at("14:02"), now: at("15:02") }),
    ).toEqual({ from: at("14:02") });
  });

  it("counts from turning it on again when that came after the last email", () => {
    expect(
      newMembersPeriod({ onSince: at("16:00"), lastEmailAt: at("14:02"), now: at("16:01") }),
    ).toEqual({ from: at("16:00") });
  });
});
