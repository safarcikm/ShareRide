import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { colors } from "@/theme/tokens";
import { Button } from "./button";

const face = () => screen.getByTestId("button-face");

describe("Button", () => {
  it("is a moss button with a darker edge", async () => {
    await render(<Button label="Continue" onPress={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Continue" })).toHaveStyle({
      borderBottomWidth: 4,
      borderBottomColor: colors.light.primaryEdge,
    });
    expect(face()).toHaveStyle({ backgroundColor: colors.light.primary });
    expect(screen.getByText("Continue")).toHaveStyle({
      color: colors.light.onPrimary,
      fontFamily: "Fredoka_600SemiBold",
    });
  });

  it("outlines a secondary button in the control colour", async () => {
    await render(<Button label="Íslenska" variant="secondary" onPress={jest.fn()} />);
    expect(face()).toHaveStyle({ borderColor: colors.light.control, borderWidth: 2 });
  });

  it("keeps the label visible while busy", async () => {
    await render(<Button label="Send code" onPress={jest.fn()} busy />);
    expect(screen.getByText("Send code")).toBeOnTheScreen();
    const button = screen.getByRole("button", { name: "Send code" });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
  });

  it("shows disabled with colours, not opacity", async () => {
    await render(<Button label="Continue" onPress={jest.fn()} disabled />);
    expect(face()).toHaveStyle({ backgroundColor: colors.light.border });
    expect(screen.getByText("Continue")).toHaveStyle({ color: colors.light.textMuted });
    const outer = StyleSheet.flatten(screen.getByRole("button").props.style) as object;
    expect(outer).not.toHaveProperty("opacity");
    expect(outer).toMatchObject({ borderBottomWidth: 0 });
  });

  it("grows with its text instead of a fixed height", async () => {
    await render(<Button label="Continue" onPress={jest.fn()} />);
    const button = screen.getByRole("button");
    expect(button).toHaveStyle({ minHeight: 48 });
    expect(StyleSheet.flatten(button.props.style)).not.toHaveProperty("height");
  });

  it("lets the screen place a text button", async () => {
    await render(<Button label="Íslenska" variant="text" onPress={jest.fn()} />);
    expect(StyleSheet.flatten(screen.getByRole("button").props.style)).not.toHaveProperty(
      "alignSelf",
    );
  });

  it("centres a label that wraps, and lets it shrink beside the spinner", async () => {
    await render(<Button label="Continue" onPress={jest.fn()} busy />);
    expect(screen.getByText("Continue")).toHaveStyle({ textAlign: "center", flexShrink: 1 });
  });

  it("ignores presses while busy or disabled", async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<Button label="Go" onPress={onPress} busy />);
    await fireEvent.press(screen.getByRole("button"));
    await rerender(<Button label="Go" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
