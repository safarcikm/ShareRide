import { describe, expect, it } from "vitest";
import {
  checkMeetingPointIssue,
  meetingPointIssueLimits,
  meetingPointIssueReasons,
  meetingPointIssueRetryAfter,
} from "./issues.ts";

describe("checkMeetingPointIssue", () => {
  it("takes a reason and a note, tidied", () => {
    expect(
      checkMeetingPointIssue({ reason: "unsafe", note: "  Engin lýsing á kvöldin.\n " }, "active"),
    ).toEqual({
      ok: true,
      value: { reason: "unsafe", note: "Engin lýsing á kvöldin." },
    });
    expect(checkMeetingPointIssue({ reason: "other", note: "" }, "paused")).toEqual({
      ok: true,
      value: { reason: "other", note: "" },
    });
  });

  it("offers the reasons of spec 2, 3.5", () => {
    expect(meetingPointIssueReasons).toEqual([
      "closed_or_moved",
      "unsafe",
      "wrong_location",
      "wrong_information",
      "other",
    ]);
  });

  it("refuses a note over 300 characters, counting letters as people see them", () => {
    const longest = "á".normalize("NFD").repeat(meetingPointIssueLimits.noteMax);
    expect(checkMeetingPointIssue({ reason: "other", note: longest }, "active").ok).toBe(true);
    expect(checkMeetingPointIssue({ reason: "other", note: `${longest}x` }, "active")).toEqual({
      ok: false,
      error: { code: "too_long" },
    });
  });

  it("is only for points people can see", () => {
    for (const status of ["active", "paused", "retiring"] as const) {
      expect(checkMeetingPointIssue({ reason: "other", note: "" }, status).ok).toBe(true);
    }
    for (const status of ["draft", "retired"] as const) {
      expect(checkMeetingPointIssue({ reason: "other", note: "" }, status)).toEqual({
        ok: false,
        error: { code: "not_found" },
      });
    }
  });
});

describe("meetingPointIssueRetryAfter", () => {
  const now = new Date("2026-11-17T12:00:00.000Z");
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

  it("lets a person send 5 in 24 hours (R2.8)", () => {
    expect(meetingPointIssueLimits.perDay).toBe(5);
    expect(
      meetingPointIssueRetryAfter([hoursAgo(1), hoursAgo(2), hoursAgo(3), hoursAgo(4)], now),
    ).toBeNull();
  });

  it("says when the next one can be sent: a day after the oldest of the last 24 hours", () => {
    const sent = [hoursAgo(1), hoursAgo(23), hoursAgo(5), hoursAgo(2), hoursAgo(3), hoursAgo(30)];
    expect(meetingPointIssueRetryAfter(sent, now)).toBe(3_600);
  });
});
