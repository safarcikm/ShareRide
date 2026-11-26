import { render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/i18n/language";
import { northResult } from "@/testing/search";
import { colors, peopleColours } from "@/theme/tokens";
import { ResultTicket } from "./result-ticket";

// Spec 31, 3.3 and 3.6: a ride found is a ticket (R31.2).

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

const inApp = (ui: ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);
const searched = { from: "Borgarnes", to: "Blönduós" };
const hidden = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });

describe("ResultTicket", () => {
  it("is a ticket: the day, the part's times and places, how long it takes and the price for a seat", async () => {
    await inApp(<ResultTicket result={northResult} searched={searched} seats={1} />);
    const ticket = within(screen.getByTestId("trip-result"));
    expect(ticket.getByText("Sun 15 Nov")).toBeVisible();
    expect(ticket.getByText("10:00")).toBeVisible();
    expect(ticket.getByText("Borgarnes")).toBeVisible();
    expect(ticket.getByText("2 h 5 min")).toBeVisible();
    expect(ticket.getByText("12:05")).toBeVisible();
    expect(ticket.getByText("Blönduós")).toBeVisible();
    expect(ticket.getByText("2,900 ISK")).toBeVisible();
    expect(ticket.getByText("per seat")).toBeVisible();
    // One seat: no total beside the price for a seat.
    expect(ticket.queryByText(/for 1 seat/)).toBeNull();
    // Under a tear line, the driver and the seats left.
    expect(hidden("ticket-tear")).toBeTruthy();
    const foot = within(screen.getByTestId("ticket-foot"));
    expect(foot.getByText("Anna")).toBeVisible();
    expect(foot.getByText("New driver")).toHaveStyle({ color: colors.light.warning });
    expect(foot.getByText("3 seats left")).toBeVisible();
  });

  it("says how a seat is booked in a tag beside the day: blue when the driver answers, green at once", async () => {
    const { rerender } = await inApp(
      <ResultTicket result={northResult} searched={searched} seats={1} />,
    );
    const day = () => within(screen.getByTestId("ticket-day"));
    expect(day().getByText("Driver approves")).toHaveStyle({ color: colors.light.info });
    await rerender(
      <LanguageProvider>
        <ResultTicket
          result={{ ...northResult, bookingMode: "instant" }}
          searched={searched}
          seats={1}
        />
      </LanguageProvider>,
    );
    expect(day().getByText("Book instantly")).toHaveStyle({ color: colors.light.primary });
  });

  it("shows the driver's small picture in their colour, and a rating once there is one", async () => {
    await inApp(
      <ResultTicket
        result={{
          ...northResult,
          driver: { ...northResult.driver, colour: 3, rating: { average: 4.86, count: 12 } },
        }}
        searched={searched}
        seats={1}
      />,
    );
    expect(hidden("avatar")).toHaveStyle({ backgroundColor: peopleColours[3], width: 28 });
    const foot = within(screen.getByTestId("ticket-foot"));
    expect(foot.getByText("4.9 (12 ratings)")).toBeVisible();
    expect(foot.queryByText("New driver")).toBeNull();
  });

  it("says what more seats cost under the price for one, and Free without a unit", async () => {
    const { rerender } = await inApp(
      <ResultTicket
        result={{ ...northResult, total: { amount: 5800, currency: "ISK" } }}
        searched={searched}
        seats={2}
      />,
    );
    const price = () => within(screen.getByTestId("ticket-price"));
    expect(price().getByText("2,900 ISK")).toBeVisible();
    expect(price().getByText("per seat")).toBeVisible();
    expect(price().getByText("5,800 ISK for 2 seats")).toBeVisible();
    await rerender(
      <LanguageProvider>
        <ResultTicket
          result={{
            ...northResult,
            pricePerSeat: { amount: 0, currency: "ISK" },
            total: { amount: 0, currency: "ISK" },
          }}
          searched={searched}
          seats={2}
        />
      </LanguageProvider>,
    );
    expect(price().getByText("Free")).toBeVisible();
    expect(price().queryByText("per seat")).toBeNull();
    expect(price().queryByText(/for 2 seats/)).toBeNull();
  });

  it("says how far a stop is from the place searched, under that stop", async () => {
    await inApp(
      <ResultTicket
        result={{
          ...northResult,
          board: { ...northResult.board, nearbyM: 1300 },
          alight: { ...northResult.alight, nearbyM: 400 },
        }}
        searched={searched}
        seats={1}
      />,
    );
    expect(
      within(screen.getByTestId("ticket-from-place")).getByText("1.3 km from Borgarnes"),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("ticket-to-place")).getByText("400 m from Blönduós"),
    ).toBeVisible();
  });

  it("names the driver's whole ride under the timetable when it goes further, and not when it is the part", async () => {
    const { rerender } = await inApp(
      <ResultTicket result={northResult} searched={searched} seats={1} />,
    );
    // Under the timetable and over the tear line, not under a place.
    expect(screen.getByTestId("ticket-note")).toHaveTextContent(
      "Anna drives BSÍ bus terminal → Hof, Akureyri",
    );
    expect(
      within(screen.getByTestId("ticket-top")).getByText(
        "Anna drives BSÍ bus terminal → Hof, Akureyri",
      ),
    ).toBeVisible();
    await rerender(
      <LanguageProvider>
        <ResultTicket
          result={{
            ...northResult,
            tripFrom: northResult.board.meetingPoint.name,
            tripTo: northResult.alight.meetingPoint.name,
          }}
          searched={searched}
          seats={1}
        />
      </LanguageProvider>,
    );
    expect(screen.queryByText(/^Anna drives/)).toBeNull();
    expect(screen.queryByTestId("ticket-note")).toBeNull();
  });

  it("is one button named by all it says, with the day only where no heading says it", async () => {
    const { rerender } = await inApp(
      <ResultTicket result={northResult} searched={searched} seats={1} />,
    );
    const name =
      "Leaves Borgarnes at 10:00, arrives at Blönduós at 12:05, 2 h 5 min, 2,900 ISK per seat, " +
      "Anna drives BSÍ bus terminal → Hof, Akureyri, Driver approves, Anna, New driver, 3 seats left";
    expect(screen.getByRole("button", { name })).toBeVisible();
    await rerender(
      <LanguageProvider>
        <ResultTicket result={northResult} searched={searched} seats={1} showDay />
      </LanguageProvider>,
    );
    expect(screen.getByRole("button", { name: `Sun 15 Nov, ${name}` })).toBeVisible();
    // Sharing is a button of its own, in the corner.
    expect(
      screen.getByRole("button", { name: "Share the ride Borgarnes → Blönduós" }),
    ).toBeVisible();
  });
});
