import { describe, expect, it } from "vitest";
import {
  checkFeedback,
  checkReply,
  checkScreenshot,
  feedbackAllowed,
  feedbackCountedSince,
  feedbackDeletedUpTo,
  feedbackRules,
  type FeedbackDraft,
} from "./feedback.ts";

const draft = (changes: Partial<FeedbackDraft> = {}): FeedbackDraft => ({
  kind: "problem",
  message: "The map does not move.",
  appVersion: "1.4.0",
  platform: "ios",
  osVersion: "19.1",
  screen: "/trips/[id]",
  ...changes,
});

describe("checkFeedback", () => {
  it("takes a message with the app's details, trimmed and composed", () => {
    expect(checkFeedback(draft({ message: "  Vél gert \n" }))).toEqual({
      ok: true,
      value: { ...draft(), message: "Vél gert" },
    });
  });

  it("takes every kind and platform it knows, and no other", () => {
    for (const kind of ["problem", "idea", "other"]) {
      expect(checkFeedback(draft({ kind })).ok).toBe(true);
    }
    for (const platform of ["ios", "android", "web"]) {
      expect(checkFeedback(draft({ platform })).ok).toBe(true);
    }
    expect(checkFeedback(draft({ kind: "praise" }))).toEqual({
      ok: false,
      error: { code: "kind_unknown" },
    });
    expect(checkFeedback(draft({ platform: "windows" }))).toEqual({
      ok: false,
      error: { code: "platform_unknown" },
    });
  });

  it("needs a message of 1 to 2 000 characters, counted as people see them", () => {
    expect(checkFeedback(draft({ message: " \n " }))).toEqual({
      ok: false,
      error: { code: "message_missing" },
    });
    expect(checkFeedback(draft({ message: "🚗".repeat(2000) })).ok).toBe(true);
    expect(checkFeedback(draft({ message: "a".repeat(2001) }))).toEqual({
      ok: false,
      error: { code: "message_too_long", maxLength: 2000 },
    });
  });

  it("holds the app's details to their lengths, on one line", () => {
    expect(checkFeedback(draft({ appVersion: "" }))).toEqual({
      ok: false,
      error: { code: "details_invalid", field: "appVersion" },
    });
    expect(checkFeedback(draft({ appVersion: "1".repeat(33) }))).toEqual({
      ok: false,
      error: { code: "details_invalid", field: "appVersion" },
    });
    // A browser gives no system version worth keeping.
    expect(checkFeedback(draft({ platform: "web", osVersion: "" })).ok).toBe(true);
    expect(checkFeedback(draft({ osVersion: "1".repeat(65) }))).toEqual({
      ok: false,
      error: { code: "details_invalid", field: "osVersion" },
    });
    expect(checkFeedback(draft({ screen: "" }))).toEqual({
      ok: false,
      error: { code: "details_invalid", field: "screen" },
    });
    expect(checkFeedback(draft({ screen: "/" + "a".repeat(120) }))).toEqual({
      ok: false,
      error: { code: "details_invalid", field: "screen" },
    });
    expect(checkFeedback(draft({ screen: "/trips\n/x" }))).toEqual({
      ok: false,
      error: { code: "details_invalid", field: "screen" },
    });
  });
});

describe("checkReply", () => {
  it("takes 1 to 1 000 characters, trimmed", () => {
    expect(checkReply("  Thanks, fixed in the next version. ")).toEqual({
      ok: true,
      value: "Thanks, fixed in the next version.",
    });
    expect(checkReply("  ")).toEqual({ ok: false, error: { code: "reply_missing" } });
    expect(checkReply("a".repeat(1000)).ok).toBe(true);
    expect(checkReply("a".repeat(1001))).toEqual({
      ok: false,
      error: { code: "reply_too_long", maxLength: 1000 },
    });
  });
});

describe("feedbackAllowed", () => {
  const now = new Date("2027-03-10T12:00:00Z");

  it("counts the last 24 hours", () => {
    expect(feedbackCountedSince(now)).toEqual(new Date("2027-03-09T12:00:00Z"));
  });

  it("takes the tenth of a day and refuses the eleventh until the oldest is a day old", () => {
    const oldest = new Date("2027-03-09T18:00:00Z");
    expect(feedbackAllowed({ count: 9, oldest }, now)).toEqual({ ok: true, value: undefined });
    expect(feedbackAllowed({ count: 10, oldest }, now)).toEqual({
      ok: false,
      error: { code: "rate_limited", retryAfterSeconds: 6 * 3600 },
    });
    expect(feedbackRules.perDay).toBe(10);
  });
});

describe("checkScreenshot", () => {
  it("refuses a file over 1 MB before reading it", () => {
    expect(checkScreenshot(new Uint8Array(1024 * 1024 + 1))).toEqual({
      ok: false,
      error: "too_large",
    });
  });

  it("refuses what is not a JPEG", () => {
    expect(checkScreenshot(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toEqual({
      ok: false,
      error: "not_jpeg",
    });
  });
});

describe("feedbackDeletedUpTo", () => {
  const ended = new Date("2027-06-15T10:00:00Z");

  it("deletes nothing while the beta has not ended", () => {
    expect(feedbackDeletedUpTo(null, new Date("2030-01-01T00:00:00Z"))).toBeNull();
  });

  it("deletes nothing until 12 months after the beta ended", () => {
    expect(feedbackDeletedUpTo(ended, new Date("2028-06-15T09:59:59Z"))).toBeNull();
  });

  it("then deletes what is 12 months old, so later feedback is kept its own 12 months", () => {
    expect(feedbackDeletedUpTo(ended, new Date("2028-06-15T10:00:00Z"))).toEqual(ended);
    expect(feedbackDeletedUpTo(ended, new Date("2028-09-01T08:00:00Z"))).toEqual(
      new Date("2027-09-01T08:00:00Z"),
    );
  });
});
