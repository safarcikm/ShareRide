import { fireEvent, screen } from "expo-router/testing-library";
import type { Me } from "@shareride/contracts";
import { failure, ok, testMe } from "@/testing/fake-client";
import { legalDocument, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

const afterLegal: Me = { ...testMe, ageConfirmed: true, missingSteps: ["profile"] };

/** Signs in a new account; the app opens the terms. */
async function openTerms(versions: { terms: number; rules: number } = { terms: 1, rules: 1 }) {
  const app = await renderApp("/", { me: testMe });
  app.client.answer("/v1/legal/{type}/current", (input) => {
    const { type } = input["params"] as { type: string };
    return ok(200, legalDocument(type, type === "terms" ? versions.terms : versions.rules));
  });
  expect(await screen.findByRole("header", { name: "Before you start" })).toBeVisible();
  return app;
}

describe("Terms and age", () => {
  it("asks for both boxes before accepting", async () => {
    const app = await openTerms();
    await fireEvent.press(screen.getByRole("button", { name: "Accept and continue" }));
    expect(await screen.findByText("Tick both boxes to continue.")).toBeVisible();
    await fireEvent.press(screen.getByRole("checkbox", { name: "I am 18 or older" }));
    await fireEvent.press(screen.getByRole("button", { name: "Accept and continue" }));
    expect(await screen.findByText("Tick both boxes to continue.")).toBeVisible();
    expect(app.client.calls.some((call) => call.path === "/v1/me/legal-acceptances")).toBe(false);
  });

  it("records the acceptance with the versions shown and goes on to the profile", async () => {
    const app = await openTerms();
    app.client.answer("/v1/me/legal-acceptances", () => ok(200, afterLegal));
    await fireEvent.press(screen.getByRole("checkbox", { name: "I am 18 or older" }));
    await fireEvent.press(
      screen.getByRole("checkbox", {
        name: "I accept the Terms of Service and the Community Rules",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Accept and continue" }));

    expect(await screen.findByRole("header", { name: "Tell others about you" })).toBeVisible();
    expect(screen).toHavePathname("/onboarding/profile");
    expect(app.client.calls.find((c) => c.path === "/v1/me/legal-acceptances")?.input).toEqual({
      body: {
        ageConfirmed: true,
        documents: [
          { type: "terms", version: 1 },
          { type: "community-rules", version: 1 },
        ],
        locale: "en",
      },
      accessToken: "sr_at_access-1",
    });
  });

  it("shows the new version when the terms changed while reading", async () => {
    const versions = { terms: 1, rules: 1 };
    const app = await openTerms(versions);
    app.client.answer("/v1/me/legal-acceptances", (input) => {
      const body = input["body"] as { documents: { version: number }[] };
      return body.documents[0]?.version === 2
        ? ok(200, afterLegal)
        : failure(409, "legal_version_outdated");
    });
    versions.terms = 2;
    await fireEvent.press(screen.getByRole("checkbox", { name: "I am 18 or older" }));
    await fireEvent.press(
      screen.getByRole("checkbox", {
        name: "I accept the Terms of Service and the Community Rules",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Accept and continue" }));
    expect(await screen.findByText("The terms have just changed. Read them again.")).toBeVisible();
    expect(await screen.findByText("Terms of Service, version 2")).toBeVisible();

    await fireEvent.press(
      screen.getByRole("checkbox", {
        name: "I accept the Terms of Service and the Community Rules",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Accept and continue" }));
    expect(await screen.findByRole("header", { name: "Tell others about you" })).toBeVisible();
  });

  it("asks for the terms before the profile, even when the profile is opened directly", async () => {
    await renderApp("/profile", { me: testMe });
    expect(await screen.findByRole("header", { name: "Before you start" })).toBeVisible();
  });

  it("opens a legal document to read", async () => {
    await openTerms();
    await fireEvent.press(screen.getByRole("link", { name: "Read the Terms of Service" }));
    expect(await screen.findByRole("header", { name: "Terms of Service" })).toBeVisible();
    expect(screen.getByText("Draft text.")).toBeVisible();
    expect(screen).toHavePathname("/legal/terms");
  });
});

describe("Creating a profile", () => {
  async function openProfileForm() {
    const app = await renderApp("/", { me: afterLegal });
    expect(await screen.findByRole("header", { name: "Tell others about you" })).toBeVisible();
    return app;
  }

  it("needs a first name made of letters", async () => {
    const app = await openProfileForm();
    await fireEvent.changeText(screen.getByLabelText("First name"), "Anna 2");
    await fireEvent.press(screen.getByRole("button", { name: "Save profile" }));
    expect(
      await screen.findByText("Use 1 to 30 letters. Spaces, hyphens and apostrophes are fine."),
    ).toBeVisible();
    expect(app.client.calls.some((call) => call.path === "/v1/me" && "body" in call.input)).toBe(
      false,
    );
  });

  it("keeps the about text to 300 characters", async () => {
    await openProfileForm();
    await fireEvent.changeText(screen.getByLabelText("First name"), "Anna");
    await fireEvent.changeText(screen.getByLabelText("About you"), "a".repeat(301));
    expect(screen.getByText("301 of 300")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Keep it to 300 characters.")).toBeVisible();
  });

  it("saves the profile and shows it", async () => {
    const app = await openProfileForm();
    app.client.answer("/v1/me", (input) => {
      const body = input["body"] as Partial<Me> | undefined;
      return ok(200, { ...afterLegal, ...body, missingSteps: [] });
    });
    await fireEvent.changeText(screen.getByLabelText("First name"), "  Anna ");
    await fireEvent.changeText(screen.getByLabelText("About you"), "Coffee and podcasts.");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Icelandic" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
    expect(screen).toHavePathname("/profile");
    expect(screen.getByText("Anna")).toBeVisible();
    expect(screen.getByText("Coffee and podcasts.")).toBeVisible();
    expect(app.client.calls.find((c) => c.path === "/v1/me" && "body" in c.input)?.input).toEqual({
      body: { firstName: "Anna", about: "Coffee and podcasts.", languages: ["is"] },
      accessToken: "sr_at_access-1",
    });
  });
});
