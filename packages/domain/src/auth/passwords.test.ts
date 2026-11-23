import { describe, expect, it } from "vitest";
import {
  checkNewPassword,
  freshSignInSeconds,
  needsProof,
  passwordChangeLimits,
  passwordSignInLimits,
  scryptSettings,
} from "./passwords.ts";

const common = new Set(["correcthorse", "password1234"]);
const isCommon = (lowered: string) => common.has(lowered);
const check = (password: string, email: string | null = "anna@example.com") =>
  checkNewPassword(password, email, isCommon);

describe("checkNewPassword (R27.2)", () => {
  it("takes 8 to 128 characters, counted as characters, not bytes", () => {
    expect(check("a".repeat(7))).toEqual({ ok: false, error: "too_short" });
    expect(check("a".repeat(8))).toEqual({ ok: true, value: "a".repeat(8) });
    expect(check("a".repeat(128)).ok).toBe(true);
    expect(check("a".repeat(129))).toEqual({ ok: false, error: "too_long" });
    // Seven emoji and a letter: eight characters, though many more bytes.
    expect(check(`${"🐧".repeat(7)}a`).ok).toBe(true);
    // No capitals, digits or symbols needed.
    expect(check("lundabyggd").ok).toBe(true);
  });

  it("keeps spaces, and stores the NFC form of a character typed in two parts", () => {
    expect(check("  a few words  ")).toEqual({ ok: true, value: "  a few words  " });
    const decomposed = "kaffi og káka";
    expect(check(decomposed)).toEqual({ ok: true, value: "kaffi og káka" });
  });

  it("refuses a password on the common list, in any case", () => {
    expect(check("Password1234")).toEqual({ ok: false, error: "too_common" });
    expect(check("CORRECTHORSE")).toEqual({ ok: false, error: "too_common" });
  });

  it("refuses the account's email as the password, in any case", () => {
    expect(check("Anna@Example.com")).toEqual({ ok: false, error: "is_email" });
    expect(check("anna@example.com", null).ok).toBe(true);
  });

  it("asks nothing else: no digits or symbols needed", () => {
    expect(check("puffins fly north").ok).toBe(true);
  });
});

describe("needsProof (R27.5)", () => {
  const startedAt = new Date("2026-11-23T12:00:00Z");
  const after = (seconds: number) => new Date(startedAt.getTime() + seconds * 1000);

  it("needs no confirm code within 10 minutes of signing in", () => {
    expect(freshSignInSeconds).toBe(600);
    expect(needsProof(startedAt, after(599))).toBe(false);
  });

  it("needs one from then on", () => {
    expect(needsProof(startedAt, after(600))).toBe(true);
  });
});

describe("limits and settings (R27.4, ADR 0047)", () => {
  it("allows 10 wrong tries an hour for an email and 30 from a network address", () => {
    expect(passwordSignInLimits).toMatchObject({
      perEmail: [{ limit: 10, windowSeconds: 3600 }],
      perIpAddress: [{ limit: 30, windowSeconds: 3600 }],
    });
  });

  it("allows 20 tries of any kind an hour for an email and 100 from a network address", () => {
    expect(passwordSignInLimits).toMatchObject({
      allPerEmail: [{ limit: 20, windowSeconds: 3600 }],
      allPerIpAddress: [{ limit: 100, windowSeconds: 3600 }],
    });
  });

  it("lets an account save a password 10 times an hour", () => {
    expect(passwordChangeLimits).toEqual([{ limit: 10, windowSeconds: 3600 }]);
  });

  it("hashes with scrypt N = 2^15, r = 8, p = 3", () => {
    expect(scryptSettings).toEqual({ logN: 15, r: 8, p: 3, saltBytes: 16, keyBytes: 32 });
  });
});
