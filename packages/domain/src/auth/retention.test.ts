import { describe, expect, it } from "vitest";
import { retention, retentionCutoffs } from "./retention.ts";
import { sessionRules } from "./session-tokens.ts";
import { codeSendLimits } from "./sign-in-code.ts";

describe("retention (privacy inventory)", () => {
  it("keeps rate-limit events for 24 hours", () => {
    expect(retention.rateLimitEventsSeconds).toBe(24 * 3600);
  });

  it("keeps ended sessions for 30 days", () => {
    expect(retention.endedSessionsSeconds).toBe(30 * 24 * 3600);
  });

  it("keeps rate-limit events at least as long as the longest limit window", () => {
    const windows = [
      ...codeSendLimits.perNumber,
      ...codeSendLimits.perIpAddress,
      ...codeSendLimits.perCallingCode("354"),
      ...codeSendLimits.perCallingCode("48"),
    ].map((rule) => rule.windowSeconds);
    expect(Math.max(...windows)).toBeLessThanOrEqual(retention.rateLimitEventsSeconds);
  });
});

describe("retentionCutoffs", () => {
  it("gives the times before which each kind of record goes", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    expect(retentionCutoffs(now)).toEqual({
      codesExpiredBefore: now,
      rateLimitEventsBefore: new Date("2026-11-12T12:00:00Z"),
      tokensExpiredBefore: now,
      sessionsIdleSince: new Date(now.getTime() - sessionRules.refreshTokenIdleSeconds * 1000),
      sessionsEndedBefore: new Date("2026-10-14T12:00:00Z"),
    });
  });
});
