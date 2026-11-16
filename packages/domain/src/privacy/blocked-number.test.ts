import { describe, expect, it } from "vitest";
import { blockedNumberUntil } from "./blocked-number.ts";

describe("a suspended person's number after deletion (R11.9, decision 2)", () => {
  const erasedAt = new Date("2026-11-16T12:00:00Z");

  it("is blocked until the suspension ends", () => {
    const end = new Date("2027-05-01T00:00:00Z");
    expect(blockedNumberUntil(end, erasedAt)).toEqual(end);
  });

  it("is blocked at most 3 years, and 3 years for a permanent suspension", () => {
    expect(blockedNumberUntil(new Date("2035-01-01T00:00:00Z"), erasedAt)?.toISOString()).toBe(
      "2029-11-16T12:00:00.000Z",
    );
    expect(blockedNumberUntil(null, erasedAt)?.toISOString()).toBe("2029-11-16T12:00:00.000Z");
  });

  it("is not blocked when the suspension has already ended", () => {
    expect(blockedNumberUntil(erasedAt, erasedAt)).toBeNull();
  });
});
