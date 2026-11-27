import { fireEvent, screen, waitFor } from "expo-router/testing-library";
import { Linking } from "react-native";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { soonestApi } from "@/testing/search";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

// "Update PuffinRide" (spec 32, 3.6, section 5 and R32.4): an app older
// than the oldest version the API serves shows that screen and nothing else.

/** The operator's settings, with this oldest app version. */
function oldestIs(oldestAppVersion: string | null) {
  return (client: FakeClient) => {
    client.answer("/v1/config", () =>
      ok(200, {
        beta: false,
        paused: [],
        maxSeats: 8,
        freeCancellationMinutes: 15,
        maxMoveMinutes: 120,
        reliabilityMonths: 12,
        signInProviders: [],
        emailSignIn: true,
        oldestAppVersion,
      }),
    );
    soonestApi(client, []);
  };
}

let openURL: jest.SpyInstance;

beforeEach(() => {
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

afterEach(() => {
  openURL.mockRestore();
});

describe("Update PuffinRide (spec 32, 3.6)", () => {
  it("on an iPhone below the oldest version, shows only the update, which opens the App Store", async () => {
    await renderApp("/", {
      device: { platform: "ios", appVersion: "1.0.0" },
      setUp: oldestIs("1.1.0"),
    });
    expect(await screen.findByRole("header", { name: "Update PuffinRide" })).toBeVisible();
    expect(
      screen.getByText("This version no longer works. The new one is waiting in the store."),
    ).toBeVisible();
    // The puffin, as a picture only.
    expect(screen.getByTestId("puffin-by-pin", { includeHiddenElements: true })).toBeOnTheScreen();
    // No menu, no Back, no way past it.
    expect(screen.queryByTestId("tab-bar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.queryByRole("header", { name: "Share your ride" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Open the App Store" }));
    expect(openURL).toHaveBeenCalledWith("itms-apps://apps.apple.com/app/id6840158626");
  });

  it("on Android, opens Google Play, and its web page where the store app does not open", async () => {
    openURL.mockRejectedValueOnce(new Error("No Play Store"));
    await renderApp("/", {
      device: { platform: "android", appVersion: "1.0.0" },
      setUp: oldestIs("1.0.1"),
    });
    expect(await screen.findByRole("header", { name: "Update PuffinRide" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Open Google Play" }));
    expect(openURL).toHaveBeenNthCalledWith(1, "market://details?id=is.puffinride.app");
    await waitFor(() => {
      expect(openURL).toHaveBeenNthCalledWith(
        2,
        "https://play.google.com/store/apps/details?id=is.puffinride.app",
      );
    });
  });

  it("stands in front of every screen, signed in too", async () => {
    await renderApp("/profile", {
      me: completeMe,
      device: { platform: "ios", appVersion: "1.0.0" },
      setUp: oldestIs("2.0.0"),
    });
    expect(await screen.findByRole("header", { name: "Update PuffinRide" })).toBeVisible();
    expect(screen.queryByTestId("tab-bar")).toBeNull();
  });

  it("lets the oldest version itself and newer ones in", async () => {
    await renderApp("/", {
      device: { platform: "ios", appVersion: "1.1.0" },
      setUp: oldestIs("1.1.0"),
    });
    expect(await screen.findByRole("header", { name: "Share your ride" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Update PuffinRide" })).toBeNull();
  });

  it("lets every version in while the API names no oldest one", async () => {
    await renderApp("/", {
      device: { platform: "android", appVersion: "0.0.1" },
      setUp: oldestIs(null),
    });
    expect(await screen.findByRole("header", { name: "Share your ride" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Update PuffinRide" })).toBeNull();
  });

  it("never shows on the website, which is always the newest", async () => {
    await renderApp("/", {
      device: { platform: "web", appVersion: "1.0.0" },
      setUp: (client) => {
        oldestIs("9.0.0")(client);
        // The website asks with its cookie, and has none: signed out.
        client.answer("/v1/auth/refresh", () => failure(401, "invalid_refresh_token"));
      },
    });
    expect(await screen.findByRole("header", { name: "Share your ride" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Update PuffinRide" })).toBeNull();
  });
});
