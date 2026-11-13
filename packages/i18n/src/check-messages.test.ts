import { describe, expect, it } from "vitest";
import { findMessageProblems } from "./check-messages.ts";
import { en } from "./messages/en.ts";
import { is } from "./messages/is.ts";

describe("the message catalogs", () => {
  it("have the same keys and arguments in Icelandic and English, and valid ICU syntax", () => {
    expect(findMessageProblems({ en, is })).toEqual([]);
  });
});

describe("findMessageProblems", () => {
  it("reports a key missing from one language", () => {
    expect(findMessageProblems({ en: { a: "A", b: "B" }, is: { a: "A" } })).toEqual([
      "is: missing key b",
    ]);
  });

  it("reports a key that only one language has", () => {
    expect(findMessageProblems({ en: { a: "A" }, is: { a: "A", extra: "X" } })).toEqual([
      "is: unknown key extra",
    ]);
  });

  it("reports invalid ICU syntax", () => {
    expect(findMessageProblems({ en: { a: "{count, plural, one {#}" }, is: { a: "A" } })).toEqual([
      expect.stringMatching(/^en: a: invalid ICU message/) as string,
    ]);
  });

  it("reports arguments that differ between languages", () => {
    expect(findMessageProblems({ en: { a: "Hi {name}" }, is: { a: "Hæ {nafn}" } })).toEqual([
      "is: a: arguments (nafn) differ from en (name)",
    ]);
  });
});
