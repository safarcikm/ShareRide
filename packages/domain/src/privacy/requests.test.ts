import { describe, expect, it } from "vitest";
import { privacySettings } from "./settings.ts";
import {
  requestAllowed,
  requestDueAt,
  requestsCountedSince,
  validatePrivacyRequest,
  validateRequestAnswer,
} from "./requests.ts";

describe("ask about my data (spec 11, 3.6; R11.7)", () => {
  it("is due one calendar month after it arrives", () => {
    expect(requestDueAt(new Date("2026-11-16T21:40:00Z")).toISOString()).toBe(
      "2026-12-16T21:40:00.000Z",
    );
    expect(requestDueAt(new Date("2027-01-31T09:00:00Z")).toISOString()).toBe(
      "2027-02-28T09:00:00.000Z",
    );
  });

  it("takes a kind and a text of 1 to 2 000 characters, trimmed", () => {
    expect(validatePrivacyRequest({ kind: "question", text: "  Why?  " })).toEqual({
      ok: true,
      value: { kind: "question", text: "Why?" },
    });
    expect(validatePrivacyRequest({ kind: "question", text: "   " })).toEqual({
      ok: false,
      error: { code: "request_text_invalid" },
    });
    expect(validatePrivacyRequest({ kind: "objection", text: "x".repeat(2001) }).ok).toBe(false);
    expect(validatePrivacyRequest({ kind: "objection", text: "x".repeat(2000) }).ok).toBe(true);
  });

  it("takes an answer of 1 to 5 000 characters, trimmed", () => {
    expect(validateRequestAnswer("  We keep trips for 3 years.  ")).toEqual({
      ok: true,
      value: "We keep trips for 3 years.",
    });
    expect(validateRequestAnswer(" \n ")).toEqual({
      ok: false,
      error: { code: "request_answer_invalid" },
    });
    expect(validateRequestAnswer("x".repeat(5000)).ok).toBe(true);
    expect(validateRequestAnswer("x".repeat(5001)).ok).toBe(false);
  });

  it("allows 5 requests a day", () => {
    expect(privacySettings.requestsPerDay).toBe(5);
  });

  it("counts the requests of the last 24 hours", () => {
    expect(requestsCountedSince(new Date("2026-11-16T21:40:00Z")).toISOString()).toBe(
      "2026-11-15T21:40:00.000Z",
    );
  });

  it("takes a sixth request once the oldest of the five is 24 hours old", () => {
    const now = new Date("2026-11-16T21:40:00Z");
    expect(requestAllowed({ count: 4, oldest: new Date("2026-11-16T09:00:00Z") }, now)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(requestAllowed({ count: 5, oldest: new Date("2026-11-16T09:00:00Z") }, now)).toEqual({
      ok: false,
      error: { code: "rate_limited", retryAfterSeconds: 11 * 3600 + 20 * 60 },
    });
    // Never less than a second, even at the edge.
    expect(requestAllowed({ count: 5, oldest: new Date("2026-11-15T21:40:00.500Z") }, now)).toEqual(
      { ok: false, error: { code: "rate_limited", retryAfterSeconds: 1 } },
    );
  });
});
