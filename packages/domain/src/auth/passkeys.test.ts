import { describe, expect, it } from "vitest";
import {
  deviceName,
  memberPasskeyRules,
  passkeyOfferDue,
  passkeyOfferRules,
  type PasskeyOfferInput,
} from "./passkeys.ts";

describe("memberPasskeyRules (R27.8, ADR 0048)", () => {
  it("allows 10 devices per account, a challenge for 5 minutes, and 60 sign-in options in 10 minutes (R29.6)", () => {
    expect(memberPasskeyRules).toEqual({
      perAccount: 10,
      challengeSeconds: 300,
      signInOptionsLimits: [{ limit: 60, windowSeconds: 600 }],
    });
  });
});

describe("deviceName (spec 27, 3.6)", () => {
  const agents: Record<string, string> = {
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1":
      "Safari on iPhone",
    "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1":
      "Safari on iPad",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15":
      "Safari on Mac",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36":
      "Chrome on Mac",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36":
      "Chrome on Windows",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0":
      "Edge on Windows",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0":
      "Firefox on Windows",
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36":
      "Chrome on Android",
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36":
      "Samsung Internet on Android",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1":
      "Chrome on iPhone",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36":
      "Chrome on Linux",
  };

  it.each(Object.entries(agents))("names %s", (agent, name) => {
    const named = deviceName(agent);
    expect(named === null ? null : `${named.browser} on ${named.system}`).toBe(name);
  });

  it("gives nothing when it cannot tell", () => {
    expect(deviceName("")).toBeNull();
    expect(deviceName("curl/8.0")).toBeNull();
  });
});

describe("passkeyOfferDue (spec 28, 3.2, R28.2)", () => {
  const now = new Date("2026-11-26T12:00:00.000Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const capable: PasskeyOfferInput = {
    isNewUser: false,
    way: "email",
    deviceHasLock: true,
    serverHasPasskeys: true,
    passkeyHere: false,
    declinedAt: null,
    keptChoice: false,
    now,
  };

  it("asks again 30 days after Not now", () => {
    expect(passkeyOfferRules).toEqual({ askAgainAfterDays: 30 });
  });

  it("offers it after an email code on a browser that can keep one", () => {
    expect(passkeyOfferDue(capable)).toBe(true);
  });

  it.each(["password", "google", "apple"] as const)("offers it after %s too", (way) => {
    expect(passkeyOfferDue({ ...capable, way })).toBe(true);
  });

  it.each<[string, Partial<PasskeyOfferInput>]>([
    ["after a passkey sign-in", { way: "passkey" }],
    ["to a new account, which has Sign in faster next time", { isNewUser: true }],
    ["on a device without its own lock", { deviceHasLock: false }],
    ["by a server without passkeys", { serverHasPasskeys: false }],
    ["on a browser known to have a passkey", { passkeyHere: true }],
    ["with a choice kept through sign-in, which opens instead", { keptChoice: true }],
    ["29 days after Not now", { declinedAt: daysAgo(29) }],
  ])("does not offer it %s", (_name, change) => {
    expect(passkeyOfferDue({ ...capable, ...change })).toBe(false);
  });

  it("offers it again 30 days after Not now", () => {
    expect(passkeyOfferDue({ ...capable, declinedAt: daysAgo(30) })).toBe(true);
  });
});
