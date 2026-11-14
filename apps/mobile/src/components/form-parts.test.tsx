import { fireEvent, render, screen } from "@testing-library/react-native";
import { colors } from "@/theme/tokens";
import { AccessibilityInfo } from "react-native";
import { Checkbox } from "./checkbox";
import { Chip } from "./chip";
import { FieldError } from "./field-error";
import { Notice } from "./notice";
import { TextField } from "./text-field";

// Icons sit next to text that says the same thing, so they are hidden from
// screen readers; these find them anyway.
const icon = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });
const noIcon = (testID: string) => screen.queryByTestId(testID, { includeHiddenElements: true });

describe("TextField", () => {
  it("outlines the field in the control colour", async () => {
    await render(<TextField label="Phone number" value="" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText("Phone number")).toHaveStyle({
      borderColor: colors.light.control,
      borderWidth: 2,
      minHeight: 52,
      backgroundColor: colors.light.surface,
    });
  });

  it("turns the outline moss while you type in the field", async () => {
    await render(<TextField label="Phone number" value="" onChangeText={jest.fn()} />);
    const input = screen.getByLabelText("Phone number");
    await fireEvent(input, "focus");
    expect(input).toHaveStyle({ borderColor: colors.light.primary });
    await fireEvent(input, "blur");
    expect(input).toHaveStyle({ borderColor: colors.light.control });
  });

  it("keeps the error colour while you type in a field with an error", async () => {
    await render(
      <TextField label="Phone number" value="" onChangeText={jest.fn()} error="Check the number" />,
    );
    const input = screen.getByLabelText("Phone number");
    await fireEvent(input, "focus");
    expect(input).toHaveStyle({ borderColor: colors.light.error });
  });

  it("turns the outline and message to the error colour, with an icon", async () => {
    await render(
      <TextField label="Phone number" value="" onChangeText={jest.fn()} error="Check the number" />,
    );
    expect(screen.getByLabelText("Phone number")).toHaveStyle({ borderColor: colors.light.error });
    expect(screen.getByText("Check the number")).toHaveStyle({ color: colors.light.error });
    expect(icon("field-error-icon")).toBeOnTheScreen();
  });
});

describe("Checkbox", () => {
  it("fills a ticked box with moss and a tick", async () => {
    await render(<Checkbox label="I am 18 or older" checked onChange={jest.fn()} />);
    expect(screen.getByTestId("checkbox-box")).toHaveStyle({
      backgroundColor: colors.light.primary,
      borderBottomColor: colors.light.primaryEdge,
    });
    expect(icon("checkbox-tick")).toBeOnTheScreen();
  });

  it("outlines an empty box in the control colour", async () => {
    const onChange = jest.fn();
    await render(<Checkbox label="I am 18 or older" checked={false} onChange={onChange} />);
    expect(screen.getByTestId("checkbox-box")).toHaveStyle({
      borderColor: colors.light.control,
      width: 26,
      height: 26,
    });
    expect(noIcon("checkbox-tick")).toBeNull();
    await fireEvent.press(screen.getByRole("checkbox", { name: "I am 18 or older" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  // The web journeys check the same on the web build, which drops
  // accessibilityState and needs aria-checked.
  it("tells screen readers whether it is ticked", async () => {
    await render(<Checkbox label="I am 18 or older" checked onChange={jest.fn()} />);
    expect(screen.getByRole("checkbox", { name: "I am 18 or older" })).toBeChecked();
  });
});

describe("Chip", () => {
  it("marks a selected chip with a tick, not only colour", async () => {
    await render(<Chip label="English" selected onToggle={jest.fn()} />);
    expect(screen.getByRole("checkbox", { name: "English" })).toHaveStyle({
      backgroundColor: colors.light.primarySoft,
      borderColor: colors.light.primary,
    });
    expect(icon("chip-tick")).toBeOnTheScreen();
  });

  it("gives a 40 high chip a touch area of at least 44", async () => {
    await render(<Chip label="English" selected={false} onToggle={jest.fn()} />);
    const chip = screen.getByRole("checkbox", { name: "English" });
    expect(chip).toHaveStyle({ minHeight: 40, borderColor: colors.light.control });
    expect(chip.props.hitSlop).toEqual({ top: 2, bottom: 2, left: 0, right: 0 });
    expect(noIcon("chip-tick")).toBeNull();
  });

  it("can be one choice of several, or a suggestion without a state", async () => {
    await render(
      <>
        <Chip role="radio" label="Blue" selected onToggle={jest.fn()} />
        <Chip role="button" label="Toyota" selected={false} onToggle={jest.fn()} />
      </>,
    );
    expect(screen.getByRole("radio", { name: "Blue" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Toyota" })).toBeOnTheScreen();
    expect(screen.queryByRole("checkbox", { name: "Toyota" })).toBeNull();
  });
});

describe("FieldError", () => {
  it("shows nothing until there is an error", async () => {
    await render(<FieldError message={undefined} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is read out once when it appears, in red after an alert icon", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const view = await render(<FieldError message={undefined} />);
    await view.rerender(<FieldError message="Choose a colour." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a colour.");
    expect(screen.getByText("Choose a colour.")).toHaveStyle({ color: colors.light.error });
    expect(icon("field-error-icon")).toBeOnTheScreen();
    await view.rerender(<FieldError message="Choose a colour." />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Choose a colour.");
    announce.mockRestore();
  });
});

describe("Notice", () => {
  it("puts an error on the error fill", async () => {
    await render(<Notice message="That code didn't work." />);
    expect(screen.getByRole("alert", { name: "That code didn't work." })).toHaveStyle({
      backgroundColor: colors.light.errorSoft,
    });
    expect(screen.getByText("That code didn't work.")).toHaveStyle({ color: colors.light.text });
  });

  it("puts information on the info fill", async () => {
    await render(<Notice kind="info" message="We sent a new code." />);
    expect(screen.getByText("We sent a new code.")).toBeOnTheScreen();
    expect(screen.getByTestId("notice")).toHaveStyle({ backgroundColor: colors.light.infoSoft });
  });
});
