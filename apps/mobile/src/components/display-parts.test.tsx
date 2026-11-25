import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Text } from "react-native";
import { colors } from "@/theme/tokens";
import { ChevronLeft, Share } from "lucide-react-native";
import { Card, useCardCorner } from "./card";
import { IconButton } from "./icon-button";
import { Row } from "./row";
import { Tag } from "./tag";

describe("Tag", () => {
  it.each([
    ["positive", colors.light.primary, colors.light.primarySoft],
    ["warning", colors.light.warning, colors.light.warningSoft],
    ["info", colors.light.info, colors.light.infoSoft],
    ["womenOnly", colors.light.womenOnly, colors.light.womenOnlySoft],
  ] as const)("shows a %s tag as caption text on its tint", async (kind, text, fill) => {
    await render(<Tag kind={kind} label="Sample meeting point" />);
    expect(screen.getByText("Sample meeting point")).toHaveStyle({
      color: text,
      fontFamily: "Nunito_700Bold",
      fontSize: 13,
    });
    expect(screen.getByTestId("tag")).toHaveStyle({ backgroundColor: fill, borderRadius: 12 });
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
    expect(screen.getByTestId("card")).toHaveStyle({
      borderBottomWidth: 3,
      borderBottomColor: colors.light.edge,
    });
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

  it("turns its edge primary under the pointer when it can be pressed (spec 18, 3.4)", async () => {
    await render(
      <Card onPress={jest.fn()} accessibilityLabel="BSÍ, Bus hub">
        <Text>BSÍ</Text>
      </Card>,
    );
    await fireEvent(screen.getByRole("button"), "hoverIn");
    expect(screen.getByTestId("card")).toHaveStyle({
      borderBottomWidth: 3,
      borderBottomColor: colors.light.primary,
    });
    // What sits on tints of its own, such as a tag, keeps the surface under it.
    expect(screen.getByTestId("card-face")).toHaveStyle({ backgroundColor: colors.light.surface });
    await fireEvent(screen.getByRole("button"), "hoverOut");
    expect(screen.getByTestId("card")).toHaveStyle({ borderBottomColor: colors.light.edge });
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
    expect(screen.getByTestId("card")).toHaveStyle({ borderBottomColor: colors.light.primary });
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
    expect(screen.getByTestId("card")).toHaveStyle({ borderBottomColor: colors.light.primary });
    await fireEvent(share, "hoverOut");
    expect(screen.getByTestId("card")).toHaveStyle({ borderBottomColor: colors.light.edge });
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
    expect(quiet).toHaveStyle({ width: 44, height: 44, borderBottomWidth: 0 });
    expect(screen.getByTestId("face")).toHaveStyle({ width: 36, height: 36 });
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
