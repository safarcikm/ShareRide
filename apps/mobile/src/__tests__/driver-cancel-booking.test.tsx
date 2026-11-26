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
import { aProfileId, newcomer } from "@/testing/people";

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
  passenger: {
    firstName: "Jón",
    colour: 3,
    memberSince: "2026-10",
    profileId: aProfileId(14),
    photo: null,
    ...newcomer,
  },
  confirmed: { registration: "AB 123", whereToStand: null },
});

/** Gunna, accepted from Borgarnes to Blönduós, has until 12:30 to pay. */
const gunna = northBooking({
  viewer: "driver",
  status: "accepted",
  requestExpiresAt: null,
  paymentDueAt: "2026-11-14T12:30:00.000Z",
});

async function openTrip(
  bookings: readonly Booking[] = [jon],
  answers: Parameters<typeof driverApi>[2] = {},
) {
  return renderApp(tripPage, {
    me: completeMe,
    setUp: (client) => {
      tripsApi(client, [northMyTrip]);
      driverApi(client, bookings, answers);
    },
  });
}

/** The trip page, then Cancel booking for one passenger. */
async function openCancel(name: string, ...trip: Parameters<typeof openTrip>) {
  const app = await openTrip(...trip);
  await fireEvent.press(await screen.findByRole("button", { name: `Cancel booking: ${name}` }));
  expect(await screen.findByRole("header", { name: `Cancel booking: ${name}` })).toBeVisible();
  return app;
}

const cancels = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/bookings/{id}/cancel")
    .map((call) => call.input["body"]);

const choose = async (reason: string) => {
  await fireEvent.press(screen.getByRole("radio", { name: reason }));
};

describe("The driver cancels one booking (spec 6, 3.4)", () => {
  it("offers Cancel booking for each passenger after their chat, and not once they should be aboard", async () => {
    const aboard = northBooking({
      ...jon,
      id: "0190a1d6-0000-7000-8000-0000000000b7",
      board: { ...northStop(0), plannedAt: "2026-11-14T12:00:00.000Z" },
      passenger: {
        firstName: "Siggi",
        colour: 4,
        memberSince: "2026-09",
        profileId: aProfileId(15),
        photo: null,
        ...newcomer,
      },
    });
    await openTrip([jon, gunna, aboard]);
    const cancel = await screen.findByRole("button", { name: "Cancel booking: Jón" });
    const buttons = screen.getAllByRole("button");
    const message = screen.getByRole("button", { name: "Message Jón" });
    expect(buttons.indexOf(cancel)).toBeGreaterThan(buttons.indexOf(message));
    // Waiting for payment can be cancelled too: there is nothing to refund.
    expect(screen.getByRole("button", { name: "Cancel booking: Gunna" })).toBeVisible();
    // From the time to get in, the trip day takes over (spec 8).
    expect(screen.getByLabelText("Siggi, 2 seats, Confirmed")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancel booking: Siggi" })).toBeNull();
  });

  it("cancels a paid booking with a reason and a note, then says so on the trip, with focus", async () => {
    const { client } = await openCancel("Jón");
    expect(screen).toHavePathname(`/bookings/${jon.id}/cancel`);
    expect(screen.getByText("Jón gets a full refund of 8,000 ISK")).toBeVisible();
    expect(screen.getByRole("radio", { name: "The car is smaller than planned" })).toBeVisible();
    expect(screen.queryByRole("radio", { name: "Found another ride" })).toBeNull();
    await choose("Car problem");
    expect(screen.getByText("This cancellation shows on your profile")).toBeVisible();
    // Weather never counts (R6.7).
    await choose("Weather");
    expect(screen.queryByText("This cancellation shows on your profile")).toBeNull();
    await choose("Car problem");
    expect(
      screen.getByText("Jón is told at once, and the seats are freed for others."),
    ).toBeVisible();
    await fireEvent.changeText(
      screen.getByLabelText("Note to the passenger (optional)"),
      "Sorry, the clutch went.",
    );

    // React Native's test set-up already mocks it, so it holds earlier tests' calls.
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(cancels(client)).toEqual([
      {
        reason: "car_problem",
        terms: { refund: jon.total, countsOnReliability: true },
        note: "Sorry, the clutch went.",
      },
    ]);
    expect(
      await screen.findByText("Booking cancelled. The passenger has been told."),
    ).toBeVisible();
    expect(focusMoves).toHaveBeenCalledTimes(1);
    focusMoves.mockRestore();
    expect(screen).toHavePathname(tripPage);
    expect(screen.queryByLabelText(/^Jón, /)).toBeNull();
  });

  it("says an unpaid booking has nothing to refund, and sends no note when none is written", async () => {
    const { client } = await openCancel("Gunna", [jon, gunna]);
    expect(screen.getByText("Gunna hasn't paid yet, so there's nothing to refund.")).toBeVisible();
    await choose("The passenger asked");
    // An unpaid booking never counts.
    expect(screen.queryByText("This cancellation shows on your profile")).toBeNull();
    expect(
      screen.getByText("Gunna is told at once, and the seat is freed for others."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(cancels(client)).toEqual([
      {
        reason: "passenger_asked",
        terms: { refund: { amount: 0, currency: "ISK" }, countsOnReliability: false },
      },
    ]);
    expect(
      await screen.findByText("Booking cancelled. The passenger has been told."),
    ).toBeVisible();
    expect(screen.getByLabelText("Jón, 2 seats, Confirmed")).toBeVisible();
    expect(screen.queryByLabelText(/^Gunna, /)).toBeNull();
  });

  it("says a booking was cancelled after a request was answered, in place of the answer", async () => {
    await openTrip([requestToDrive, jon]);
    await fireEvent.press(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByText(/^Request accepted\./)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking: Jón" }));
    await choose("Illness");
    await fireEvent.press(await screen.findByRole("button", { name: "Cancel booking" }));
    expect(
      await screen.findByText("Booking cancelled. The passenger has been told."),
    ).toBeVisible();
    expect(screen.queryByText(/^Request accepted\./)).toBeNull();
  });

  it("moves focus to the outcome again when a second booking is cancelled", async () => {
    await openTrip([jon, gunna]);
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    for (const name of ["Gunna", "Jón"]) {
      await fireEvent.press(await screen.findByRole("button", { name: `Cancel booking: ${name}` }));
      await choose("Illness");
      focusMoves.mockClear();
      await fireEvent.press(await screen.findByRole("button", { name: "Cancel booking" }));
      expect(
        await screen.findByText("Booking cancelled. The passenger has been told."),
      ).toBeVisible();
      expect(focusMoves).toHaveBeenCalledTimes(1);
    }
    focusMoves.mockRestore();
  });

  it("keeps contact details out of the note, as in a trip's note (R3.10)", async () => {
    const { client } = await openCancel("Jón");
    await choose("Illness");
    const note = screen.getByLabelText("Note to the passenger (optional)");
    await fireEvent.changeText(note, "Sorry! Call me on 555 1234");
    expect(
      screen.getByText("Please don't share phone numbers, emails or links in the note."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(cancels(client)).toEqual([]);
    await fireEvent.changeText(note, "Sorry, I'm ill.");
    expect(
      screen.queryByText("Please don't share phone numbers, emails or links in the note."),
    ).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(cancels(client)).toHaveLength(1);
  });

  it("keeps the note when the terms changed meanwhile, to send it with the new ones", async () => {
    // Gunna paid while Anna was cancelling: now she gets a full refund.
    let tries = 0;
    const { client } = await openCancel("Gunna", [jon, gunna], {
      cancel: () => {
        tries += 1;
        return tries === 1
          ? failure(409, "terms_changed", {
              terms: { refund: gunna.total, countsOnReliability: true },
            })
          : undefined;
      },
    });
    await choose("Illness");
    const note = "Sorry, I'm ill.";
    await fireEvent.changeText(screen.getByLabelText("Note to the passenger (optional)"), note);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(
      await screen.findByText("Something changed since you opened this. Check the refund again."),
    ).toBeVisible();
    expect(screen.getByLabelText("Note to the passenger (optional)")).toHaveDisplayValue(note);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(cancels(client).at(-1)).toMatchObject({ reason: "illness", note });
  });

  it("says why nothing was sent when the note needs fixing, with focus", async () => {
    const { client } = await openCancel("Jón");
    await choose("Illness");
    await fireEvent.changeText(
      screen.getByLabelText("Note to the passenger (optional)"),
      "Call me: 555 1234",
    );
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please don't share phone numbers, emails or links in the note.",
    );
    expect(focusMoves).toHaveBeenCalledTimes(1);
    focusMoves.mockRestore();
    expect(cancels(client)).toEqual([]);
  });

  it("leaves the last outcome as it was with Keep the booking", async () => {
    await openTrip([requestToDrive, jon]);
    await fireEvent.press(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByText(/^Request accepted\./)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking: Jón" }));
    await choose("Illness");
    await fireEvent.press(await screen.findByRole("button", { name: "Cancel booking" }));
    const cancelled = "Booking cancelled. The passenger has been told.";
    expect(await screen.findByText(cancelled)).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking: Gunna" }));
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await fireEvent.press(await screen.findByRole("button", { name: "Keep the booking" }));
    expect(await screen.findByText(cancelled)).toBeVisible();
    expect(screen.queryByText(/^Request accepted\./)).toBeNull();
    expect(focusMoves).not.toHaveBeenCalled();
    focusMoves.mockRestore();
  });

  it("goes back to the trip with Keep the booking", async () => {
    const { client } = await openCancel("Jón");
    await choose("Illness");
    await fireEvent.press(screen.getByRole("button", { name: "Keep the booking" }));
    expect(await screen.findByLabelText("Jón, 2 seats, Confirmed")).toBeVisible();
    expect(screen).toHavePathname(tripPage);
    expect(screen.queryByText("Booking cancelled. The passenger has been told.")).toBeNull();
    expect(cancels(client)).toEqual([]);
  });

  it("leads back to the trip when the booking can no longer be cancelled", async () => {
    await openTrip([jon], { preview: () => failure(409, "booking_not_cancellable") });
    await fireEvent.press(await screen.findByRole("button", { name: "Cancel booking: Jón" }));
    expect(await screen.findByText("This booking can no longer be cancelled.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Back to the ride" }));
    expect(await screen.findByLabelText("Jón, 2 seats, Confirmed")).toBeVisible();
    expect(screen).toHavePathname(tripPage);
  });
});
