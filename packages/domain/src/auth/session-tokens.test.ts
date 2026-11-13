import { describe, expect, it } from "vitest";
import { decideRefresh, sessionRules } from "./session-tokens.ts";

const t0 = new Date("2026-11-13T12:00:00Z");
const seconds = (n: number) => new Date(t0.getTime() + n * 1000);

describe("decideRefresh (spec 1, section 3.7; ADR 0016)", () => {
  const current = {
    expiresAt: seconds(60 * 24 * 3600),
    rotatedAt: null,
    replacementIsCurrent: false,
    sessionEnded: false,
  };

  it("rotates a current refresh token", () => {
    expect(decideRefresh(current, seconds(10))).toBe("rotate");
  });

  it("treats a token past its expiry as expired", () => {
    expect(decideRefresh(current, seconds(60 * 24 * 3600))).toBe("expired");
  });

  it("refuses any token of an ended session", () => {
    expect(decideRefresh({ ...current, sessionEnded: true }, seconds(10))).toBe("session_ended");
  });

  it("treats reuse of the previous token within 30 seconds as a retry", () => {
    const previous = { ...current, rotatedAt: seconds(0), replacementIsCurrent: true };
    expect(decideRefresh(previous, seconds(30))).toBe("retry");
  });

  it("treats reuse after 30 seconds as theft", () => {
    const previous = { ...current, rotatedAt: seconds(0), replacementIsCurrent: true };
    expect(decideRefresh(previous, seconds(31))).toBe("reuse_detected");
  });

  it("treats reuse of an older token as theft, even within 30 seconds", () => {
    const older = { ...current, rotatedAt: seconds(0), replacementIsCurrent: false };
    expect(decideRefresh(older, seconds(5))).toBe("reuse_detected");
  });

  it("has the lifetimes from spec 1 and ADR 0016", () => {
    expect(sessionRules).toEqual({
      accessTokenSeconds: 15 * 60,
      refreshTokenIdleSeconds: 60 * 24 * 3600,
      retryGraceSeconds: 30,
      endedSessionRetentionDays: 30,
    });
  });
});
