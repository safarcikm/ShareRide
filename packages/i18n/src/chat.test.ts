import { lateMinutes, quickMessageKeys, type QuickMessage } from "@shareride/domain";
import { describe, expect, it } from "vitest";
import { quickMessageText, systemLineText } from "./chat.ts";
import { createTranslator } from "./translator.ts";

const en = createTranslator("en");
const is = createTranslator("is");

describe("quick messages in the reader's language (R7.2)", () => {
  it("reads the late one with its minutes in both languages", () => {
    expect(quickMessageText(en, { key: "late", minutes: 10 })).toBe("I'm running 10 minutes late");
    expect(quickMessageText(is, { key: "late", minutes: 10 })).toBe("Mér seinkar um 10 mínútur");
  });

  it("has a text in both languages for every quick message", () => {
    const all: QuickMessage[] = [
      ...lateMinutes.map((minutes) => ({ key: "late" as const, minutes })),
      ...quickMessageKeys.filter((key) => key !== "late").map((key) => ({ key })),
    ];
    for (const quick of all) {
      for (const t of [en, is]) {
        const text = quickMessageText(t, quick);
        expect(text).not.toContain("{");
        expect(text.length).toBeGreaterThan(0);
      }
    }
    expect(quickMessageText(en, { key: "thanks" })).toBe("Thank you!");
    expect(quickMessageText(is, { key: "whereAreYou" })).toBe("Hvar ertu?");
  });
});

describe("system lines in the reader's language (spec 7, 3.1, item 3)", () => {
  it("reads the opening line in both languages", () => {
    expect(systemLineText(en, "opened")).toBe(
      "Booking confirmed. You can message each other here.",
    );
    expect(systemLineText(is, "opened")).toBe("Bókunin er staðfest. Þið getið skrifast á hér.");
  });
});
