import { screen } from "expo-router/testing-library";
import type { SignInMethod } from "@shareride/contracts";
import { ok, type FakeClient } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
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
jest.mock("@/sign-in/return-address", () => ({
  providerReturnUrl: () => "puffinride://sign-in/return",
}));
jest.mock("@/sign-in/platform", () => ({ signInPlatform: () => "ios" }));

// The iPhone app offers Google only beside Sign in with Apple (spec 32, 3.3;
// R32.5), as Apple's guideline 4.8 asks. Until Apple comes, members who
// joined with Google sign in there with an email code to their Google address.

const withProviders = (providers: readonly string[]) => (client: FakeClient) => {
  client.answer("/v1/config", () =>
    ok(200, {
      beta: false,
      paused: [],
      maxSeats: 8,
      freeCancellationMinutes: 15,
      maxMoveMinutes: 120,
      reliabilityMonths: 12,
      signInProviders: providers,
      emailSignIn: true,
    }),
  );
};

const googleNote =
  "Joined with Google? Type your Google email and we'll email you a code. If that doesn't work, sign in once on puffinride.is with Google and add an email.";

describe("Signing in on the iPhone (spec 32, 3.3)", () => {
  it("offers no Google without Apple beside it, and says how members who joined with Google sign in", async () => {
    await renderApp("/sign-in", { setUp: withProviders(["google"]) });
    expect(await screen.findByText(googleNote)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send code" })).toBeVisible();
    expect(
      screen.getByText(
        "Joined with your phone number? Use your email, then the same number. It's added to your account.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Use your email or Google/)).toBeNull();
  });

  it("offers Google beside Sign in with Apple, with no note", async () => {
    await renderApp("/sign-in", { setUp: withProviders(["google", "apple"]) });
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeVisible();
    expect(screen.queryByText(googleNote)).toBeNull();
  });

  it("lists a linked Google in Sign-in methods to remove, but offers none to add", async () => {
    const googleMethod: SignInMethod = {
      provider: "google",
      email: "anna@example.com",
      linkedAt: "2026-11-22T12:00:00.000Z",
    };
    await renderApp("/settings/sign-in-methods", {
      me: completeMe,
      setUp: (client) => {
        withProviders(["google"])(client);
        client.answer(
          "/v1/me/sign-in-methods",
          () => ok(200, { passkeys: [], methods: [googleMethod] }),
          "get",
        );
      },
    });
    expect(await screen.findByRole("button", { name: "Remove Google" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add Google" })).toBeNull();
  });

  it("offers no Google to add in Sign-in methods when none is linked", async () => {
    await renderApp("/settings/sign-in-methods", {
      me: completeMe,
      setUp: (client) => {
        withProviders(["google"])(client);
        client.answer(
          "/v1/me/sign-in-methods",
          () => ok(200, { passkeys: [], methods: [] }),
          "get",
        );
      },
    });
    expect(await screen.findByRole("header", { name: "Sign-in methods" })).toBeVisible();
    expect(await screen.findByRole("button", { name: /email$/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add Google" })).toBeNull();
    expect(screen.queryByText("Google")).toBeNull();
  });
});
