import { act, fireEvent, screen, within } from "expo-router/testing-library";
import { Linking } from "react-native";
import { newAttemptKey } from "@/booking/attempt-key";
import { readAppData, writeAppData } from "@/lib/app-data";
import type { Me } from "@shareride/contracts";
import { renderApp, completeMe } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { bookingApi, northBooking, paidBooking, unpaidBooking } from "@/testing/bookings";
import { failure, ok, testMe, tokens, type FakeClient } from "@/testing/fake-client";
import { northResult, northTrip, soonestApi, tripDetailsApi } from "@/testing/search";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// A choice made before signing up waits in the app's own storage.
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn(() => Promise.resolve(null)),
  writeAppData: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));
jest.mock("@/booking/attempt-key", () => ({ newAttemptKey: jest.fn(() => "attempt-1") }));

const mockedRead = readAppData as jest.Mock;
const mockedWrite = writeAppData as jest.Mock;
const mockedKey = newAttemptKey as jest.Mock;
const id = northResult.tripId;
const bookingId = northBooking().id;
const instantTrip = (query: Record<string, unknown>) =>
  ok(
    200,
    northTrip(
      {
        board: Number(query["fromStop"]),
        alight: Number(query["toStop"]),
        seats: Number(query["seats"]),
      },
      { bookingMode: "instant" },
    ),
  );
const bookCalls = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/trips/{id}/bookings")
    .map((call) => call.input["body"] as Record<string, unknown>);

beforeEach(() => {
  mockedRead.mockReset().mockResolvedValue(null);
  mockedWrite.mockReset().mockResolvedValue(undefined);
  mockedKey.mockClear();
});

async function openBooking(
  answers: {
    trip?: Parameters<typeof tripDetailsApi>[1];
    book?: (body: Record<string, unknown>) => unknown;
    booking?: () => ReturnType<typeof northBooking>;
  } = {},
  path = `/trips/${id}/book?from=1&to=2&seats=1`,
) {
  return renderApp(path, {
    me: completeMe,
    setUp: (client) => {
      tripDetailsApi(client, answers.trip);
      client.answer(
        "/v1/trips/{id}/bookings",
        (input) =>
          (answers.book ?? (() => ok(201, northBooking())))(
            input["body"] as Record<string, unknown>,
          ),
        "post",
      );
      bookingApi(client, answers.booking ?? (() => northBooking()));
    },
  });
}

describe("Booking from trip details (spec 5, 3.1)", () => {
  it("opens the booking screen for the part and seats on screen", async () => {
    await renderApp(`/trips/${id}?from=1&to=2&seats=2`, {
      me: completeMe,
      setUp: (client) => {
        tripDetailsApi(client, instantTrip);
      },
    });
    const bar = await screen.findByTestId("bottom-bar");
    expect(within(bar).queryByText("You'll sign in or create an account first.")).toBeNull();
    await fireEvent.press(within(bar).getByRole("button", { name: "Book" }));
    expect(await screen.findByRole("header", { name: "Book this ride" })).toBeVisible();
    expect(screen).toHavePathname(`/trips/${id}/book`);
    expect(screen).toHaveSearchParams({ id, from: "1", to: "2", seats: "2" });
    expect(screen.getByText("Borgarnes → Blönduós")).toBeVisible();
    expect(screen.getByText("Sunday 15 November")).toBeVisible();
    expect(screen.getByText("5,800 ISK")).toBeVisible();
    expect(
      screen.getByText(
        "You pay 5,800 ISK in the app once your booking is accepted. Free cancellation, with a full refund, up to 15 minutes before your departure.",
      ),
    ).toBeVisible();
    expect(screen.getByText(/^If you can't make it, cancel as early as you can\./)).toBeVisible();
    // Instant booking has no message; the chat opens once paid.
    expect(screen.queryByLabelText("Message to the driver (optional)")).toBeNull();
  });

  it("keeps the choice of someone signed out while they sign up", async () => {
    await renderApp(`/trips/${id}?from=1&to=2&seats=2`, {
      setUp: (client) => {
        tripDetailsApi(client);
      },
    });
    const bar = await screen.findByTestId("bottom-bar");
    expect(within(bar).getByText("You'll sign in or create an account first.")).toBeVisible();
    await fireEvent.press(within(bar).getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Sign in or create an account")).toBeVisible();
    const [key, kept] = mockedWrite.mock.calls.at(-1) as [string, string];
    expect(key).toBe("pending-booking");
    expect(JSON.parse(kept)).toEqual({
      tripId: id,
      board: 1,
      alight: 2,
      seats: 2,
      keptAt: "2026-11-14T12:00:00.000Z",
    });
  });

  it("keeps the choice of someone signed in who has a step left, and comes back to it", async () => {
    const afterTerms: Me = { ...testMe, ageConfirmed: true, missingSteps: ["profile"] };
    const { client } = await renderApp(`/trips/${id}?from=1&to=2&seats=2`, {
      me: afterTerms,
      setUp: (fake) => {
        tripDetailsApi(fake);
      },
    });
    const bar = await screen.findByTestId("bottom-bar");
    expect(within(bar).getByText("You'll finish setting up your account first.")).toBeVisible();
    // The choice is kept before step 3 opens, so the step shows it.
    mockedWrite.mockImplementation((name: string, value: string) => {
      if (name === "pending-booking") mockedRead.mockResolvedValue(value);
      return Promise.resolve();
    });
    await fireEvent.press(within(bar).getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(
      await screen.findByRole("button", { name: "Create account and send request" }),
    ).toBeVisible();
    client.answer("/v1/me", () => ok(200, completeMe));
    await fireEvent.changeText(screen.getByLabelText("First name"), "Gunna");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Icelandic" }));
    await fireEvent.press(screen.getByRole("button", { name: "Create account and send request" }));
    expect(await screen.findByRole("header", { name: "Request this ride" })).toBeVisible();
    expect(screen).toHaveSearchParams({ id, from: "1", to: "2", seats: "2" });
  });

  it("comes back to the ride after signing up from a ride on the front page", async () => {
    // The app's storage, as on a device: what is written can be read back.
    const stored = new Map<string, string>();
    mockedRead.mockImplementation((name: string) => Promise.resolve(stored.get(name) ?? null));
    mockedWrite.mockImplementation((name: string, value: string) => {
      stored.set(name, value);
      return Promise.resolve();
    });
    const afterTerms: Me = { ...testMe, ageConfirmed: true, missingSteps: ["profile"] };
    const { client } = await renderApp("/", {
      setUp: (fake) => {
        soonestApi(fake, [northResult]);
        tripDetailsApi(fake);
        fake.answer("/v1/auth/phone/start", () => ok(202, { resendAfterSeconds: 30 }));
        fake.answer("/v1/auth/phone/verify", () =>
          ok(200, { ...tokens(1), user: afterTerms, isNewUser: true }),
        );
      },
    });
    // The front page stays open, out of sight, under the screens that follow.
    await fireEvent.press(await screen.findByTestId("trip-result"));
    const bar = await screen.findByTestId("bottom-bar");
    await fireEvent.press(within(bar).getByRole("button", { name: "Send request" }));
    // Each step of signing up shows the ride (spec 16, 3.5 item 3).
    expect(await screen.findByTestId("kept-ride")).toHaveAccessibleName(
      /^You're booking, Sunday 15 November, Leaves Borgarnes at 10:00, arrives at Blönduós at 12:05, 1 seat, 2,900 ISK, Driver: Anna/,
    );
    await fireEvent.changeText(await screen.findByLabelText("Mobile number"), "690 0000");
    await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Step 2 of 3")).toBeVisible();
    expect(screen.getByTestId("kept-ride")).toBeVisible();
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(screen.getByText("Step 3 of 3")).toBeVisible();
    expect(await screen.findByTestId("kept-ride")).toHaveAccessibleName(
      "You're booking, Sunday 15 November, Leaves Borgarnes at 10:00, arrives at Blönduós at 12:05",
    );

    client.answer("/v1/me", () => ok(200, completeMe));
    client.answer("/v1/me", () => ok(200, completeMe), "patch");
    await fireEvent.changeText(screen.getByLabelText("First name"), "Gunna");
    await fireEvent.press(screen.getByRole("button", { name: "Create account and send request" }));
    expect(await screen.findByRole("header", { name: "Request this ride" })).toBeVisible();
    expect(screen).toHavePathname(`/trips/${id}/book`);
    expect(screen).toHaveSearchParams({ id, from: "1", to: "2", seats: "1" });
    // Only the front page on screen takes the choice, once. The one left
    // open under the ride must not: its way to the booking would never show.
    // The sign-up steps only look at it.
    const takes = mockedWrite.mock.calls.filter(
      ([name, value]) => name === "pending-booking" && value === "",
    );
    expect(takes).toHaveLength(1);
    expect(stored.get("pending-booking")).toBe("");
  });

  it("shows the booking on trip details on coming back from it", async () => {
    let booked = false;
    await renderApp(`/trips/${id}?from=1&to=2`, {
      me: completeMe,
      setUp: (client) => {
        tripDetailsApi(client, () =>
          ok(
            200,
            northTrip(
              { board: 1, alight: 2 },
              booked ? { myBooking: { id: bookingId, status: "requested" } } : {},
            ),
          ),
        );
        client.answer(
          "/v1/trips/{id}/bookings",
          () => {
            booked = true;
            return ok(201, northBooking());
          },
          "post",
        );
        bookingApi(client, () => northBooking());
      },
    });
    const bar = await screen.findByTestId("bottom-bar");
    await fireEvent.press(within(bar).getByRole("button", { name: "Send request" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Request sent. Anna has until 22:00 to answer.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("You have a booking on this trip.")).toBeVisible();
    expect(screen).toHavePathname(`/trips/${id}`);
  });

  it("opens the kept choice once their account is ready, and forgets it", async () => {
    const kept = { tripId: id, board: 1, alight: 2, seats: 2, keptAt: "2026-11-14T11:01:00.000Z" };
    mockedRead.mockImplementation((name: string) =>
      Promise.resolve(name === "pending-booking" ? JSON.stringify(kept) : null),
    );
    await openBooking({}, "/");
    expect(await screen.findByRole("header", { name: "Request this ride" })).toBeVisible();
    expect(screen).toHavePathname(`/trips/${id}/book`);
    expect(screen).toHaveSearchParams({ id, from: "1", to: "2", seats: "2" });
    expect(mockedWrite).toHaveBeenLastCalledWith("pending-booking", "");
  });

  it("forgets a choice kept more than an hour ago", async () => {
    const old = { tripId: id, board: 1, alight: 2, seats: 1, keptAt: "2026-11-14T10:59:00.000Z" };
    mockedRead.mockImplementation((name: string) =>
      Promise.resolve(name === "pending-booking" ? JSON.stringify(old) : null),
    );
    await openBooking({}, "/");
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(screen).toHavePathname("/");
    // Taken and forgotten, so it never leads anywhere later.
    expect(mockedWrite).toHaveBeenLastCalledWith("pending-booking", "");
  });

  it("leads someone who already has a booking on the trip to it", async () => {
    await renderApp(`/trips/${id}?from=1&to=2`, {
      me: completeMe,
      setUp: (client) => {
        tripDetailsApi(client, () =>
          ok(
            200,
            northTrip(
              { board: 1, alight: 2 },
              { myBooking: { id: bookingId, status: "requested" } },
            ),
          ),
        );
        bookingApi(client, () => northBooking());
      },
    });
    const bar = await screen.findByTestId("bottom-bar");
    expect(within(bar).getByText("You have a booking on this trip.")).toBeVisible();
    await fireEvent.press(within(bar).getByRole("button", { name: "See your booking" }));
    expect(await screen.findByText("Request sent. Anna has until 22:00 to answer.")).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
  });
});

describe("The booking screen (spec 5, 3.1 and 3.2)", () => {
  it("sends a request with a message, checking it for contact details as it is typed", async () => {
    const { client } = await openBooking();
    expect(await screen.findByRole("header", { name: "Request this ride" })).toBeVisible();
    const field = screen.getByLabelText("Message to the driver (optional)");
    await fireEvent.changeText(field, "Call me on 555 1234");
    expect(screen.getByText(/^Please don't share phone numbers, emails or links\./)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Send request" }));
    expect(bookCalls(client)).toEqual([]);

    await fireEvent.changeText(field, "I have one big suitcase.");
    expect(screen.queryByText(/^Please don't share phone numbers/)).toBeNull();
    expect(screen.getByText("24 of 300")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Request sent. Anna has until 22:00 to answer.")).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
    expect(bookCalls(client)).toEqual([
      {
        fromStop: 1,
        toStop: 2,
        seats: 1,
        total: { amount: 2900, currency: "ISK" },
        message: "I have one big suitcase.",
        attemptKey: "attempt-1",
      },
    ]);
  });

  it("sends one request for a double tap", async () => {
    const { client } = await openBooking();
    const send = await screen.findByRole("button", { name: "Send request" });
    // Both presses land before the screen shows the button busy.
    await act(async () => {
      await Promise.all([fireEvent.press(send), fireEvent.press(send)]);
    });
    expect(await screen.findByText("Request sent. Anna has until 22:00 to answer.")).toBeVisible();
    expect(bookCalls(client)).toHaveLength(1);
  });

  it("keeps the button off while the message can't be sent", async () => {
    await openBooking();
    const field = await screen.findByLabelText("Message to the driver (optional)");
    await fireEvent.changeText(field, "Mail me at someone@example.com");
    expect(screen.getByRole("button", { name: "Send request" })).toBeDisabled();
    await fireEvent.changeText(field, "One small bag.");
    expect(screen.getByRole("button", { name: "Send request" })).toBeEnabled();
  });

  it("leads to the booking someone already holds on the trip", async () => {
    await openBooking({
      trip: () =>
        ok(
          200,
          northTrip({ board: 1, alight: 2 }, { myBooking: { id: bookingId, status: "requested" } }),
        ),
    });
    expect(await screen.findByText("Request sent. Anna has until 22:00 to answer.")).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
  });

  it("goes back to the same part and seats when opened with nothing behind it", async () => {
    await openBooking({}, `/trips/${id}/book?from=1&to=2&seats=2`);
    await screen.findByRole("header", { name: "Request this ride" });
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByTestId("bottom-bar")).toBeVisible();
    expect(screen).toHavePathname(`/trips/${id}`);
    expect(screen).toHaveSearchParams({ id, from: "1", to: "2", seats: "2" });
  });

  it("says how long to wait when trips were opened too often", async () => {
    await openBooking({ trip: () => failure(429, "rate_limited", { retryAfterSeconds: 120 }) });
    expect(
      await screen.findByText("Too many trips opened in a short time. Try again in 2 minutes."),
    ).toBeVisible();
  });

  it("leads through a step the server says is missing, keeping the choice", async () => {
    const { client } = await openBooking({
      book: () => failure(403, "account_incomplete"),
    });
    client.answer("/v1/me", () => ok(200, { ...completeMe, missingSteps: ["legal"] as const }));
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    // New terms were published since the app last asked (R1.6).
    expect(await screen.findByRole("header", { name: "Our terms have changed" })).toBeVisible();
    const [key, kept] = mockedWrite.mock.calls.at(-1) as [string, string];
    expect(key).toBe("pending-booking");
    expect(JSON.parse(kept)).toMatchObject({ tripId: id, board: 1, alight: 2, seats: 1 });
  });

  it("tries again with the same attempt key after a lost connection", async () => {
    let tries = 0;
    const { client } = await openBooking({
      book: () => {
        tries += 1;
        return tries === 1 ? failure(0, "network_error") : ok(200, northBooking());
      },
    });
    const send = await screen.findByRole("button", { name: "Send request" });
    await fireEvent.press(send);
    expect(await screen.findByText(/^We couldn't reach ShareRide/)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Request sent. Anna has until 22:00 to answer.")).toBeVisible();
    expect(bookCalls(client).map((body) => body["attemptKey"])).toEqual(["attempt-1", "attempt-1"]);
    expect(mockedKey).toHaveBeenCalledTimes(1);
  });

  it("says when the seats were just taken, with the seats free now", async () => {
    let free = 2;
    const { client } = await openBooking({
      trip: (query) =>
        ok(
          200,
          northTrip(
            { board: 1, alight: 2, seats: Number(query["seats"]) },
            {
              part: {
                freeSeats: free,
                ...(Number(query["seats"]) > free ? { state: "full" } : {}),
              },
            },
          ),
        ),
      book: () => {
        free = 0;
        return failure(409, "seats_taken", { freeSeats: 0 });
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Sorry, those seats were just taken")).toBeVisible();
    expect(screen.getByText("No seats are free on your part now.")).toBeVisible();
    // The trip's free seats are asked for again: the part is full now.
    expect(await screen.findByText("Full on your part of the trip")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
    expect(client.calls.filter((call) => call.path === "/v1/trips/{id}")).toHaveLength(2);
    await fireEvent.press(screen.getByRole("button", { name: "Back to the trip" }));
    expect(screen).toHavePathname(`/trips/${id}`);
    expect(screen).toHaveSearchParams({ id, from: "1", to: "2", seats: "1" });
  });

  it("goes back to the trip page it came from after seats were taken", async () => {
    let free = 2;
    await renderApp(`/trips/${id}?from=1&to=2&seats=2`, {
      me: completeMe,
      setUp: (client) => {
        tripDetailsApi(client, (query) =>
          ok(
            200,
            northTrip(
              { board: 1, alight: 2, seats: Number(query["seats"]) },
              {
                part: {
                  freeSeats: free,
                  ...(Number(query["seats"]) > free ? { state: "full" } : {}),
                },
              },
            ),
          ),
        );
        client.answer(
          "/v1/trips/{id}/bookings",
          () => {
            free = 1;
            return failure(409, "seats_taken", { freeSeats: 1 });
          },
          "post",
        );
      },
    });
    const bar = await screen.findByTestId("bottom-bar");
    await fireEvent.press(within(bar).getByRole("button", { name: "Send request" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Back to the trip" }));
    expect(await screen.findByText("1 free on your part · 2,900 ISK per seat")).toBeVisible();
    expect(screen).toHavePathname(`/trips/${id}`);
    expect(screen).toHaveSearchParams({ id, from: "1", to: "2", seats: "1" });
    // The trip page was the one beneath, so Back leaves the trip.
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(screen).toHavePathname("/");
  });

  it("shows a changed price, names it on the button and books at it", async () => {
    const higher = { amount: 3100, currency: "ISK" } as const;
    let changed = false;
    const atHigher = northBooking({ ...unpaidBooking, total: higher });
    const { client } = await openBooking({
      trip: (query) =>
        changed
          ? ok(
              200,
              northTrip(
                { board: 1, alight: 2 },
                { bookingMode: "instant", part: { pricePerSeat: higher, total: higher } },
              ),
            )
          : instantTrip(query),
      book: (body) => {
        if ((body["total"] as { amount: number }).amount === 3100) return ok(201, atHigher);
        changed = true;
        return failure(409, "price_changed", { total: higher });
      },
      booking: () => atHigher,
    });
    expect(await screen.findByText("2,900 ISK per seat")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Book" }));
    expect(
      await screen.findByText("The price has changed to 3,100 ISK. Book at this price?"),
    ).toBeVisible();
    // The price per seat is asked for again, and the button names the new total.
    expect(await screen.findByText("3,100 ISK per seat")).toBeVisible();
    expect(screen.getByText("3,100 ISK")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Book at 3,100 ISK" }));
    expect(await screen.findByText("Pay 3,100 ISK to confirm your seat")).toBeVisible();
    expect(bookCalls(client).map((body) => body["total"])).toEqual([
      { amount: 2900, currency: "ISK" },
      higher,
    ]);
  });

  it("asks to send the request at a changed price", async () => {
    await openBooking({
      book: () => failure(409, "price_changed", { total: { amount: 3100, currency: "ISK" } }),
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    expect(
      await screen.findByText(
        "The price has changed to 3,100 ISK. Send the request at this price?",
      ),
    ).toBeVisible();
    expect(await screen.findByRole("button", { name: "Send request at 3,100 ISK" })).toBeVisible();
  });

  it("says why a booking could not be made", async () => {
    await openBooking({ book: () => failure(409, "overlapping_booking") });
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    expect(
      await screen.findByText(
        "You already have a booking or request at the same time. Withdraw or cancel it first.",
      ),
    ).toBeVisible();
  });
});

describe("Paying (spec 5, 3.5; rule M1)", () => {
  async function openUnpaid() {
    let booking = unpaidBooking;
    const result = await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => booking);
        client.answer("/v1/bookings/{id}/payment", () =>
          ok(200, {
            paymentId: "0190a1d6-0000-7000-8000-0000000000e1",
            provider: "test",
            amount: unpaidBooking.total,
            dueAt: unpaidBooking.paymentDueAt,
          }),
        );
        client.answer("/v1/test-payments/{id}", (input) => {
          const { outcome } = input["body"] as { outcome: string };
          booking = outcome === "succeeded" ? paidBooking : unpaidBooking;
          return ok(200, booking);
        });
      },
    });
    return result;
  }

  it("pays with the test sheet: a failed payment can be tried again, then the seat is confirmed", async () => {
    const { client } = await openUnpaid();
    expect(await screen.findByText("Pay 2,900 ISK to confirm your seat")).toBeVisible();
    expect(screen.getByText("Pay by 12:30 to keep your seat")).toBeVisible();
    expect(screen.getByText("Waiting for payment")).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Pay 2,900 ISK" }));
    expect(
      await screen.findByRole("header", { name: "Test payment: no money moves" }),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Make the payment fail" }));
    expect(
      await screen.findByText("The payment didn't go through. Try again or use another card."),
    ).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Pay 2,900 ISK" }));
    await screen.findByRole("header", { name: "Test payment: no money moves" });
    await fireEvent.press(screen.getByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByText("Your seat is confirmed")).toBeVisible();
    expect(screen.getByText("Number plate AB 123")).toBeVisible();
    expect(screen.getByText("Where to stand")).toBeVisible();
    expect(screen.getByText("By the petrol pumps")).toBeVisible();
    expect(screen.queryByText("Pay 2,900 ISK to confirm your seat")).toBeNull();
    expect(
      client.calls
        .filter((call) => call.path === "/v1/test-payments/{id}")
        .map((call) => call.input["body"]),
    ).toEqual([{ outcome: "failed" }, { outcome: "succeeded" }]);

    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await fireEvent.press(screen.getByRole("button", { name: "Open in maps" }));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/maps\.apple\.com\/\?ll=/));
    open.mockRestore();
  });

  it("shows the time to pay ran out, once the server says so", async () => {
    let booking = unpaidBooking;
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => booking);
        client.answer("/v1/bookings/{id}/payment", () => {
          // As the server sends it: the payment deadline that passed stays.
          booking = northBooking({ ...unpaidBooking, status: "expired" });
          return failure(409, "booking_not_payable");
        });
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    expect(
      await screen.findByText("The time to pay ran out, so the seat was freed."),
    ).toBeVisible();
    expect(screen.getByText("Expired")).toBeVisible();
  });

  it("says the booking stopped waiting for payment, and keeps it on screen", async () => {
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => unpaidBooking);
        client.answer("/v1/bookings/{id}/payment", () => failure(409, "payment_settled"));
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByText("This booking is no longer waiting for payment.")).toBeVisible();
    expect(screen.getByText("Pay 2,900 ISK to confirm your seat")).toBeVisible();
  });

  it("says when the driver didn't answer a request in time", async () => {
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        // As the server sends it: the request's deadline that passed stays.
        bookingApi(client, () => northBooking({ status: "expired" }));
      },
    });
    expect(await screen.findByText("The driver didn't answer in time")).toBeVisible();
    // The seat will never be confirmed, so the plate is not promised.
    expect(screen.queryByText(/^Number plate/)).toBeNull();
  });
});
