import { describe, expect, it } from "vitest";
import {
  nextPointStatus,
  pauseStillApplies,
  pauseLimits,
  reviewDueOn,
  validatePause,
  type StatusChange,
} from "./status.ts";
import type { MeetingPointStatus } from "./catalogue.ts";

const today = "2026-11-17";

describe("nextPointStatus (spec 2, 3.6)", () => {
  const cases: [MeetingPointStatus, StatusChange, number, MeetingPointStatus | "not_allowed"][] = [
    // Pause: an active point only, whatever trips use it (3.6.4).
    ["active", "pause", 0, "paused"],
    ["active", "pause", 3, "paused"],
    ["draft", "pause", 0, "not_allowed"],
    ["paused", "pause", 0, "not_allowed"],
    ["retiring", "pause", 1, "not_allowed"],
    ["retired", "pause", 0, "not_allowed"],
    // Back in use: a paused point only.
    ["paused", "resume", 2, "active"],
    ["active", "resume", 0, "not_allowed"],
    ["retiring", "resume", 1, "not_allowed"],
    // Retire: at once without future trips, after the last one otherwise (3.6.5).
    ["active", "retire", 0, "retired"],
    ["active", "retire", 2, "retiring"],
    // A paused point stays out of use: nobody boards there, and its drivers
    // were asked to choose another stop when it was paused.
    ["paused", "retire", 0, "retired"],
    ["paused", "retire", 1, "retired"],
    // A draft no trip can use is put away for good: points are never deleted (R2.2).
    ["draft", "retire", 0, "retired"],
    ["retiring", "retire", 1, "not_allowed"],
    // Retired is final (R2.2).
    ["retired", "retire", 0, "not_allowed"],
    ["retired", "resume", 0, "not_allowed"],
    // Activate: a draft only, once its checklist passes (3.6.3, R2.3).
    ["draft", "activate", 0, "active"],
    ["active", "activate", 0, "not_allowed"],
    ["paused", "activate", 0, "not_allowed"],
    ["retiring", "activate", 1, "not_allowed"],
    ["retired", "activate", 0, "not_allowed"],
  ];

  it.each(cases)("%s, %s with %i future trips: %s", (status, change, futureTrips, expected) => {
    const result = nextPointStatus(status, change, futureTrips);
    expect(result).toEqual(
      expected === "not_allowed"
        ? { ok: false, error: "not_allowed" }
        : { ok: true, value: expected },
    );
  });
});

describe("validatePause", () => {
  it("takes a reason in both languages and an end date after today, tidied", () => {
    expect(
      validatePause(
        {
          reasonIs: "  Vegavinna við innkeyrsluna. ",
          reasonEn: "Road works at the entrance.",
          until: "2026-11-30",
        },
        today,
      ),
    ).toEqual({
      ok: true,
      value: {
        reasonIs: "Vegavinna við innkeyrsluna.",
        reasonEn: "Road works at the entrance.",
        until: "2026-11-30",
      },
    });
  });

  it("needs no end date", () => {
    expect(validatePause({ reasonIs: "Lokað.", reasonEn: "Closed.", until: null }, today)).toEqual({
      ok: true,
      value: { reasonIs: "Lokað.", reasonEn: "Closed.", until: null },
    });
  });

  it("names each problem", () => {
    expect(
      validatePause(
        { reasonIs: " ", reasonEn: "x".repeat(pauseLimits.reasonMaxLength + 1), until: today },
        today,
      ),
    ).toEqual({
      ok: false,
      error: [
        { field: "reasonIs", issue: "required" },
        { field: "reasonEn", issue: "too_long" },
        { field: "until", issue: "not_after_today" },
      ],
    });
    expect(
      validatePause({ reasonIs: "Lokað.", reasonEn: "Closed.", until: "2026-02-30" }, today),
    ).toEqual({ ok: false, error: [{ field: "until", issue: "invalid" }] });
  });
});

describe("pauseStillApplies", () => {
  it("holds for a paused point, and one retired while paused, which keeps its reason", () => {
    expect(pauseStillApplies("paused", true)).toBe(true);
    expect(pauseStillApplies("retired", true)).toBe(true);
  });

  it("no longer holds once the point is back in use, or for one never paused", () => {
    expect(pauseStillApplies("active", false)).toBe(false);
    expect(pauseStillApplies("retiring", false)).toBe(false);
    expect(pauseStillApplies("retired", false)).toBe(false);
    expect(pauseStillApplies("draft", false)).toBe(false);
  });
});

describe("reviewDueOn (R2.9)", () => {
  it("is a year after the point was last confirmed", () => {
    expect(reviewDueOn("active", "2026-11-12")).toBe("2027-11-12");
    expect(reviewDueOn("paused", "2026-11-12")).toBe("2027-11-12");
    expect(reviewDueOn("retiring", "2026-11-12")).toBe("2027-11-12");
    expect(reviewDueOn("active", null)).toBeNull();
  });

  it("falls on 28 February after a 29 February", () => {
    expect(reviewDueOn("active", "2028-02-29")).toBe("2029-02-28");
  });

  it("is none for a point not in use: a draft, or a retired one", () => {
    expect(reviewDueOn("draft", "2026-11-12")).toBeNull();
    expect(reviewDueOn("retired", "2026-11-12")).toBeNull();
  });
});
