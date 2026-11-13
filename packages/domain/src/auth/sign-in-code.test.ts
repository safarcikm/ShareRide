import { describe, expect, it } from "vitest";
import { checkCodeAttempt, codeRules, codeSendLimits, generateCode } from "./sign-in-code.ts";

const t0 = new Date("2026-11-13T12:00:00Z");
const seconds = (n: number) => new Date(t0.getTime() + n * 1000);

describe("generateCode (rule R1.2)", () => {
  it("makes 6 digits from the random source, keeping leading zeros", () => {
    const digits = [0, 4, 2, 9, 0, 7];
    let i = 0;
    expect(generateCode(() => digits[i++] ?? 0)).toBe("042907");
  });

  it("asks the random source for one digit at a time, 0 to 9", () => {
    const bounds: number[] = [];
    generateCode((max) => {
      bounds.push(max);
      return 0;
    });
    expect(bounds).toEqual([10, 10, 10, 10, 10, 10]);
  });
});

describe("checkCodeAttempt (rule R1.2)", () => {
  const fresh = { createdAt: t0, attempts: 0, usedAt: null };

  it("allows an attempt on a fresh code", () => {
    expect(checkCodeAttempt(fresh, seconds(60))).toEqual({ ok: true, value: { attemptsLeft: 4 } });
  });

  it("allows the fifth attempt and no more", () => {
    expect(checkCodeAttempt({ ...fresh, attempts: 4 }, seconds(60))).toEqual({
      ok: true,
      value: { attemptsLeft: 0 },
    });
    expect(checkCodeAttempt({ ...fresh, attempts: 5 }, seconds(60))).toEqual({
      ok: false,
      error: { code: "code_attempts_exceeded" },
    });
  });

  it("expires 10 minutes after it was sent", () => {
    expect(checkCodeAttempt(fresh, seconds(599))).toMatchObject({ ok: true });
    expect(checkCodeAttempt(fresh, seconds(600))).toEqual({
      ok: false,
      error: { code: "code_expired" },
    });
  });

  it("works only once", () => {
    expect(checkCodeAttempt({ ...fresh, usedAt: seconds(10) }, seconds(20))).toEqual({
      ok: false,
      error: { code: "code_expired" },
    });
  });

  it("has the values from spec 1", () => {
    expect(codeRules).toEqual({ length: 6, validForSeconds: 600, maxAttempts: 5 });
  });
});

describe("codeSendLimits (rule R1.3)", () => {
  it("allow one code per 30 seconds and 5 per hour per number", () => {
    expect(codeSendLimits.perNumber).toEqual([
      { limit: 1, windowSeconds: 30 },
      { limit: 5, windowSeconds: 3600 },
    ]);
  });
});
