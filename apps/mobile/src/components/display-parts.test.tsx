import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { colors } from "@/theme/tokens";
import { Card } from "./card";
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
});
