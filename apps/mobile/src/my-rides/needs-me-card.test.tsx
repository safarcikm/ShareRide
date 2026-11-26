import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/i18n/language";
import { northMyTrip, unpaidBooking } from "@/testing/bookings";
import { filledButtons } from "@/testing/buttons";
import { NeedsMeCard } from "./needs-me-card";
import { mergeRides, needing } from "./rides";

// Spec 31, 3.3 item 3 and 3.5: what needs me, as one card.

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

const inApp = (ui: ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);
/** Saturday 14 November 2026, noon in Iceland. */
const noon = new Date("2026-11-14T12:00:00Z");

/** To pay by 12:30, then Gunna's request to answer by 22:00. */
const needs = needing(mergeRides([unpaidBooking], [northMyTrip], "upcoming"), noon);

describe("NeedsMeCard", () => {
  it("says the soonest need in the yellow card, with one filled button that opens the ride", async () => {
    const [first] = needs;
    if (first === undefined) throw new Error("Nothing needs me");
    await inApp(<NeedsMeCard first={first} more={0} at={noon} />);
    expect(screen.getByTestId("needs-you-card")).toBeVisible();
    expect(screen.getByText("Pay to keep your seat")).toBeVisible();
    expect(screen.getByText("Borgarnes to Blönduós, Sun 15 Nov. Pay by 12:30.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Pay 2,900 ISK" })).toBeVisible();
    // The card's button is not the screen's main button (R31.1).
    expect(filledButtons()).toBe(0);
    expect(screen.getAllByTestId("filled-button")).toHaveLength(1);
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it("names who asks for a seat, and what for", async () => {
    const [, second] = needs;
    if (second === undefined) throw new Error("One need only");
    await inApp(<NeedsMeCard first={second} more={0} at={noon} />);
    expect(screen.getByText("Gunna asks for 1 seat")).toBeVisible();
    expect(
      screen.getByText("Borgarnes to Blönduós, Sun 15 Nov. 10 h left to answer."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "See the request" })).toBeVisible();
  });

  it("says how many more need me, as a link to My rides", async () => {
    const [first] = needs;
    if (first === undefined) throw new Error("Nothing needs me");
    await inApp(<NeedsMeCard first={first} more={2} at={noon} />);
    expect(screen.getByText("and 2 more")).toBeVisible();
    expect(screen.getByRole("link", { name: "and 2 more: open My rides" })).toBeVisible();
  });
});
