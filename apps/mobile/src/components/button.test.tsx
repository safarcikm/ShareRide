import { fireEvent, render, screen } from "@testing-library/react-native";
import { Plus } from "lucide-react-native";
import { StyleSheet } from "react-native";
import { edgeUnder } from "@/testing/lift";
import { colors } from "@/theme/tokens";
import { Button } from "./button";

const face = () => screen.getByTestId("button-face");

describe("Button", () => {
  it("is a moss button with a darker edge", async () => {
    await render(<Button label="Continue" onPress={jest.fn()} />);
    // The edge is a second face under it, 4 lower, with the room for it kept.
    expect(screen.getByRole("button", { name: "Continue" })).toHaveStyle({ paddingBottom: 4 });
    expect(face()).toHaveStyle({
      backgroundColor: colors.light.primary,
      ...edgeUnder(4, colors.light.primaryEdge),
    });
    expect(screen.getByText("Continue")).toHaveStyle({
      color: colors.light.onPrimary,
      fontFamily: "Fredoka_600SemiBold",
    });
  });

  it("is a red button with a darker edge where it takes something away (spec 31, 3.19)", async () => {
    await render(<Button label="Cancel booking" variant="danger" onPress={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Cancel booking" })).toHaveStyle({
      paddingBottom: 4,
    });
    expect(face()).toHaveStyle({
      backgroundColor: colors.light.error,
      ...edgeUnder(4, colors.light.errorEdge),
    });
    expect(screen.getByText("Cancel booking")).toHaveStyle({ color: colors.light.onError });
  });

  it.each(["primary", "danger"] as const)(
    "counts a %s button as filled, and no other (R31.1)",
    async (variant) => {
      await render(
        <>
          <Button label="Do it" variant={variant} onPress={jest.fn()} />
          <Button label="Keep" variant="secondary" onPress={jest.fn()} />
          <Button label="Back" variant="text" onPress={jest.fn()} />
        </>,
      );
      expect(screen.getAllByTestId("filled-button")).toHaveLength(1);
      expect(screen.getByTestId("filled-button")).toBe(
        screen.getByRole("button", { name: "Do it" }),
      );
    },
  );

  it("shows an icon before the label, in the label's colour and unheard (spec 31, 3.10)", async () => {
    await render(
      <Button label="Offer a ride" variant="secondary" icon={Plus} onPress={jest.fn()} />,
    );
    const icon = screen.getByTestId("button-icon", { includeHiddenElements: true });
    expect(icon).toHaveProp("aria-hidden", true);
    // The first thing on the button's face, before its label.
    expect(face().children[0]).toBe(icon);
    // Named by its label alone.
    expect(screen.getByRole("button", { name: "Offer a ride" })).toBeVisible();
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
    // No edge, and no room for one.
    expect(outer).not.toHaveProperty("paddingBottom");
    expect(StyleSheet.flatten(face().props.style)).not.toHaveProperty("boxShadow");
  });

  it("grows with its text instead of a fixed height", async () => {
    await render(<Button label="Continue" onPress={jest.fn()} />);
    const button = screen.getByRole("button");
    expect(button).toHaveStyle({ minHeight: 48 });
    expect(StyleSheet.flatten(button.props.style)).not.toHaveProperty("height");
  });

  it.each(["primary", "danger", "secondary", "text"] as const)(
    "fits a %s button to its label, in the middle of the column",
    async (variant) => {
      await render(<Button label="Send code" variant={variant} onPress={jest.fn()} />);
      expect(screen.getByRole("button")).toHaveStyle({ alignSelf: "center" });
    },
  );

  it("centres a label that wraps, and lets it shrink beside the spinner", async () => {
    await render(<Button label="Continue" onPress={jest.fn()} busy />);
    expect(screen.getByText("Continue")).toHaveStyle({ textAlign: "center", flexShrink: 1 });
  });

  describe("under the pointer (spec 18, 3.4)", () => {
    it("turns a primary button a step darker, and back", async () => {
      await render(<Button label="Continue" onPress={jest.fn()} />);
      await fireEvent(screen.getByRole("button"), "hoverIn");
      expect(face()).toHaveStyle({ backgroundColor: colors.light.primaryHover });
      expect(screen.getByText("Continue")).toHaveStyle({ color: colors.light.onPrimary });
      await fireEvent(screen.getByRole("button"), "hoverOut");
      expect(face()).toHaveStyle({ backgroundColor: colors.light.primary });
    });

    it("turns a red button a step darker, and back", async () => {
      await render(<Button label="Cancel booking" variant="danger" onPress={jest.fn()} />);
      await fireEvent(screen.getByRole("button"), "hoverIn");
      expect(face()).toHaveStyle({ backgroundColor: colors.light.errorHover });
      expect(screen.getByText("Cancel booking")).toHaveStyle({ color: colors.light.onError });
      await fireEvent(screen.getByRole("button"), "hoverOut");
      expect(face()).toHaveStyle({ backgroundColor: colors.light.error });
    });

    it("tints a secondary button", async () => {
      await render(<Button label="Change" variant="secondary" onPress={jest.fn()} />);
      await fireEvent(screen.getByRole("button"), "hoverIn");
      expect(face()).toHaveStyle({
        backgroundColor: colors.light.primarySoft,
        borderColor: colors.light.control,
      });
    });

    it("underlines a text button", async () => {
      await render(<Button label="Report" variant="text" onPress={jest.fn()} />);
      expect(screen.getByText("Report")).not.toHaveStyle({ textDecorationLine: "underline" });
      await fireEvent(screen.getByRole("button"), "hoverIn");
      expect(screen.getByText("Report")).toHaveStyle({ textDecorationLine: "underline" });
    });

    it("shows nothing on a disabled or busy button, and forgets the pointer", async () => {
      await render(<Button label="Continue" onPress={jest.fn()} />);
      await fireEvent(screen.getByRole("button"), "hoverIn");
      await screen.rerender(<Button label="Continue" onPress={jest.fn()} disabled />);
      expect(face()).toHaveStyle({ backgroundColor: colors.light.border });
      await screen.rerender(<Button label="Continue" onPress={jest.fn()} busy />);
      expect(face()).toHaveStyle({ backgroundColor: colors.light.primary });
      await screen.rerender(<Button label="Continue" onPress={jest.fn()} />);
      expect(face()).toHaveStyle({ backgroundColor: colors.light.primary });
    });
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
