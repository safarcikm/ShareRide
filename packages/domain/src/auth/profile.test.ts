import { describe, expect, it } from "vitest";
import { validateProfileChanges } from "./profile.ts";

describe("validateProfileChanges (spec 1, section 3.5)", () => {
  it("accepts a first name, an about text and languages", () => {
    expect(
      validateProfileChanges({
        firstName: "Anna-María",
        about: "Commuting daily.",
        languages: ["is", "en"],
      }),
    ).toEqual({
      ok: true,
      value: { firstName: "Anna-María", about: "Commuting daily.", languages: ["is", "en"] },
    });
  });

  it("trims spaces around the first name and the about text", () => {
    expect(validateProfileChanges({ firstName: "  Jón ", about: " Hi " })).toEqual({
      ok: true,
      value: { firstName: "Jón", about: "Hi" },
    });
  });

  it.each(["Þóra", "O'Neil", "Mary Ann", "Zoë", "Łukasz"])(
    "accepts the first name %j",
    (firstName) => {
      expect(validateProfileChanges({ firstName })).toMatchObject({ ok: true });
    },
  );

  it.each(["", " ", "A".repeat(31), "R2D2", "Anna!", "<b>"])(
    "rejects the first name %j",
    (firstName) => {
      expect(validateProfileChanges({ firstName })).toEqual({
        ok: false,
        error: { code: "profile_invalid", field: "firstName" },
      });
    },
  );

  it("counts an accented letter typed as two code points as one character", () => {
    const decomposed = "O\u0301".repeat(30); // "Ó" as O plus a combining accent
    expect(validateProfileChanges({ firstName: decomposed })).toEqual({
      ok: true,
      value: { firstName: "Ó".repeat(30) },
    });
  });

  it("accepts 300 characters about you and rejects 301", () => {
    expect(validateProfileChanges({ about: "a".repeat(300) })).toMatchObject({ ok: true });
    expect(validateProfileChanges({ about: "a".repeat(301) })).toEqual({
      ok: false,
      error: { code: "profile_invalid", field: "about" },
    });
  });

  it("lets a person clear the about text", () => {
    expect(validateProfileChanges({ about: "" })).toEqual({ ok: true, value: { about: null } });
  });

  it("accepts only languages from the list, each once", () => {
    expect(validateProfileChanges({ languages: ["is", "xx"] })).toEqual({
      ok: false,
      error: { code: "profile_invalid", field: "languages" },
    });
    expect(validateProfileChanges({ languages: ["is", "is"] })).toEqual({
      ok: false,
      error: { code: "profile_invalid", field: "languages" },
    });
  });
});
