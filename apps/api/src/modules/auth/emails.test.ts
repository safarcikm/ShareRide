import { describe, expect, it } from "vitest";
import { emailChangedContent, signInChangeContent } from "./emails.ts";

const web = "https://app.example.test";

describe("The emails about an account's sign-in", () => {
  it("opens Profile from the notice of a changed email, where Email and Send feedback are", () => {
    const { text, html } = emailChangedContent("en", web, "new-address@example.com");
    expect(text).toContain(`Open in PuffinRide: ${web}/profile\n`);
    expect(html).toContain(`href="${web}/profile"`);
    // Settings is gone (spec 31, 3.14): its address only leads on.
    expect(text).not.toContain(`${web}/settings`);
    expect(text).toContain("ne•••@example.com");
    expect(text).not.toContain("new-address");
  });

  it("opens Sign-in methods from the notice of a changed way to sign in", () => {
    const { text } = signInChangeContent("en", web, { kind: "password_added" });
    expect(text).toContain(`Open in PuffinRide: ${web}/settings/sign-in-methods\n`);
  });
});
