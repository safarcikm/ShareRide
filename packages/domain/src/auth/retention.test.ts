import { describe, expect, it } from "vitest";
import { retention, retentionCutoffs } from "./retention.ts";
import { sessionRules } from "./session-tokens.ts";
import { emailCodeSendLimits, textSendLimits } from "./email-sign-in.ts";
import { codeSendLimits } from "./sign-in-code.ts";

describe("retention (privacy inventory)", () => {
  it("keeps rate-limit events for 24 hours", () => {
    expect(retention.rateLimitEventsSeconds).toBe(24 * 3600);
  });

  it("keeps a Google or Apple sign-in an hour after it ended (spec 19, 7)", () => {
    expect(retention.providerSignInsSeconds).toBe(3600);
  });

  it("keeps a waiting email sign-in an hour after it expired (spec 26, 4)", () => {
    expect(retention.emailSignInsSeconds).toBe(3600);
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
      ...emailCodeSendLimits.perEmail,
      ...emailCodeSendLimits.perIpAddress,
      ...textSendLimits.perPendingSignIn,
      ...textSendLimits.all,
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
      emailLinksSentBefore: new Date("2026-11-12T12:00:00Z"),
      providerSignInsExpiredBefore: new Date("2026-11-13T11:00:00Z"),
      emailSignInsExpiredBefore: new Date("2026-11-13T11:00:00Z"),
    });
  });
});
