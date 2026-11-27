import { screen } from "expo-router/testing-library";
import { getLocales } from "expo-localization";
import { StatusBar } from "expo-status-bar";
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
jest.mock("expo-status-bar", () => ({ StatusBar: jest.fn(() => null) }));

beforeEach(() => {
  (getLocales as jest.Mock).mockReturnValue([{ languageTag: "en-GB" }]);
});

// The phone's clock and battery, over the top of every page: dark on the
// light look and light on the dark one, as the app follows the phone. On
// Android they were left white over the light sky of Find.
describe("The phone's status bar", () => {
  it("takes the colours of the app's light or dark look", async () => {
    await renderApp("/");
    await screen.findByRole("header", { name: "Share your ride" });
    const bar = jest.mocked(StatusBar);
    expect(bar).toHaveBeenCalled();
    for (const [props] of bar.mock.calls) expect(props).toEqual({ style: "auto" });
  });
});
