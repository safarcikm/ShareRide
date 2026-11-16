import { describe, expect, it } from "vitest";
import { exportAllowed, exportExpiresAt } from "./export.ts";

describe("download my data (spec 11, 3.2)", () => {
  const now = new Date("2026-11-16T12:00:00Z");

  it("allows the first export", () => {
    expect(exportAllowed(null, now)).toEqual({ ok: true, value: undefined });
  });

  it("allows one export per 24 hours, and says when the next can be asked for", () => {
    expect(exportAllowed(new Date("2026-11-15T13:00:00Z"), now)).toEqual({
      ok: false,
      error: { code: "export_too_soon", retryAfterSeconds: 3600 },
    });
    expect(exportAllowed(new Date("2026-11-15T12:00:00Z"), now).ok).toBe(true);
  });

  it("keeps the file 7 days after it is ready", () => {
    expect(exportExpiresAt(now).toISOString()).toBe("2026-11-23T12:00:00.000Z");
  });
});
