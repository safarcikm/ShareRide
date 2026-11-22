import { describe, expect, it } from "vitest";
import {
  canRemovePasskey,
  checkSetupLink,
  isRecentlyConfirmed,
  operatorSignInLimitsPerAddress,
  passkeyRules,
  recoveryCodeSendLimits,
} from "./passkeys.ts";

const sentAt = new Date("2026-11-16T22:00:00Z");
const minutes = (count: number) => new Date(sentAt.getTime() + count * 60_000);

describe("checkSetupLink", () => {
  const link = { expiresAt: minutes(30), usedAt: null };

  it("works for 30 minutes", () => {
    expect(passkeyRules.setupLinkMinutes).toBe(30);
    expect(checkSetupLink(link, minutes(29))).toBe("valid");
    expect(checkSetupLink(link, minutes(30))).toBe("expired");
  });

  it("works once", () => {
    expect(checkSetupLink({ ...link, usedAt: minutes(1) }, minutes(2))).toBe("used");
  });
});

describe("canRemovePasskey", () => {
  it("keeps the last passkey, so the operator can still sign in", () => {
    expect(canRemovePasskey(1)).toBe(false);
    expect(canRemovePasskey(2)).toBe(true);
  });
});

describe("operator sign-in limits", () => {
  it("allow a few tries a minute and stop guessing over an hour", () => {
    expect(operatorSignInLimitsPerAddress).toEqual([
      { limit: 10, windowSeconds: 60 },
      { limit: 60, windowSeconds: 3600 },
    ]);
  });

  it("give a challenge 5 minutes to be answered", () => {
    expect(passkeyRules.challengeSeconds).toBe(300);
  });
});

describe("isRecentlyConfirmed", () => {
  it("lets passkeys change for 5 minutes after a passkey was used", () => {
    expect(isRecentlyConfirmed(sentAt, minutes(0))).toBe(true);
    expect(isRecentlyConfirmed(sentAt, new Date(minutes(5).getTime() - 1))).toBe(true);
    expect(isRecentlyConfirmed(sentAt, minutes(5))).toBe(false);
  });
});

describe("recoveryCodeSendLimits (spec 22, R22.6)", () => {
  it("allow one recovery code per 30 seconds and 5 an hour per number", () => {
    expect(recoveryCodeSendLimits.perNumber).toEqual([
      { limit: 1, windowSeconds: 30 },
      { limit: 5, windowSeconds: 3600 },
    ]);
  });
});
