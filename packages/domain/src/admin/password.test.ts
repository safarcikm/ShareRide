import { describe, expect, it } from "vitest";
import { operatorPasswordRules } from "./password.ts";

describe("the console's temporary password (ADR 0041)", () => {
  it("is 12 characters or more, and allows 50 tries an hour from all addresses together", () => {
    expect(operatorPasswordRules.minLength).toBe(12);
    expect(operatorPasswordRules.triesFromAll).toEqual([{ limit: 50, windowSeconds: 3600 }]);
  });
});
