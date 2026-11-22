import { describe, expect, it } from "vitest";
import { outboxEventTypes, retryAt } from "./delivery.ts";
import { defaultNotificationSettings } from "./settings.ts";

describe("trying a failed send again (spec 7, 3.7)", () => {
  const queuedAt = new Date("2026-11-15T12:00:00Z");
  const after = (seconds: number) => new Date(queuedAt.getTime() + seconds * 1000);
  const next = (attempts: number, nowSeconds: number) =>
    retryAt({ queuedAt, attempts }, after(nowSeconds), defaultNotificationSettings);

  it("waits 30 seconds after the first attempt, then twice as long each time", () => {
    expect(next(1, 0)).toEqual(after(30));
    expect(next(2, 30)).toEqual(after(90));
    expect(next(3, 90)).toEqual(after(210));
    expect(next(4, 210)).toEqual(after(450));
  });

  it("gives up once the next try would be more than an hour after it was queued", () => {
    // The seventh try would wait 32 minutes: 3 600 seconds after queuing is the last moment.
    expect(next(7, 1_680)).toEqual(after(3_600));
    expect(next(7, 1_681)).toBeNull();
    expect(next(8, 3_600)).toBeNull();
  });
});

describe("outboxEventTypes", () => {
  it("include a console recovery (spec 22, R22.4)", () => {
    expect(outboxEventTypes).toContain("ConsoleRecovered");
  });
});
