import { fireEvent, screen, waitFor } from "expo-router/testing-library";
import { getLocales } from "expo-localization";
import { aboutPage, createTranslator } from "@shareride/i18n";
import { Linking } from "react-native";
import { completeMe, renderApp } from "@/testing/app";
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

const en = createTranslator("en");

function deviceLanguage(languageTag: string) {
  (getLocales as jest.Mock).mockReturnValue([{ languageTag }]);
}

let openURL: jest.SpyInstance;

beforeEach(() => {
  deviceLanguage("en-GB");
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

afterEach(() => {
  openURL.mockRestore();
});

// The About page (spec 30, 3.1 and 3.2): what PuffinRide is, the legal
// documents, who runs it and how to reach us, open to everyone.
describe("About PuffinRide", () => {
  it("says what PuffinRide is, who runs it and how to reach us", async () => {
    await renderApp("/about");
    expect(await screen.findByRole("header", { name: "About PuffinRide" })).toBeVisible();
    expect(screen.getByText(/^PuffinRide is carpooling across Iceland\./)).toBeVisible();
    expect(screen.getByText(/^PuffinRide is in an open beta/)).toBeVisible();
    for (const heading of ["Terms and policies", "Who runs PuffinRide", "Contact us"]) {
      expect(screen.getByRole("header", { name: heading })).toBeVisible();
    }
    // In the words of the published Terms (R30.2), which a test of the API checks.
    expect(screen.getByText(en(aboutPage.operator))).toBeVisible();
    expect(screen.getByRole("link", { name: "admin@puffinride.is" })).toBeVisible();
    expect(screen.getByRole("link", { name: "PuffinRide on Facebook" })).toBeVisible();
    expect(screen.getByRole("link", { name: "PuffinRide on Instagram" })).toBeVisible();
  });

  it("opens each document and Cookies", async () => {
    await renderApp("/about");
    await screen.findByRole("header", { name: "About PuffinRide" });
    for (const name of ["Terms of Service", "Community Rules", "Privacy Policy", "Cookies"]) {
      expect(screen.getByRole("link", { name })).toBeVisible();
    }
    await fireEvent.press(screen.getByRole("link", { name: "Privacy Policy" }));
    await waitFor(() => {
      expect(screen).toHavePathname("/legal/privacy");
    });
  });

  it("links to Carpool in Iceland", async () => {
    await renderApp("/about");
    await fireEvent.press(await screen.findByRole("link", { name: "How carpooling works" }));
    expect(await screen.findByRole("header", { name: "Carpool in Iceland" })).toBeVisible();
  });

  it("writes an email to our address and opens our Facebook Page and Instagram", async () => {
    await renderApp("/about");
    await fireEvent.press(await screen.findByRole("link", { name: "admin@puffinride.is" }));
    expect(openURL).toHaveBeenCalledWith("mailto:admin@puffinride.is");
    await fireEvent.press(screen.getByRole("link", { name: "PuffinRide on Facebook" }));
    expect(openURL).toHaveBeenCalledWith("https://www.facebook.com/profile.php?id=61597055066444");
    await fireEvent.press(screen.getByRole("link", { name: "PuffinRide on Instagram" }));
    expect(openURL).toHaveBeenCalledWith("https://www.instagram.com/puffinride.is/");
  });

  it("is in Icelandic for an Icelandic device", async () => {
    deviceLanguage("is-IS");
    await renderApp("/about");
    expect(await screen.findByRole("header", { name: "Um PuffinRide" })).toBeVisible();
    expect(screen.getByRole("header", { name: "Hver rekur PuffinRide" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Notendaskilmálar" })).toBeVisible();
  });

  it("goes Back to Profile when opened on its own", async () => {
    await renderApp("/about");
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => {
      expect(screen).toHavePathname("/profile");
    });
  });

  it("is where the old page's address leads", async () => {
    await renderApp("/legal");
    expect(await screen.findByRole("header", { name: "About PuffinRide" })).toBeVisible();
    expect(screen).toHavePathname("/about");
  });

  // On the website an address's ?lang= chooses the language (spec 23, 3.5).
  it("keeps the language the old address asked for", async () => {
    await renderApp("/legal?lang=is");
    expect(await screen.findByRole("header", { name: "About PuffinRide" })).toBeVisible();
    expect(screen).toHavePathname("/about");
    expect(screen).toHaveSearchParams({ lang: "is" });
  });

  it("opens from Profile, signed in", async () => {
    await renderApp("/profile", { me: completeMe });
    await fireEvent.press(await screen.findByRole("link", { name: "About PuffinRide" }));
    expect(await screen.findByRole("header", { name: "About PuffinRide" })).toBeVisible();
    expect(screen).toHavePathname("/about");
  });
});
