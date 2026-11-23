import { describe, expect, it } from "vitest";
import {
  confirmChannel,
  emailAtPhoneStep,
  emailChangeNeedsCode,
  emailCodeSendLimits,
  emailSignInRules,
  hideEmail,
  textSendLimits,
} from "./email-sign-in.ts";
import { codePurposes } from "./sign-in-code.ts";

describe("email sign-in codes (spec 26, R26.4)", () => {
  it("are a code purpose of their own", () => {
    expect(codePurposes).toContain("email_sign_in");
  });

  it("allow one per 30 seconds and 5 an hour per address, 20 an hour per network address", () => {
    expect(emailCodeSendLimits.perEmail).toEqual([
      { limit: 1, windowSeconds: 30 },
      { limit: 5, windowSeconds: 3600 },
    ]);
    expect(emailCodeSendLimits.perIpAddress).toEqual([{ limit: 20, windowSeconds: 3600 }]);
  });

  it("keep a proven email waiting 30 minutes for the phone step (3.3, item 5)", () => {
    expect(emailSignInRules.waitingSeconds).toBe(30 * 60);
  });
});

describe("textSendLimits (R26.2, R26.3)", () => {
  it("send at most 3 texts for one waiting sign-in", () => {
    expect(textSendLimits.perPendingSignIn).toEqual([{ limit: 3, windowSeconds: 24 * 3600 }]);
  });

  it("cap all texts together at 300 an hour and 1 000 a day", () => {
    expect(textSendLimits.all).toEqual([
      { limit: 300, windowSeconds: 3600 },
      { limit: 1000, windowSeconds: 24 * 3600 },
    ]);
  });
});

describe("emailAtPhoneStep (3.3, item 3)", () => {
  const newEmail = "ana@example.com";

  it("makes the account with the email when the number has none", () => {
    expect(emailAtPhoneStep({ accountEmail: undefined, newEmail, takenByOther: false })).toBe(
      "created",
    );
  });

  it("adds the email to an account without one", () => {
    expect(emailAtPhoneStep({ accountEmail: null, newEmail, takenByOther: false })).toBe("added");
  });

  it("puts it in place of another email (R26.6 tells the old address)", () => {
    expect(
      emailAtPhoneStep({ accountEmail: "old@example.com", newEmail, takenByOther: false }),
    ).toBe("replaced");
  });

  it("leaves an account that already has it as it is", () => {
    expect(emailAtPhoneStep({ accountEmail: newEmail, newEmail, takenByOther: false })).toBe(
      "already",
    );
  });

  it("changes nothing when another account took the email meanwhile", () => {
    expect(emailAtPhoneStep({ accountEmail: null, newEmail, takenByOther: true })).toBe("in_use");
    expect(emailAtPhoneStep({ accountEmail: undefined, newEmail, takenByOther: true })).toBe(
      "in_use",
    );
  });
});

describe("confirmChannel (R26.7)", () => {
  it("sends a confirm code by email to a verified email, by text without one", () => {
    expect(confirmChannel(true)).toBe("email");
    expect(confirmChannel(false)).toBe("sms");
  });
});

describe("emailChangeNeedsCode (R26.5)", () => {
  const createdAt = new Date("2026-11-23T12:00:00Z");
  const later = (minutes: number) => new Date(createdAt.getTime() + minutes * 60_000);
  const account = { createdAt, hasVerifiedEmail: false, signedUp: true };

  it("asks no code within 30 minutes of the account being made", () => {
    expect(emailChangeNeedsCode(account, later(29))).toBe(false);
  });

  it("asks a code from then on", () => {
    expect(emailChangeNeedsCode(account, later(30))).toBe(true);
    expect(emailChangeNeedsCode(account, later(60 * 24))).toBe(true);
  });

  it("asks no code before sign-up is finished, however long it took", () => {
    expect(emailChangeNeedsCode({ ...account, signedUp: false }, later(60 * 24))).toBe(false);
  });

  it("always asks a code to replace a verified email", () => {
    const verified = { ...account, hasVerifiedEmail: true };
    expect(emailChangeNeedsCode(verified, later(1))).toBe(true);
    expect(emailChangeNeedsCode({ ...verified, signedUp: false }, later(1))).toBe(true);
  });
});

describe("hideEmail (3.6, R26.6)", () => {
  it("keeps the first two letters and the domain", () => {
    expect(hideEmail("anna.jons@gmail.com")).toBe("an•••@gmail.com");
  });

  it("keeps one letter of a short name", () => {
    expect(hideEmail("ab@example.is")).toBe("a•••@example.is");
    expect(hideEmail("a@example.is")).toBe("a•••@example.is");
  });
});
