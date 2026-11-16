import type { Booking } from "@shareride/contracts";
import { AccessibilityInfo } from "react-native";
import { fireEvent, screen } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  driverApi,
  northBooking,
  northMyTrip,
  northStop,
  requestToDrive,
} from "@/testing/bookings";
import { failure, type FakeClient } from "@/testing/fake-client";
import { tripsApi } from "@/testing/trips";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland; the north trip leaves tomorrow.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

const tripPage = `/drive/trips/${northMyTrip.id}`;

/** Jón rides from the bus terminal to Blönduós with a friend, paid. */
const jon = northBooking({
  id: "0190a1d6-0000-7000-8000-0000000000b5",
  viewer: "driver",
  status: "confirmed",
  board: northStop(0),
  alight: northStop(2),
  seats: 2,
  total: { amount: 8000, currency: "ISK" },
  requestExpiresAt: null,
  passenger: { firstName: "Jón", colour: 3, memberSince: "2026-10" },
  confirmed: { registration: "AB 123", whereToStand: null },
});

/** Dóra, accepted from Borgarnes to Blönduós, has until 12:30 to pay. */
const dora = northBooking({
  id: "0190a1d6-0000-7000-8000-0000000000b6",
  viewer: "driver",
  status: "accepted",
  requestExpiresAt: null,
  paymentDueAt: "2026-11-14T12:30:00.000Z",
  passenger: { firstName: "Dóra", colour: 4, memberSince: "2026-09" },
});

async function openTrip(
  bookings: readonly Booking[] = [jon],
  { trip = northMyTrip, cancel }: { trip?: typeof northMyTrip; cancel?: () => unknown } = {},
) {
  return renderApp(tripPage, {
    me: completeMe,
    setUp: (client) => {
      tripsApi(client, [trip], cancel === undefined ? {} : { cancel });
      driverApi(client, bookings);
    },
  });
}

/** The trip page, then Cancel trip. */
async function openCancel(...trip: Parameters<typeof openTrip>) {
  const app = await openTrip(...trip);
  await fireEvent.press(await screen.findByRole("button", { name: "Cancel trip" }));
  expect(await screen.findByRole("header", { name: "Cancel your trip" })).toBeVisible();
  return app;
}

const cancels = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/trips/{id}/cancel")
    .map((call) => call.input["body"]);

const choose = async (reason: string) => {
  await fireEvent.press(screen.getByRole("radio", { name: reason }));
};

const counts = "This cancellation shows on your profile";

describe("The driver cancels the trip (spec 6, 3.3)", () => {
  it("offers Cancel trip until the trip leaves, after the seats on each stretch", async () => {
    await openTrip();
    const cancel = await screen.findByRole("button", { name: "Cancel trip" });
    const buttons = screen.getAllByRole("button");
    expect(buttons.indexOf(cancel)).toBeGreaterThan(
      buttons.indexOf(screen.getByRole("button", { name: "Cancel booking: Jón" })),
    );
  });

  it("offers no Cancel trip once the planned departure has come", async () => {
    const left = { ...northMyTrip, departsAt: "2026-11-14T12:00:00.000Z" };
    await openTrip([jon], { trip: left });
    expect(await screen.findByLabelText("Jón, 2 seats, Confirmed")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancel trip" })).toBeNull();
  });

  it("cancels with a reason and a note, then says so on the trip, with focus", async () => {
    const { client } = await openCancel([requestToDrive, jon, dora]);
    expect(screen).toHavePathname(`${tripPage}/cancel`);
    expect(screen.getByText("1 passenger gets a full refund and will be told now.")).toBeVisible();
    expect(screen.getByText("2 more people with a booking or request are told too.")).toBeVisible();
    expect(screen.queryByRole("radio", { name: "The passenger asked" })).toBeNull();
    await choose("Car problem");
    expect(screen.getByText(counts)).toBeVisible();
    // Weather never counts (R6.7).
    await choose("Weather");
    expect(screen.queryByText(counts)).toBeNull();
    await choose("Car problem");
    await fireEvent.changeText(
      screen.getByLabelText("Note to passengers (optional)"),
      "  Sorry, the clutch went. ",
    );

    // React Native's test set-up already mocks it, so it holds earlier tests' calls.
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel trip" }));
    expect(cancels(client)).toEqual([
      { reason: "car_problem", countsOnReliability: true, note: "Sorry, the clutch went." },
    ]);
    expect(await screen.findByText("You cancelled this trip: Car problem")).toBeVisible();
    expect(focusMoves).toHaveBeenCalledTimes(1);
    focusMoves.mockRestore();
    expect(screen).toHavePathname(tripPage);
    expect(screen.getByText("Your note: Sorry, the clutch went.")).toBeVisible();
    // Nothing left to answer, cancel or message.
    expect(screen.queryByRole("button", { name: "Cancel trip" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Cancel booking/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Message all passengers" })).toBeNull();
  });

  it("says nobody is told when nobody booked, and sends no note when none is written", async () => {
    const { client } = await openCancel([]);
    expect(
      screen.getByText("Nobody has booked this trip, so nobody needs to be told."),
    ).toBeVisible();
    // Without a passenger it never counts.
    await choose("Plans changed");
    expect(screen.queryByText(counts)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel trip" }));
    expect(cancels(client)).toEqual([{ reason: "plans_changed", countsOnReliability: false }]);
    expect(await screen.findByText("You cancelled this trip: Plans changed")).toBeVisible();
    expect(screen.queryByText(/^Your note/)).toBeNull();
  });

  it("tells a free ride's passenger without promising a refund, and still counts it (R5.11)", async () => {
    const free = { ...jon, total: { amount: 0, currency: "ISK" as const } };
    const { client } = await openCancel([free]);
    expect(screen.queryByText(/full refund/)).toBeNull();
    expect(screen.getByText("1 person with a booking or request will be told now.")).toBeVisible();
    await choose("Car problem");
    expect(screen.getByText(counts)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel trip" }));
    expect(cancels(client)).toEqual([{ reason: "car_problem", countsOnReliability: true }]);
  });

  it("shows it again, keeping the reason and the note, when someone paid or left meanwhile", async () => {
    let tries = 0;
    const { client } = await openCancel([jon, dora], {
      cancel: () => {
        tries += 1;
        return tries === 1
          ? failure(409, "terms_changed", { countsOnReliability: true })
          : undefined;
      },
    });
    await choose("Illness");
    const note = "Sorry, I'm ill.";
    await fireEvent.changeText(screen.getByLabelText("Note to passengers (optional)"), note);
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel trip" }));
    expect(
      await screen.findByText(
        "Something changed since you opened this. Check who is affected again.",
      ),
    ).toBeVisible();
    expect(focusMoves).toHaveBeenCalledTimes(1);
    focusMoves.mockRestore();
    expect(screen.getByRole("radio", { name: "Illness" })).toBeChecked();
    expect(screen.getByLabelText("Note to passengers (optional)")).toHaveDisplayValue(note);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel trip" }));
    expect(cancels(client)).toHaveLength(2);
    expect(await screen.findByText("You cancelled this trip: Illness")).toBeVisible();
  });

  it("asks for a reason first, with focus", async () => {
    const { client } = await openCancel();
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel trip" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a reason.");
    expect(focusMoves).toHaveBeenCalledTimes(1);
    focusMoves.mockRestore();
    expect(cancels(client)).toEqual([]);
  });

  it("keeps contact details out of the note, as in a trip's note (R3.10)", async () => {
    const { client } = await openCancel();
    await choose("Illness");
    const note = screen.getByLabelText("Note to passengers (optional)");
    await fireEvent.changeText(note, "Call me on 555 1234");
    const warning = "Please don't share phone numbers, emails or links in the note.";
    expect(screen.getByText(warning)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel trip" }));
    expect(screen.getByRole("alert")).toHaveTextContent(warning);
    expect(cancels(client)).toEqual([]);
    await fireEvent.changeText(note, "Sorry, I'm ill.");
    expect(screen.queryByText(warning)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel trip" }));
    expect(cancels(client)).toHaveLength(1);
  });

  it("goes back to the trip as it was with Keep the trip", async () => {
    const { client } = await openCancel();
    await choose("Illness");
    await fireEvent.press(screen.getByRole("button", { name: "Keep the trip" }));
    expect(await screen.findByLabelText("Jón, 2 seats, Confirmed")).toBeVisible();
    expect(screen).toHavePathname(tripPage);
    expect(screen.getByRole("button", { name: "Cancel trip" })).toBeVisible();
    expect(cancels(client)).toEqual([]);
  });

  it("says when the trip can no longer be cancelled, and keeps the choice to try again", async () => {
    let tries = 0;
    await openCancel([jon], {
      cancel: () => {
        tries += 1;
        return tries === 1 ? failure(409, "trip_not_cancellable") : undefined;
      },
    });
    await choose("Illness");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This trip can no longer be cancelled.",
    );
    expect(screen.getByRole("radio", { name: "Illness" })).toBeChecked();
  });

  it("says a trip cancelled before is cancelled, without focus, when it opens", async () => {
    const cancelled = {
      ...northMyTrip,
      status: "cancelled" as const,
      cancellation: { reason: "weather" as const, note: "", countsOnReliability: false },
    };
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await openTrip([], { trip: cancelled });
    expect(await screen.findByText("You cancelled this trip: Weather")).toBeVisible();
    expect(focusMoves).not.toHaveBeenCalled();
    focusMoves.mockRestore();
    expect(screen.queryByRole("button", { name: "Cancel trip" })).toBeNull();
    expect(screen.queryByText("No requests or bookings yet.")).toBeNull();
  });
});
