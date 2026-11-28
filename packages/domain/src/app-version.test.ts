import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isAppVersion, isOlderThan } from "./app-version.ts";

describe("isOlderThan (spec 32, R32.4)", () => {
  it("compares the numbers part by part, as numbers", () => {
    expect(isOlderThan("1.0.0", "1.0.1")).toBe(true);
    expect(isOlderThan("1.0.9", "1.1.0")).toBe(true);
    expect(isOlderThan("1.9.0", "1.10.0")).toBe(true);
    expect(isOlderThan("0.9.9", "1.0.0")).toBe(true);
    expect(isOlderThan("2.0.0", "10.0.0")).toBe(true);
  });

  it("lets the oldest version itself and every newer one through", () => {
    expect(isOlderThan("1.0.0", "1.0.0")).toBe(false);
    expect(isOlderThan("1.0.1", "1.0.0")).toBe(false);
    expect(isOlderThan("1.10.0", "1.9.0")).toBe(false);
    expect(isOlderThan("2.0.0", "1.99.99")).toBe(false);
  });

  it("never blocks without an oldest version, or with one it cannot read", () => {
    expect(isOlderThan("1.0.0", null)).toBe(false);
    expect(isOlderThan("1.0.0", "")).toBe(false);
    expect(isOlderThan("1.0.0", "2")).toBe(false);
    expect(isOlderThan("1.0.0", "2.0")).toBe(false);
    expect(isOlderThan("1.0.0", "2.0.0-beta")).toBe(false);
    expect(isOlderThan("1.0.0", " 2.0.0")).toBe(false);
    expect(isOlderThan("1.0.0", "v2.0.0")).toBe(false);
  });

  it("never blocks an app whose own version it cannot read", () => {
    expect(isOlderThan("", "1.0.0")).toBe(false);
    expect(isOlderThan("1.0", "1.0.0")).toBe(false);
    expect(isOlderThan("unknown", "1.0.0")).toBe(false);
  });

  it("finds no version older than itself, and of two different ones exactly one older", () => {
    const part = fc.integer({ min: 0, max: 999 });
    const version = fc.tuple(part, part, part).map((parts) => parts.join("."));
    fc.assert(
      fc.property(version, version, (a, b) => {
        expect(isOlderThan(a, a)).toBe(false);
        if (a === b) return;
        expect(isOlderThan(a, b)).not.toBe(isOlderThan(b, a));
      }),
    );
  });
});

describe("isAppVersion", () => {
  it("reads three whole numbers with dots between, as the apps' versions are", () => {
    expect(isAppVersion("1.0.0")).toBe(true);
    expect(isAppVersion("12.3.45")).toBe(true);
    expect(isAppVersion("1.0")).toBe(false);
    expect(isAppVersion("1.0.0.0")).toBe(false);
    expect(isAppVersion("01.0.0")).toBe(false);
    expect(isAppVersion("1.0.0-beta")).toBe(false);
    expect(isAppVersion("")).toBe(false);
  });
});
