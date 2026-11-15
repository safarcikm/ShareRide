import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { useState } from "react";
import { Dimensions } from "react-native";
import { LanguageProvider } from "@/i18n/language";
import type { Clock } from "@/lib/clock-time";
import { colors } from "@/theme/tokens";
import { TimeField, wheelSize } from "./time-field";

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

const label = "Leaving BSÍ bus terminal at";

/** A time field that keeps its own time and opens on its own, as a screen would. */
function Harness({
  start,
  onChange,
  error,
}: {
  readonly start: Clock | null;
  readonly onChange: (clock: Clock) => void;
  readonly error?: string;
}) {
  const [value, setValue] = useState(start);
  const [open, setOpen] = useState(false);
  return (
    <TimeField
      label={label}
      value={value}
      suggested={{ hour: 12, minute: 30 }}
      open={open}
      onOpen={() => {
        setOpen(true);
      }}
      onClose={() => {
        setOpen(false);
      }}
      onChange={(clock) => {
        setValue(clock);
        onChange(clock);
      }}
      error={error}
    />
  );
}

async function show(start: Clock | null, error?: string) {
  const onChange = jest.fn();
  await render(
    <LanguageProvider>
      <Harness start={start} onChange={onChange} error={error} />
    </LanguageProvider>,
  );
  return onChange;
}

const hours = () => screen.getByRole("adjustable", { name: "Hour" });
const minutes = () => screen.getByRole("adjustable", { name: "Minutes" });

describe("TimeField (spec 15, 5.2)", () => {
  it("shows the time in a field that opens a wheel of hours and minutes under it", async () => {
    await show({ hour: 9, minute: 30 });
    const field = screen.getByRole("button", { name: `${label}: 09:30` });
    expect(field).not.toBeExpanded();
    expect(screen.queryByRole("adjustable")).toBeNull();

    await fireEvent.press(field);
    expect(field).toBeExpanded();
    expect(hours()).toHaveAccessibilityValue({ text: "09" });
    expect(minutes()).toHaveAccessibilityValue({ text: "30" });
    // Every hour of a 24-hour clock, and minutes in 5-minute steps.
    expect(within(hours()).getAllByText(/^\d\d$/u)).toHaveLength(24);
    expect(within(hours()).getByText("00")).toBeVisible();
    expect(within(hours()).getByText("23")).toBeVisible();
    expect(within(minutes()).getAllByText(/^\d\d$/u)).toHaveLength(12);
    expect(within(minutes()).getByText("55")).toBeVisible();
    expect(within(minutes()).queryByText("07")).toBeNull();
  });

  it("chooses the hour or minutes tapped in the wheel", async () => {
    const onChange = await show({ hour: 9, minute: 30 });
    await fireEvent.press(screen.getByRole("button", { name: `${label}: 09:30` }));
    await fireEvent.press(within(hours()).getByText("14"));
    expect(onChange).toHaveBeenLastCalledWith({ hour: 14, minute: 30 });
    await fireEvent.press(within(minutes()).getByText("45"));
    expect(onChange).toHaveBeenLastCalledWith({ hour: 14, minute: 45 });
    expect(screen.getByRole("button", { name: `${label}: 14:45` })).toBeVisible();
  });

  it("chooses the row the wheel stops on", async () => {
    const onChange = await show({ hour: 9, minute: 30 });
    await fireEvent.press(screen.getByRole("button", { name: `${label}: 09:30` }));
    // The hour wheel stopped 18 rows down, at 18. Rows grow with the text
    // size, which is twice the usual in these tests.
    const { row } = wheelSize(Dimensions.get("window").fontScale);
    expect(row).toBeGreaterThan(44);
    await fireEvent(screen.getByTestId("hour-wheel"), "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 0, y: 18 * row } },
    });
    expect(onChange).toHaveBeenLastCalledWith({ hour: 18, minute: 30 });
    await fireEvent(screen.getByTestId("minute-wheel"), "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 0, y: 2 * row } },
    });
    expect(onChange).toHaveBeenLastCalledWith({ hour: 18, minute: 10 });
  });

  it("keeps the rows 44 high at the usual text size, and grows them with it", () => {
    expect(wheelSize(1)).toEqual({ row: 44, width: 64 });
    expect(wheelSize(3).row).toBeGreaterThanOrEqual(28 * 3);
  });

  it("keeps a time chosen while the other wheel is still settling", async () => {
    const onChange = await show({ hour: 9, minute: 30 });
    await fireEvent.press(screen.getByRole("button", { name: `${label}: 09:30` }));
    const { row } = wheelSize(Dimensions.get("window").fontScale);
    jest.useFakeTimers();
    try {
      // Let go of the hours at 11 with no fling, then tap 45 straight away.
      await fireEvent(screen.getByTestId("hour-wheel"), "scrollEndDrag", {
        nativeEvent: { contentOffset: { x: 0, y: 11 * row } },
      });
      await fireEvent.press(within(minutes()).getByText("45"));
      await act(() => {
        jest.runOnlyPendingTimers();
      });
    } finally {
      jest.useRealTimers();
    }
    expect(onChange).toHaveBeenLastCalledWith({ hour: 11, minute: 45 });
  });

  it("lets screen readers swipe the hour and minutes up and down", async () => {
    const onChange = await show({ hour: 23, minute: 0 });
    await fireEvent.press(screen.getByRole("button", { name: `${label}: 23:00` }));
    await fireEvent(minutes(), "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(onChange).toHaveBeenLastCalledWith({ hour: 23, minute: 5 });
    // The wheels stop at their ends rather than going round.
    onChange.mockClear();
    await fireEvent(hours(), "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent(hours(), "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(onChange).toHaveBeenLastCalledWith({ hour: 22, minute: 5 });
  });

  it("starts at the suggested time when none is chosen yet", async () => {
    const onChange = await show(null);
    const field = screen.getByRole("button", { name: `${label}: Choose a time` });
    expect(screen.getByText("Choose a time")).toHaveStyle({ color: colors.light.textMuted });
    await fireEvent.press(field);
    expect(onChange).toHaveBeenCalledWith({ hour: 12, minute: 30 });
    expect(hours()).toHaveAccessibilityValue({ text: "12" });
  });

  it("closes with Done or a second press on the field", async () => {
    await show({ hour: 9, minute: 30 });
    const field = screen.getByRole("button", { name: `${label}: 09:30` });
    await fireEvent.press(field);
    expect(field).toHaveStyle({ borderColor: colors.light.primary });
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("adjustable")).toBeNull();
    expect(field).not.toBeExpanded();
    expect(field).toHaveStyle({ borderColor: colors.light.control });
    await fireEvent.press(field);
    await fireEvent.press(field);
    expect(screen.queryByRole("adjustable")).toBeNull();
  });

  it("shows an error under the field in the error colour", async () => {
    await show({ hour: 12, minute: 10 }, "Leave at least 30 minutes from now.");
    expect(screen.getByRole("button", { name: `${label}: 12:10` })).toHaveStyle({
      borderColor: colors.light.error,
    });
    expect(screen.getByText("Leave at least 30 minutes from now.")).toHaveStyle({
      color: colors.light.error,
    });
  });
});
