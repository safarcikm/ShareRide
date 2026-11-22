import { fireEvent, screen } from "expo-router/testing-library";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
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

// The app's banners while the operator has paused something (spec 10, 3.3;
// milestone 11, PR 7): where the paused thing starts. Booking's is in
// booking.test.tsx.

const pausedTo = (paused: readonly string[]) => ({
  setUp: (client: FakeClient) => {
    client.answer("/v1/config", () =>
      ok(200, {
        beta: false,
        paused,
        maxSeats: 8,
        freeCancellationMinutes: 15,
        maxMoveMinutes: 120,
        reliabilityMonths: 12,
        signInProviders: [],
      }),
    );
  },
});

const signups =
  "New accounts are paused for a short while. If you already have an account, you can sign in.";
const sms =
  "We can't send text messages right now, so signing in is paused for a short while. Try again later.";
const trips =
  "Posting new trips is paused for a short while. Your trips and drafts are safe. Try again later.";

describe("Step 1 of signing in while something is paused", () => {
  it("shows nothing when nothing is paused", async () => {
    await renderApp("/sign-in");
    expect(await screen.findByLabelText("Mobile number")).toBeVisible();
    expect(screen.queryByText(signups)).toBeNull();
    expect(screen.queryByText(sms)).toBeNull();
  });

  it("says that new accounts are paused, and that members can sign in", async () => {
    await renderApp("/sign-in", pausedTo(["signups"]));
    expect(await screen.findByText(signups)).toBeVisible();
    expect(screen.queryByText(sms)).toBeNull();
    expect(screen.getByRole("button", { name: "Send code" })).toBeEnabled();
  });

  it("says that text messages are paused", async () => {
    await renderApp("/sign-in", pausedTo(["sms"]));
    expect(await screen.findByText(sms)).toBeVisible();
  });

  it("says so when the API refuses a code asked for just as the pause began", async () => {
    await renderApp("/sign-in", {
      setUp: (client) => {
        client.answer("/v1/auth/phone/start", () => failure(503, "sms_paused"), "post");
      },
    });
    await fireEvent.changeText(await screen.findByLabelText("Mobile number"), "6112345");
    await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText(sms)).toBeVisible();
  });
});

describe("Offer while new trips are paused", () => {
  it("says so above the route, and not otherwise", async () => {
    await renderApp("/offer", { me: completeMe, ...pausedTo(["trips"]) });
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(await screen.findByText(trips)).toBeVisible();

    await renderApp("/offer", { me: completeMe, ...pausedTo(["bookings"]) });
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen.queryByText(trips)).toBeNull();
  });
});
