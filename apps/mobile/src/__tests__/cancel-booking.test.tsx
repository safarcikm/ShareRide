import type { Booking, CancelBookingBody } from "@shareride/contracts";
import { fireEvent, screen } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  bookingApi,
  cancellationPreview,
  cancelledBooking,
  northBooking,
  paidBooking,
  unpaidBooking,
} from "@/testing/bookings";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { searchApi } from "@/testing/search";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland: Gunna boards in Borgarnes tomorrow.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

const bookingId = paidBooking.id;
const full = paidBooking.total;
const none = { amount: 0, currency: "ISK" } as const;

const cancels = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/bookings/{id}/cancel")
    .map((call) => call.input["body"]);

/**
 * The booking on a fake server that cancels it: `previews` answer the
 * previews in turn (the last one again after that), and `answers` the
 * cancels, until the last one, which cancels.
 */
async function openBooking(
  start: Booking,
  {
    previews = [ok(200, cancellationPreview(full, true))],
    answers = [],
    path = `/bookings/${bookingId}`,
    setUp = () => undefined,
  }: {
    previews?: unknown[];
    answers?: unknown[];
    path?: string;
    /** More fake answers; `set` changes the booking the server holds. */
    setUp?: (client: FakeClient, set: (booking: Booking) => void) => void;
  } = {},
) {
  let booking = start;
  let previewed = 0;
  let tried = 0;
  const app = await renderApp(path, {
    me: completeMe,
    setUp: (client) => {
      bookingApi(client, () => booking);
      searchApi(client);
      client.answer("/v1/bookings/{id}/cancellation-preview", () => {
        previewed += 1;
        return previews[Math.min(previewed, previews.length) - 1];
      });
      client.answer("/v1/bookings/{id}/cancel", (input) => {
        tried += 1;
        const answer = answers[tried - 1];
        if (answer !== undefined) return answer;
        const { reason, terms } = input["body"] as CancelBookingBody;
        booking = {
          ...cancelledBooking,
          cancellation: { by: "passenger", reason, note: "", wholeTrip: false, ...terms },
        };
        return ok(200, booking);
      });
      setUp(client, (next) => {
        booking = next;
      });
    },
  });
  return app;
}

async function openCancel(start: Booking = paidBooking, options = {}) {
  const app = await openBooking(start, options);
  await fireEvent.press(await screen.findByRole("button", { name: "Cancel booking" }));
  expect(await screen.findByRole("header", { name: "Cancel your booking" })).toBeVisible();
  return app;
}

const choose = async (reason: string) => {
  await fireEvent.press(screen.getByRole("radio", { name: reason }));
};

describe("Cancelling a booking (spec 6, 3.5)", () => {
  it("offers Cancel booking after the booking's facts and the chat", async () => {
    await openBooking(paidBooking);
    const cancel = await screen.findByRole("button", { name: "Cancel booking" });
    const message = screen.getByRole("button", { name: "Message Anna" });
    const buttons = screen.getAllByRole("button");
    expect(buttons.indexOf(cancel)).toBeGreaterThan(buttons.indexOf(message));
  });

  it("is not offered to the driver here (spec 6, 3.4 comes on the driver's trip page)", async () => {
    await openBooking({ ...paidBooking, viewer: "driver" });
    expect(await screen.findByRole("button", { name: "Message Gunna" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });

  it("is no longer offered once the time to get in has come: the trip day takes over (spec 8)", async () => {
    const board = { ...paidBooking.board, plannedAt: "2026-11-14T12:00:00.000Z" };
    await openBooking({ ...paidBooking, board });
    expect(await screen.findByRole("button", { name: "Message Anna" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });

  it("shows the outcome after paying on the booking, then cancelling", async () => {
    await openBooking(unpaidBooking, {
      setUp: (client, set) => {
        client.answer("/v1/bookings/{id}/payment", () =>
          ok(200, {
            paymentId: "0190a1d6-0000-7000-8000-0000000000e1",
            provider: "test",
            amount: unpaidBooking.total,
            dueAt: unpaidBooking.paymentDueAt,
          }),
        );
        client.answer("/v1/test-payments/{id}", () => {
          set(paidBooking);
          return ok(200, paidBooking);
        });
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    await screen.findByRole("header", { name: "Test payment: no money moves" });
    await fireEvent.press(screen.getByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByText("Your seat is confirmed")).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    await choose("Plans changed");
    await fireEvent.press(await screen.findByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByText("You cancelled this booking: Plans changed")).toBeVisible();
    expect(screen.queryByText("Your seat is confirmed")).toBeNull();
  });

  it("offers Withdraw request instead for a request (spec 5)", async () => {
    await openBooking(northBooking());
    expect(await screen.findByRole("button", { name: "Withdraw request" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });

  it("shows the refund, the reliability line for the reason chosen, and cancels with those terms", async () => {
    const { client } = await openCancel();
    expect(screen).toHavePathname(`/bookings/${bookingId}/cancel`);
    expect(screen.getByText("Full refund of 2,900 ISK")).toBeVisible();
    expect(screen.queryByText("This cancellation shows on your profile")).toBeNull();
    // Only the driver writes a note (spec 6, 3.4).
    expect(screen.queryByLabelText("Note to the passenger (optional)")).toBeNull();
    await choose("Plans changed");
    expect(screen.getByText("This cancellation shows on your profile")).toBeVisible();
    expect(screen.getByText("Anna is told, and the seat is freed for others.")).toBeVisible();
    // Weather never counts (R6.8).
    await choose("Weather");
    expect(screen.queryByText("This cancellation shows on your profile")).toBeNull();
    await choose("Plans changed");

    // React Native's test set-up already mocks it, so it holds earlier tests' calls.
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(cancels(client)).toEqual([
      { reason: "plans_changed", terms: { refund: full, countsOnReliability: true } },
    ]);
    expect(await screen.findByText("You cancelled this booking: Plans changed")).toBeVisible();
    // The outcome takes focus, as the screen with the button pressed has gone.
    expect(focusMoves).toHaveBeenCalledTimes(1);
    focusMoves.mockRestore();
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
    expect(screen.getByText("Cancelled")).toBeVisible();
    expect(
      screen.getByText("Full refund of 2,900 ISK, back to the card you paid with."),
    ).toBeVisible();
    expect(screen.getByText("This cancellation shows on your profile")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Message/ })).toBeNull();
  });

  it("asks for a reason before cancelling", async () => {
    const { client } = await openCancel();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a reason.");
    expect(cancels(client)).toEqual([]);
    await choose("Found another ride");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("goes back to the booking with Keep my booking", async () => {
    const { client } = await openCancel();
    await fireEvent.press(screen.getByRole("button", { name: "Keep my booking" }));
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
    expect(await screen.findByRole("button", { name: "Cancel booking" })).toBeVisible();
    expect(cancels(client)).toEqual([]);
  });

  it("says when there is no refund (rule M2)", async () => {
    await openCancel(paidBooking, { previews: [ok(200, cancellationPreview(none, true))] });
    expect(screen.getByText("No refund: less than 15 min before departure")).toBeVisible();
  });

  it("names the booking's own cut-off, the one it was made under (R10.3)", async () => {
    await openCancel(
      { ...paidBooking, cancellationRules: { freeUntilMinutes: 60, farMoveMinutes: 30 } },
      { previews: [ok(200, cancellationPreview(none, true))] },
    );
    expect(screen.getByText("No refund: less than 1 h before departure")).toBeVisible();
  });

  it("says there is nothing to refund for a booking not yet paid, which never counts", async () => {
    await openCancel(unpaidBooking, { previews: [ok(200, cancellationPreview(none, false))] });
    expect(screen.getByText("Nothing to refund: you haven't paid yet.")).toBeVisible();
    await choose("Plans changed");
    expect(screen.queryByText("This cancellation shows on your profile")).toBeNull();
  });

  it("says there is nothing to refund for a free ride", async () => {
    const free = { ...paidBooking, total: none };
    await openCancel(free, { previews: [ok(200, cancellationPreview(none, true))] });
    expect(screen.getByText("This ride is free, so there's nothing to refund.")).toBeVisible();
  });

  it("says there is nothing to refund for a ride paid to the driver in person (rule M6)", async () => {
    const inPerson: Booking = { ...paidBooking, payment: "in_person" };
    await openCancel(inPerson, { previews: [ok(200, cancellationPreview(none, true))] });
    expect(screen.getByText("Nothing to refund: you pay the driver in person.")).toBeVisible();
    await choose("Plans changed");
    expect(screen.getByText("This cancellation shows on your profile")).toBeVisible();
  });

  it("shows the terms again when they changed meanwhile, to confirm them", async () => {
    const { client } = await openCancel(paidBooking, {
      previews: [
        ok(200, cancellationPreview(full, true)),
        ok(200, cancellationPreview(none, true)),
      ],
      answers: [
        failure(409, "terms_changed", { terms: { refund: none, countsOnReliability: true } }),
      ],
    });
    await choose("Plans changed");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(
      await screen.findByText("Something changed since you opened this. Check the refund again."),
    ).toBeVisible();
    expect(screen.getByText("No refund: less than 15 min before departure")).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}/cancel`);

    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(cancels(client)).toEqual([
      { reason: "plans_changed", terms: { refund: full, countsOnReliability: true } },
      { reason: "plans_changed", terms: { refund: none, countsOnReliability: true } },
    ]);
    expect(await screen.findByText("You cancelled this booking: Plans changed")).toBeVisible();
  });

  it("says when the booking can no longer be cancelled, and leads back to it", async () => {
    await openBooking(paidBooking, {
      previews: [failure(409, "booking_not_cancellable")],
      path: `/bookings/${bookingId}/cancel`,
    });
    expect(await screen.findByText("This booking can no longer be cancelled.")).toBeVisible();
    expect(screen.queryByRole("radio")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Back to the booking" }));
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
  });

  it("says when the booking can no longer be cancelled on confirming, such as once boarding time came", async () => {
    await openCancel(paidBooking, { answers: [failure(409, "booking_not_cancellable")] });
    await choose("Plans changed");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByText("This booking can no longer be cancelled.")).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}/cancel`);
  });

  it("keeps the choice when cancelling fails, to try again", async () => {
    const { client } = await openCancel(paidBooking, {
      answers: [failure(500, "internal_error")],
    });
    await choose("Weather");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Weather" })).toBeChecked();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByText("You cancelled this booking: Weather")).toBeVisible();
    expect(screen.queryByText("This cancellation shows on your profile")).toBeNull();
    expect(cancels(client)).toHaveLength(2);
  });
});

describe("A cancelled booking (spec 6, 3.4 and 3.5)", () => {
  it("says the driver cancelled and why, with their note and the refund, and offers the same search again", async () => {
    await openBooking({
      ...cancelledBooking,
      cancellation: {
        by: "driver",
        reason: "car_problem",
        refund: full,
        countsOnReliability: null,
        note: "Sorry, the clutch went.",
        wholeTrip: false,
      },
    });
    expect(await screen.findByText("Anna cancelled this booking: Car problem")).toBeVisible();
    expect(screen.getByText("Note from the driver: Sorry, the clutch went.")).toBeVisible();
    expect(
      screen.getByText("Full refund of 2,900 ISK, back to the card you paid with."),
    ).toBeVisible();
    expect(screen.queryByText("This cancellation shows on your profile")).toBeNull();
    expect(screen.getByRole("button", { name: "Find another ride" })).toBeVisible();
  });

  it("says the driver cancelled the whole trip, with their note and the refund (spec 6, 3.3)", async () => {
    await openBooking({
      ...cancelledBooking,
      cancellation: {
        by: "driver",
        reason: "weather",
        refund: full,
        countsOnReliability: null,
        note: "The pass is closed.",
        wholeTrip: true,
      },
    });
    expect(await screen.findByText("Anna cancelled the ride: Weather")).toBeVisible();
    expect(screen.getByText("Note from the driver: The pass is closed.")).toBeVisible();
    expect(
      screen.getByText("Full refund of 2,900 ISK, back to the card you paid with."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Find another ride" })).toBeVisible();
  });

  it("tells a passenger whose request was declined that the trip was cancelled, and why", async () => {
    await openBooking(
      northBooking({
        status: "declined",
        requestExpiresAt: null,
        cancellation: {
          by: "driver",
          reason: "car_problem",
          refund: none,
          countsOnReliability: null,
          note: "",
          wholeTrip: true,
        },
      }),
    );
    expect(await screen.findByText("Anna cancelled the ride: Car problem")).toBeVisible();
    expect(screen.getByText("Cancelled")).toBeVisible();
    expect(screen.queryByText("Declined")).toBeNull();
    expect(screen.queryByText("The driver couldn't take this request")).toBeNull();
    expect(screen.queryByText(/refund|Note from/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Find another ride" })).toBeVisible();
  });

  it("says nothing of a refund when there was none", async () => {
    await openBooking({
      ...cancelledBooking,
      cancellation: {
        by: "passenger",
        reason: "found_another",
        refund: none,
        countsOnReliability: false,
        note: "",
        wholeTrip: false,
      },
    });
    expect(await screen.findByText("You cancelled this booking: Found another ride")).toBeVisible();
    expect(screen.queryByText(/refund/i)).toBeNull();
    expect(screen.queryByText("This cancellation shows on your profile")).toBeNull();
  });
});
