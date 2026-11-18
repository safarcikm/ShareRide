import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { colors } from "@/theme/tokens";
import { ChevronLeft } from "lucide-react-native";
import { Card } from "./card";
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
