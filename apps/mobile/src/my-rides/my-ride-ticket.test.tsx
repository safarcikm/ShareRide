import type { Booking, MyTrip } from "@shareride/contracts";
import { render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/i18n/language";
import {
  northBooking,
  northMyTrip,
  northSegments,
  paidBooking,
  unpaidBooking,
} from "@/testing/bookings";
import { onTheDay } from "@/testing/trip-day";
import { colors, peopleColours } from "@/theme/tokens";
import { MyRideTicket } from "./my-ride-ticket";
import { mergeRides } from "./rides";

// Spec 31, 3.3, 3.5 item 4 and 3.10: a ride of mine is a ticket (R31.2).

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

const inApp = (ui: ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);
/** Saturday 14 November 2026, noon in Iceland. */
const noon = new Date("2026-11-14T12:00:00Z");

function seat(booking: Booking, at = noon) {
  const [ride] = mergeRides([booking], [], "upcoming");
  if (ride === undefined) throw new Error("Not a ride");
  return <MyRideTicket ride={ride} at={at} />;
}

function drive(trip: MyTrip, at = noon) {
  const [ride] = mergeRides([], [trip], "upcoming");
  if (ride === undefined) throw new Error("Not a ride");
  return <MyRideTicket ride={ride} at={at} />;
}

/** Nobody asks, and one seat is booked from Borgarnes to Blönduós. */
const quiet: MyTrip = {
  ...northMyTrip,
  openRequests: 0,
  requestsCloseAt: null,
  firstRequest: null,
};

const foot = () => within(screen.getByTestId("ticket-foot"));
const edge = () => screen.getByTestId("card");

describe("a seat of mine", () => {
  it("is a ticket for my part: Passenger beside the day, the price for my seats, the driver and the state", async () => {
    await inApp(seat(northBooking()));
    const day = within(screen.getByTestId("ticket-day"));
    expect(day.getByText("Sun 15 Nov")).toBeVisible();
    expect(day.getByText("Passenger")).toHaveStyle({ color: colors.light.textMuted });
    expect(screen.getByText("10:00")).toBeVisible();
    expect(screen.getByText("Borgarnes")).toBeVisible();
    expect(screen.getByText("2 h 5 min")).toBeVisible();
    expect(screen.getByText("12:05")).toBeVisible();
    expect(screen.getByText("Blönduós")).toBeVisible();
    const price = within(screen.getByTestId("ticket-price"));
    expect(price.getByText("2,900 ISK")).toBeVisible();
    expect(price.getByText("1 seat")).toBeVisible();
    expect(screen.getByTestId("avatar", { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: peopleColours[1],
      width: 28,
    });
    expect(foot().getByText("Anna")).toBeVisible();
    // Blue: it waits for someone else (spec 31, rule 6).
    expect(foot().getByText("Waiting for Anna's answer")).toHaveStyle({
      color: colors.light.info,
    });
    // Not mine yet: no moss edge.
    expect(edge()).toHaveStyle({ borderBottomColor: colors.light.edge });
  });

  it("has a moss edge once the seat is mine, and says so", async () => {
    await inApp(seat(paidBooking));
    expect(foot().getByText("Seat confirmed")).toHaveStyle({ color: colors.light.primary });
    expect(edge()).toHaveStyle({ borderBottomColor: colors.light.primary });
  });

  it("says in yellow what it needs: to pay, and by when", async () => {
    await inApp(seat(unpaidBooking));
    expect(foot().getByText("Pay by 12:30")).toHaveStyle({ color: colors.light.warning });
    expect(foot().queryByText("Waiting for payment")).toBeNull();
    expect(foot().getByText("Anna")).toBeVisible();
  });

  it("says when it leaves on its trip day", async () => {
    await inApp(seat(onTheDay(), new Date("2026-11-15T09:20:00Z")));
    expect(foot().getByText("Leaves in 40 minutes")).toHaveStyle({
      color: colors.light.warning,
    });
    expect(foot().queryByText("Seat confirmed")).toBeNull();
  });

  it("is quiet about what asks nothing of anyone, and red about a problem", async () => {
    const { rerender } = await inApp(
      seat(northBooking({ status: "declined", requestExpiresAt: null })),
    );
    expect(foot().getByText("Declined")).toHaveStyle({ color: colors.light.textMuted });
    expect(edge()).toHaveStyle({ borderBottomColor: colors.light.edge });
    await rerender(
      <LanguageProvider>
        {seat(northBooking({ ...paidBooking, status: "no_show" }))}
      </LanguageProvider>,
    );
    expect(foot().getByText("No-show")).toHaveStyle({ color: colors.light.error });
    await rerender(
      <LanguageProvider>
        {seat(northBooking({ ...paidBooking, status: "completed" }))}
      </LanguageProvider>,
    );
    expect(foot().getByText("Completed")).toHaveStyle({ color: colors.light.primary });
    expect(edge()).toHaveStyle({ borderBottomColor: colors.light.primary });
  });

  it("says Free where the price stands, and counts the seats under it", async () => {
    await inApp(seat(northBooking({ seats: 2, total: { amount: 0, currency: "ISK" } })));
    const price = within(screen.getByTestId("ticket-price"));
    expect(price.getByText("Free")).toBeVisible();
    expect(price.getByText("2 seats")).toBeVisible();
  });

  it("is one button named by all it says", async () => {
    await inApp(seat(northBooking()));
    expect(
      screen.getByRole("button", {
        name: "Passenger, Sunday 15 November, Leaves Borgarnes at 10:00, arrives at Blönduós at 12:05, 2 h 5 min, 1 seat, 2,900 ISK, Anna, Waiting for Anna's answer",
      }),
    ).toBeVisible();
  });
});

describe("a ride I drive", () => {
  it("shows the whole way as two ends with the stops between counted, and no price", async () => {
    await inApp(drive(quiet));
    const day = within(screen.getByTestId("ticket-day"));
    expect(day.getByText("Sun 15 Nov")).toBeVisible();
    expect(day.getByText("You drive")).toHaveStyle({ color: colors.light.textMuted });
    expect(screen.getByText("09:00")).toBeVisible();
    expect(screen.getByText("BSÍ bus terminal")).toBeVisible();
    expect(screen.getByText("5 h, 2 stops")).toBeVisible();
    expect(screen.getByText("14:00")).toBeVisible();
    expect(screen.getByText("Hof, Akureyri")).toBeVisible();
    expect(screen.queryByTestId("ticket-price")).toBeNull();
    // The seats of the fullest stretch; each stretch is on the ride's own page.
    expect(foot().getByText("1 of 3 seats taken")).toHaveStyle({ color: colors.light.text });
    expect(screen.queryByText(/free/i)).toBeNull();
    expect(edge()).toHaveStyle({ borderBottomColor: colors.light.primary });
  });

  it("says in yellow who waits for an answer, at the foot's end as on a seat of mine", async () => {
    await inApp(drive(northMyTrip));
    // The seats where a seat's ticket has its driver, and the yellow tag
    // where every ticket of a list has it (spec 31, 3.10).
    const start = within(screen.getByTestId("ticket-foot-start"));
    const end = within(screen.getByTestId("ticket-foot-end"));
    expect(start.getByText("1 of 3 seats taken")).toHaveStyle({ color: colors.light.text });
    expect(end.getByText("Answer Gunna's request")).toHaveStyle({
      color: colors.light.warning,
    });
  });

  it("says one stop, and only how long it takes with none between the ends", async () => {
    const [first, second, , last] = quiet.stops;
    if (first === undefined || second === undefined || last === undefined) throw new Error("Stops");
    const { rerender } = await inApp(
      drive({
        ...quiet,
        stops: [first, second, last],
        segments: northSegments([0, 0, 0]).slice(1),
      }),
    );
    expect(screen.getByText("5 h, 1 stop")).toBeVisible();
    await rerender(
      <LanguageProvider>
        {drive({ ...quiet, stops: [first, last], segments: northSegments([0, 0, 0]).slice(2) })}
      </LanguageProvider>,
    );
    expect(screen.getByText("5 h")).toBeVisible();
  });

  it("says a ride I cancelled is cancelled, and why, with no seats and no moss edge", async () => {
    await inApp(
      drive({
        ...quiet,
        status: "cancelled",
        cancellation: { reason: "weather", note: "", countsOnReliability: false },
      }),
    );
    expect(foot().getByText("Cancelled")).toHaveStyle({ color: colors.light.textMuted });
    expect(screen.getByTestId("ticket-note")).toHaveTextContent("You cancelled this ride: Weather");
    expect(screen.queryByText(/seats? taken/)).toBeNull();
    expect(edge()).toHaveStyle({ borderBottomColor: colors.light.edge });
  });

  it("is one button named by all it says", async () => {
    await inApp(drive(northMyTrip));
    expect(
      screen.getByRole("button", {
        name: "You drive, Sunday 15 November, Leaves BSÍ bus terminal at 09:00, arrives at Hof, Akureyri at 14:00, 5 h, 2 stops, 1 of 3 seats taken, Answer Gunna's request",
      }),
    ).toBeVisible();
  });
});
