import { describe, expect, it } from "vitest";
import { operatorPasswordRules } from "./password.ts";

describe("the console's temporary password (ADR 0041)", () => {
  it("is 12 characters or more, and limits tries per address and from all addresses together", () => {
    expect(operatorPasswordRules.minLength).toBe(12);
    expect(operatorPasswordRules.triesPerAddress).toEqual([
      { limit: 5, windowSeconds: 60 },
      { limit: 20, windowSeconds: 3600 },
    ]);
    expect(operatorPasswordRules.triesFromAll).toEqual([{ limit: 200, windowSeconds: 3600 }]);
  });

  it("does not let one address use up the tries of all addresses", () => {
    const perAddressHour = operatorPasswordRules.triesPerAddress.at(-1)?.limit ?? Infinity;
    const allHour = operatorPasswordRules.triesFromAll.at(-1)?.limit ?? 0;
    expect(allHour).toBeGreaterThanOrEqual(5 * perAddressHour);
  });
});
