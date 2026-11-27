import { getLocales } from "expo-localization";
import { router } from "expo-router";
import { fireEvent, screen, within } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import { testMe } from "@/testing/fake-client";
import type * as TestApp from "@/testing/app";
import { soonestApi } from "@/testing/search";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({
  getLocales: jest.fn(() => [{ languageTag: "en-GB" }]),
}));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn().mockResolvedValue(null),
  writePreference: jest.fn().mockResolvedValue(undefined),
}));

describe("An address the app does not have (spec 31, 3.21)", () => {
  beforeEach(() => {
    (getLocales as jest.Mock).mockReturnValue([{ languageTag: "en-GB" }]);
  });

  it("says so in the app's look, and leads to Find from the bar", async () => {
    await renderApp("/trips", {
      setUp: (client) => {
        soonestApi(client, []);
      },
    });
    expect(await screen.findByRole("header", { name: "We can't find this page" })).toBeVisible();
    expect(
      screen.getByText("The link may be old, or the address may have a mistake in it."),
    ).toBeVisible();
    // The puffin of a screen with nothing on it, as a picture only.
    expect(screen.getByTestId("puffin-by-pin", { includeHiddenElements: true })).toBeOnTheScreen();
    // Nothing of the router's own page.
    expect(screen.queryByText(/Unmatched Route|Sitemap/)).toBeNull();
    const bar = within(screen.getByTestId("bottom-bar"));
    await fireEvent.press(bar.getByRole("link", { name: "Find a ride" }));
    expect(await screen.findByRole("header", { name: "Share your ride" })).toBeVisible();
    expect(screen).toHavePathname("/");
    // Find takes the page's place: back from Find does not show it again.
    expect(router.canGoBack()).toBe(false);
  });

  it("is there for someone whose account is half set up, and Find leads them on", async () => {
    await renderApp("/trips", { me: { ...testMe, missingSteps: ["legal", "profile"] } });
    expect(await screen.findByRole("header", { name: "We can't find this page" })).toBeVisible();
    await fireEvent.press(
      within(screen.getByTestId("bottom-bar")).getByRole("link", { name: "Find a ride" }),
    );
    // The menu sends them to what their account still needs.
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(screen).toHavePathname("/onboarding/about-you");
  });

  it("is there for an address deep in the app, signed in, in Icelandic", async () => {
    (getLocales as jest.Mock).mockReturnValue([{ languageTag: "is-IS" }]);
    await renderApp("/drive/trips/nothing/here/at-all", { me: completeMe });
    expect(await screen.findByRole("header", { name: "Við finnum ekki þessa síðu" })).toBeVisible();
    expect(screen.getByText("Hlekkurinn gæti verið gamall eða villa í slóðinni.")).toBeVisible();
    expect(
      within(screen.getByTestId("bottom-bar")).getByRole("link", { name: "Finna far" }),
    ).toBeVisible();
  });
});
