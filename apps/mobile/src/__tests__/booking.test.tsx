import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { Dimensions, Linking } from "react-native";
import { newAttemptKey } from "@/booking/attempt-key";
import { readAppData, writeAppData } from "@/lib/app-data";
import type { Me } from "@shareride/contracts";
import { renderApp, completeMe } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { filledButtons } from "@/testing/buttons";
import { bookingApi, northBooking, paidBooking, unpaidBooking } from "@/testing/bookings";
import { failure, ok, testMe, tokens, type FakeClient } from "@/testing/fake-client";
import { northResult, northStops, northTrip, soonestApi, tripDetailsApi } from "@/testing/search";
import { bsi } from "@/testing/meeting-points";
import { blonduos, borgarnes, mosfellsbaer } from "@/testing/trips";

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

const paymentCalls = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/bookings/{id}/payment")
    .map((call) => (call.input["params"] as { id: string }).id);
/** The test provider's payment for a booking, as the API starts it. */
const paymentFor = (booking: ReturnType<typeof northBooking>) => ({
  paymentId: "0190a1d6-0000-7000-8000-0000000000e1",
  provider: "test",
  amount: booking.total,
  dueAt: booking.paymentDueAt,
});

// The first render in a file loads every screen of the app, and with no
// cache (as in CI) compiles them too. Jest runs the largest files first,
// this one among them, while every package's checks run at once, and that
// took the first test past its 15 s. Load the app here, with time of its
// own.
beforeAll(async () => {
  const { unmount } = await renderApp("/");
  await unmount();
}, 120_000);

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
    pay?: () => unknown;
    settle?: (outcome: string) => unknown;
    /** What the operator has paused (spec 10, 3.3). */
    paused?: readonly string[];
    /** The operator's switch for paying the driver in person (rule M6). */
    payInPerson?: boolean;
  } = {},
  path = `/trips/${id}/book?from=1&to=2&seats=1`,
) {
  return renderApp(path, {
    me: completeMe,
    setUp: (client) => {
      if (answers.paused !== undefined || answers.payInPerson !== undefined) {
        client.answer("/v1/config", () =>
          ok(200, {
            beta: false,
            paused: answers.paused ?? [],
            maxSeats: 8,
            freeCancellationMinutes: 15,
            maxMoveMinutes: 120,
            reliabilityMonths: 12,
            signInProviders: [],
            payInPerson: answers.payInPerson ?? false,
          }),
        );
      }
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
      client.answer(
        "/v1/bookings/{id}/payment",
        answers.pay ?? (() => ok(200, paymentFor(unpaidBooking))),
        "post",
      );
      client.answer(
        "/v1/test-payments/{id}",
        (input) => {
          const { outcome } = input["body"] as { outcome: string };
          return (
            answers.settle ??
            ((given) => ok(200, given === "succeeded" ? paidBooking : unpaidBooking))
          )(outcome);
        },
        "post",
      );
    },
  });
}

/** Check and pay for an instant trip, booking unpaidBooking. */
const openCheckAndPay = (answers: Parameters<typeof openBooking>[0] = {}) =>
  openBooking({
    trip: instantTrip,
    book: () => ok(201, unpaidBooking),
    booking: () => paidBooking,
    ...answers,
  });

describe("Booking from trip details (spec 5, 3.1)", () => {
  it("opens Check and pay for the part and seats on screen (spec 16, 3.7)", async () => {
    await renderApp(`/trips/${id}?from=1&to=2&seats=2`, {
      me: completeMe,
      setUp: (client) => {
        tripDetailsApi(client, instantTrip);
      },
    });
    const bar = await screen.findByTestId("bottom-bar");
    expect(within(bar).queryByText("You'll sign in or create an account first.")).toBeNull();
    await fireEvent.press(within(bar).getByRole("button", { name: "Book" }));
    expect(await screen.findByRole("header", { name: "Check and pay" })).toBeVisible();
    expect(screen).toHavePathname(`/trips/${id}/book`);
    // With the meeting points shown, so a stop added meanwhile is noticed (spec 6, 3.2).
    expect(screen).toHaveSearchParams({
      id,
      from: "1",
      to: "2",
      seats: "2",
      fromPoint: borgarnes.id,
      toPoint: blonduos.id,
    });
    // The head at the left, and my part as a ticket (spec 31, 3.19): the
    // day, the two ends, what the seats cost, and the driver with the car.
    expect(
      within(screen.getByTestId("screen-head")).getByRole("header", { name: "Check and pay" }),
    ).toBeVisible();
    const ticket = within(screen.getByTestId("booking-ticket"));
    expect(within(ticket.getByTestId("ticket-day")).getByText("Sunday 15 November")).toBeVisible();
    expect(within(ticket.getByTestId("ticket-from")).getByText("10:00")).toBeVisible();
    expect(within(ticket.getByTestId("ticket-from")).getByText("Borgarnes")).toBeVisible();
    expect(ticket.getByText("2 h 5 min")).toBeVisible();
    expect(within(ticket.getByTestId("ticket-to")).getByText("12:05")).toBeVisible();
    expect(within(ticket.getByTestId("ticket-to")).getByText("Blönduós")).toBeVisible();
    const price = within(ticket.getByTestId("ticket-price"));
    expect(price.getByText("5,800 ISK")).toBeVisible();
    expect(price.getByText("2 seats × 2,900 ISK")).toBeVisible();
    const foot = within(ticket.getByTestId("ticket-foot"));
    expect(foot.getByText("Anna")).toBeVisible();
    expect(foot.getByText("White Toyota Yaris")).toBeVisible();
    // Nothing on it is pressed: the part is changed on the ride's page.
    expect(ticket.queryByRole("button")).toBeNull();
    // So a screen reader is told what each text is: where I get in and
    // out, and that Anna is the driver (spec 31, 3.20).
    expect(ticket.getByLabelText("Get in: 10:00")).toBe(ticket.getByText("10:00"));
    expect(ticket.getByLabelText("Get out: 12:05")).toBe(ticket.getByText("12:05"));
    expect(foot.getByLabelText("Driver: Anna")).toBe(foot.getByText("Anna"));
    for (const tick of [
      "Your seat is confirmed as soon as you pay.",
      "Free cancellation, with a full refund, up to 15 min before you get in.",
      "You'll see the number plate once your seat is confirmed.",
    ]) {
      expect(screen.getByText(tick)).toBeVisible();
    }
    expect(screen.getByText(/^If you can't make it, cancel as early as you can\./)).toBeVisible();
    // The seats were chosen on the trip; instant booking has no message.
    expect(screen.queryByRole("button", { name: "One seat more" })).toBeNull();
    expect(screen.queryByLabelText("Message to the driver (optional)")).toBeNull();
    expect(screen.getByRole("button", { name: "Pay 5,800 ISK" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Book" })).toBeNull();
    expect(filledButtons()).toBe(1);
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
      fromPoint: borgarnes.id,
      toPoint: blonduos.id,
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
    expect(screen).toHaveSearchParams({
      id,
      from: "1",
      to: "2",
      seats: "2",
      fromPoint: borgarnes.id,
      toPoint: blonduos.id,
    });
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
        fake.answer("/v1/auth/email/start", () => ok(202, { resendAfterSeconds: 30 }));
        fake.answer("/v1/auth/email/verify", () =>
          ok(200, {
            status: "phoneNeeded",
            pendingSignIn: `sr_pe_${"e".repeat(43)}`,
            provider: "email",
            email: "anna@example.com",
            firstName: null,
            expiresAt: "2026-11-23T12:30:00.000Z",
          }),
        );
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
    await fireEvent.changeText(await screen.findByLabelText("Email"), "anna@example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "246810");
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
    expect(screen).toHaveSearchParams({
      id,
      from: "1",
      to: "2",
      seats: "1",
      fromPoint: borgarnes.id,
      toPoint: blonduos.id,
    });
    // Only the front page on screen takes the choice, once. The one left
    // open under the ride must not: its way to the booking would never show.
    // The sign-up steps only look at it.
    const takes = mockedWrite.mock.calls.filter(
      ([name, value]) => name === "pending-booking" && value === "",
    );
    expect(takes).toHaveLength(1);
    expect(stored.get("pending-booking")).toBe("");
  });

  it("takes no press on the next page's Send request just after the ride's own was pressed: a double press sends nothing", async () => {
    const { client } = await renderApp(`/trips/${id}?from=1&to=2`, {
      me: completeMe,
      // As in the app: tests press faster than anyone otherwise.
      holdsPresses: true,
      setUp: (fake) => {
        tripDetailsApi(fake, () => ok(200, northTrip({ board: 1, alight: 2 })));
        fake.answer("/v1/trips/{id}/bookings", () => ok(201, northBooking()), "post");
        bookingApi(fake, () => northBooking());
      },
    });
    const sent = () => client.calls.filter((call) => call.path === "/v1/trips/{id}/bookings");
    const bar = await screen.findByTestId("bottom-bar");
    await fireEvent.press(within(bar).getByRole("button", { name: "Send request" }));
    // The page that checks the booking is open, with its own Send request
    // where the ride's stood (spec 31, R31.1): it is held.
    await waitFor(() => {
      expect(screen).toHavePathname(`/trips/${id}/book`);
    });
    const send = () => screen.getByRole("button", { name: "Send request" });
    expect(send()).toBeDisabled();
    await fireEvent.press(send());
    expect(sent()).toHaveLength(0);
    // Half a second later it sends.
    await waitFor(
      () => {
        expect(send()).toBeEnabled();
      },
      { timeout: 3_000 },
    );
    await fireEvent.press(send());
    expect(await screen.findByRole("header", { name: "Request sent" })).toBeVisible();
    expect(sent()).toHaveLength(1);
  });

  it("takes no press on Find another ride just after Send request brought it under the main button: Request sent stays to be read", async () => {
    await renderApp(`/trips/${id}/book?from=1&to=2&seats=1`, {
      me: completeMe,
      holdsPresses: true,
      setUp: (fake) => {
        tripDetailsApi(fake, () => ok(200, northTrip({ board: 1, alight: 2 })));
        fake.answer("/v1/trips/{id}/bookings", () => ok(201, northBooking()), "post");
        bookingApi(fake, () => northBooking());
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("header", { name: "Request sent" })).toBeVisible();
    // The bar has "See in My rides" over "Find another ride", which stands
    // where Send request stood (spec 31, 3.20): it is held with the main one.
    const find = () => screen.getByRole("button", { name: "Find another ride" });
    expect(find()).toBeDisabled();
    await fireEvent.press(find());
    expect(screen).toHavePathname(`/bookings/${bookingId}/booked`);
    // Half a second later it leads on.
    await waitFor(
      () => {
        expect(find()).toBeEnabled();
      },
      { timeout: 3_000 },
    );
    await fireEvent.press(find());
    await waitFor(() => {
      expect(screen).toHavePathname("/");
    });
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
    expect(await screen.findByRole("header", { name: "Request sent" })).toBeVisible();
    // The seat waits with you in it; the car drives off once it's yours (spec 15, 5.3).
    expect(screen.getByTestId("your-seat", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("puffins-in-car", { includeHiddenElements: true })).toBeNull();
    // Request sent took the place of Check and pay, so Back opens the trip.
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("You have a booking on this ride.")).toBeVisible();
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
    expect(within(bar).getByText("You have a booking on this ride.")).toBeVisible();
    await fireEvent.press(within(bar).getByRole("button", { name: "See your booking" }));
    expect(await screen.findByText("Anna has until 22:00 to answer.")).toBeVisible();
    expect(screen.getByRole("header", { name: "Request sent" })).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
  });
});

describe("The booking screen (spec 5, 3.1 and 3.2)", () => {
  it("sends a request with a message, checking it for contact details as it is typed", async () => {
    const { client } = await openBooking();
    expect(await screen.findByRole("header", { name: "Request this ride" })).toBeVisible();
    expect(screen.getByText("You pay when Anna says yes.")).toBeVisible();
    expect(screen.queryByText("Your seat is confirmed as soon as you pay.")).toBeNull();
    const field = screen.getByLabelText("Message to the driver (optional)");
    await fireEvent.changeText(field, "Call me on 555 1234");
    expect(screen.getByText(/^Please don't share phone numbers, emails or links\./)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Send request" }));
    expect(bookCalls(client)).toEqual([]);

    await fireEvent.changeText(field, "I have one big suitcase.");
    expect(screen.queryByText(/^Please don't share phone numbers/)).toBeNull();
    expect(screen.getByText("24 of 300")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("header", { name: "Request sent" })).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}/booked`);
    expect(bookCalls(client)).toEqual([
      {
        fromStop: 1,
        toStop: 2,
        // The meeting points shown, so a stop added meanwhile is noticed (spec 6, 3.2).
        fromPoint: borgarnes.id,
        toPoint: blonduos.id,
        seats: 1,
        total: { amount: 2900, currency: "ISK" },
        message: "I have one big suitcase.",
        attemptKey: "attempt-1",
      },
    ]);
  });

  it("books and opens the payment with one press of Pay, with no second Book", async () => {
    const { client } = await openCheckAndPay();
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    expect(
      await screen.findByRole("header", { name: "Test payment: no money moves" }),
    ).toBeVisible();
    expect(screen).toHavePathname(`/trips/${id}/book`);
    expect(bookCalls(client)).toHaveLength(1);
    expect(paymentCalls(client)).toEqual([unpaidBooking.id]);
    // The sheet takes the place of the button pressed.
    expect(screen.getAllByRole("button", { name: "Pay 2,900 ISK" })).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByRole("header", { name: "You're booked!" })).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}/booked`);
    // The puffins' car drives off with you in it (spec 15, 5.3).
    const car = screen.getByTestId("puffins-in-car", { includeHiddenElements: true });
    expect(within(car).getByTestId("moving-lines", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("your-seat", { includeHiddenElements: true })).toBeNull();
  });

  it("says nothing about an unpaid seat while the payment starts", async () => {
    let release: () => void = () => undefined;
    await openCheckAndPay({
      pay: () =>
        new Promise((resolve) => {
          release = () => {
            resolve(ok(200, paymentFor(unpaidBooking)));
          };
        }),
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByRole("button", { name: "Pay 2,900 ISK", busy: true })).toBeVisible();
    expect(screen.queryByText(/^Not paid yet/)).toBeNull();
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(
      await screen.findByRole("header", { name: "Test payment: no money moves" }),
    ).toBeVisible();
    expect(screen.queryByText(/^Not paid yet/)).toBeNull();
  });

  it("settles once for a double tap on the sheet's Pay", async () => {
    const { client } = await openCheckAndPay();
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    const pay = await screen.findByRole("button", { name: "Pay 2,900 ISK" });
    await act(async () => {
      await Promise.all([fireEvent.press(pay), fireEvent.press(pay)]);
    });
    expect(await screen.findByRole("header", { name: "You're booked!" })).toBeVisible();
    expect(client.calls.filter((call) => call.path === "/v1/test-payments/{id}")).toHaveLength(1);
  });

  it("makes one booking and one payment for a double tap on Pay", async () => {
    const { client } = await openCheckAndPay();
    const pay = await screen.findByRole("button", { name: "Pay 2,900 ISK" });
    await act(async () => {
      await Promise.all([fireEvent.press(pay), fireEvent.press(pay)]);
    });
    expect(
      await screen.findByRole("header", { name: "Test payment: no money moves" }),
    ).toBeVisible();
    expect(bookCalls(client)).toHaveLength(1);
    expect(paymentCalls(client)).toHaveLength(1);
  });

  it("holds the seat when the payment can't start, and Pay starts it again for the same booking", async () => {
    let tries = 0;
    const { client } = await openCheckAndPay({
      pay: () => {
        tries += 1;
        return tries === 1 ? failure(0, "network_error") : ok(200, paymentFor(unpaidBooking));
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByText("Not paid yet. Your seat is held until 12:30.")).toBeVisible();
    expect(screen.getByText(/^We couldn't reach PuffinRide/)).toBeVisible();
    expect(screen.getByRole("header", { name: "Check and pay" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Pay 2,900 ISK" }));
    expect(
      await screen.findByRole("header", { name: "Test payment: no money moves" }),
    ).toBeVisible();
    expect(bookCalls(client)).toHaveLength(1);
    expect(paymentCalls(client)).toEqual([unpaidBooking.id, unpaidBooking.id]);
  });

  it("holds the seat after a failed payment, and paying again confirms it", async () => {
    const { client } = await openCheckAndPay();
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Make the payment fail" }));
    expect(
      await screen.findByText("The payment didn't go through. Try again or use another card."),
    ).toBeVisible();
    expect(screen.getByText("Not paid yet. Your seat is held until 12:30.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Pay 2,900 ISK" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByRole("header", { name: "You're booked!" })).toBeVisible();
    expect(bookCalls(client)).toHaveLength(1);
    expect(
      client.calls
        .filter((call) => call.path === "/v1/test-payments/{id}")
        .map((call) => call.input["body"]),
    ).toEqual([{ outcome: "failed" }, { outcome: "succeeded" }]);
  });

  it("opens the booking when it can no longer be paid here", async () => {
    await openCheckAndPay({
      pay: () => failure(409, "booking_not_payable"),
      booking: () => northBooking({ ...unpaidBooking, status: "expired" }),
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    expect(
      await screen.findByText("The time to pay ran out, so the seat was freed."),
    ).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
  });

  it("books a free ride with Book, confirmed without a payment", async () => {
    const free = { amount: 0, currency: "ISK" } as const;
    const confirmedFree = northBooking({ ...paidBooking, total: free });
    const { client } = await openBooking({
      trip: () =>
        ok(
          200,
          northTrip(
            { board: 1, alight: 2 },
            { bookingMode: "instant", part: { pricePerSeat: free, total: free } },
          ),
        ),
      book: () => ok(201, confirmedFree),
      booking: () => confirmedFree,
    });
    expect(await screen.findByRole("header", { name: "Book this ride" })).toBeVisible();
    expect(screen.getByText("This ride is free: there's nothing to pay.")).toBeVisible();
    expect(screen.getByText("Free")).toBeVisible();
    expect(screen.queryByText(/^Free cancellation/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Book" }));
    expect(await screen.findByRole("header", { name: "You're booked!" })).toBeVisible();
    expect(bookCalls(client)).toHaveLength(1);
    expect(paymentCalls(client)).toEqual([]);
  });

  describe("paying the driver in person (rule M6, ADR 0038)", () => {
    const inPersonBooking = northBooking({ ...paidBooking, payment: "in_person" });
    const payDriver =
      "Card payments are coming soon. Pay the driver 2,900 ISK in cash or by bank transfer when you get in.";

    it("books with Book, confirmed without a payment, and says how to pay the driver", async () => {
      const { client } = await openBooking({
        payInPerson: true,
        trip: instantTrip,
        book: () => ok(201, inPersonBooking),
        booking: () => inPersonBooking,
      });
      expect(await screen.findByRole("header", { name: "Book this ride" })).toBeVisible();
      expect(screen.getByText(payDriver)).toBeVisible();
      expect(
        screen.getByText("Plans change? Cancel in the app: there's nothing to pay."),
      ).toBeVisible();
      expect(screen.queryByText(/^Free cancellation/)).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: "Book" }));
      expect(await screen.findByRole("header", { name: "You're booked!" })).toBeVisible();
      expect(bookCalls(client)).toHaveLength(1);
      expect(paymentCalls(client)).toEqual([]);
    });

    it("says how to pay the driver before asking, on a request", async () => {
      await openBooking({ payInPerson: true });
      expect(await screen.findByText(payDriver)).toBeVisible();
      expect(screen.queryByText("You pay when Anna says yes.")).toBeNull();
    });

    it("still pays in the app a booking the server made to be paid there", async () => {
      // The switch went off between reading it and booking.
      const { client } = await openBooking({
        payInPerson: true,
        trip: instantTrip,
        book: () => ok(201, unpaidBooking),
        booking: () => paidBooking,
      });
      await fireEvent.press(await screen.findByRole("button", { name: "Book" }));
      expect(await screen.findByRole("button", { name: "Pay 2,900 ISK" })).toBeVisible();
      expect(paymentCalls(client)).toEqual([bookingId]);
    });

    it("shows a confirmed booking's price to pay the driver on its page", async () => {
      await renderApp(`/bookings/${bookingId}`, {
        me: completeMe,
        setUp: (client) => {
          bookingApi(client, () => inPersonBooking);
        },
      });
      expect(await screen.findByText(payDriver)).toBeVisible();
    });
  });

  it("sends one request for a double tap", async () => {
    const { client } = await openBooking();
    const send = await screen.findByRole("button", { name: "Send request" });
    // Both presses land before the screen shows the button busy.
    await act(async () => {
      await Promise.all([fireEvent.press(send), fireEvent.press(send)]);
    });
    expect(await screen.findByRole("header", { name: "Request sent" })).toBeVisible();
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
    expect(await screen.findByText("Anna has until 22:00 to answer.")).toBeVisible();
    expect(screen.getByRole("header", { name: "Request sent" })).toBeVisible();
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
      await screen.findByText("Too many rides opened in a short time. Try again in 2 minutes."),
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
    expect(JSON.parse(kept)).toMatchObject({
      tripId: id,
      board: 1,
      alight: 2,
      seats: 1,
      fromPoint: borgarnes.id,
      toPoint: blonduos.id,
    });
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
    expect(await screen.findByText(/^We couldn't reach PuffinRide/)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("header", { name: "Request sent" })).toBeVisible();
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
    expect(await screen.findByText("Full on your part of the ride")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
    expect(client.calls.filter((call) => call.path === "/v1/trips/{id}")).toHaveLength(2);
    await fireEvent.press(screen.getByRole("button", { name: "Back to the ride" }));
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
    await fireEvent.press(await screen.findByRole("button", { name: "Back to the ride" }));
    expect(await screen.findByText("1 free on your part")).toBeVisible();
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
      pay: () => ok(200, paymentFor(atHigher)),
    });
    const price = () => within(screen.getByTestId("ticket-price"));
    expect(await screen.findByTestId("ticket-price")).toHaveTextContent("2,900 ISK1 seat");
    await fireEvent.press(screen.getByRole("button", { name: "Pay 2,900 ISK" }));
    expect(
      await screen.findByText("The price has changed to 3,100 ISK. Pay this price?"),
    ).toBeVisible();
    // The ride is asked for again, and the ticket and the button name the new total.
    expect(await price().findByText("3,100 ISK")).toBeVisible();
    await waitFor(() => {
      expect(client.calls.filter((call) => call.path === "/v1/trips/{id}")).toHaveLength(2);
    });
    await fireEvent.press(screen.getByRole("button", { name: "Pay 3,100 ISK" }));
    expect(
      await screen.findByRole("header", { name: "Test payment: no money moves" }),
    ).toBeVisible();
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

  it("says what may fit when the trip limit refuses the booking, and leads back (spec 17)", async () => {
    const { client } = await openBooking({ book: () => failure(409, "trip_limit_reached") });
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    expect(
      await screen.findByText(
        "This ride can't take this booking right now. Go back and try fewer seats or a shorter part of the ride.",
      ),
    ).toBeVisible();
    // The price per seat is asked for again, in case it has fallen.
    await waitFor(() => {
      expect(client.calls.filter((call) => call.path === "/v1/trips/{id}")).toHaveLength(2);
    });
    await fireEvent.press(screen.getByRole("button", { name: "Back to the ride" }));
    expect(screen).toHavePathname(`/trips/${id}`);
    expect(screen).toHaveSearchParams({ id, from: "1", to: "2", seats: "1" });
  });

  it.each([
    ["where to get in", `fromPoint=${bsi.id}&toPoint=${blonduos.id}`],
    ["where to get out", `fromPoint=${borgarnes.id}&toPoint=${borgarnes.id}`],
  ])("books nothing when the ride page showed another place %s (spec 6, 3.2)", async (_, shown) => {
    const { client } = await openBooking({}, `/trips/${id}/book?from=1&to=2&seats=1&${shown}`);
    expect(
      await screen.findByText(
        "The driver has changed the ride's stops. Go back to the ride to choose where you get in and out again.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
    expect(bookCalls(client)).toEqual([]);
  });

  it("keeps the part as first shown when the trip comes again with a stop added", async () => {
    let answers = 0;
    const withStop = northStops.flatMap((stop, position) =>
      position === 1
        ? [{ meetingPoint: mosfellsbaer, plannedAt: "2026-11-15T09:30:00.000Z" }, stop]
        : [stop],
    );
    const { client } = await openBooking({
      trip: () => {
        answers += 1;
        return answers === 1
          ? ok(200, northTrip({ board: 1, alight: 2 }))
          : ok(
              200,
              northTrip(
                { board: 1, alight: 2 },
                { stops: withStop.map((stop, position) => ({ ...stop, position })) },
              ),
            );
      },
      book: () => failure(409, "seats_taken", { freeSeats: 1 }),
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    expect(
      await screen.findByText(
        "The driver has changed the ride's stops. Go back to the ride to choose where you get in and out again.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
    expect(bookCalls(client)).toHaveLength(1);
  });

  it("sends the passenger back to the trip when the driver changed its stops meanwhile", async () => {
    await openBooking({ book: () => failure(409, "stops_changed") });
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    expect(
      await screen.findByText(
        "The driver has changed the ride's stops. Go back to the ride to choose where you get in and out again.",
      ),
    ).toBeVisible();
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

  it("says where to read why, when the account was suspended meanwhile (spec 9, 3.6.2)", async () => {
    await openBooking({
      book: () => failure(403, "account_suspended", { suspendedUntil: null }),
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    expect(
      await screen.findByText("Your account is suspended. Read why under Profile, Notices."),
    ).toBeVisible();
  });
});

describe("Check and pay and a request on a laptop (spec 18, 3.8)", () => {
  const phone = { width: 750, height: 1334, scale: 2, fontScale: 2 };
  const laptop = { width: 1280, height: 800, scale: 1, fontScale: 1 };

  beforeEach(() => {
    Dimensions.set({ window: laptop });
  });

  afterEach(async () => {
    // The screen is still on show here, so its update goes through act.
    await act(() => {
      Dimensions.set({ window: phone });
    });
  });

  const main = () => within(screen.getByTestId("columns-main"));
  const side = () => within(screen.getByTestId("columns-side"));

  it("puts what you read and fill in in the main column, with the ride, the total and Send request beside it", async () => {
    await openBooking();
    expect(await screen.findByRole("header", { name: "Request this ride" })).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();

    expect(main().getByText("You pay when Anna says yes.")).toBeVisible();
    expect(
      main().getByText("Free cancellation, with a full refund, up to 15 min before you get in."),
    ).toBeVisible();
    expect(
      main().getByText("You'll see the number plate once your seat is confirmed."),
    ).toBeVisible();
    expect(main().getByLabelText("Message to the driver (optional)")).toBeVisible();
    expect(main().getByText("0 of 300")).toBeVisible();
    expect(main().getByText(/^If you can't make it, cancel as early as you can\./)).toBeVisible();

    // The ride is a ticket there, with what the seats cost at its right.
    const ticket = within(side().getByTestId("booking-ticket"));
    expect(ticket.getByText("Sunday 15 November")).toBeVisible();
    expect(ticket.getByText("10:00")).toBeVisible();
    expect(ticket.getByText("Borgarnes")).toBeVisible();
    expect(ticket.getByText("12:05")).toBeVisible();
    expect(ticket.getByText("Blönduós")).toBeVisible();
    expect(within(ticket.getByTestId("ticket-foot")).getByText("Anna")).toBeVisible();
    expect(ticket.getByText("White Toyota Yaris")).toBeVisible();
    const price = within(ticket.getByTestId("ticket-price"));
    expect(price.getByText("2,900 ISK")).toBeVisible();
    // One seat has no sum to show.
    expect(price.getByText("1 seat")).toBeVisible();
    expect(side().getByRole("button", { name: "Send request" })).toBeEnabled();
    expect(filledButtons()).toBe(1);

    // The side column takes the bottom bar's place, and each thing is there once.
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Send request" })).toHaveLength(1);
    expect(screen.getAllByText("2,900 ISK")).toHaveLength(1);
  });

  it("says first in the main column that booking is paused (spec 10, 3.3)", async () => {
    const paused =
      "Booking and paying are paused for a short while. Your bookings are safe, and none runs out while you can't pay. Try again later.";
    await openBooking({ paused: ["bookings"] });
    expect(await screen.findByRole("header", { name: "Request this ride" })).toBeVisible();
    expect(await main().findByText(paused)).toBeVisible();
    expect(main().getAllByText(/\S/)[0]).toHaveTextContent(paused);
    expect(screen.getAllByText(paused)).toHaveLength(1);
    expect(side().getByRole("button", { name: "Send request" })).toBeVisible();
  });

  it("sends the request with the message typed in the main column", async () => {
    const { client } = await openBooking();
    await fireEvent.changeText(
      await main().findByLabelText("Message to the driver (optional)"),
      "I have one big suitcase.",
    );
    await fireEvent.press(side().getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("header", { name: "Request sent" })).toBeVisible();
    expect(bookCalls(client)).toEqual([
      expect.objectContaining({ message: "I have one big suitcase.", seats: 1 }),
    ]);
  });

  it("opens the payment in the side column in place of Pay, with one booking for a double press", async () => {
    const { client } = await openCheckAndPay();
    expect(await screen.findByRole("header", { name: "Check and pay" })).toBeVisible();
    expect(main().getByText("Your seat is confirmed as soon as you pay.")).toBeVisible();
    expect(screen.queryByLabelText("Message to the driver (optional)")).toBeNull();
    const pay = side().getByRole("button", { name: "Pay 2,900 ISK" });
    await act(async () => {
      await Promise.all([fireEvent.press(pay), fireEvent.press(pay)]);
    });
    expect(
      await side().findByRole("header", { name: "Test payment: no money moves" }),
    ).toBeVisible();
    expect(bookCalls(client)).toHaveLength(1);
    expect(paymentCalls(client)).toHaveLength(1);
    // The sheet takes the place of the button pressed, under the ride.
    expect(side().getByTestId("booking-ticket")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Pay 2,900 ISK" })).toHaveLength(1);
    await fireEvent.press(side().getByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByRole("header", { name: "You're booked!" })).toBeVisible();
  });

  it("says what went wrong in the main column, and in the side column that the part is full", async () => {
    let free = 2;
    await openBooking({
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
    expect(await main().findByText("Sorry, those seats were just taken")).toBeVisible();
    expect(main().getByRole("button", { name: "Back to the ride" })).toBeVisible();
    expect(await side().findByText("Full on your part of the ride")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
  });

  it("keeps the message when the window turns narrow, with the button in the bottom bar again", async () => {
    await openBooking();
    await fireEvent.changeText(
      await screen.findByLabelText("Message to the driver (optional)"),
      "I have one big suitcase.",
    );
    await act(() => {
      Dimensions.set({ window: phone });
    });
    expect(screen.queryByTestId("columns-side")).toBeNull();
    expect(screen.getByLabelText("Message to the driver (optional)")).toHaveDisplayValue(
      "I have one big suitcase.",
    );
    const bar = within(screen.getByTestId("bottom-bar"));
    expect(bar.getByRole("button", { name: "Send request" })).toBeEnabled();
    // And when it turns wide again.
    await act(() => {
      Dimensions.set({ window: laptop });
    });
    expect(main().getByLabelText("Message to the driver (optional)")).toHaveDisplayValue(
      "I have one big suitcase.",
    );
    expect(side().getByRole("button", { name: "Send request" })).toBeEnabled();
  });

  it("keeps the payment open, for the booking made, when the window turns narrow", async () => {
    const { client } = await openCheckAndPay();
    await fireEvent.press(await side().findByRole("button", { name: "Pay 2,900 ISK" }));
    expect(
      await side().findByRole("header", { name: "Test payment: no money moves" }),
    ).toBeVisible();
    await act(() => {
      Dimensions.set({ window: phone });
    });
    const bar = within(screen.getByTestId("bottom-bar"));
    expect(bar.getByRole("header", { name: "Test payment: no money moves" })).toBeVisible();
    await fireEvent.press(bar.getByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByRole("header", { name: "You're booked!" })).toBeVisible();
    expect(bookCalls(client)).toHaveLength(1);
    expect(paymentCalls(client)).toHaveLength(1);
  });

  it("keeps the page, with Back in its place, when the trip cannot be loaded", async () => {
    await openBooking({ trip: () => failure(500, "internal_error") });
    expect(await screen.findByText("The ride could not be loaded.")).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    const column = within(screen.getByTestId("page-column"));
    expect(column.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});

describe("You're booked and Request sent (spec 16, 3.7, items 4 and 5)", () => {
  it("says you're booked after paying, with what happens next and where to stand", async () => {
    await openCheckAndPay();
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByRole("header", { name: "You're booked!" })).toBeVisible();
    expect(
      screen.getByText("Sunday 15 November. Anna picks you up at 10:00 at Borgarnes."),
    ).toBeVisible();
    // The ride as the ticket it is in My rides (spec 31, 3.19), which opens it.
    expect(
      screen.getByRole("button", {
        name: "Passenger, Sunday 15 November, Leaves Borgarnes at 10:00, arrives at Blönduós at 12:05, 2 h 5 min, 1 seat, 2,900 ISK, Anna, Seat confirmed",
      }),
    ).toBeVisible();
    expect(screen.getByRole("header", { name: "What happens next" })).toBeVisible();
    for (const step of [
      "Number plate AB 123",
      "Be at the meeting point a few minutes before 10:00.",
      "Plans change? Cancelling is free up to 15 min before you get in.",
    ]) {
      expect(screen.getByText(step)).toBeVisible();
    }
    expect(screen.getByRole("header", { name: "Where to stand" })).toBeVisible();
    expect(screen.getByText("By the petrol pumps")).toBeVisible();
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await fireEvent.press(screen.getByRole("link", { name: "Open in maps" }));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/maps\.apple\.com\/\?ll=/));
    open.mockRestore();

    expect(screen.getByRole("button", { name: "Find another ride" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "See it in My rides" }));
    expect(await screen.findByRole("tab", { name: "My rides", selected: true })).toBeVisible();
    expect(screen).toHavePathname("/my-rides");
  });

  it("goes back to the trip from You're booked, which now leads to the booking", async () => {
    let booked = false;
    await renderApp(`/trips/${id}?from=1&to=2`, {
      me: completeMe,
      setUp: (client) => {
        tripDetailsApi(client, () =>
          ok(
            200,
            northTrip(
              { board: 1, alight: 2 },
              {
                bookingMode: "instant",
                ...(booked ? { myBooking: { id: bookingId, status: "confirmed" as const } } : {}),
              },
            ),
          ),
        );
        client.answer(
          "/v1/trips/{id}/bookings",
          () => {
            booked = true;
            return ok(201, unpaidBooking);
          },
          "post",
        );
        bookingApi(client, () => paidBooking);
        client.answer(
          "/v1/bookings/{id}/payment",
          () => ok(200, paymentFor(unpaidBooking)),
          "post",
        );
        client.answer("/v1/test-payments/{id}", () => ok(200, paidBooking), "post");
      },
    });
    const bar = await screen.findByTestId("bottom-bar");
    await fireEvent.press(within(bar).getByRole("button", { name: "Book" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByRole("header", { name: "You're booked!" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("You have a booking on this ride.")).toBeVisible();
    expect(screen).toHavePathname(`/trips/${id}`);
  });

  it("says the plate shows later when the driver has not added it", async () => {
    await renderApp(`/bookings/${bookingId}/booked`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () =>
          northBooking({
            ...paidBooking,
            confirmed: { registration: null, whereToStand: null },
          }),
        );
      },
    });
    expect(await screen.findByRole("header", { name: "You're booked!" })).toBeVisible();
    expect(screen.getByText("The number plate shows in My rides before you leave.")).toBeVisible();
    expect(screen.getByRole("header", { name: "Where to stand" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Find another ride" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(screen).toHavePathname("/");
  });

  it("says a request was sent, until when the driver can answer, and what comes next", async () => {
    await openBooking();
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("header", { name: "Request sent" })).toBeVisible();
    expect(screen.getByText("Anna has until 22:00 to answer.")).toBeVisible();
    await fireEvent.press(
      screen.getByRole("button", {
        name: /^Passenger, Sunday 15 November, .*, Anna, Waiting for Anna's answer$/,
      }),
    );
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByRole("header", { name: "Request sent" })).toBeVisible();
    for (const step of [
      "The answer shows in My rides.",
      "When Anna says yes, pay in My rides, under Needs you, to confirm your seat.",
      "No answer in time? The request ends, and you pay nothing.",
    ]) {
      expect(screen.getByText(step)).toBeVisible();
    }
    // Nothing is confirmed yet, so there is nowhere to stand.
    expect(screen.queryByRole("header", { name: "Where to stand" })).toBeNull();
    expect(screen.getByRole("button", { name: "See it in My rides" })).toBeVisible();
  });

  it("opens the booking itself for one that is neither booked nor requested", async () => {
    await renderApp(`/bookings/${bookingId}/booked`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => unpaidBooking);
      },
    });
    expect(await screen.findByRole("header", { name: "Pay to keep your seat" })).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
  });

  it("goes back to the booking when opened with nothing behind it", async () => {
    await renderApp(`/bookings/${bookingId}/booked`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => paidBooking);
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByText("Your seat is confirmed")).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
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
    // The title asks, and says until when; no tag says it a second time.
    expect(await screen.findByRole("header", { name: "Pay to keep your seat" })).toBeVisible();
    expect(screen.getByText("Your seat is held until 12:30.")).toBeVisible();
    expect(screen.queryByText("Waiting for payment")).toBeNull();

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
    expect(await screen.findByRole("header", { name: "Your seat is confirmed" })).toBeVisible();
    expect(screen.getByLabelText("Number plate AB 123")).toBeVisible();
    expect(screen.getByText("Where to stand")).toBeVisible();
    expect(screen.getByText("By the petrol pumps")).toBeVisible();
    expect(screen.queryByRole("header", { name: "Pay to keep your seat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pay 2,900 ISK" })).toBeNull();
    expect(
      client.calls
        .filter((call) => call.path === "/v1/test-payments/{id}")
        .map((call) => call.input["body"]),
    ).toEqual([{ outcome: "failed" }, { outcome: "succeeded" }]);

    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await fireEvent.press(screen.getByRole("link", { name: "Open in maps" }));
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
    expect(screen.getByRole("header", { name: "Pay to keep your seat" })).toBeVisible();
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

  it("names a driver whose account was erased as a former member (spec 11, 3.5)", async () => {
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () =>
          northBooking({
            ...paidBooking,
            status: "completed",
            driver: { ...paidBooking.driver, firstName: null },
            confirmed: { registration: null, whereToStand: null },
          }),
        );
      },
    });
    expect(await screen.findByText("A former member")).toBeVisible();
    expect(screen.queryByText("Anna")).toBeNull();
  });
});

describe("Booking while bookings are paused (spec 10, 3.3)", () => {
  const banner =
    "Booking and paying are paused for a short while. Your bookings are safe, and none runs out while you can't pay. Try again later.";

  it("says so on the booking screen, and not otherwise", async () => {
    await openBooking({ paused: ["bookings"] });
    expect(await screen.findByRole("header", { name: "Request this ride" })).toBeVisible();
    expect(await screen.findByText(banner)).toBeVisible();

    await openBooking({ paused: ["trips"] });
    expect(await screen.findByRole("header", { name: "Request this ride" })).toBeVisible();
    expect(screen.queryByText(banner)).toBeNull();
  });

  it("says so when the API refuses a request sent just as the pause began", async () => {
    await openBooking({ book: () => failure(503, "bookings_paused") });
    await fireEvent.press(await screen.findByRole("button", { name: "Send request" }));
    expect(await screen.findByText(banner)).toBeVisible();
    expect(screen.getByRole("header", { name: "Request this ride" })).toBeVisible();
  });
});

describe("A booking on a laptop (spec 18, 3.9)", () => {
  const phone = { width: 750, height: 1334, scale: 2, fontScale: 2 };
  const laptop = { width: 1280, height: 800, scale: 1, fontScale: 1 };

  beforeEach(() => {
    Dimensions.set({ window: laptop });
  });

  afterEach(async () => {
    // The screen is still on show here, so its update goes through act.
    await act(() => {
      Dimensions.set({ window: phone });
    });
  });

  const main = () => within(screen.getByTestId("columns-main"));
  const side = () => within(screen.getByTestId("columns-side"));
  const loads = (client: FakeClient) =>
    client.calls.filter((call) => call.path === "/v1/bookings/{id}").length;
  /** The text on screen, in reading order. */
  function textsInOrder(): string[] {
    const texts: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === "string") texts.push(node);
      else if (Array.isArray(node)) node.forEach(walk);
      else if (typeof node === "object" && node !== null && "children" in node) {
        walk(node.children);
      }
    };
    walk(screen.toJSON());
    return texts;
  }

  it("has the road, the driver and where to stand in the main column, with the ride and the rows beside them", async () => {
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => paidBooking);
      },
    });
    const title = await screen.findByRole("header", { name: "Your seat is confirmed" });
    expect(screen.getByTestId("page")).toBeVisible();
    expect(title).not.toHaveStyle({ textAlign: "center" });

    expect(main().getByLabelText("Step 1 of 3: Confirmed")).toBeVisible();
    expect(main().getByLabelText("Number plate AB 123")).toBeVisible();
    expect(main().getByRole("header", { name: "Where to stand" })).toBeVisible();
    expect(main().getByText("By the petrol pumps")).toBeVisible();
    // The driver and where to stand share a row where there is room, as
    // cards of one height.
    const [driver, stand, ...more] = within(main().getByTestId("grid")).getAllByTestId("grid-cell");
    if (driver === undefined || stand === undefined) throw new Error("Two cells expected");
    expect(more).toHaveLength(0);
    expect(within(driver).getByLabelText("Number plate AB 123")).toBeVisible();
    expect(within(driver).getByRole("link", { name: "Message Anna" })).toBeVisible();
    expect(within(stand).getByRole("header", { name: "Where to stand" })).toBeVisible();
    for (const cell of [driver, stand]) {
      expect(within(cell).getByTestId("card")).toHaveStyle({ flexGrow: 1 });
    }

    // The ride and its price first, then what can be done about it.
    const ride = within(side().getByTestId("booking-ticket"));
    expect(ride.getByText("1 seat")).toBeVisible();
    expect(ride.getByText("2,900 ISK")).toBeVisible();
    // The rows end the side column: the Safety card they were is gone.
    expect(screen.queryByRole("header", { name: "Safety" })).toBeNull();
    expect(main().queryByText("Weather and roads")).toBeNull();
    const texts = textsInOrder();
    const at = (text: string) => {
      const index = texts.indexOf(text);
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    // The main column is read first, then the side column, top to bottom.
    expect(at("Your seat is confirmed")).toBeLessThan(at("Message"));
    expect(at("Message")).toBeLessThan(at("AB 123"));
    expect(at("AB 123")).toBeLessThan(at("Where to stand"));
    expect(at("Where to stand")).toBeLessThan(at("2,900 ISK"));
    expect(at("2,900 ISK")).toBeLessThan(at("Share the ride's details"));
    expect(at("Share the ride's details")).toBeLessThan(at("Weather and roads"));
    expect(at("Weather and roads")).toBeLessThan(at("Cancel booking"));
    // Each once.
    expect(side().getByRole("button", { name: "Cancel booking" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Cancel booking" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Message Anna" })).toHaveLength(1);
    expect(screen.getAllByText("2,900 ISK")).toHaveLength(1);
    expect(screen.getAllByText("Weather and roads")).toHaveLength(1);
  });

  it("pays at the top of the side column, and keeps the payment open when the window turns narrow and wide again", async () => {
    let booking = unpaidBooking;
    const { client } = await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (fake) => {
        bookingApi(fake, () => booking);
        fake.answer("/v1/bookings/{id}/payment", () => ok(200, paymentFor(unpaidBooking)));
        fake.answer("/v1/test-payments/{id}", () => {
          booking = paidBooking;
          return ok(200, booking);
        });
      },
    });
    expect(await screen.findByRole("header", { name: "Pay to keep your seat" })).toBeVisible();
    expect(screen.getByText("Your seat is held until 12:30.")).toBeVisible();
    // The price stands with the ride, under what to do now.
    expect(side().getByText("2,900 ISK")).toBeVisible();
    expect(filledButtons()).toBe(1);
    await fireEvent.press(side().getByRole("button", { name: "Pay 2,900 ISK" }));
    const sheet = { name: "Test payment: no money moves" } as const;
    expect(await side().findByRole("header", sheet)).toBeVisible();

    await act(() => {
      Dimensions.set({ window: phone });
    });
    expect(screen.queryByTestId("page")).toBeNull();
    expect(within(screen.getByTestId("bottom-bar")).getByRole("header", sheet)).toBeVisible();
    await act(() => {
      Dimensions.set({ window: laptop });
    });
    expect(side().getByRole("header", sheet)).toBeVisible();
    // Nothing was asked for again.
    expect(paymentCalls(client)).toEqual([unpaidBooking.id]);
    expect(loads(client)).toBe(1);

    await fireEvent.press(side().getByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByRole("header", { name: "Your seat is confirmed" })).toBeVisible();
    expect(main().getByRole("link", { name: "Message Anna" })).toBeVisible();
    expect(filledButtons()).toBe(0);
  });

  it("keeps the question about withdrawing a request open across the window's widths", async () => {
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => northBooking());
      },
    });
    await fireEvent.press(await side().findByRole("button", { name: "Withdraw request" }));
    expect(side().getByRole("button", { name: "Keep my request" })).toBeVisible();
    // Nowhere to stand yet: the driver's card has the row to itself.
    expect(within(main().getByTestId("grid")).getAllByTestId("grid-cell")).toHaveLength(1);
    // No chat and no plate before the seat is confirmed; the ride is beside.
    expect(side().getByText("2,900 ISK")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Message Anna" })).toBeNull();

    await act(() => {
      Dimensions.set({ window: phone });
    });
    expect(
      within(screen.getByTestId("bottom-bar")).getByRole("button", { name: "Keep my request" }),
    ).toBeVisible();
    await act(() => {
      Dimensions.set({ window: laptop });
    });
    expect(side().getByRole("button", { name: "Keep my request" })).toBeVisible();
  });

  it("shows the driver a passenger's booking in the two columns, with no status or cancelling of the passenger's", async () => {
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => ({ ...paidBooking, viewer: "driver" }));
      },
    });
    expect(await side().findByRole("link", { name: "Message Gunna" })).toBeVisible();
    expect(side().getByText("2,900 ISK")).toBeVisible();
    expect(side().getByText("Weather and roads")).toBeVisible();
    expect(main().getByLabelText("Number plate AB 123")).toBeVisible();
    // The passenger's title, Pay and "Cancel booking" are the passenger's.
    expect(screen.queryByText("Your seat is confirmed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
    expect(filledButtons()).toBe(0);
    // Nothing stands in both columns.
    expect(screen.getAllByText("2,900 ISK")).toHaveLength(1);
    expect(screen.getAllByLabelText("Number plate AB 123")).toHaveLength(1);
  });

  it("is a page while it loads and when it cannot be loaded, the notice in a column at its left", async () => {
    let answer: (value: unknown) => void = () => undefined;
    let tries = 0;
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        client.answer(
          "/v1/bookings/{id}",
          () => {
            tries += 1;
            if (tries > 1) return ok(200, paidBooking);
            return new Promise((resolve) => {
              answer = resolve;
            });
          },
          "get",
        );
      },
    });
    expect(await screen.findByLabelText("Loading")).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    expect(screen.getByRole("button", { name: "Back" })).toBeVisible();

    await act(() => {
      answer(failure(500, "internal_error"));
    });
    const column = within(await screen.findByTestId("page-column"));
    expect(column.getByText("The booking could not be loaded.")).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    await fireEvent.press(column.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("header", { name: "Your seat is confirmed" })).toBeVisible();
    expect(main().getByTestId("driver-card")).toBeVisible();
  });

  it("is the phone's one column on a phone: the ride, the driver with the chat, where to stand, then the rows", async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => paidBooking);
      },
    });
    expect(await screen.findByRole("header", { name: "Your seat is confirmed" })).toBeVisible();
    expect(screen.queryByTestId("page")).toBeNull();
    expect(screen.queryByTestId("columns-side")).toBeNull();
    expect(screen.queryByTestId("grid")).toBeNull();
    for (const card of screen.getAllByTestId("card")) {
      expect(card).not.toHaveStyle({ flexGrow: 1 });
    }
    const texts = textsInOrder();
    const at = (text: string) => {
      const index = texts.indexOf(text);
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    expect(at("Your seat is confirmed")).toBeLessThan(at("2,900 ISK"));
    expect(at("2,900 ISK")).toBeLessThan(at("Message"));
    expect(at("Message")).toBeLessThan(at("AB 123"));
    expect(at("AB 123")).toBeLessThan(at("Where to stand"));
    expect(at("Where to stand")).toBeLessThan(at("Weather and roads"));
    expect(at("Weather and roads")).toBeLessThan(at("Cancel booking"));
  });
});
