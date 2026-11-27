import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { AccessibilityInfo, Dimensions } from "react-native";
import type { Booking, MyTrip } from "@shareride/contracts";
import { renderApp, completeMe } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { bookingApi, driverApi, northBooking, northMyTrip, paidBooking } from "@/testing/bookings";
import { filledButtons } from "@/testing/buttons";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { onTheDay, rider, tripOnTheDay } from "@/testing/trip-day";
import { tripsApi } from "@/testing/trips";
import { colors } from "@/theme/tokens";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({
  getLocales: jest.fn(() => [{ languageTag: "en-GB" }]),
}));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Sunday 15 November 2026, 09:45 in Iceland: the north trip left BSÍ at
// 09:00 and is due in Borgarnes, where Gunna gets in, at 10:00.
const inBorgarnes = new Date("2026-11-15T09:45:00Z");
let mockNow = inBorgarnes;
jest.mock("@/lib/clock", () => ({ now: () => mockNow }));

afterEach(() => {
  mockNow = inBorgarnes;
});

/**
 * The booking page for `start`. Saying "I'm here" answers with `answer`, or
 * as the server would: the booking then shows it said. `change` changes
 * what the next load of the booking answers.
 */
async function openBooking(start: Booking, answer?: () => unknown) {
  let booking = start;
  const rendered = await renderApp(`/bookings/${booking.id}`, {
    me: completeMe,
    setUp: (client) => {
      bookingApi(client, () => booking);
      client.answer("/v1/bookings/{id}/check-in", () => {
        if (answer !== undefined) return answer();
        const checkedInAt = mockNow.toISOString();
        if (booking.tripDay !== null) {
          booking = {
            ...booking,
            tripDay: { ...booking.tripDay, passengerCheckedInAt: checkedInAt },
          };
        }
        return ok(200, { checkedInAt });
      });
    },
  });
  return {
    ...rendered,
    change: (next: Booking) => {
      booking = next;
    },
  };
}

/** Loads of `path` so far. */
const loadsOf = (client: FakeClient, path: string) =>
  client.calls.filter((call) => call.path === path).length;

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

const imHere = { name: "I'm here" } as const;

describe("the passenger's trip day (spec 8, 3.1; spec 31, 3.9)", () => {
  it("puts when and where first, then where to stand, the driver and car, and the part, with I'm here in the bar", async () => {
    await openBooking(onTheDay());
    expect(await screen.findByRole("header", { name: "Leaves in 15 minutes" })).toBeVisible();
    const texts = textsInOrder();
    const at = (text: string) => {
      const index = texts.indexOf(text);
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    expect(at("Leaves in 15 minutes")).toBeLessThan(at("Today at 10:00 from Borgarnes."));
    expect(at("Today at 10:00 from Borgarnes.")).toBeLessThan(at("Where to stand"));
    expect(at("Where to stand")).toBeLessThan(at("By the petrol pumps"));
    expect(at("By the petrol pumps")).toBeLessThan(at("Message"));
    expect(at("Message")).toBeLessThan(at("AB 123"));
    expect(at("AB 123")).toBeLessThan(at("Blönduós"));
    expect(at("Blönduós")).toBeLessThan(at("I'm here"));
    // The one thing to do now is under the thumb, whatever is scrolled to.
    expect(within(screen.getByTestId("bottom-bar")).getByRole("button", imHere)).toBeVisible();
    expect(screen.getByRole("link", { name: "Message Anna" })).toBeVisible();
  });

  it("leaves the prompt to add an email for another day", async () => {
    await openBooking(onTheDay());
    expect(await screen.findByRole("header", { name: "Leaves in 15 minutes" })).toBeVisible();
    expect(screen.queryByText(/Add an email/)).toBeNull();
  });

  it("keeps the usual page before the trip day", async () => {
    await openBooking(onTheDay({ phase: "upcoming" }));
    expect(await screen.findByRole("header", { name: "Your seat is confirmed" })).toBeVisible();
    expect(screen.queryByRole("header", { name: /^Leaves in/ })).toBeNull();
    expect(screen.queryByRole("button", imHere)).toBeNull();
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
  });

  it("is only for a confirmed booking", async () => {
    await openBooking(onTheDay({}, { status: "completed" }));
    expect(await screen.findByRole("header", { name: "Completed" })).toBeVisible();
    expect(screen.queryByRole("header", { name: /^Leaves in/ })).toBeNull();
    expect(screen.queryByRole("button", imHere)).toBeNull();
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
  });
});

describe("the passenger's trip day on a laptop (spec 18, 3.9; spec 31, 3.16)", () => {
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

  it("has where to stand and the driver in the main column, with I'm here over the ride beside them", async () => {
    // The booking the page loads again does not say I'm here: what was
    // said shows only for as long as the part that said it is kept.
    const { client } = await openBooking(onTheDay(), () =>
      ok(200, { checkedInAt: mockNow.toISOString() }),
    );
    expect(await screen.findByRole("header", { name: "Leaves in 15 minutes" })).toBeVisible();
    const main = within(screen.getByTestId("columns-main"));
    const side = within(screen.getByTestId("columns-side"));
    expect(main.getByText("By the petrol pumps")).toBeVisible();
    expect(main.getByLabelText("Number plate AB 123")).toBeVisible();
    expect(main.getByRole("link", { name: "Message Anna" })).toBeVisible();
    // Where to stand comes before the driver on the day, in one row.
    const [stand, driver] = within(main.getByTestId("grid")).getAllByTestId("grid-cell");
    if (stand === undefined || driver === undefined) throw new Error("Two cells expected");
    expect(within(stand).getByText("By the petrol pumps")).toBeVisible();
    expect(within(driver).getByLabelText("Number plate AB 123")).toBeVisible();
    // What the bar holds on a phone is at the top of the side column.
    expect(side.getByRole("button", imHere)).toBeVisible();
    expect(side.getByText("Blönduós")).toBeVisible();
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
    const texts = textsInOrder();
    const at = (text: string) => {
      const index = texts.indexOf(text);
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    expect(at("Leaves in 15 minutes")).toBeLessThan(at("By the petrol pumps"));
    expect(at("By the petrol pumps")).toBeLessThan(at("AB 123"));
    expect(at("AB 123")).toBeLessThan(at("I'm here"));
    expect(at("I'm here")).toBeLessThan(at("Blönduós"));

    // Saying I'm here works from the side column, and stays said when the
    // window turns narrow and wide again: the part keeps what it was told,
    // and nothing is loaded again for that.
    await fireEvent.press(side.getByRole("button", imHere));
    const told = "We've told the driver you're here.";
    expect(await screen.findByText(told)).toBeVisible();
    // Saying it loads the booking again, once.
    await waitFor(() => {
      expect(loadsOf(client, "/v1/bookings/{id}")).toBe(2);
    });
    // Focus went to what was told when it was said, and stays where the
    // passenger puts it after: a window that changes size says nothing new.
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focus.mockClear();
    await act(() => {
      Dimensions.set({ window: phone });
    });
    expect(within(screen.getByTestId("bottom-bar")).getByText(told)).toBeVisible();
    expect(screen.queryByTestId("columns-side")).toBeNull();
    await act(() => {
      Dimensions.set({ window: laptop });
    });
    expect(within(screen.getByTestId("columns-side")).getByText(told)).toBeVisible();
    expect(loadsOf(client, "/v1/bookings/{id}")).toBe(2);
    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
  });
});

describe("the passenger's I'm here (spec 8, 3.2; R8.3)", () => {
  it("tells the driver with one tap, and what it told takes focus", async () => {
    const { client } = await openBooking(onTheDay());
    // React Native's test set-up already mocks it, so it holds earlier tests' calls.
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await fireEvent.press(await screen.findByRole("button", imHere));
    expect(await screen.findByText("We've told the driver you're here.")).toBeVisible();
    // The button pressed has gone, so focus moves to what replaced it.
    expect(focusMoves).toHaveBeenCalledTimes(1);
    focusMoves.mockRestore();
    expect(
      client.calls.find((call) => call.path === "/v1/bookings/{id}/check-in")?.input,
    ).toMatchObject({ params: { id: paidBooking.id }, body: {} });
    expect(screen.queryByRole("button", imHere)).toBeNull();
  });

  it("says when it opens, before then", async () => {
    mockNow = new Date("2026-11-15T09:00:00Z");
    await openBooking(onTheDay());
    expect(await screen.findByText("You can say you're here from 09:30.")).toBeVisible();
    expect(screen.queryByRole("button", imHere)).toBeNull();
  });

  it("shows what it told once said, leaving focus where it is", async () => {
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await openBooking(onTheDay({ passengerCheckedInAt: "2026-11-15T09:40:00.000Z" }));
    expect(await screen.findByText("We've told the driver you're here.")).toBeVisible();
    expect(screen.queryByRole("button", imHere)).toBeNull();
    expect(focusMoves).not.toHaveBeenCalled();
    focusMoves.mockRestore();
  });

  it("keeps itself up to date while open: it opens on time, and the driver's arrival shows", async () => {
    jest.useFakeTimers();
    try {
      mockNow = new Date("2026-11-15T09:20:00Z");
      const { change } = await openBooking(onTheDay());
      expect(await screen.findByText("You can say you're here from 09:30.")).toBeVisible();
      mockNow = new Date("2026-11-15T09:30:00Z");
      change(onTheDay({ driverCheckedInAt: "2026-11-15T09:29:00.000Z" }));
      await act(() => jest.advanceTimersByTimeAsync(30_000));
      expect(await screen.findByRole("button", imHere)).toBeVisible();
      expect(screen.getByText("Anna is at the meeting point")).toBeVisible();
      expect(screen.queryByText("You can say you're here from 09:30.")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("is gone once it has closed", async () => {
    mockNow = new Date("2026-11-15T11:01:00Z");
    await openBooking(onTheDay());
    expect(await screen.findByRole("header", { name: "Trip day" })).toBeVisible();
    expect(screen.queryByRole("button", imHere)).toBeNull();
    expect(screen.queryByText(/say you're here/)).toBeNull();
  });

  it("says when the driver is at the meeting point", async () => {
    await openBooking(onTheDay({ driverCheckedInAt: "2026-11-15T09:50:00.000Z" }));
    expect(await screen.findByText("Anna is at the meeting point")).toBeVisible();
  });

  it("says nothing of the driver before they are there", async () => {
    await openBooking(onTheDay());
    expect(await screen.findByRole("button", imHere)).toBeVisible();
    expect(screen.queryByText("Anna is at the meeting point")).toBeNull();
  });

  it.each([
    [failure(409, "check_in_closed"), "It's too late to say you're here at this stop."],
    [
      failure(409, "check_in_not_open", { opensAt: "2026-11-15T09:50:00.000Z" }),
      "You can say you're here from 09:50.",
    ],
    [failure(500, "internal"), "We couldn't tell them you're here. Try again."],
    [
      failure(0, "network_error"),
      "We couldn't reach PuffinRide. Check your connection and try again.",
    ],
  ])("says why it could not tell them (%#)", async (answer, said) => {
    await openBooking(onTheDay(), () => answer);
    await fireEvent.press(await screen.findByRole("button", imHere));
    expect(await screen.findByText(said)).toBeVisible();
  });

  it.each(["not_confirmed", "not_found"])(
    "loads the booking again, saying why, when it changed meanwhile (%s)",
    async (code) => {
      const { client, change } = await openBooking(onTheDay(), () => failure(409, code));
      const button = await screen.findByRole("button", imHere);
      const loads = loadsOf(client, "/v1/bookings/{id}");
      // Meanwhile, the driver cancelled it.
      change(northBooking({ ...paidBooking, status: "cancelled", confirmed: null }));
      await fireEvent.press(button);
      expect(
        await screen.findByText(
          "Something changed since you opened this. Here is your booking now.",
        ),
      ).toBeVisible();
      expect(loadsOf(client, "/v1/bookings/{id}")).toBeGreaterThan(loads);
      expect(await screen.findByText("Cancelled")).toBeVisible();
      expect(screen.queryByRole("button", imHere)).toBeNull();
    },
  );
});

const tripId = northMyTrip.id;
const stopId = (position: number) => northMyTrip.stops[position]?.id ?? "";

/** Óli from BSÍ to Hof with two seats; Gunna from Borgarnes to Blönduós; Siggi did not come. */
const riders = [
  rider("0190a1d6-0000-7000-8000-0000000000c1", "Óli", { board: 0, alight: 3, seats: 2 }, "here"),
  rider("0190a1d6-0000-7000-8000-0000000000c2", "Gunna", { board: 1, alight: 2 }, "not_here"),
  rider(
    "0190a1d6-0000-7000-8000-0000000000c3",
    "Siggi",
    { board: 0, alight: 2 },
    "no_show",
    "no_show",
  ),
  // A request is not on the trip day.
  northBooking({ id: "0190a1d6-0000-7000-8000-0000000000c4", viewer: "driver" }),
];

/**
 * The driver's trip page for the north trip on its day. Saying "I'm here"
 * answers with `answer`, or as the server would: the stop then shows it said.
 */
async function openDriverTrip(start: MyTrip, answer?: () => unknown) {
  let trip = start;
  return renderApp(`/drive/trips/${tripId}`, {
    me: completeMe,
    setUp: (client: FakeClient) => {
      tripsApi(client, [trip]);
      client.answer("/v1/me/trips/{id}", () => ok(200, trip), "get");
      driverApi(client, riders);
      client.answer("/v1/trips/{id}/stops/{stopId}/check-in", (input) => {
        if (answer !== undefined) return answer();
        const { stopId: said } = input["params"] as { stopId: string };
        const checkedInAt = mockNow.toISOString();
        trip = {
          ...trip,
          stops: trip.stops.map((stop) =>
            stop.id === said && stop.checkIn !== null
              ? { ...stop, checkIn: { ...stop.checkIn, at: checkedInAt } }
              : stop,
          ),
        };
        return ok(200, { checkedInAt });
      });
    },
  });
}

describe("the driver's trip day (spec 8, 3.1)", () => {
  beforeEach(() => {
    // 08:45: a quarter of an hour before leaving BSÍ.
    mockNow = new Date("2026-11-15T08:45:00Z");
  });

  it("says to use it only when parked, then lists the stops in order with their times", async () => {
    await openDriverTrip(tripOnTheDay());
    expect(await screen.findByText("Use this only when parked.")).toBeVisible();
    const texts = textsInOrder();
    const stops = ["09:00", "BSÍ bus terminal", "10:00", "Borgarnes", "12:05", "Blönduós", "14:00"];
    const at = stops.map((text) =>
      texts.indexOf(text, texts.indexOf("Use this only when parked.")),
    );
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("shows who gets in at each stop, with seats and whether they are here, and who gets out", async () => {
    await openDriverTrip(tripOnTheDay());
    expect(await screen.findByLabelText("Óli, 2 seats, Here")).toBeVisible();
    expect(screen.getByLabelText("Gunna, 1 seat, Not here yet")).toBeVisible();
    // Getting out says no status: they are in the car.
    expect(screen.getByLabelText("Óli, 2 seats")).toBeVisible();
    expect(screen.getByLabelText("Gunna, 1 seat")).toBeVisible();
    expect(screen.getAllByText("Getting in")).toHaveLength(2);
    expect(screen.getAllByText("Getting out")).toHaveLength(2);
  });

  it("marks a no-show getting in, and leaves them out of who gets out", async () => {
    await openDriverTrip(tripOnTheDay());
    expect(await screen.findByText("Use this only when parked.")).toBeVisible();
    // Once in the trip day and once in the passengers below it.
    expect(screen.getByLabelText("Siggi, 1 seat, No-show")).toBeVisible();
    expect(screen.getByRole("button", { name: /^Siggi, .*, 1 seat, .*, No-show$/ })).toBeVisible();
    expect(screen.queryByLabelText("Siggi, 1 seat")).toBeNull();
    // Red in both, as a problem is (spec 31, 3.3).
    const tags = screen.getAllByText("No-show");
    expect(tags).toHaveLength(2);
    for (const tag of tags) expect(tag).toHaveStyle({ color: colors.light.error });
  });

  it("offers I'm here at the next stop only, in the bar, and tells those getting in there", async () => {
    const { client } = await openDriverTrip(tripOnTheDay());
    // The screen's one main button, in the bar at the bottom (spec 31, 3.9 item 4).
    const bar = within(await screen.findByTestId("bottom-bar"));
    const button = await bar.findByRole("button", { name: "I'm here at BSÍ bus terminal" });
    expect(button).toHaveStyle({ minHeight: 56 });
    expect(within(button).getByText("I'm here at BSÍ bus terminal")).toBeVisible();
    expect(bar.getByTestId("filled-button")).toBe(button);
    expect(filledButtons()).toBe(1);
    expect(screen.queryByTestId("said-here")).toBeNull();
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await fireEvent.press(button);
    // What it told takes the button's place, with focus, and the stop says so too.
    expect(await bar.findByText("We've told your passengers you're here.")).toBeVisible();
    expect(focusMoves).toHaveBeenCalledTimes(1);
    focusMoves.mockRestore();
    expect(
      within(await screen.findByTestId("said-here")).getByText(
        "We've told your passengers you're here.",
      ),
    ).toBeVisible();
    expect(
      client.calls.find((call) => call.path === "/v1/trips/{id}/stops/{stopId}/check-in")?.input,
    ).toMatchObject({ params: { id: tripId, stopId: stopId(0) }, body: {} });
    expect(screen.queryByRole("button", { name: "I'm here at Borgarnes" })).toBeNull();
  });

  it("moves on to the next stop once said at one", async () => {
    mockNow = inBorgarnes;
    await openDriverTrip(tripOnTheDay([0]));
    expect(await screen.findByRole("button", { name: "I'm here at Borgarnes" })).toBeVisible();
    // The stop where it was said keeps saying so, in the list.
    expect(
      within(screen.getByTestId("said-here")).getByText("We've told your passengers you're here."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "I'm here at BSÍ bus terminal" })).toBeNull();
  });

  it("offers each open stop when the windows overlap, so a skipped one never blocks the next", async () => {
    // 09:45: still open at BSÍ, where it was not said, and open in Borgarnes.
    mockNow = inBorgarnes;
    await openDriverTrip(tripOnTheDay());
    const bar = within(await screen.findByTestId("bottom-bar"));
    const first = await bar.findByRole("button", { name: "I'm here at BSÍ bus terminal" });
    const second = bar.getByRole("button", { name: "I'm here at Borgarnes" });
    // One main button (R31.1): the first stop's; the other is outlined under it.
    expect(within(first).getByTestId("button-face")).toHaveStyle({
      backgroundColor: colors.light.primary,
    });
    expect(within(second).getByTestId("button-face")).toHaveStyle({
      backgroundColor: colors.light.surface,
    });
    expect(bar.getAllByTestId("filled-button")).toHaveLength(1);
  });

  it("keeps saying what it told when the next stop is open already", async () => {
    mockNow = inBorgarnes;
    await openDriverTrip(tripOnTheDay());
    const bar = within(await screen.findByTestId("bottom-bar"));
    await fireEvent.press(await bar.findByRole("button", { name: "I'm here at Borgarnes" }));
    expect(await bar.findByText("We've told your passengers you're here.")).toBeVisible();
    // Said in Borgarnes, BSÍ is behind: nothing is left to say there.
    await waitFor(() => {
      expect(bar.queryByRole("button", { name: /^I'm here at/ })).toBeNull();
    });
    expect(bar.getByText("We've told your passengers you're here.")).toBeVisible();
  });

  it("never offers it where nobody gets in, since it would tell nobody", async () => {
    // 11:40: said at BSÍ and Borgarnes; at Blönduós and Hof people only get out.
    mockNow = new Date("2026-11-15T11:40:00Z");
    await openDriverTrip(tripOnTheDay([0, 1]));
    expect(await screen.findByText("Use this only when parked.")).toBeVisible();
    expect(screen.getAllByText("We've told your passengers you're here.")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /^I'm here at/ })).toBeNull();
    expect(screen.queryByText(/you can say you're here from/i)).toBeNull();
    // Nothing to say: no bar.
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
  });

  it("skips a stop where it has closed", async () => {
    // 10:05: too late at BSÍ, open in Borgarnes.
    mockNow = new Date("2026-11-15T10:05:00Z");
    await openDriverTrip(tripOnTheDay());
    expect(await screen.findByRole("button", { name: "I'm here at Borgarnes" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "I'm here at BSÍ bus terminal" })).toBeNull();
  });

  it("says when the next stop opens, before then", async () => {
    mockNow = new Date("2026-11-15T08:00:00Z");
    await openDriverTrip(tripOnTheDay());
    const bar = within(await screen.findByTestId("bottom-bar"));
    expect(bar.getByText("At BSÍ bus terminal you can say you're here from 08:30.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^I'm here at/ })).toBeNull();
  });

  it("says when the next stop opens under what it told, once said where the next is not open yet", async () => {
    // 08:45: said at BSÍ; Borgarnes opens at 09:30.
    await openDriverTrip(tripOnTheDay());
    const bar = within(await screen.findByTestId("bottom-bar"));
    await fireEvent.press(await bar.findByRole("button", { name: "I'm here at BSÍ bus terminal" }));
    expect(await bar.findByText("We've told your passengers you're here.")).toBeVisible();
    expect(await bar.findByText("At Borgarnes you can say you're here from 09:30.")).toBeVisible();
    expect(bar.queryByRole("button", { name: /^I'm here at/ })).toBeNull();
  });

  it("keeps what I'm here told when the window turns wide and narrow again, without taking focus again", async () => {
    const told = "We've told your passengers you're here.";
    // The ride loads again as it was: only the page knows it was said.
    await openDriverTrip(tripOnTheDay(), () => ok(200, { checkedInAt: mockNow.toISOString() }));
    const bar = within(await screen.findByTestId("bottom-bar"));
    await fireEvent.press(await bar.findByRole("button", { name: "I'm here at BSÍ bus terminal" }));
    expect(await bar.findByText(told)).toBeVisible();
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    try {
      await act(() => {
        Dimensions.set({ window: { width: 1280, height: 800, scale: 1, fontScale: 1 } });
      });
      expect(screen.queryByTestId("bottom-bar")).toBeNull();
      const side = within(screen.getByTestId("columns-side"));
      expect(within(side.getByTestId("driver-im-here")).getByText(told)).toBeVisible();
      expect(side.queryByRole("button", { name: "I'm here at BSÍ bus terminal" })).toBeNull();
    } finally {
      await act(() => {
        Dimensions.set({ window: { width: 750, height: 1334, scale: 2, fontScale: 2 } });
      });
    }
    expect(within(screen.getByTestId("bottom-bar")).getByText(told)).toBeVisible();
    expect(screen.queryByRole("button", { name: "I'm here at BSÍ bus terminal" })).toBeNull();
    // It was heard once, where the button was pressed; moving it says nothing again.
    expect(focusMoves).not.toHaveBeenCalled();
    focusMoves.mockRestore();
  });

  it("has I'm here at the top of the side column on a laptop, over the ride's ticket", async () => {
    Dimensions.set({ window: { width: 1280, height: 800, scale: 1, fontScale: 1 } });
    try {
      await openDriverTrip(tripOnTheDay());
      const side = within(await screen.findByTestId("columns-side"));
      expect(
        await side.findByRole("button", { name: "I'm here at BSÍ bus terminal" }),
      ).toBeVisible();
      expect(screen.queryByTestId("bottom-bar")).toBeNull();
      const texts = textsInOrder();
      expect(texts.indexOf("I'm here at BSÍ bus terminal")).toBeLessThan(
        texts.lastIndexOf("You drive"),
      );
      // The stops stay in the main column.
      expect(
        within(screen.getByTestId("columns-main")).getByText("Use this only when parked."),
      ).toBeVisible();
    } finally {
      await act(() => {
        Dimensions.set({ window: { width: 750, height: 1334, scale: 2, fontScale: 2 } });
      });
    }
  });

  it("keeps itself up to date while open, without asking for the cars again", async () => {
    jest.useFakeTimers();
    try {
      const { client } = await openDriverTrip(tripOnTheDay());
      expect(await screen.findByText("Use this only when parked.")).toBeVisible();
      const rides = loadsOf(client, "/v1/me/trips/{id}");
      const lists = loadsOf(client, "/v1/me/trips/{id}/bookings");
      const cars = loadsOf(client, "/v1/me/vehicles");
      expect(cars).toBeGreaterThan(0);
      await act(() => jest.advanceTimersByTimeAsync(30_000));
      expect(loadsOf(client, "/v1/me/trips/{id}")).toBeGreaterThan(rides);
      expect(loadsOf(client, "/v1/me/trips/{id}/bookings")).toBeGreaterThan(lists);
      // The car on the ticket does not change while the ride is on.
      expect(loadsOf(client, "/v1/me/vehicles")).toBe(cars);
    } finally {
      jest.useRealTimers();
    }
  });

  it("says why it could not tell them", async () => {
    await openDriverTrip(tripOnTheDay(), () => failure(409, "check_in_closed"));
    await fireEvent.press(
      await screen.findByRole("button", { name: "I'm here at BSÍ bus terminal" }),
    );
    expect(await screen.findByText("It's too late to say you're here at this stop.")).toBeVisible();
  });

  it("loads the trip again, saying why, when it changed meanwhile", async () => {
    const { client } = await openDriverTrip(tripOnTheDay(), () => failure(409, "trip_not_running"));
    const button = await screen.findByRole("button", { name: "I'm here at BSÍ bus terminal" });
    const loads = loadsOf(client, "/v1/me/trips/{id}");
    await fireEvent.press(button);
    expect(
      await screen.findByText("Something changed since you opened this. Here is your ride now."),
    ).toBeVisible();
    expect(loadsOf(client, "/v1/me/trips/{id}")).toBeGreaterThan(loads);
  });

  it("is not shown before the trip day", async () => {
    await openDriverTrip({ ...tripOnTheDay(), phase: "upcoming" });
    expect(await screen.findByText("Passengers")).toBeVisible();
    expect(screen.queryByText("Use this only when parked.")).toBeNull();
  });
});
