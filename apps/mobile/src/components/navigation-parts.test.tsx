import { act, render, screen, within } from "@testing-library/react-native";
import { getLocales } from "expo-localization";
import { Share } from "lucide-react-native";
import type { ReactElement } from "react";
import { Dimensions, StyleSheet } from "react-native";
import { LanguageProvider } from "@/i18n/language";
import { renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { colors } from "@/theme/tokens";
import { IconButton } from "./icon-button";
import { Road } from "./road";
import { Screen } from "./screen";
import { ScreenHead } from "./screen-head";
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

describe("ScreenHead (spec 31, 3.3)", () => {
  const inEnglish = (ui: ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

  it("puts Back before the title, which starts at the left and is the heading", async () => {
    await inEnglish(<ScreenHead title="Your ride to Vík" line="1 request needs your answer." />);
    expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
    const title = screen.getByRole("header", { name: "Your ride to Vík" });
    expect(title).toHaveStyle({ fontFamily: "Fredoka_600SemiBold", fontSize: 28 });
    expect(title).not.toHaveStyle({ textAlign: "center" });
    expect(screen.getAllByRole("header")).toHaveLength(1);
    // At most one line under it, in muted text, at the left like the title.
    const line = screen.getByText("1 request needs your answer.");
    expect(line).toHaveStyle({ fontSize: 17, color: colors.light.textMuted });
    expect(line).not.toHaveStyle({ textAlign: "center" });
    expect(screen.getByTestId("screen-head")).toHaveStyle({
      flexDirection: "row",
      alignItems: "flex-start",
    });
  });

  it("has no Back on a screen with nowhere to go back to", async () => {
    await inEnglish(<ScreenHead back={null} title="My rides" />);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByRole("header", { name: "My rides" })).toBeVisible();
  });

  it("shows small text over the title, such as a ride's day", async () => {
    await inEnglish(<ScreenHead over="Saturday 28 November" title="Selfoss to Vík" />);
    expect(screen.getByText("Saturday 28 November")).toHaveStyle({
      fontSize: 15,
      color: colors.light.textMuted,
    });
  });

  it("holds one more round button at the right", async () => {
    await inEnglish(
      <ScreenHead
        title="Selfoss to Vík"
        action={<IconButton icon={Share} label="Share this ride" onPress={jest.fn()} />}
      />,
    );
    const buttons = within(screen.getByTestId("screen-head")).getAllByRole("button");
    expect(buttons.map((button) => button.props.accessibilityLabel as string)).toEqual([
      "Back",
      "Share this ride",
    ]);
  });

  it("stands a posting step's road beside Back, over the title", async () => {
    await inEnglish(
      <ScreenHead
        title="Check and publish"
        line="This is how people will see your ride."
        road={<Road steps={["Route", "Time", "Seats", "Price", "Check"]} current={4} />}
      />,
    );
    const top = screen.getByTestId("screen-head");
    expect(within(top).getByRole("button", { name: "Back" })).toBeVisible();
    expect(within(top).getByRole("image", { name: "Step 5 of 5: Check" })).toBeVisible();
    expect(screen.getByTestId("screen-head-road")).toHaveStyle({ flex: 1 });
    // The title has the whole width under them.
    expect(within(top).queryByRole("header")).toBeNull();
    expect(screen.getByRole("header", { name: "Check and publish" })).toBeVisible();
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

  describe("on wide screens", () => {
    beforeEach(() => {
      Dimensions.set({ window: { width: 1280, height: 800, scale: 1, fontScale: 1 } });
    });
    afterEach(async () => {
      // The screen is still on show here, so its update goes through act.
      await act(() => {
        Dimensions.set({ window: { width: 750, height: 1334, scale: 2, fontScale: 2 } });
      });
    });

    it("shows an aside beside the column", async () => {
      await render(
        <Screen aside={<Body>Map</Body>}>
          <Body>List</Body>
        </Screen>,
      );
      expect(within(screen.getByTestId("aside")).getByText("Map")).toBeVisible();
      expect(screen.getByText("List")).toBeVisible();
    });

    it("keeps a footer in the bottom bar, with an aside at the side", async () => {
      await render(
        <Screen aside={<Body>Map</Body>} footer={<Body>Book</Body>}>
          <Body>Trip</Body>
        </Screen>,
      );
      expect(within(screen.getByTestId("bottom-bar")).getByText("Book")).toBeVisible();
      expect(within(screen.getByTestId("aside")).getByText("Map")).toBeVisible();
    });
  });

  it("leaves the aside out on phones", async () => {
    await render(
      <Screen aside={<Body>Map</Body>}>
        <Body>List</Body>
      </Screen>,
    );
    expect(screen.queryByText("Map")).toBeNull();
  });
});
