import { describe, expect, it } from "vitest";
import { requestDueAt, validatePrivacyRequest } from "./requests.ts";

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
});
