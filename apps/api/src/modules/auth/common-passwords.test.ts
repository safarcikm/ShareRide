import { readFileSync } from "node:fs";
import { passwordRules } from "@shareride/domain";
import { describe, expect, it } from "vitest";
import { isCommonPassword } from "./passwords.ts";

// The list of passwords too common to use (spec 27, R27.2).

const entries = readFileSync(
  new URL("../../../assets/common-passwords.txt", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter((line) => line !== "" && !line.startsWith("#"));

describe("the common-password list", () => {
  it("holds only passwords long enough to be chosen, lowercased, one per line", () => {
    expect(entries.length).toBeGreaterThan(40_000);
    for (const entry of entries) {
      expect(Array.from(entry).length).toBeGreaterThanOrEqual(passwordRules.minLength);
      expect(entry).toBe(entry.normalize("NFC").toLowerCase());
      expect(entry).not.toContain("\r");
    }
    expect(new Set(entries).size).toBe(entries.length);
  });

  it("knows the passwords people use most, and not a few words of one's own", () => {
    for (const common of ["password", "12345678", "iloveyou", "qwertyuiop"]) {
      expect(isCommonPassword(common)).toBe(true);
    }
    expect(isCommonPassword("lundar a latrabjargi")).toBe(false);
  });
});
