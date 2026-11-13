import { screen } from "expo-router/testing-library";
import { useFonts } from "expo-font";
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
jest.mock("expo-font", () => ({
  ...jest.requireActual<object>("expo-font"),
  useFonts: jest.fn(),
}));

const mockedUseFonts = useFonts as jest.Mock;

beforeEach(() => {
  (getLocales as jest.Mock).mockReturnValue([{ languageTag: "en-GB" }]);
});

describe("Fonts at start", () => {
  it("shows Loading while the fonts load", async () => {
    mockedUseFonts.mockReturnValue([false, null]);
    await renderApp("/");
    expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
    expect(screen.queryByText("Share the ride across Iceland")).toBeNull();
  });

  it("opens the app with system fonts when loading fails", async () => {
    mockedUseFonts.mockReturnValue([false, new Error("offline")]);
    await renderApp("/");
    expect(await screen.findByText("Share the ride across Iceland")).toBeVisible();
  });

  it("opens the app once the fonts are loaded", async () => {
    mockedUseFonts.mockReturnValue([true, null]);
    await renderApp("/");
    expect(await screen.findByText("Share the ride across Iceland")).toBeVisible();
  });
});
