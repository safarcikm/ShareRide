import { describe, expect, it } from "vitest";
import {
  newMembersEmailGapMinutes,
  newMembersFrom,
  newMembersLookbackDays,
  newMembersPeriod,
} from "./new-members.ts";

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

describe("newMembersFrom (spec 25, R25.3)", () => {
  const day = (date: string) => new Date(`${date}T12:00:00.000Z`);

  it("counts from the later of turning it on and the last email", () => {
    expect(
      newMembersFrom({ onSince: at("09:00"), lastEmailAt: at("14:02"), until: at("15:02") }),
    ).toEqual(at("14:02"));
    expect(newMembersFrom({ onSince: at("09:00"), lastEmailAt: null, until: at("15:02") })).toEqual(
      at("09:00"),
    );
  });

  it("looks back no further than the notification log keeps the last email", () => {
    expect(newMembersLookbackDays).toBe(89);
    // Turned on in the spring, the last email long gone from the log: only
    // the last 89 days, in which any member would have had an email still kept.
    expect(
      newMembersFrom({ onSince: day("2026-03-01"), lastEmailAt: null, until: day("2026-11-23") }),
    ).toEqual(day("2026-08-26"));
  });
});
