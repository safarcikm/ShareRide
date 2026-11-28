import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Text } from "react-native";
import { LanguageProvider } from "@/i18n/language";
import { ringInside as webRing } from "@/theme/ring-inside.web";
import { cardFace } from "@/testing/lift";
import { colors } from "@/theme/tokens";
import { ChevronLeft, Pencil, Share, X, Zap } from "lucide-react-native";
import { ActionRows } from "./action-rows";
import { Avatar } from "./avatar";
import { Card, useCardCorner } from "./card";
import { IconButton } from "./icon-button";
import { Row } from "./row";
import { Tag } from "./tag";

/** The colour scheme the parts see; light unless a test says otherwise. */
let mockScheme: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockScheme,
}));

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

afterEach(() => {
  mockScheme = "light";
});

const hidden = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });

describe("Tag", () => {
  const kinds = [
    ["positive", "primary", "primarySoft"],
    ["warning", "warning", "warningSoft"],
    ["info", "info", "infoSoft"],
    ["womenOnly", "womenOnly", "womenOnlySoft"],
    // Nothing is asked of anyone, and a problem (spec 31, 3.3).
    ["plain", "textMuted", "background"],
    ["problem", "error", "errorSoft"],
  ] as const;

  describe.each(["light", "dark"] as const)("in %s", (scheme) => {
    it.each(kinds)("shows a %s tag as caption text on its tint", async (kind, text, fill) => {
      mockScheme = scheme;
      await render(<Tag kind={kind} label="Sample meeting point" />);
      expect(screen.getByText("Sample meeting point")).toHaveStyle({
        color: colors[scheme][text],
        fontFamily: "Nunito_700Bold",
        fontSize: 13,
      });
      expect(screen.getByTestId("tag")).toHaveStyle({
        backgroundColor: colors[scheme][fill],
        borderRadius: 12,
      });
    });
  });

  // On a card in the tag's own tint its fill would not show: there it
  // stands on the white of a surface, as a ticket does (spec 31, 3.12).
  it.each(["light", "dark"] as const)(
    "stands on the surface where the card under it has its tint, in %s",
    async (scheme) => {
      mockScheme = scheme;
      await render(<Tag kind="warning" label="No reviews yet" onTint />);
      expect(screen.getByTestId("tag")).toHaveStyle({ backgroundColor: colors[scheme].surface });
      expect(screen.getByText("No reviews yet")).toHaveStyle({ color: colors[scheme].warning });
    },
  );

  it("puts an icon before its label, in the label's colour", async () => {
    await render(<Tag kind="positive" label="Book instantly" icon={Zap} />);
    const tag = screen.getByTestId("tag");
    expect(tag).toHaveStyle({ flexDirection: "row", alignItems: "center" });
    // The words carry the meaning: a screen reader hears only them.
    expect(hidden("tag-icon")).toBeOnTheScreen();
    expect(screen.queryByTestId("tag-icon")).toBeNull();
    expect(within(tag).getByText("Book instantly")).toBeVisible();
    // A label too long for one line wraps beside the icon.
    expect(within(tag).getByText("Book instantly")).toHaveStyle({ flexShrink: 1 });
  });

  it("has no icon unless it is given one", async () => {
    await render(<Tag kind="positive" label="Book instantly" />);
    expect(screen.queryByTestId("tag-icon", { includeHiddenElements: true })).toBeNull();
  });
});

describe("Avatar", () => {
  it("is 48 round, and 28 when small, as in a ticket's foot (spec 31, 3.3)", async () => {
    await render(
      <LanguageProvider>
        <Avatar firstName="Jón" colour={2} />
      </LanguageProvider>,
    );
    expect(hidden("avatar")).toHaveStyle({ width: 48, height: 48, borderRadius: 999 });
    await screen.rerender(
      <LanguageProvider>
        <Avatar small firstName="Jón" colour={2} />
      </LanguageProvider>,
    );
    expect(hidden("avatar")).toHaveStyle({ width: 28, height: 28, borderRadius: 999 });
    expect(screen.getByText("J", { includeHiddenElements: true })).toHaveStyle({ fontSize: 13 });
  });
});

/** A quiet button in a card's corner that tells the card, as ShareCorner does. */
function ShareInCorner() {
  const card = useCardCorner();
  return <IconButton quiet icon={Share} label="Share BSÍ" onPress={jest.fn()} {...(card ?? {})} />;
}

describe("Card", () => {
  it("is a surface with rounded corners and a chunky bottom edge", async () => {
    await render(
      <Card>
        <Text>Inside</Text>
      </Card>,
    );
    expect(screen.getByTestId("card-face")).toHaveStyle({
      backgroundColor: colors.light.surface,
      borderRadius: 22,
      padding: 16,
    });
    // A hairline round it and a soft shadow under it (spec 15, 4.4).
    expect(screen.getByTestId("card-face")).toHaveStyle(cardFace());
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is a button with a name when it can be pressed", async () => {
    const onPress = jest.fn();
    await render(
      <Card onPress={onPress} accessibilityLabel="BSÍ, Bus hub">
        <Text>BSÍ</Text>
      </Card>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "BSÍ, Bus hub" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("turns its outline primary under the pointer when it can be pressed (spec 18, 3.4)", async () => {
    await render(
      <Card onPress={jest.fn()} accessibilityLabel="BSÍ, Bus hub">
        <Text>BSÍ</Text>
      </Card>,
    );
    await fireEvent(screen.getByRole("button"), "hoverIn");
    expect(screen.getByTestId("card-face")).toHaveStyle(cardFace(colors.light.primary));
    // What sits on tints of its own, such as a tag, keeps the surface under it.
    expect(screen.getByTestId("card-face")).toHaveStyle({ backgroundColor: colors.light.surface });
    await fireEvent(screen.getByRole("button"), "hoverOut");
    expect(screen.getByTestId("card-face")).toHaveStyle(cardFace());
  });

  it("fills the room it is given when asked, as in a grid's row", async () => {
    await render(
      <Card fill onPress={jest.fn()} accessibilityLabel="BSÍ">
        <Text>BSÍ</Text>
      </Card>,
    );
    expect(screen.getByTestId("card")).toHaveStyle({ flexGrow: 1 });
    expect(screen.getByTestId("card-face")).toHaveStyle({ flexGrow: 1 });
    await screen.rerender(
      <Card>
        <Text>BSÍ</Text>
      </Card>,
    );
    expect(screen.getByTestId("card")).not.toHaveStyle({ flexGrow: 1 });
  });

  it("tells when the pointer or the keyboard comes to it", async () => {
    const onHoverIn = jest.fn();
    const onFocus = jest.fn();
    await render(
      <Card onPress={jest.fn()} accessibilityLabel="BSÍ" onHoverIn={onHoverIn} onFocus={onFocus}>
        <Text>BSÍ</Text>
      </Card>,
    );
    await fireEvent(screen.getByRole("button"), "hoverIn");
    expect(onHoverIn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("card-face")).toHaveStyle(cardFace(colors.light.primary));
    await fireEvent(screen.getByRole("button"), "focus");
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it("holds a button of its own in its top right corner (spec 28, 3.1)", async () => {
    const onPress = jest.fn();
    const onShare = jest.fn();
    await render(
      <Card
        onPress={onPress}
        accessibilityLabel="BSÍ"
        corner={<IconButton quiet icon={Share} label="Share BSÍ" onPress={onShare} />}
      >
        <Text>BSÍ</Text>
      </Card>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Share BSÍ" }));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    // Not inside the card's button, where a screen reader could not reach it.
    const card = screen.getByRole("button", { name: "BSÍ" });
    expect(within(card).queryByRole("button", { name: "Share BSÍ" })).toBeNull();
    // The button's 44 tap area 4 from the card's edges, its circle 8.
    expect(screen.getByTestId("card-corner")).toHaveStyle({
      position: "absolute",
      top: 4,
      right: 4,
    });
  });

  it("counts the pointer or the keyboard on its corner as on the card", async () => {
    const onHoverIn = jest.fn();
    const onFocus = jest.fn();
    await render(
      <Card
        onPress={jest.fn()}
        accessibilityLabel="BSÍ"
        onHoverIn={onHoverIn}
        onFocus={onFocus}
        corner={<ShareInCorner />}
      >
        <Text>BSÍ</Text>
      </Card>,
    );
    const share = screen.getByRole("button", { name: "Share BSÍ" });
    await fireEvent(share, "hoverIn");
    expect(onHoverIn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("card-face")).toHaveStyle(cardFace(colors.light.primary));
    await fireEvent(share, "hoverOut");
    expect(screen.getByTestId("card-face")).toHaveStyle(cardFace());
    await fireEvent(share, "focus");
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it("keeps filling its cell with a corner", async () => {
    await render(
      <Card
        fill
        onPress={jest.fn()}
        accessibilityLabel="BSÍ"
        corner={<IconButton quiet icon={Share} label="Share BSÍ" onPress={jest.fn()} />}
      >
        <Text>BSÍ</Text>
      </Card>,
    );
    expect(screen.getByTestId("card-with-corner")).toHaveStyle({ flexGrow: 1 });
    expect(screen.getByTestId("card")).toHaveStyle({ flexGrow: 1 });
  });
});

describe("Row", () => {
  it("is tinted under the pointer (spec 18, 3.4)", async () => {
    await render(<Row title="My cars" value="1" onPress={jest.fn()} />);
    const row = screen.getByRole("button", { name: "My cars, 1" });
    expect(row).not.toHaveStyle({ backgroundColor: colors.light.primarySoft });
    await fireEvent(row, "hoverIn");
    expect(row).toHaveStyle({ backgroundColor: colors.light.primarySoft });
    await fireEvent(row, "hoverOut");
    expect(row).not.toHaveStyle({ backgroundColor: colors.light.primarySoft });
  });

  it("is at least 56 high, with a chevron, and has no icon unless given one", async () => {
    await render(<Row title="My cars" onPress={jest.fn()} />);
    expect(screen.getByRole("button", { name: "My cars" })).toHaveStyle({ minHeight: 56 });
    expect(hidden("row-chevron")).toBeOnTheScreen();
    expect(screen.queryByTestId("row-icon", { includeHiddenElements: true })).toBeNull();
  });

  it("shows its icon in a soft square (spec 31, 3.3)", async () => {
    await render(<Row icon={Pencil} title="Edit the ride" onPress={jest.fn()} />);
    expect(hidden("row-icon")).toHaveStyle({
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.light.background,
    });
  });

  it("is a link when it has an address", async () => {
    await render(<Row icon={Share} title="Share this ride" href="/about" />);
    expect(screen.getByRole("link", { name: "Share this ride" })).toBeVisible();
  });

  it("is a red link when it opens what cannot be undone", async () => {
    await render(<Row danger icon={X} title="Cancel booking" href="/about" />);
    expect(screen.getByRole("link", { name: "Cancel booking" })).toBeVisible();
    expect(screen.getByText("Cancel booking")).toHaveStyle({ color: colors.light.error });
    expect(screen.queryByTestId("row-chevron", { includeHiddenElements: true })).toBeNull();
  });

  it("is one kind of row and takes nothing of another", async () => {
    const onPress = jest.fn();
    const maybe = undefined as "/about" | undefined;
    await render(
      <>
        {/* @ts-expect-error A button is not also a link. */}
        <Row title="Both" onPress={onPress} href="/about" />
        {/* @ts-expect-error A link needs its address. */}
        <Row title="Perhaps" onPress={onPress} href={maybe} />
        {/* @ts-expect-error A row that only shows a value does nothing. */}
        <Row shows title="Shown" onPress={onPress} />
        {/* @ts-expect-error A row that unfolds is not a link. */}
        <Row title="Unfolds" href="/about" expanded={false} onToggle={onPress}>
          <Text>Under</Text>
        </Row>
      </>,
    );
    // Whatever gets past the types, an address that is missing makes no link.
    const perhaps = screen.getByRole("button", { name: "Perhaps" });
    await fireEvent.press(perhaps);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is red and has no chevron when it cannot be undone (R31.3)", async () => {
    const onPress = jest.fn();
    await render(<Row danger icon={X} title="Cancel the ride" onPress={onPress} />);
    const row = screen.getByRole("button", { name: "Cancel the ride" });
    expect(screen.getByText("Cancel the ride")).toHaveStyle({ color: colors.light.error });
    expect(hidden("row-icon")).toHaveStyle({ backgroundColor: colors.light.errorSoft });
    expect(screen.queryByTestId("row-chevron", { includeHiddenElements: true })).toBeNull();
    await fireEvent(row, "hoverIn");
    expect(row).toHaveStyle({ backgroundColor: colors.light.errorSoft });
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("waits while it is disabled: muted, with no tint, saying so, and doing nothing", async () => {
    const onPress = jest.fn();
    await render(<Row disabled icon={Pencil} title="Post the way back" onPress={onPress} />);
    const row = screen.getByRole("button", { name: "Post the way back" });
    expect(row).toBeDisabled();
    expect(screen.getByText("Post the way back")).toHaveStyle({
      color: colors.light.textMuted,
    });
    await fireEvent(row, "hoverIn");
    expect(row).not.toHaveStyle({ backgroundColor: colors.light.primarySoft });
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
    // Its turn comes: it is a row like any other again.
    await screen.rerender(<Row icon={Pencil} title="Post the way back" onPress={onPress} />);
    expect(screen.getByRole("button", { name: "Post the way back" })).toBeEnabled();
    expect(screen.getByText("Post the way back")).toHaveStyle({ color: colors.light.text });
  });

  it("shows that it is working while it is busy, in place of its chevron, and does nothing more", async () => {
    const onPress = jest.fn();
    await render(<Row busy icon={Pencil} title="Take a photo" onPress={onPress} />);
    const row = screen.getByRole("button", { name: "Take a photo" });
    expect(row).toBeDisabled();
    expect(row).toBeBusy();
    expect(within(row).getByTestId("row-busy", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("row-chevron", { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
    // A red row has no chevron, and shows it is working all the same.
    await screen.rerender(<Row busy danger icon={X} title="Remove photo" onPress={onPress} />);
    const red = screen.getByRole("button", { name: "Remove photo" });
    expect(within(red).getByTestId("row-busy", { includeHiddenElements: true })).toBeTruthy();
    // Done: a row like any other again.
    await screen.rerender(<Row icon={Pencil} title="Take a photo" onPress={onPress} />);
    expect(screen.getByRole("button", { name: "Take a photo" })).toBeEnabled();
    expect(screen.queryByTestId("row-busy", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId("row-chevron", { includeHiddenElements: true })).toBeTruthy();
  });

  it("unfolds what is under it, and says whether it is open", async () => {
    const onToggle = jest.fn();
    const row = (expanded: boolean) => (
      <Row title="Gunnar" value="1 seat" expanded={expanded} onToggle={onToggle}>
        <Text>Mjódd to Hella</Text>
      </Row>
    );
    await render(row(false));
    const button = screen.getByRole("button", { name: "Gunnar, 1 seat" });
    expect(button).toBeCollapsed();
    expect(screen.queryByText("Mjódd to Hella")).toBeNull();
    expect(hidden("row-chevron-down")).toBeOnTheScreen();
    await fireEvent.press(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
    await screen.rerender(row(true));
    expect(screen.getByRole("button", { name: "Gunnar, 1 seat" })).toBeExpanded();
    expect(screen.getByText("Mjódd to Hella")).toBeVisible();
    expect(hidden("row-chevron-up")).toBeOnTheScreen();
  });

  it("holds a switch", async () => {
    const onSwitch = jest.fn();
    await render(<Row title="New booking requests" switched={false} onSwitch={onSwitch} />);
    const toggle = screen.getByRole("switch", { name: "New booking requests" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByTestId("switch-track")).toHaveStyle({
      borderColor: colors.light.control,
    });
    expect(screen.queryByTestId("row-chevron", { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(toggle);
    expect(onSwitch).toHaveBeenCalledWith(true);
    await screen.rerender(<Row title="New booking requests" switched onSwitch={onSwitch} />);
    expect(screen.getByRole("switch", { name: "New booking requests" })).toBeChecked();
    expect(screen.getByTestId("switch-track")).toHaveStyle({
      backgroundColor: colors.light.primary,
    });
  });

  it("puts a value that has no room beside its title under it, and never breaks the title for it", async () => {
    await render(<Row title="Free cancellation" value="Up to 15 min before" onPress={jest.fn()} />);
    const words = hidden("row-words");
    expect(words).toHaveStyle({ flexDirection: "row", flexWrap: "wrap", flexGrow: 1 });
    // The title takes the room there is, so a value beside it stands at the row's end.
    expect(within(words).getByText("Free cancellation")).toHaveStyle({
      flexGrow: 1,
      flexBasis: "auto",
    });
    expect(within(words).getByText("Up to 15 min before")).toBeOnTheScreen();
  });

  it("keeps a value of several lines under its title, wherever it is shown", async () => {
    const stops = "09:00  BSÍ bus terminal\n10:00  Borgarnes";
    await render(<Row shows stacked title="Stops" value={stops} />);
    // One under the other, from the left: not beside the title on a wide screen.
    expect(hidden("row-words")).toHaveStyle({ flexDirection: "column", alignItems: "flex-start" });
    expect(screen.getByText(stops)).toBeVisible();
    // The line ends are kept: a match takes any run of spaces and line ends as one space.
    expect(screen.getByText(stops).props.children).toBe(stops);
  });

  it("only shows a value when that is all it does: no button, no chevron", async () => {
    await render(<Row shows title="Phone" value="Confirmed" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Phone")).toBeVisible();
    expect(screen.getByText("Confirmed")).toHaveStyle({ color: colors.light.textMuted });
    expect(screen.queryByTestId("row-chevron", { includeHiddenElements: true })).toBeNull();
  });

  it("is read in one piece by a phone's screen reader when it only shows: the title, then the value", async () => {
    await render(<Row shows title="Phone" value="Confirmed" />);
    const row = screen.getByLabelText("Phone, Confirmed");
    expect(row.props).toMatchObject({ accessible: true });
    expect(within(row).getByText("Phone")).toBeVisible();
    await screen.rerender(<Row shows title="Phone" />);
    expect(screen.getByLabelText("Phone").props).toMatchObject({ accessible: true });
  });
});

describe("ActionRows", () => {
  it("is a card of rows with a line between them (spec 31, 3.3)", async () => {
    const show = false as boolean;
    await render(
      <ActionRows>
        <Row icon={Pencil} title="Edit the ride" onPress={jest.fn()} />
        {show ? <Row icon={Share} title="Hidden" onPress={jest.fn()} /> : null}
        <Row icon={Share} title="Share this ride" onPress={jest.fn()} />
        <Row danger icon={X} title="Cancel the ride" onPress={jest.fn()} />
      </ActionRows>,
    );
    // The rows reach the card's edges, so the card has no padding of its own.
    expect(screen.getByTestId("card-face")).toHaveStyle({
      padding: 0,
      overflow: "hidden",
      backgroundColor: colors.light.surface,
    });
    expect(screen.getByTestId("card-face")).toHaveStyle(cardFace());
    // The lines are the card of rows showing between its rows, 2 wide; a
    // row that is left out leaves none.
    const rows = screen.getByTestId("action-rows");
    expect(rows).toHaveStyle({ gap: 2, backgroundColor: colors.light.border });
    expect(rows.children).toHaveLength(3);
    // Inside the card a row is a surface padded by 16, and its tint reaches the edges.
    const edit = screen.getByRole("button", { name: "Edit the ride" });
    expect(edit).toHaveStyle({
      paddingHorizontal: 16,
      marginHorizontal: 0,
      borderRadius: 0,
      backgroundColor: colors.light.surface,
    });
    await fireEvent(edit, "hoverIn");
    expect(edit).toHaveStyle({ backgroundColor: colors.light.primarySoft });
  });

  it("gives a line to rows in a fragment, and none to a part that shows nothing", async () => {
    const Nothing = () => null;
    await render(
      <ActionRows>
        <>
          <Row shows title="Phone" value="Confirmed" />
          <Row title="Language" value="English" href="/about" />
        </>
        <Nothing />
        <Row title="Gunnar" expanded onToggle={jest.fn()}>
          <Text>Mjódd to Hella</Text>
        </Row>
      </ActionRows>,
    );
    const rows = screen.getByTestId("action-rows").children;
    expect(rows).toHaveLength(3);
    // Each kind of row is a surface, the unfolded one with what is under it.
    for (const row of rows) {
      expect(row).toHaveStyle({ backgroundColor: colors.light.surface });
    }
    expect(within(rows[2] as never).getByText("Mjódd to Hella")).toBeVisible();
  });

  it("draws a row's keyboard focus ring inside it on the web, where the card would cut it off", () => {
    expect(webRing).toEqual({ dataSet: { ring: "inside" } });
  });
});

describe("IconButton", () => {
  const button = (disabled: boolean) => (
    <IconButton
      icon={ChevronLeft}
      label="Back"
      faceTestID="face"
      onPress={jest.fn()}
      disabled={disabled}
    />
  );

  it("is tinted under the pointer (spec 18, 3.4)", async () => {
    await render(button(false));
    await fireEvent(screen.getByRole("button"), "hoverIn");
    expect(screen.getByTestId("face")).toHaveStyle({ backgroundColor: colors.light.primarySoft });
    await fireEvent(screen.getByRole("button"), "hoverOut");
    expect(screen.getByTestId("face")).toHaveStyle({ backgroundColor: colors.light.surface });
  });

  it("is small and quiet when asked, with a tap area of 44 (spec 28, 3.1)", async () => {
    await render(
      <IconButton quiet icon={Share} label="Share" faceTestID="face" onPress={jest.fn()} />,
    );
    // The whole 44 is the button, as the web has no hitSlop; the circle is 36.
    const quiet = screen.getByRole("button", { name: "Share" });
    expect(quiet).toHaveStyle({ width: 44, height: 44 });
    // No edge under it.
    expect(quiet).not.toHaveStyle({ paddingBottom: 3 });
    expect(screen.getByTestId("face")).toHaveStyle({ width: 36, height: 36, boxShadow: undefined });
    expect(screen.getByTestId("face")).not.toHaveStyle({ backgroundColor: colors.light.surface });
    await fireEvent(quiet, "hoverIn");
    expect(screen.getByTestId("face")).toHaveStyle({ backgroundColor: colors.light.primarySoft });
  });

  it("shows nothing while it is disabled, and forgets the pointer", async () => {
    await render(button(false));
    await fireEvent(screen.getByRole("button"), "hoverIn");
    await screen.rerender(button(true));
    expect(screen.getByTestId("face")).toHaveStyle({ backgroundColor: colors.light.border });
    // The pointer left while the button heard nothing of it.
    await screen.rerender(button(false));
    expect(screen.getByTestId("face")).toHaveStyle({ backgroundColor: colors.light.surface });
  });
});
