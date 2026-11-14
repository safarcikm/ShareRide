import { captureException } from "@sentry/react-native";
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { getLocales } from "expo-localization";
import { Text } from "react-native";
import * as RootLayout from "@/app/_layout";
import { readPreference } from "@/lib/preferences";
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

const mockedGetLocales = getLocales as jest.Mock;
const mockedReadPreference = readPreference as jest.Mock;
const mockedCaptureException = captureException as jest.Mock;

/** The real root layout over a screen that breaks the first time it shows. */
async function renderBrokenScreen() {
  const error = new Error("broken screen");
  let broken = true;
  function Screen() {
    if (broken) throw error;
    return <Text>Screen works</Text>;
  }
  await renderRouter({ _layout: RootLayout, index: Screen }, { initialUrl: "/" });
  return {
    error,
    mend: () => {
      broken = false;
    },
  };
}

beforeEach(() => {
  mockedCaptureException.mockClear();
  mockedGetLocales.mockReturnValue([{ languageTag: "en-GB" }]);
  mockedReadPreference.mockResolvedValue(null);
  // React logs the error it caught; the test checks what the app does.
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("A screen that breaks", () => {
  it("is reported, and the person can try again", async () => {
    const { error, mend } = await renderBrokenScreen();

    expect(await screen.findByRole("header", { name: "Something went wrong" })).toBeVisible();
    expect(mockedCaptureException).toHaveBeenCalledWith(error);

    mend();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Screen works")).toBeVisible();
  });

  it("is explained in the language the person chose", async () => {
    mockedReadPreference.mockResolvedValue("is");

    await renderBrokenScreen();

    expect(await screen.findByText("Eitthvað fór úrskeiðis")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reyna aftur" })).toBeVisible();
  });
});
