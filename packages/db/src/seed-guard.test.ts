import { describe, expect, it } from "vitest";
import { seedRefusal } from "./seed-guard.ts";

describe("seedRefusal", () => {
  it("allows the draft documents locally and on staging", () => {
    expect(seedRefusal({ NODE_ENV: "development" })).toBeNull();
    expect(seedRefusal({ NODE_ENV: "development", APP_ENV: "local" })).toBeNull();
    expect(seedRefusal({ NODE_ENV: "production", APP_ENV: "staging" })).toBeNull();
  });

  it("refuses production, however it is named", () => {
    expect(seedRefusal({ NODE_ENV: "production" })).toMatch(/not for production/);
    expect(seedRefusal({ NODE_ENV: "production", APP_ENV: "production" })).toMatch(
      /not for production/,
    );
    expect(seedRefusal({ NODE_ENV: "development", APP_ENV: "production" })).toMatch(
      /not for production/,
    );
  });

  it("refuses an APP_ENV it does not know", () => {
    expect(seedRefusal({ NODE_ENV: "production", APP_ENV: "prod" })).toMatch(/APP_ENV/);
  });
});
