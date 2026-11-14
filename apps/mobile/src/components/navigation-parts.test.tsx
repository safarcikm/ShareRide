import { render, screen } from "@testing-library/react-native";
import { getLocales } from "expo-localization";
import { StyleSheet } from "react-native";
import { renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { colors } from "@/theme/tokens";
import { Screen } from "./screen";
import { Body, Title } from "./text";
import { TextLink } from "./text-link";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  (getLocales as jest.Mock).mockReturnValue([{ languageTag: "en-GB" }]);
});

describe("BackButton", () => {
  it("is a round icon button with a chunky edge and the name Back", async () => {
    await renderApp("/coming-soon");
    const back = await screen.findByRole("button", { name: "Back" });
    expect(back).toHaveStyle({
      width: 44,
      height: 44,
      borderRadius: 999,
      borderBottomWidth: 3,
      borderBottomColor: colors.light.edge,
    });
    expect(screen.getByTestId("back-face")).toHaveStyle({ backgroundColor: colors.light.surface });
    expect(screen.queryByText("Back")).toBeNull();
  });
});

describe("LanguageSwitch", () => {
  it("is a text button in moss", async () => {
    await renderApp("/");
    await screen.findByRole("button", { name: "Change the language to Icelandic" });
    expect(screen.getByText("Íslenska")).toHaveStyle({
      color: colors.light.primary,
      fontFamily: "Nunito_700Bold",
    });
  });
});

describe("TextLink", () => {
  it("underlines links in bold Nunito", async () => {
    await render(<TextLink label="Terms" href="/legal/terms" />);
    expect(screen.getByText("Terms")).toHaveStyle({
      textDecorationLine: "underline",
      fontFamily: "Nunito_700Bold",
      color: colors.light.primary,
    });
    expect(screen.getByRole("link", { name: "Terms" })).toHaveStyle({ alignSelf: "center" });
  });
});

describe("Title and Body", () => {
  it("sets titles in Fredoka and body text in Nunito, centred", async () => {
    await render(
      <>
        <Title>Your trips</Title>
        <Body>Nothing booked yet.</Body>
      </>,
    );
    expect(screen.getByRole("header", { name: "Your trips" })).toHaveStyle({
      fontFamily: "Fredoka_600SemiBold",
      fontSize: 28,
      color: colors.light.text,
      textAlign: "center",
    });
    expect(screen.getByText("Nothing booked yet.")).toHaveStyle({
      fontFamily: "Nunito_400Regular",
      fontSize: 17,
      color: colors.light.textMuted,
      textAlign: "center",
    });
  });

  it("starts long text at the left, for reading", async () => {
    await render(<Body align="start">These terms apply to every trip.</Body>);
    expect(screen.getByText("These terms apply to every trip.")).not.toHaveStyle({
      textAlign: "center",
    });
  });
});

describe("Screen", () => {
  it("pads the screen by 16", async () => {
    await render(
      <Screen>
        <Body>Nothing booked yet.</Body>
      </Screen>,
    );
    const scroll = screen.getByTestId("screen-scroll");
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle as object)).toMatchObject({
      padding: 16,
    });
  });
});
