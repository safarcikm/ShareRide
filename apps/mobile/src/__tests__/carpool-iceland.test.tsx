import { fireEvent, screen, waitFor } from "expo-router/testing-library";
import { getLocales } from "expo-localization";
import { renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

function deviceLanguage(languageTag: string) {
  (getLocales as jest.Mock).mockReturnValue([{ languageTag }]);
}

beforeEach(() => {
  deviceLanguage("en-GB");
});

// The Carpool in Iceland page (spec 23, 3.9): what PuffinRide is and how
// carpooling with it works, in words, open to everyone.
describe("Carpool in Iceland", () => {
  it("says what PuffinRide is and how carpooling works, section by section", async () => {
    await renderApp("/carpool-iceland");
    expect(await screen.findByRole("header", { name: "Carpool in Iceland" })).toBeVisible();
    expect(screen.getByText(/^PuffinRide is a carpool site for Iceland\./)).toBeVisible();
    for (const heading of [
      "How it works",
      "Meeting points",
      "Where rides go",
      "Who you travel with",
      "Questions",
    ]) {
      expect(screen.getByRole("header", { name: heading })).toBeVisible();
    }
    expect(screen.getByRole("header", { name: "Is PuffinRide a taxi?" })).toBeVisible();
    expect(screen.getByRole("header", { name: "What does samferða mean?" })).toBeVisible();
    expect(screen.getByText(/^No\. Drivers offer seats on a trip/)).toBeVisible();
  });

  it("links to Find, Offer, the meeting points and the community rules", async () => {
    await renderApp("/carpool-iceland");
    await screen.findByRole("header", { name: "Carpool in Iceland" });
    for (const name of [
      "Find a ride",
      "Offer a ride",
      "See the meeting points",
      "Read the community rules",
    ]) {
      expect(screen.getByRole("link", { name })).toBeVisible();
    }
    await fireEvent.press(screen.getByRole("link", { name: "Read the community rules" }));
    await waitFor(() => {
      expect(screen).toHavePathname("/legal/community-rules");
    });
  });

  it("is in Icelandic for an Icelandic device", async () => {
    deviceLanguage("is-IS");
    await renderApp("/carpool-iceland");
    expect(await screen.findByRole("header", { name: "Samferða um Ísland" })).toBeVisible();
    expect(screen.getByRole("header", { name: "Svona virkar þetta" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Skoða mótsstaði" })).toBeVisible();
  });

  it("opens from the front page", async () => {
    await renderApp("/");
    await fireEvent.press(await screen.findByRole("link", { name: "How carpooling works" }));
    expect(await screen.findByRole("header", { name: "Carpool in Iceland" })).toBeVisible();
    expect(screen).toHavePathname("/carpool-iceland");
  });
});
