import { createTranslator } from "@shareride/i18n";
import { emailLinkText, providerLinkText } from "./provider-link-notice";

const t = createTranslator("en");

describe("providerLinkText", () => {
  it("says what the phone step did with the account", () => {
    expect(providerLinkText(t, { provider: "google", outcome: "linked", email: null })).toBe(
      "Google is now linked to your account. Next time you can continue with Google.",
    );
    expect(
      providerLinkText(t, { provider: "google", outcome: "replaced", email: "anna@example.com" }),
    ).toBe("Your Google account on PuffinRide is now anna@example.com.");
    expect(providerLinkText(t, { provider: "apple", outcome: "replaced", email: null })).toBe(
      "Your Apple account on PuffinRide has changed.",
    );
    expect(providerLinkText(t, { provider: "apple", outcome: "in_use", email: null })).toBe(
      "This Apple account is used by another PuffinRide account.",
    );
  });

  it("says nothing when the account was made with it, or already had it", () => {
    expect(providerLinkText(t, { provider: "google", outcome: "created", email: null })).toBeNull();
    expect(
      providerLinkText(t, { provider: "apple", outcome: "already_linked", email: null }),
    ).toBeNull();
  });
});

describe("emailLinkText (spec 26, 3.3)", () => {
  it("says when the email was added to the account, or took the old one's place", () => {
    expect(emailLinkText(t, { outcome: "added", email: "anna@example.com" })).toBe(
      "Next time, sign in with anna@example.com.",
    );
    expect(emailLinkText(t, { outcome: "replaced", email: "anna@example.com" })).toBe(
      "Your sign-in email is now anna@example.com.",
    );
  });

  it("says nothing for a new account, the same email, or one another account has", () => {
    for (const outcome of ["created", "already", "in_use"] as const) {
      expect(emailLinkText(t, { outcome, email: "anna@example.com" })).toBeNull();
    }
  });
});
