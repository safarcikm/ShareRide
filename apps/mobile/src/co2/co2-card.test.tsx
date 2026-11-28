import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/i18n/language";
import { Co2Card } from "./co2-card";

// The CO2 saved card (spec 34, 3.4): one folded row, the sentences and the
// link to About's method under it.

const mockPush = jest.fn<undefined, [unknown]>();
jest.mock("expo-router", () => ({
  router: {
    push: (href: unknown) => {
      mockPush(href);
    },
  },
}));
let mockLanguage = "en-GB";
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: mockLanguage }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

afterEach(() => {
  mockLanguage = "en-GB";
  mockPush.mockClear();
});

const inApp = (ui: ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);
const line = "One car fewer on the road for 389\u00a0km.";

describe("Co2Card", () => {
  it("shows the kilograms, folded, and unfolds the lines and the link to the method", async () => {
    await inApp(<Co2Card grams={58_350} lines={[line]} />);
    expect(screen.getByText("CO₂ saved")).toBeTruthy();
    expect(screen.getByText("About 58\u00a0kg, estimated")).toBeTruthy();
    const row = screen.getByRole("button", { name: "CO2 saved, about 58 kilograms, estimated" });
    expect(row).not.toBeExpanded();
    expect(screen.queryByText(line)).toBeNull();
    expect(screen.queryByRole("link", { name: "How we estimate it" })).toBeNull();

    await fireEvent.press(row);
    expect(row).toBeExpanded();
    expect(screen.getByText(line)).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: "How we estimate it" }));
    expect(mockPush).toHaveBeenCalledWith("/about#co2");

    await fireEvent.press(row);
    expect(screen.queryByText(line)).toBeNull();
  });

  it("says one kilogram, not kilograms, at 1 kg", async () => {
    await inApp(<Co2Card grams={1_400} lines={[line]} />);
    expect(screen.getByText("About 1\u00a0kg, estimated")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "CO2 saved, about 1 kilogram, estimated" }),
    ).toBeTruthy();
  });

  it("shows nothing under 1 kg or without a figure (R34.7)", async () => {
    await inApp(<Co2Card grams={999} lines={[line]} />);
    expect(screen.queryByText("CO₂ saved")).toBeNull();
    await inApp(<Co2Card grams={null} lines={[line]} />);
    expect(screen.queryByText("CO₂ saved")).toBeNull();
  });

  it("speaks Icelandic", async () => {
    mockLanguage = "is-IS";
    await inApp(<Co2Card grams={58_350} lines={[]} />);
    expect(screen.getByText("Minni losun CO₂")).toBeTruthy();
    expect(screen.getByText("Um 58\u00a0kg, áætlað")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Minni losun CO2, um 58 kíló, áætlað" }),
    ).toBeTruthy();
  });
});
