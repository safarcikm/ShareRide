import { describe, expect, it } from "vitest";
import { checkMessage, lateMinutes, quickMessageKeys } from "./messages.ts";
import { defaultChatSettings } from "./settings.ts";

const check = (input: Parameters<typeof checkMessage>[0]) =>
  checkMessage(input, defaultChatSettings);

describe("a text message (R7.2)", () => {
  it("takes 1 to 1 000 characters", () => {
    expect(check({ text: "a" })).toEqual({ ok: true, value: { kind: "text", text: "a" } });
    expect(check({ text: "a".repeat(1000) }).ok).toBe(true);
  });

  it("refuses 1 001 characters", () => {
    expect(check({ text: "a".repeat(1001) })).toEqual({
      ok: false,
      error: { code: "too_long", maxLength: 1000 },
    });
  });

  it("counts letters as they are written, whatever their encoding", () => {
    // "é" as e and a combining accent is one letter once composed, and is stored so.
    const decomposed = "e\u0301".repeat(1000);
    expect(check({ text: decomposed })).toEqual({
      ok: true,
      value: { kind: "text", text: "\u00e9".repeat(1000) },
    });
  });

  it("refuses an empty message or one of spaces and new lines only", () => {
    expect(check({ text: "" })).toEqual({ ok: false, error: { code: "empty" } });
    expect(check({ text: "  \n\t " })).toEqual({ ok: false, error: { code: "empty" } });
  });

  it("drops spaces and new lines at either end", () => {
    expect(check({ text: "\n  See you at N1  \n" })).toEqual({
      ok: true,
      value: { kind: "text", text: "See you at N1" },
    });
  });

  it("keeps phone numbers, email addresses and links (spec 7, decision 3)", () => {
    const text = "Call me on 555 1234 or write to anna@example.com, map: https://example.com/x";
    expect(check({ text })).toEqual({ ok: true, value: { kind: "text", text } });
  });
});

describe("a quick message (R7.2)", () => {
  it("takes every quick message but the late one as it is", () => {
    for (const key of quickMessageKeys.filter((key) => key !== "late")) {
      expect(check({ quick: { key } })).toEqual({
        ok: true,
        value: { kind: "quick", quick: { key } },
      });
    }
  });

  it("takes the late one with 5, 10, 15 or 30 minutes", () => {
    expect(lateMinutes).toEqual([5, 10, 15, 30]);
    for (const minutes of lateMinutes) {
      expect(check({ quick: { key: "late", minutes } })).toEqual({
        ok: true,
        value: { kind: "quick", quick: { key: "late", minutes } },
      });
    }
  });

  it("refuses the late one with other minutes, or none", () => {
    expect(check({ quick: { key: "late", minutes: 20 } })).toEqual({
      ok: false,
      error: { code: "invalid_minutes" },
    });
    expect(check({ quick: { key: "late" } })).toEqual({
      ok: false,
      error: { code: "invalid_minutes" },
    });
  });

  it("refuses minutes on a quick message that has none", () => {
    expect(check({ quick: { key: "thanks", minutes: 10 } })).toEqual({
      ok: false,
      error: { code: "invalid_minutes" },
    });
  });

  it("refuses a key it does not know", () => {
    expect(check({ quick: { key: "callMe" } })).toEqual({
      ok: false,
      error: { code: "unknown_quick_message" },
    });
  });
});
