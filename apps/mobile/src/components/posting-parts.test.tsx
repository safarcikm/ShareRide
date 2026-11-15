import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Text } from "react-native";
import { LanguageProvider } from "@/i18n/language";
import { colors } from "@/theme/tokens";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { PriceLevel } from "./price-level";
import { RadioCard } from "./radio-card";
import { Screen } from "./screen";
import { StepProgress } from "./step-progress";
import { Stepper } from "./stepper";
import { Switch } from "./switch";

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

const inEnglish = (ui: ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

describe("Switch (spec 15, 5.2)", () => {
  it("is a switch whose track turns moss when on", async () => {
    const onChange = jest.fn();
    await inEnglish(<Switch label="Borgarnes" value={false} onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Borgarnes" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByTestId("switch-track")).toHaveStyle({
      borderColor: colors.light.control,
      backgroundColor: colors.light.surface,
    });
    await fireEvent.press(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows on with a moss track and a white thumb at the end", async () => {
    await inEnglish(<Switch label="Borgarnes" value onChange={jest.fn()} />);
    expect(screen.getByRole("switch", { name: "Borgarnes" })).toBeChecked();
    expect(screen.getByTestId("switch-track")).toHaveStyle({
      backgroundColor: colors.light.primary,
    });
    expect(screen.getByTestId("switch-thumb")).toHaveStyle({
      backgroundColor: colors.light.onPrimary,
      alignSelf: "flex-end",
    });
  });
});

describe("Stepper", () => {
  it("changes the value by one within its limits", async () => {
    const onChange = jest.fn();
    await inEnglish(
      <Stepper
        label="Seats offered"
        value={8}
        min={1}
        max={8}
        onChange={onChange}
        valueText="8 seats"
        fewerLabel="One seat fewer"
        moreLabel="One seat more"
      />,
    );
    expect(screen.getByRole("button", { name: "One seat more" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "One seat fewer" }));
    expect(onChange).toHaveBeenCalledWith(7);
    // Phones read it as one control: swipe up for one more.
    const adjustable = screen.getByRole("adjustable", { name: "Seats offered" });
    expect(adjustable).toHaveAccessibilityValue({ now: 8, text: "8 seats" });
    await fireEvent(adjustable, "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });
    expect(onChange).toHaveBeenLastCalledWith(7);
  });
});

describe("RadioCard", () => {
  it("is a radio whose outline and dot turn moss when selected", async () => {
    await inEnglish(
      <RadioCard
        title="Instant booking"
        help="People book straight away."
        selected
        onSelect={jest.fn()}
      />,
    );
    expect(
      screen.getByRole("radio", { name: "Instant booking. People book straight away." }),
    ).toBeChecked();
    expect(screen.getByTestId("radio-card-face")).toHaveStyle({
      borderColor: colors.light.primary,
    });
    expect(screen.getByTestId("radio-dot")).toBeOnTheScreen();
  });
});

describe("StepProgress", () => {
  it("says the step and fills its bars up to it", async () => {
    await inEnglish(<StepProgress step={3} total={5} />);
    expect(screen.getByText("Step 3 of 5")).toBeVisible();
    const bars = screen.getAllByTestId("step-bar", { includeHiddenElements: true });
    expect(bars.map((bar) => (bar.props.style as object[]).at(-1))).toEqual([
      { backgroundColor: colors.light.primary },
      { backgroundColor: colors.light.primary },
      { backgroundColor: colors.light.primary },
      { backgroundColor: colors.light.border },
      { backgroundColor: colors.light.border },
    ]);
  });
});

describe("PriceLevel", () => {
  it("moves a step at a time between free and the highest level", async () => {
    const onChange = jest.fn();
    await inEnglish(
      <PriceLevel
        level={0}
        highest={110}
        step={10}
        suggested={100}
        onChange={onChange}
        valueText="Free, the whole route costs 0 ISK"
      />,
    );
    expect(screen.getByTestId("price-level-value")).toHaveTextContent("Free");
    expect(screen.getByRole("button", { name: "Lower the price" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Raise the price" }));
    expect(onChange).toHaveBeenCalledWith(10);
    expect(screen.getByRole("adjustable", { name: "Price level" })).toHaveAccessibilityValue({
      text: "Free, the whole route costs 0 ISK",
    });
  });

  it("picks the step tapped on the track, without reading the tap's position", async () => {
    const onChange = jest.fn();
    await inEnglish(
      <PriceLevel
        level={100}
        highest={200}
        step={10}
        suggested={100}
        onChange={onChange}
        valueText="100%, the whole route costs 3,000 ISK"
      />,
    );
    // The web hands a mouse event with no locationX; each step has its own place.
    // The track is hidden from screen readers, which use minus and plus.
    const hidden = { includeHiddenElements: true };
    await fireEvent.press(screen.getByTestId("price-step-80", hidden), { nativeEvent: {} });
    expect(onChange).toHaveBeenLastCalledWith(80);
    await fireEvent.press(screen.getByTestId("price-step-200", hidden), { nativeEvent: {} });
    expect(onChange).toHaveBeenLastCalledWith(200);
    expect(screen.queryByTestId("price-step-210", hidden)).toBeNull();
    expect(onChange.mock.calls.every(([level]) => Number.isFinite(level))).toBe(true);
  });

  it("stops at the highest level", async () => {
    await inEnglish(
      <PriceLevel
        level={110}
        highest={110}
        step={10}
        suggested={100}
        onChange={jest.fn()}
        valueText="110%"
      />,
    );
    expect(screen.getByRole("button", { name: "Raise the price" })).toBeDisabled();
    expect(screen.getByTestId("price-fill", { includeHiddenElements: true })).toHaveStyle({
      width: "100%",
    });
  });
});

describe("Calendar", () => {
  const first = { year: 2026, month: 11, day: 14 };
  const last = { year: 2027, month: 1, day: 13 };

  it("picks a day in range and moves between months", async () => {
    const onChange = jest.fn();
    await inEnglish(<Calendar value={null} first={first} last={last} onChange={onChange} />);
    expect(screen.getByText("November 2026")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Friday 13 November" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("radio", { name: "Sunday 15 November" }));
    expect(onChange).toHaveBeenCalledWith({ year: 2026, month: 11, day: 15 });

    await fireEvent.press(screen.getByRole("button", { name: "Next month" }));
    await fireEvent.press(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("January 2027")).toBeVisible();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Thursday 14 January" })).toBeDisabled();
  });
});

describe("Screen with a bottom bar", () => {
  it("keeps the main button in a bar with a border line", async () => {
    await inEnglish(
      <Screen footer={<Button main label="Continue" onPress={jest.fn()} />}>
        <Text>Content</Text>
      </Screen>,
    );
    expect(screen.getByTestId("bottom-bar")).toHaveStyle({
      backgroundColor: colors.light.surface,
      borderTopColor: colors.light.border,
      borderTopWidth: 2,
    });
    expect(screen.getByRole("button", { name: "Continue" })).toHaveStyle({
      minHeight: 56,
      alignSelf: "stretch",
    });
  });
});
