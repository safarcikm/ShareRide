import { createTranslator } from "@shareride/i18n";
import { providerLinkText } from "./provider-link-notice";

const t = createTranslator("en");

describe("providerLinkText", () => {
  it("says what the phone step did with the account", () => {
    expect(providerLinkText(t, { provider: "google", outcome: "linked", email: null })).toBe(
      "Google is now linked to your account. Next time you can continue with Google.",
    );
    expect(
      providerLinkText(t, { provider: "google", outcome: "replaced", email: "anna@example.com" }),
    ).toBe("Your Google account on ShareRide is now anna@example.com.");
    expect(providerLinkText(t, { provider: "apple", outcome: "replaced", email: null })).toBe(
      "Your Apple account on ShareRide has changed.",
    );
    expect(providerLinkText(t, { provider: "apple", outcome: "in_use", email: null })).toBe(
      "This Apple account is used by another ShareRide account.",
    );
  });

  it("says nothing when the account was made with it, or already had it", () => {
    expect(providerLinkText(t, { provider: "google", outcome: "created", email: null })).toBeNull();
    expect(
      providerLinkText(t, { provider: "apple", outcome: "already_linked", email: null }),
    ).toBeNull();
  });
});
