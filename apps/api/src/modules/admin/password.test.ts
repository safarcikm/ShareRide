import { describe, expect, it } from "vitest";
import { createPasswordSignIn, passwordMatches } from "./password.ts";

describe("passwordMatches", () => {
  it("takes only the very same password", () => {
    expect(passwordMatches("correct horse battery", "correct horse battery")).toBe(true);
    expect(passwordMatches("correct horse battery", "correct horse batter")).toBe(false);
    expect(passwordMatches("correct horse battery", "Correct horse battery")).toBe(false);
    expect(passwordMatches("correct horse battery", "")).toBe(false);
  });
});

describe("password sign-in without ADMIN_PASSWORD (ADR 0041)", () => {
  const off = createPasswordSignIn({
    db: undefined as never,
    sessions: undefined as never,
    password: undefined,
  });

  it("is off, and refuses every try", async () => {
    expect(off.on).toBe(false);
    expect(
      await off.signIn({
        phoneNumber: "6900000",
        password: "anything at all",
        request: { ipAddress: "203.0.113.1", userAgent: null },
      }),
    ).toEqual({ ok: false, error: { code: "password_sign_in_off" } });
  });
});
