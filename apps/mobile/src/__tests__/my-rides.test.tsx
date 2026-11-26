import type { Booking, MyTrip } from "@shareride/contracts";
import { act, fireEvent, screen, within } from "expo-router/testing-library";
import { Dimensions } from "react-native";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  bookingApi,
  driverApi,
  northBooking,
  northMyTrip,
  northSegments,
  paidBooking,
  requestToDrive,
  unpaidBooking,
} from "@/testing/bookings";
import { now } from "@/lib/clock";
import { filledButtons } from "@/testing/buttons";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { searchApi } from "@/testing/search";
import { onTheDay, tripOnTheDay } from "@/testing/trip-day";
import { tripsApi } from "@/testing/trips";
import { colors } from "@/theme/tokens";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland.
jest.mock("@/lib/clock", () => ({ now: jest.fn(() => new Date("2026-11-14T12:00:00Z")) }));

const bookingId = northBooking().id;
const declinedId = "0190a1d6-0000-7000-8000-0000000000b2";
const withdrawnId = "0190a1d6-0000-7000-8000-0000000000b3";
/** A request the driver declined: the deadline is gone, as the server sends it. */
const declined = northBooking({ id: declinedId, status: "declined", requestExpiresAt: null });
/** A request withdrawn before the driver answered, as the server sends it. */
const withdrawn = northBooking({ id: withdrawnId, status: "cancelled", withdrawn: true });
/** The open request once withdrawn, as the server answers. */
const withdrawnHere = northBooking({ status: "cancelled", withdrawn: true });

/** Sunday 15 November, 10:00, waiting for payment until 12:30 today. */
const unpaid = { ...unpaidBooking, id: "0190a1d6-0000-7000-8000-0000000000c1" };
/** Monday 16 November, paid. */
const confirmed = northBooking({
  ...paidBooking,
  id: "0190a1d6-0000-7000-8000-0000000000c2",
  board: { ...paidBooking.board, plannedAt: "2026-11-16T10:00:00.000Z" },
  alight: { ...paidBooking.alight, plannedAt: "2026-11-16T12:05:00.000Z" },
});
/** Anna drives on Sunday at 09:00, with a request to answer by 08:10 tomorrow. */
const driving: MyTrip = { ...northMyTrip, requestsCloseAt: "2026-11-15T08:10:00.000Z" };
/** Anna drives again on Tuesday, one seat booked all the way. */
const drivingLater: MyTrip = {
  ...northMyTrip,
  id: "0190a1d6-0000-7000-8000-0000000000d1",
  departsAt: "2026-11-17T09:00:00.000Z",
  arrivesAt: "2026-11-17T14:00:00.000Z",
  segments: northSegments([1, 1, 1]),
  takings: { amount: 0, currency: "ISK" },
  openRequests: 0,
  requestsCloseAt: null,
  firstRequest: null,
};
/** A trip Anna drove last week. */
const drove: MyTrip = {
  ...drivingLater,
  id: "0190a1d6-0000-7000-8000-0000000000d2",
  departsAt: "2026-11-07T09:00:00.000Z",
  arrivesAt: "2026-11-07T14:00:00.000Z",
};

type Lists = Partial<Record<"upcoming" | "past", { bookings?: Booking[]; trips?: MyTrip[] }>>;

/** Answers My rides' two lists: my bookings and the trips I drive, by `when`. */
function myRidesApi(client: FakeClient, lists: Lists = {}) {
  const listOf = (input: Record<string, unknown>) => {
    const { when } = input["query"] as { when: "upcoming" | "past" };
    return lists[when] ?? {};
  };
  client.answer("/v1/me/bookings", (input) => ok(200, { bookings: listOf(input).bookings ?? [] }));
  client.answer("/v1/me/trips", (input) => ok(200, { trips: listOf(input).trips ?? [] }));
}

/** The tickets of My rides in order, by what their names start with. */
const rowNames = () =>
  screen
    .getAllByRole("button", { name: /^(Passenger|You drive), / })
    .map((row) => String(row.props.accessibilityLabel));

describe("My rides (spec 16, 3.3)", () => {
  it("puts what needs you first, the soonest need first, then every ride as a ticket marked Passenger or You drive", async () => {
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        myRidesApi(client, {
          upcoming: {
            bookings: [northBooking(), unpaid, confirmed],
            trips: [drivingLater, driving],
          },
        });
      },
    });
    await fireEvent.press(await screen.findByRole("tab", { name: "My rides" }));
    expect(await screen.findByRole("header", { name: "My rides" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Coming up" })).toBeChecked();
    expect(await screen.findByRole("header", { name: "Needs you" })).toBeVisible();
    expect(screen.getByRole("header", { name: "Coming up" })).toBeVisible();
    // To pay by 12:30 today comes before a request to answer by 08:10 tomorrow,
    // though the ride with the request leaves first.
    expect(rowNames()).toEqual([
      expect.stringMatching(/^Passenger, Sunday 15 November, .*, Pay by 12:30$/),
      expect.stringMatching(/^You drive, Sunday 15 November, .*, Answer Gunna's request$/),
      expect.stringMatching(/^Passenger, Sunday 15 November, .*Waiting for Anna's answer$/),
      expect.stringMatching(/^Passenger, Monday 16 November, .*Seat confirmed$/),
      expect.stringMatching(/^You drive, Tuesday 17 November, /),
    ]);
    // Each ride is a ticket (R31.2), and what it needs is in its foot, in yellow:
    // the ticket opens where that is done, so no button stands under it.
    expect(screen.getAllByTestId("my-ride")).toHaveLength(5);
    expect(screen.getByText("Pay by 12:30")).toHaveStyle({ color: colors.light.warning });
    expect(screen.getByText("Answer Gunna's request")).toHaveStyle({
      color: colors.light.warning,
    });
    expect(screen.queryByRole("button", { name: /^(Pay|Answer) / })).toBeNull();
    expect(filledButtons()).toBe(0);
    // A seat says its driver and price; a ride I drive its seats taken.
    expect(
      screen.getByRole("button", {
        name: "Passenger, Sunday 15 November, Leaves Borgarnes at 10:00, arrives at Blönduós at 12:05, 2 h 5 min, 1 seat, 2,900 ISK, Anna, Waiting for Anna's answer",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "You drive, Sunday 15 November, Leaves BSÍ bus terminal at 09:00, arrives at Hof, Akureyri at 14:00, 5 h, 2 stops, 1 of 3 seats taken, Answer Gunna's request",
      }),
    ).toBeVisible();
    expect(screen.getAllByText("1 of 3 seats taken")).toHaveLength(2);
    // The seats free on each stretch are on the ride's own page (spec 31, 3.5 item 4).
    expect(screen.queryByText(/free/)).toBeNull();
  });

  it("puts a ride on its trip day under Needs you, saying when it leaves (spec 31, 3.3)", async () => {
    await renderApp("/my-rides", {
      me: completeMe,
      setUp: (client) => {
        myRidesApi(client, {
          upcoming: {
            bookings: [onTheDay(), confirmed],
            trips: [
              { ...tripOnTheDay(), openRequests: 0, requestsCloseAt: null, firstRequest: null },
            ],
          },
        });
      },
    });
    expect(await screen.findByRole("header", { name: "Needs you" })).toBeVisible();
    expect(screen.getByRole("header", { name: "Coming up" })).toBeVisible();
    expect(rowNames()).toEqual([
      expect.stringMatching(
        /^You drive, Sunday 15 November, .*, 1 of 3 seats taken, Leaves at 09:00$/,
      ),
      expect.stringMatching(/^Passenger, Sunday 15 November, .*, Anna, Leaves at 10:00$/),
      expect.stringMatching(/^Passenger, Monday 16 November, .*, Seat confirmed$/),
    ]);
    expect(screen.getByText("Leaves at 09:00")).toHaveStyle({ color: colors.light.warning });
    expect(screen.getByText("Leaves at 10:00")).toBeVisible();
    // The ticket opens the ride, where "I'm here" is.
    expect(screen.queryByRole("button", { name: /^(Pay|Answer)/ })).toBeNull();
  });

  it("counts the minutes to leaving down while My rides stays open", async () => {
    const mockedNow = now as jest.Mock<Date, []>;
    jest.useFakeTimers();
    try {
      await renderApp("/my-rides", {
        me: completeMe,
        setUp: (client) => {
          myRidesApi(client, { upcoming: { bookings: [onTheDay()], trips: [] } });
        },
      });
      expect(await screen.findByText("Leaves at 10:00")).toBeVisible();
      // The next morning, 40 minutes before, with the screen left open.
      mockedNow.mockReturnValue(new Date("2026-11-15T09:20:00Z"));
      await act(() => jest.advanceTimersByTimeAsync(30_000));
      expect(screen.getByText("Leaves in 40 minutes")).toBeVisible();
      mockedNow.mockReturnValue(new Date("2026-11-15T09:35:00Z"));
      await act(() => jest.advanceTimersByTimeAsync(30_000));
      expect(screen.getByText("Leaves in 25 minutes")).toBeVisible();
    } finally {
      mockedNow.mockImplementation(() => new Date("2026-11-14T12:00:00Z"));
      jest.useRealTimers();
    }
  });

  it("opens the booking to pay, and the driver's trip page to answer the requests", async () => {
    await renderApp("/my-rides", {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [driving]);
        driverApi(client, [requestToDrive]);
        bookingApi(client, () => unpaid);
        myRidesApi(client, { upcoming: { bookings: [unpaid], trips: [driving] } });
      },
    });
    await fireEvent.press(
      await screen.findByRole("button", { name: /^Passenger, .*, Pay by 12:30$/ }),
    );
    expect(await screen.findByText("Your seat is held until 12:30.")).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${unpaid.id}`);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: /^You drive, .*, Answer Gunna's request$/ }),
    );
    expect(await screen.findByText("One small bag.")).toBeVisible();
    expect(screen).toHavePathname(`/drive/trips/${driving.id}`);
  });

  it("opens a ride from its ticket", async () => {
    await renderApp("/my-rides", {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => northBooking());
        myRidesApi(client, { upcoming: { bookings: [northBooking()] } });
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: /^Passenger, / }));
    expect(await screen.findByText("Anna has until 22:00 to answer.")).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
  });

  it("lists past rides latest first, with nothing under Needs you", async () => {
    await renderApp("/my-rides", {
      me: completeMe,
      setUp: (client) => {
        myRidesApi(client, {
          upcoming: { bookings: [unpaid] },
          past: {
            bookings: [
              withdrawn,
              { ...declined, board: { ...declined.board, plannedAt: "2026-11-01T10:00:00.000Z" } },
            ],
            trips: [drove],
          },
        });
      },
    });
    expect(await screen.findByRole("header", { name: "Needs you" })).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Past" }));
    expect(await screen.findByText("Withdrawn")).toBeVisible();
    expect(screen).toHaveSearchParams({ when: "past" });
    expect(screen.queryByRole("header", { name: "Needs you" })).toBeNull();
    expect(rowNames()).toEqual([
      expect.stringMatching(/^Passenger, Sunday 15 November, .*Withdrawn/),
      expect.stringMatching(/^You drive, Saturday 7 November, /),
      expect.stringMatching(/^Passenger, Sunday 1 November, .*Declined/),
    ]);
  });

  it("lists a trip the driver cancelled under Past, saying so and why (spec 6, 3.1)", async () => {
    const cancelled: MyTrip = {
      ...drivingLater,
      status: "cancelled",
      cancellation: { reason: "weather", note: "", countsOnReliability: false },
    };
    await renderApp("/my-rides?when=past", {
      me: completeMe,
      setUp: (client) => {
        myRidesApi(client, { past: { trips: [cancelled] } });
      },
    });
    const row = await screen.findByRole("button", { name: /^You drive, / });
    expect(String(row.props.accessibilityLabel)).toMatch(
      /Cancelled.*You cancelled this ride: Weather/,
    );
    // A quiet tag, as on a cancelled booking: nothing is asked of anyone (spec 31, 3.3).
    expect(within(row).getByText("Cancelled")).toHaveStyle({ color: colors.light.textMuted });
    expect(screen.queryByText(/seats? taken/)).toBeNull();
  });

  it("offers Find a ride and Offer a ride when nothing is coming up", async () => {
    await renderApp("/my-rides", {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client);
        myRidesApi(client);
      },
    });
    expect(
      await screen.findByText(
        "Nothing coming up. Book a seat on a ride, or offer the empty seats in your car.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("header", { name: "Needs you" })).toBeNull();
    expect(screen.getByTestId("puffin-by-pin", { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Find a ride" }));
    expect(screen).toHavePathname("/");
    await fireEvent.press(await screen.findByRole("tab", { name: "My rides" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Offer a ride" }));
    expect(screen).toHavePathname("/offer");
  });

  it("says when nothing is past", async () => {
    await renderApp("/my-rides?when=past", {
      me: completeMe,
      setUp: (client) => {
        myRidesApi(client);
      },
    });
    expect(
      await screen.findByText(
        "Rides show here once they're over, and requests once they're declined, run out or are withdrawn.",
      ),
    ).toBeVisible();
  });

  it("says once when the rides could not be loaded, with a retry", async () => {
    let tries = 0;
    await renderApp("/my-rides", {
      me: completeMe,
      setUp: (client) => {
        myRidesApi(client, { upcoming: { bookings: [northBooking()] } });
        // Only the trips fail, the first time.
        client.answer("/v1/me/trips", () => {
          tries += 1;
          return tries === 1 ? failure(500, "internal_error") : ok(200, { trips: [] });
        });
      },
    });
    expect(await screen.findByText("Your rides could not be loaded.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Passenger, / })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /^Passenger, / })).toBeVisible();
    expect(screen.queryByText("Your rides could not be loaded.")).toBeNull();
  });
});

describe("Withdrawing a request (spec 5, 3.4; R5.8)", () => {
  async function openRequest(withdraw: () => unknown) {
    let booking = northBooking();
    const app = await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => booking);
        searchApi(client);
        client.answer("/v1/bookings/{id}/withdraw", () => {
          const answer = withdraw();
          if ((answer as { ok: boolean }).ok) booking = withdrawnHere;
          return answer;
        });
      },
    });
    return {
      ...app,
      change: (next: Booking) => {
        booking = next;
      },
    };
  }

  it("asks once more, withdraws, and offers the same search again", async () => {
    const { client } = await openRequest(() => ok(200, withdrawnHere));
    await fireEvent.press(await screen.findByRole("button", { name: "Withdraw request" }));
    expect(screen.getByText("Number plate shown once your seat is confirmed")).toBeVisible();
    expect(
      screen.getByText("Withdraw your request? Anna won't see it any more, and the seat is freed."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Keep my request" }));
    expect(screen.queryByText(/^Withdraw your request\?/)).toBeNull();
    expect(client.calls.filter((call) => call.path === "/v1/bookings/{id}/withdraw")).toEqual([]);

    await fireEvent.press(screen.getByRole("button", { name: "Withdraw request" }));
    await fireEvent.press(screen.getByRole("button", { name: "Withdraw request" }));
    expect(
      await screen.findByText("You withdrew this request. That never counts against you."),
    ).toBeVisible();
    expect(screen.getByText("Withdrawn")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Withdraw request" })).toBeNull();
    // The seat will never be confirmed, so the plate is not promised.
    expect(screen.queryByText(/^Number plate/)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Find another ride" }));
    expect(screen).toHavePathname("/search/results");
    expect(screen).toHaveSearchParams({
      from: withdrawn.board.meetingPoint.id,
      to: withdrawn.alight.meetingPoint.id,
      fromName: "Borgarnes",
      toName: "Blönduós",
      seats: "1",
      date: "2026-11-15",
    });
  });

  it("says when the driver answered first, and shows what they decided", async () => {
    const app = await openRequest(() => failure(409, "booking_not_requested"));
    app.change(unpaidBooking);
    await fireEvent.press(await screen.findByRole("button", { name: "Withdraw request" }));
    await fireEvent.press(screen.getByRole("button", { name: "Withdraw request" }));
    expect(await screen.findByRole("header", { name: "Pay to keep your seat" })).toBeVisible();
    expect(screen.getByText("This request was already answered or ran out.")).toBeVisible();
    // The question went with the request: Pay is what the bar holds now.
    expect(screen.queryByRole("button", { name: "Withdraw request" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Keep my request" })).toBeNull();
    expect(
      within(screen.getByTestId("bottom-bar")).getByRole("button", { name: "Pay 2,900 ISK" }),
    ).toBeVisible();
  });

  it("keeps the question open when withdrawing fails, to try again", async () => {
    let tries = 0;
    const { client } = await openRequest(() => {
      tries += 1;
      return tries === 1 ? failure(500, "internal_error") : ok(200, withdrawnHere);
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Withdraw request" }));
    await fireEvent.press(screen.getByRole("button", { name: "Withdraw request" }));
    expect(await screen.findByText(/^Withdraw your request\?/)).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Withdraw request" }));
    expect(
      await screen.findByText("You withdrew this request. That never counts against you."),
    ).toBeVisible();
    expect(client.calls.filter((call) => call.path === "/v1/bookings/{id}/withdraw")).toHaveLength(
      2,
    );
  });

  it("offers search again on a declined request, on any day once that day has passed", async () => {
    const app = await renderApp(`/bookings/${declinedId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => ({
          ...declined,
          board: { ...declined.board, plannedAt: "2026-11-13T10:00:00.000Z" },
          alight: { ...declined.alight, plannedAt: "2026-11-13T12:05:00.000Z" },
        }));
        searchApi(client);
      },
    });
    expect(await screen.findByText("The driver couldn't take this request")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Find another ride" }));
    expect(screen).toHavePathname("/search/results");
    expect(app.getSearchParams()).not.toHaveProperty("date");
  });

  it("offers search again when the driver didn't answer in time", async () => {
    const app = await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => northBooking({ status: "expired" }));
        searchApi(client);
      },
    });
    expect(await screen.findByText("The driver didn't answer in time")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Find another ride" }));
    expect(screen).toHavePathname("/search/results");
    expect(app.getSearchParams()).toMatchObject({ date: "2026-11-15", seats: "1" });
  });

  it("tells a cancellation apart from a withdrawn request", async () => {
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => ({ ...paidBooking, status: "cancelled", confirmed: null }));
      },
    });
    expect(await screen.findByText("Cancelled")).toBeVisible();
    expect(screen.queryByText("Withdrawn")).toBeNull();
    expect(screen.queryByText(/^You withdrew/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Find another ride" })).toBeNull();
    expect(screen.queryByText(/^Number plate/)).toBeNull();
  });
});

describe("My rides on a laptop (spec 18, 3.10)", () => {
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

  it("shows the rides as grids of tickets on a page, what needs you first, each saying what it needs", async () => {
    await renderApp("/my-rides", {
      me: completeMe,
      setUp: (client) => {
        myRidesApi(client, {
          upcoming: {
            bookings: [northBooking(), unpaid, confirmed],
            trips: [drivingLater, driving],
          },
        });
      },
    });
    expect(await screen.findByRole("header", { name: "Needs you" })).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    // The title starts at the left, with the choice under it.
    expect(screen.getByRole("header", { name: "My rides" })).not.toHaveStyle({
      textAlign: "center",
    });
    expect(screen.getByRole("radio", { name: "Coming up" })).toBeChecked();

    // The order is the phone's: what needs you, then the rest, soonest first.
    expect(rowNames()).toEqual([
      expect.stringMatching(/^Passenger, Sunday 15 November, .*Pay by 12:30$/),
      expect.stringMatching(/^You drive, Sunday 15 November, /),
      expect.stringMatching(/^Passenger, Sunday 15 November, .*Waiting for Anna's answer$/),
      expect.stringMatching(/^Passenger, Monday 16 November, /),
      expect.stringMatching(/^You drive, Tuesday 17 November, /),
    ]);
    // A grid under each heading, a ride to a cell.
    const [needing, rest, ...more] = screen.getAllByTestId("grid");
    if (needing === undefined || rest === undefined) throw new Error("Two grids expected");
    expect(more).toHaveLength(0);
    const cells = within(needing).getAllByTestId("grid-cell");
    expect(cells).toHaveLength(2);
    expect(within(rest).getAllByTestId("grid-cell")).toHaveLength(3);
    // What a ride needs is in its own ticket's foot, and the cell holds nothing else.
    const [pay, answer] = cells;
    if (answer === undefined || pay === undefined) throw new Error("Two cells expected");
    expect(within(pay).getByRole("button", { name: /^Passenger, Sunday/ })).toBeVisible();
    expect(within(pay).getByText("Pay by 12:30")).toBeVisible();
    expect(within(answer).getByRole("button", { name: /^You drive, Sunday/ })).toBeVisible();
    expect(within(answer).getByText("Answer Gunna's request")).toBeVisible();
    expect(within(needing).getAllByRole("button")).toHaveLength(2);
    // The tickets of a row are as tall as the tallest.
    for (const card of screen.getAllByTestId("card")) expect(card).toHaveStyle({ flexGrow: 1 });
  });

  it("shows past rides as a grid too, and keeps the choice when the window turns narrow", async () => {
    await renderApp("/my-rides?when=past", {
      me: completeMe,
      setUp: (client) => {
        myRidesApi(client, { past: { bookings: [declined, withdrawn], trips: [drove] } });
      },
    });
    expect(
      await screen.findByRole("button", { name: /^You drive, Saturday 7 November/ }),
    ).toBeVisible();
    expect(within(screen.getByTestId("grid")).getAllByTestId("grid-cell")).toHaveLength(3);
    expect(screen.queryByRole("header", { name: "Needs you" })).toBeNull();

    await act(() => {
      Dimensions.set({ window: phone });
    });
    expect(screen.getByRole("radio", { name: "Past" })).toBeChecked();
    expect(screen.getByRole("button", { name: /^You drive, Saturday 7 November/ })).toBeVisible();
    expect(screen.queryByTestId("grid")).toBeNull();
    expect(screen.queryByTestId("page")).toBeNull();
    for (const card of screen.getAllByTestId("card")) {
      expect(card).not.toHaveStyle({ flexGrow: 1 });
    }

    await act(() => {
      Dimensions.set({ window: laptop });
    });
    expect(screen.getByRole("radio", { name: "Past" })).toBeChecked();
    expect(within(screen.getByTestId("grid")).getAllByTestId("grid-cell")).toHaveLength(3);
  });

  it("offers Find a ride and Offer a ride in a column at the page's left when nothing is coming up", async () => {
    await renderApp("/my-rides", {
      me: completeMe,
      setUp: (client) => {
        myRidesApi(client);
      },
    });
    const column = within(await screen.findByTestId("page-column"));
    expect(
      column.getByText(
        "Nothing coming up. Book a seat on a ride, or offer the empty seats in your car.",
      ),
    ).not.toHaveStyle({ textAlign: "center" });
    expect(column.getByRole("button", { name: "Find a ride" })).toBeVisible();
    expect(column.getByRole("button", { name: "Offer a ride" })).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    expect(screen.queryByTestId("grid")).toBeNull();

    await fireEvent.press(screen.getByRole("radio", { name: "Past" }));
    const past = within(await screen.findByTestId("page-column"));
    expect(
      await past.findByText(
        "Rides show here once they're over, and requests once they're declined, run out or are withdrawn.",
      ),
    ).not.toHaveStyle({ textAlign: "center" });
  });

  it("says that the rides could not be loaded in a column at the page's left, with a retry", async () => {
    let tries = 0;
    await renderApp("/my-rides", {
      me: completeMe,
      setUp: (client) => {
        myRidesApi(client, { upcoming: { bookings: [confirmed] } });
        // Only the trips fail, the first time.
        client.answer("/v1/me/trips", () => {
          tries += 1;
          return tries === 1 ? failure(500, "internal_error") : ok(200, { trips: [] });
        });
      },
    });
    const column = within(await screen.findByTestId("page-column"));
    expect(column.getByText("Your rides could not be loaded.")).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    await fireEvent.press(column.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: /^Passenger, Monday 16 November/ }),
    ).toBeVisible();
    expect(screen.getByTestId("grid")).toBeVisible();
  });
});
