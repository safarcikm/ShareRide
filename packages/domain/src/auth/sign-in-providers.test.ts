import { describe, expect, it } from "vitest";
import {
  decideLink,
  emailToStore,
  isAppleRelay,
  isAllowedReturnUrl,
  isChallengeShaped,
  providerReturnPath,
  providerSignInRules,
  readProviderClaims,
} from "./sign-in-providers.ts";

describe("providerSignInRules (spec 19, 3.3 item 5)", () => {
  it("gives the provider 10 minutes, the phone step 30 and the ticket 5", () => {
    expect(providerSignInRules.startValidSeconds).toBe(600);
    expect(providerSignInRules.pendingValidSeconds).toBe(1800);
    expect(providerSignInRules.ticketValidSeconds).toBe(300);
    expect(providerSignInRules.startLimits).toEqual([{ limit: 20, windowSeconds: 600 }]);
  });
});

describe("readProviderClaims (R19.4, R19.5)", () => {
  it("keeps the subject, a verified email and a first name", () => {
    expect(
      readProviderClaims({
        claims: {
          sub: "1234567890",
          email: " Ana@Example.com ",
          email_verified: true,
          given_name: "Ana",
          family_name: "Jónsdóttir",
          picture: "https://example.com/a.png",
        },
      }),
    ).toEqual({
      ok: true,
      value: { subject: "1234567890", email: "ana@example.com", firstName: "Ana" },
    });
  });

  it('takes Apple\'s "true" as verified', () => {
    expect(
      readProviderClaims({
        claims: { sub: "a.b.c", email: "x@privaterelay.appleid.com", email_verified: "true" },
      }),
    ).toMatchObject({ ok: true, value: { email: "x@privaterelay.appleid.com" } });
  });

  it.each([false, "false", undefined])("drops an email whose verified flag is %j", (flag) => {
    expect(
      readProviderClaims({ claims: { sub: "s", email: "ana@example.com", email_verified: flag } }),
    ).toMatchObject({ ok: true, value: { email: null } });
  });

  it("drops an email that is not an email address", () => {
    expect(
      readProviderClaims({ claims: { sub: "s", email: "not an email", email_verified: true } }),
    ).toMatchObject({ ok: true, value: { email: null } });
  });

  it("takes Apple's first name from the form's user field, never the last name", () => {
    expect(
      readProviderClaims({
        claims: { sub: "s" },
        appleUser: {
          name: { firstName: " Þóra ", lastName: "Sigurðardóttir" },
          email: "t@example.com",
        },
      }),
    ).toEqual({ ok: true, value: { subject: "s", email: null, firstName: "Þóra" } });
  });

  it.each([
    ["a name the profile rule refuses", { given_name: "R2-D2" }],
    ["a name too long", { given_name: "A".repeat(31) }],
    ["a name that is not text", { given_name: 7 }],
  ])("leaves the first name empty for %s", (_case, extra) => {
    expect(readProviderClaims({ claims: { sub: "s", ...extra } })).toMatchObject({
      ok: true,
      value: { firstName: null },
    });
  });

  it.each([undefined, "", 42, "x".repeat(256)])("refuses the subject %j", (sub) => {
    expect(readProviderClaims({ claims: { sub } })).toEqual({
      ok: false,
      error: { code: "claims_invalid" },
    });
  });
});

describe("decideLink (plan 4.2; R19.1, R19.3)", () => {
  const link = { id: "identity-1", subject: "old-subject" };

  it("makes the account when the number has none and the provider account is free", () => {
    expect(
      decideLink({ via: "phone", accountId: null, subjectOwnerId: null, accountLink: null }),
    ).toEqual({ action: "create" });
  });

  it("refuses a new account for a provider account another account has", () => {
    expect(
      decideLink({ via: "phone", accountId: null, subjectOwnerId: "other", accountLink: null }),
    ).toEqual({ action: "refuse", code: "provider_in_use" });
  });

  it.each(["phone", "settings"] as const)("links a free provider account (%s)", (via) => {
    expect(decideLink({ via, accountId: "me", subjectOwnerId: null, accountLink: null })).toEqual({
      action: "link",
    });
  });

  it.each(["phone", "settings"] as const)("knows a link that is already there (%s)", (via) => {
    expect(
      decideLink({
        via,
        accountId: "me",
        subjectOwnerId: "me",
        accountLink: { id: "i", subject: "s" },
      }),
    ).toEqual({ action: "already_linked" });
  });

  it.each(["phone", "settings"] as const)(
    "refuses a provider account that another account has (%s)",
    (via) => {
      expect(
        decideLink({ via, accountId: "me", subjectOwnerId: "other", accountLink: null }),
      ).toEqual({ action: "refuse", code: "provider_in_use" });
    },
  );

  it("replaces the account's old link after the phone step", () => {
    expect(
      decideLink({ via: "phone", accountId: "me", subjectOwnerId: null, accountLink: link }),
    ).toEqual({ action: "replace", replacedIdentityId: "identity-1" });
  });

  it("refuses a second link of the same provider from Settings", () => {
    expect(
      decideLink({ via: "settings", accountId: "me", subjectOwnerId: null, accountLink: link }),
    ).toEqual({ action: "refuse", code: "provider_already_linked" });
  });
});

describe("emailToStore (R19.4)", () => {
  it("fills an empty email", () => {
    expect(
      emailToStore({ providerEmail: "ana@example.com", accountEmail: null, takenByOther: false }),
    ).toBe("ana@example.com");
  });

  it("never replaces the account's own email", () => {
    expect(
      emailToStore({
        providerEmail: "ana@example.com",
        accountEmail: "ana@work.example",
        takenByOther: false,
      }),
    ).toBeNull();
  });

  it("leaves an email another account has", () => {
    expect(
      emailToStore({ providerEmail: "ana@example.com", accountEmail: null, takenByOther: true }),
    ).toBeNull();
  });

  it("has nothing to store without a verified email", () => {
    expect(
      emailToStore({ providerEmail: null, accountEmail: null, takenByOther: false }),
    ).toBeNull();
  });

  it("swaps the old link's relay address for the new one (spec 19, 3.5)", () => {
    expect(
      emailToStore({
        providerEmail: "new@privaterelay.appleid.com",
        accountEmail: "old@privaterelay.appleid.com",
        replacedLinkEmail: "old@privaterelay.appleid.com",
        takenByOther: false,
      }),
    ).toBe("new@privaterelay.appleid.com");
  });

  it("keeps the account's email when a new Google account takes the old one's place (spec 19, 3.3)", () => {
    expect(
      emailToStore({
        providerEmail: "ana@new.example",
        accountEmail: "ana@example.com",
        replacedLinkEmail: "ana@example.com",
        takenByOther: false,
      }),
    ).toBeNull();
  });
});

describe("isAppleRelay (spec 19, 3.5)", () => {
  it("tells Apple's private relay addresses from others", () => {
    expect(isAppleRelay("abc123@privaterelay.appleid.com")).toBe(true);
    expect(isAppleRelay("ABC123@PrivateRelay.AppleID.com")).toBe(true);
    expect(isAppleRelay("anna@example.com")).toBe(false);
    expect(isAppleRelay("someone@privaterelay.appleid.com.example")).toBe(false);
  });
});

describe("isAllowedReturnUrl (ADR 0034)", () => {
  const allowed = {
    webOrigins: ["https://staging.skinnar.is", "http://localhost:8081"],
    appScheme: "puffinride",
    allowExpoGo: false,
  };

  it("names the return path", () => {
    expect(providerReturnPath).toBe("sign-in/return");
  });

  it.each([
    "https://staging.skinnar.is/sign-in/return",
    "http://localhost:8081/sign-in/return",
    "puffinride://sign-in/return",
  ])("allows %s", (url) => {
    expect(isAllowedReturnUrl(url, allowed)).toBe(true);
  });

  it.each([
    "https://evil.example/sign-in/return",
    "https://staging.skinnar.is.evil.example/sign-in/return",
    "https://staging.skinnar.is/sign-in/return?next=x",
    "https://staging.skinnar.is/sign-in/return#x",
    "https://staging.skinnar.is/other",
    "https://user@staging.skinnar.is/sign-in/return",
    "puffinride://other",
    "exp://192.168.1.5:8081/--/sign-in/return",
    "javascript:alert(1)",
    "not a url",
  ])("refuses %s", (url) => {
    expect(isAllowedReturnUrl(url, allowed)).toBe(false);
  });

  it("allows Expo Go's address only when asked to (development)", () => {
    const url = "exp://192.168.1.5:8081/--/sign-in/return";
    expect(isAllowedReturnUrl(url, { ...allowed, allowExpoGo: true })).toBe(true);
    expect(
      isAllowedReturnUrl("exp://192.168.1.5:8081/--/sign-in/return?x=1", {
        ...allowed,
        allowExpoGo: true,
      }),
    ).toBe(false);
  });
});

describe("isChallengeShaped", () => {
  it("takes a base64url SHA-256 without padding", () => {
    expect(isChallengeShaped("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(true);
  });

  it.each([
    "",
    "short",
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM=",
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw+cM",
  ])("refuses %j", (challenge) => {
    expect(isChallengeShaped(challenge)).toBe(false);
  });
});
