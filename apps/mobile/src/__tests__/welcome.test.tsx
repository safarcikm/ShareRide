import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { getLocales } from "expo-localization";
import ComingSoon from "@/app/coming-soon";
import Welcome from "@/app/index";
import RootLayout from "@/app/_layout";

jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

const mockedGetLocales = getLocales as jest.Mock;

function deviceLanguage(languageTag: string) {
  mockedGetLocales.mockReturnValue([{ languageTag }]);
}

function renderApp() {
  return renderRouter(
    { _layout: RootLayout, index: Welcome, "coming-soon": ComingSoon },
    { initialUrl: "/" },
  );
}

describe("Welcome", () => {
  it("opens in English on an English device", async () => {
    deviceLanguage("en-GB");
    await renderApp();
    expect(await screen.findByText("Share the ride across Iceland")).toBeVisible();
  });

  it("opens in Icelandic on an Icelandic device", async () => {
    deviceLanguage("is-IS");
    await renderApp();
    expect(await screen.findByText("Samferða um allt Ísland")).toBeVisible();
  });

  it("opens in English on a device in another language", async () => {
    deviceLanguage("pl-PL");
    await renderApp();
    expect(await screen.findByText("Share the ride across Iceland")).toBeVisible();
  });

  it("switches to Icelandic and back with the language button", async () => {
    deviceLanguage("en-GB");
    await renderApp();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Change the language to Icelandic" }),
    );
    expect(await screen.findByText("Samferða um allt Ísland")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Skipta yfir í ensku" }));
    expect(await screen.findByText("Share the ride across Iceland")).toBeVisible();
  });

  it("labels the title as a heading for screen readers", async () => {
    deviceLanguage("en-GB");
    await renderApp();
    expect(
      await screen.findByRole("header", { name: "Share the ride across Iceland" }),
    ).toBeVisible();
  });

  it("leads from Browse trips to the coming-soon page and back", async () => {
    deviceLanguage("en-GB");
    await renderApp();
    await fireEvent.press(await screen.findByRole("button", { name: "Browse trips" }));
    expect(await screen.findByText("Coming soon")).toBeVisible();
    expect(screen).toHavePathname("/coming-soon");
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Share the ride across Iceland")).toBeVisible();
  });
});
