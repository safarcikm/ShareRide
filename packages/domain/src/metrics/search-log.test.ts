import { describe, expect, it } from "vitest";
import { searchLogDeletedBefore, searchLogHour, searchLogPlatform } from "./search-log.ts";

describe("searchLogPlatform", () => {
  it("reads the three platforms, in any case", () => {
    expect(searchLogPlatform("ios")).toBe("ios");
    expect(searchLogPlatform(" Android ")).toBe("android");
    expect(searchLogPlatform("web")).toBe("web");
  });

  it("is unknown without the header or with anything else", () => {
    expect(searchLogPlatform(undefined)).toBe("unknown");
    expect(searchLogPlatform("Mozilla/5.0 (iPhone)")).toBe("unknown");
  });
});

describe("searchLogHour", () => {
  it("cuts the time to the start of its hour", () => {
    expect(searchLogHour(new Date("2026-11-18T10:59:59.999Z")).toISOString()).toBe(
      "2026-11-18T10:00:00.000Z",
    );
  });
});

describe("searchLogDeletedBefore", () => {
  it("is 14 months back", () => {
    expect(searchLogDeletedBefore(new Date("2026-11-18T10:30:00.000Z")).toISOString()).toBe(
      "2025-09-18T10:30:00.000Z",
    );
  });
});
