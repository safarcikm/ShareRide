import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import type { ReactElement } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  StyleSheet,
  type RefreshControlProps,
  type ScrollViewProps,
  type ViewStyle,
} from "react-native";
import type { Booking } from "@shareride/contracts";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  bookingApi,
  cancelledBooking,
  northBooking,
  paidBooking,
  unpaidBooking,
} from "@/testing/bookings";
import { filledButtons } from "@/testing/buttons";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { completedBooking } from "@/testing/reviews";
import { searchApi } from "@/testing/search";
import { dispute, onTheDay } from "@/testing/trip-day";
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
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn(() => Promise.resolve(null)),
  writeAppData: jest.fn(() => Promise.resolve()),
}));
/** Saturday 14 November 2026, noon in Iceland, unless a test says otherwise. */
const noon = new Date("2026-11-14T12:00:00Z");
let mockNow = noon;
jest.mock("@/lib/clock", () => ({ now: () => mockNow }));

// Spec 31, 3.8, 3.9 and 3.16 item 2: a booked seat's page says where the
// booking stands in its title, shows the ride as a ticket, and has one main
// button at most, in the bar at the bottom or at the top of the side column.

const phone = { width: 750, height: 1334, scale: 2, fontScale: 2 };
const laptop = { width: 1280, height: 800, scale: 1, fontScale: 1 };

beforeEach(() => {
  mockNow = noon;
});

async function open(
  start: Booking,
  setUp?: (client: FakeClient) => void,
  /** Main buttons take no press just after one was pressed, as in the app. */
  holdsPresses = false,
) {
  let booking = start;
  const result = await renderApp(`/bookings/${start.id}`, {
    me: completeMe,
    holdsPresses,
    setUp: (client) => {
      bookingApi(client, () => booking);
      setUp?.(client);
    },
  });
  return {
    ...result,
    change: (next: Booking) => {
      booking = next;
    },
  };
}

/** The text on screen, in reading order. */
function textsInOrder(): string[] {
  const texts: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string") texts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === "object" && node !== null && "children" in node) walk(node.children);
  };
  walk(screen.toJSON());
  return texts;
}

/** Where each text first stands among the screen's texts; every one must show. */
function places(...texts: readonly string[]): number[] {
  const all = textsInOrder();
  return texts.map((text) => {
    const index = all.indexOf(text);
    if (index < 0) throw new Error(`Not on screen: ${text}`);
    return index;
  });
}

const inOrder = (...texts: readonly string[]) => {
  const found = places(...texts);
  expect(found).toEqual([...found].sort((a, b) => a - b));
};

const bar = () => within(screen.getByTestId("bottom-bar"));

/** Pulls the screen down, as a phone's RefreshControl does: the booking loads again. */
async function pullDown() {
  const control = (screen.getByTestId("screen-scroll").props as ScrollViewProps).refreshControl as
    ReactElement<RefreshControlProps> | undefined;
  if (control === undefined) throw new Error("This screen does not pull to refresh.");
  await act(() => {
    void control.props.onRefresh?.();
  });
}
const rows = () =>
  within(screen.getByTestId("action-rows"))
    .getAllByTestId("row-words")
    .map((row) => within(row).getAllByText(/./)[0]?.props.children as string);

describe("a booked seat on a phone (spec 31, 3.8)", () => {
  it("has the state as its title, with what happens next under it, and no status tag", async () => {
    await open(paidBooking);
    expect(await screen.findByRole("header", { name: "Your seat is confirmed" })).toBeVisible();
    expect(
      screen.getByText("Sunday 15 November. Anna picks you up at 10:00 at Borgarnes."),
    ).toBeVisible();
    expect(screen.getByTestId("screen-head")).toBeVisible();
    // The title says it: the tag and the line with a tick are gone.
    expect(screen.queryByText("Confirmed")).toBeNull();
    expect(screen.getAllByText("Your seat is confirmed")).toHaveLength(1);
    expect(screen.queryByRole("header", { name: "Borgarnes → Blönduós" })).toBeNull();
  });

  it("shows how far the booking has come as a road", async () => {
    await open(northBooking());
    expect(await screen.findByLabelText("Step 1 of 4: Asked")).toBeVisible();
  });

  it("starts the road at Confirmed for a ride booked instantly", async () => {
    await open(paidBooking);
    expect(await screen.findByLabelText("Step 1 of 3: Confirmed")).toBeVisible();
  });

  it("shows the ride as a ticket, with the seats and the price under the tear line", async () => {
    await open(paidBooking);
    const ticket = within(await screen.findByTestId("booking-ticket"));
    expect(ticket.getByText("Sun 15 Nov")).toBeVisible();
    expect(ticket.getByText("Passenger")).toBeVisible();
    expect(ticket.getByText("10:00")).toBeVisible();
    expect(ticket.getByText("Borgarnes")).toBeVisible();
    expect(ticket.getByText("12:05")).toBeVisible();
    expect(ticket.getByText("Blönduós")).toBeVisible();
    const foot = within(ticket.getByTestId("ticket-foot"));
    expect(foot.getByText("1 seat")).toBeVisible();
    expect(foot.getByText("2,900 ISK")).toBeVisible();
    // It is where you are, not a link to it.
    expect(screen.queryByRole("link", { name: /Passenger/ })).toBeNull();
  });

  it("says Free on the ticket of a free ride", async () => {
    await open({ ...paidBooking, total: { amount: 0, currency: "ISK" } });
    const ticket = within(await screen.findByTestId("booking-ticket"));
    expect(ticket.getByText("Free")).toBeVisible();
  });

  it("has Message on the driver's card, and the number plate as a tag under the line", async () => {
    await open(paidBooking);
    const driver = within(await screen.findByTestId("driver-card"));
    expect(driver.getByText("Anna")).toBeVisible();
    expect(driver.getByRole("link", { name: "Message Anna" })).toBeVisible();
    expect(driver.getByText("Message")).toBeVisible();
    expect(driver.getByText("White Toyota Yaris")).toBeVisible();
    expect(driver.getByLabelText("Number plate AB 123")).toBeVisible();
    expect(driver.getByText("AB 123")).toBeVisible();
    // Her profile is still one press away. A phone's screen reader stops at
    // the link and not at the name in it, so the link says who Anna is
    // (spec 31, 3.20).
    expect(driver.getByRole("link", { name: /^Driver, See profile: Anna/ })).toBeVisible();
  });

  it("says when the plate comes before it is known, and has no Message before the seat is confirmed", async () => {
    await open(northBooking());
    const driver = within(await screen.findByTestId("driver-card"));
    expect(driver.getByText("Number plate shown once your seat is confirmed")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Message Anna" })).toBeNull();
  });

  it("shows where to stand with a small map and a link that opens the maps app", async () => {
    await open(paidBooking);
    const stand = within(await screen.findByTestId("where-to-stand"));
    expect(stand.getByRole("header", { name: "Where to stand" })).toBeVisible();
    expect(stand.getByText("Borgarnes")).toBeVisible();
    expect(stand.getByText("By the petrol pumps")).toBeVisible();
    expect(stand.getByLabelText("Borgarnes on a map of Iceland")).toBeVisible();
    expect(stand.getByRole("link", { name: "Open in maps" })).toBeVisible();
  });

  it("puts the head first, then the road, the ticket, the driver, where to stand and the rows", async () => {
    await open(paidBooking);
    await screen.findByRole("header", { name: "Your seat is confirmed" });
    inOrder(
      "Your seat is confirmed",
      // The road's steps.
      "Trip day",
      "Passenger",
      "2,900 ISK",
      "Message",
      "AB 123",
      "Where to stand",
      "Share the ride's details",
    );
    expect(screen.queryByTestId("columns-side")).toBeNull();
  });

  it("shows the whole ride on a map with my part solid, before the rows", async () => {
    await open(paidBooking);
    await screen.findByRole("header", { name: "Your seat is confirmed" });
    const route = within(screen.getByTestId("route-card"));
    expect(route.getByRole("header", { name: "The route" })).toBeVisible();
    expect(
      route.getByRole("image", {
        name: "The ride on a map of Iceland. Your part: Borgarnes → Blönduós.",
      }),
    ).toBeVisible();
    // My two stops stand out; the ride's first and last are muted.
    const drawn = (testID: string) =>
      route.queryAllByTestId(testID, { includeHiddenElements: true });
    expect(drawn("map-dot-chosen")).toHaveLength(2);
    expect(drawn("map-dot-muted")).toHaveLength(2);
    expect(drawn("map-line-part")).toHaveLength(1);
    expect(drawn("map-line-route")).toHaveLength(1);
    inOrder("Where to stand", "The route", "Share the ride's details");
  });

  it("shows no map when a stop of my part is no longer on the ride", async () => {
    await open(northBooking({ ...paidBooking, route: null }));
    await screen.findByRole("header", { name: "Your seat is confirmed" });
    expect(screen.queryByTestId("route-card")).toBeNull();
    expect(screen.getByTestId("where-to-stand")).toBeVisible();
  });

  it("ends with rows, Cancel booking red and last, and has no main button", async () => {
    await open(paidBooking);
    await screen.findByRole("header", { name: "Your seat is confirmed" });
    expect(rows()).toEqual([
      "Share the ride's details",
      "Weather and roads",
      "Report a problem with this ride",
      "Cancel booking",
    ]);
    expect(screen.getByRole("link", { name: "Report a problem with this ride" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel booking" })).toBeVisible();
    expect(filledButtons()).toBe(0);
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
    expect(screen.queryByRole("header", { name: "Safety" })).toBeNull();
  });

  it("says how to pay the driver in a notice under where to stand", async () => {
    await open({ ...paidBooking, payment: "in_person" });
    await screen.findByRole("header", { name: "Your seat is confirmed" });
    const how =
      "Card payments are coming soon. Pay the driver 2,900 ISK in cash or by bank transfer when you get in.";
    expect(within(screen.getByTestId("notice")).getByText(how)).toBeVisible();
    inOrder("Where to stand", how, "Share the ride's details");
  });

  describe("a request", () => {
    const question = "Withdraw your request? Anna won't see it any more, and the seat is freed.";

    it("says it was sent and until when, with Withdraw request red and last", async () => {
      // As the server answers for a request: no ride ran yet to report (R9.1).
      await open(northBooking({ problemReportable: false }));
      expect(await screen.findByRole("header", { name: "Request sent" })).toBeVisible();
      expect(screen.getByText("Anna has until 22:00 to answer.")).toBeVisible();
      expect(rows()).toEqual(["Weather and roads", "Withdraw request"]);
      expect(filledButtons()).toBe(0);
    });

    it("asks before withdrawing, with focus on the question, and puts focus back when kept", async () => {
      const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
      await open(northBooking());
      focus.mockClear();
      await fireEvent.press(await screen.findByRole("button", { name: "Withdraw request" }));
      expect(bar().getByText(question)).toBeVisible();
      expect(focus).toHaveBeenCalledTimes(1);
      // The row gave way to the question: one button says it, and it is
      // red, as what cannot be undone is (spec 31, 3.19).
      expect(screen.getAllByRole("button", { name: "Withdraw request" })).toHaveLength(1);
      expect(filledButtons()).toBe(1);
      expect(
        within(bar().getByRole("button", { name: "Withdraw request" })).getByTestId("button-face"),
      ).toHaveStyle({ backgroundColor: colors.light.error });
      await fireEvent.press(screen.getByRole("button", { name: "Keep my request" }));
      expect(screen.queryByText(question)).toBeNull();
      expect(screen.queryByTestId("bottom-bar")).toBeNull();
      expect(rows().at(-1)).toBe("Withdraw request");
      expect(focus).toHaveBeenCalledTimes(2);
      focus.mockRestore();
    });

    it("moves focus back to the row once, not each time the window changes its size", async () => {
      await open(northBooking());
      await fireEvent.press(await screen.findByRole("button", { name: "Withdraw request" }));
      await fireEvent.press(screen.getByRole("button", { name: "Keep my request" }));
      const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
      focus.mockClear();
      // The rows move to the side column and back: nothing was just done.
      await act(() => {
        Dimensions.set({ window: laptop });
      });
      await act(() => {
        Dimensions.set({ window: phone });
      });
      expect(rows().at(-1)).toBe("Withdraw request");
      expect(focus).not.toHaveBeenCalled();
      focus.mockRestore();
    });

    it("drops the question once the driver has answered, for what the seat needs now", async () => {
      const { change } = await open(northBooking());
      await fireEvent.press(await screen.findByRole("button", { name: "Withdraw request" }));
      expect(bar().getByText(question)).toBeVisible();
      // Anna says yes meanwhile, and the page loads again.
      change(
        northBooking({
          status: "accepted",
          requestExpiresAt: null,
          paymentDueAt: "2026-11-14T12:30:00.000Z",
        }),
      );
      await pullDown();
      expect(
        await screen.findByRole("header", { name: "Anna said yes: pay to keep your seat" }),
      ).toBeVisible();
      expect(screen.queryByText(question)).toBeNull();
      expect(screen.queryByRole("button", { name: "Withdraw request" })).toBeNull();
      expect(bar().getByRole("button", { name: "Pay 2,900 ISK" })).toBeVisible();
      expect(filledButtons()).toBe(1);
    });

    it("withdraws, and the page says so", async () => {
      const withdrawn = northBooking({ status: "cancelled", withdrawn: true });
      const { client } = await open(northBooking(), (fake) => {
        fake.answer("/v1/bookings/{id}/withdraw", () => ok(200, withdrawn), "post");
      });
      await fireEvent.press(await screen.findByRole("button", { name: "Withdraw request" }));
      await fireEvent.press(screen.getByRole("button", { name: "Withdraw request" }));
      expect(await screen.findByRole("header", { name: "Withdrawn" })).toBeVisible();
      // Why, as the line under the title: the two take focus together.
      expect(
        within(screen.getByTestId("screen-head")).getByText(
          "You withdrew this request. That never counts against you.",
        ),
      ).toBeVisible();
      expect(screen.queryByTestId("screen-head-outcome")).toBeNull();
      expect(
        client.calls.filter((call) => call.path === "/v1/bookings/{id}/withdraw"),
      ).toHaveLength(1);
    });
  });

  it("takes no press on Find another ride just after withdrawing: a second press meant for Withdraw request stays on the page", async () => {
    const withdrawn = northBooking({ status: "cancelled", withdrawn: true });
    await open(
      northBooking(),
      (fake) => {
        fake.answer("/v1/bookings/{id}/withdraw", () => ok(200, withdrawn), "post");
        searchApi(fake);
      },
      true,
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Withdraw request" }));
    await fireEvent.press(bar().getByRole("button", { name: "Withdraw request" }));
    expect(await screen.findByRole("header", { name: "Withdrawn" })).toBeVisible();
    // The way on stands where the red button stood, and is held (spec 31, 3.19).
    const next = () => bar().getByRole("button", { name: "Find another ride" });
    expect(next()).toBeDisabled();
    await fireEvent.press(next());
    expect(screen).toHavePathname(`/bookings/${withdrawn.id}`);
    // Half a second later it leads on.
    await waitFor(
      () => {
        expect(next()).toBeEnabled();
      },
      { timeout: 3_000 },
    );
    await fireEvent.press(next());
    await waitFor(() => {
      expect(screen).toHavePathname("/search/results");
    });
  });

  describe("a seat to pay for", () => {
    it("says so in the title, and has Pay as the one main button, in the bar", async () => {
      await open(unpaidBooking);
      expect(await screen.findByRole("header", { name: "Pay to keep your seat" })).toBeVisible();
      expect(screen.getByText("Your seat is held until 12:30.")).toBeVisible();
      expect(bar().getByRole("button", { name: "Pay 2,900 ISK" })).toBeVisible();
      expect(filledButtons()).toBe(1);
      // Nothing is confirmed yet: no road, and Cancel booking is still a row.
      expect(screen.queryByLabelText(/^Step /)).toBeNull();
      expect(rows().at(-1)).toBe("Cancel booking");
    });

    it("names the driver who said yes", async () => {
      await open(
        northBooking({
          status: "accepted",
          requestExpiresAt: null,
          paymentDueAt: "2026-11-14T12:30:00.000Z",
        }),
      );
      expect(
        await screen.findByRole("header", { name: "Anna said yes: pay to keep your seat" }),
      ).toBeVisible();
      expect(screen.getByLabelText("Step 1 of 4: Asked")).toBeVisible();
    });

    it("opens the payment in the bar, in place of Pay", async () => {
      await open(unpaidBooking, (fake) => {
        fake.answer("/v1/bookings/{id}/payment", () =>
          ok(200, {
            paymentId: "0190a1d6-0000-7000-8000-0000000000e1",
            provider: "test",
            amount: unpaidBooking.total,
            dueAt: unpaidBooking.paymentDueAt,
          }),
        );
      });
      await fireEvent.press(await bar().findByRole("button", { name: "Pay 2,900 ISK" }));
      expect(
        await bar().findByRole("header", { name: "Test payment: no money moves" }),
      ).toBeVisible();
    });

    it("says beside Pay why a payment could not start, where the passenger is looking", async () => {
      await open(unpaidBooking, (fake) => {
        fake.answer(
          "/v1/bookings/{id}/payment",
          () => failure(503, "payments_unavailable"),
          "post",
        );
      });
      await fireEvent.press(await bar().findByRole("button", { name: "Pay 2,900 ISK" }));
      const notice = await bar().findByRole("alert");
      expect(notice).toHaveTextContent("Paying isn't available right now. Try again soon.");
      expect(bar().getByRole("button", { name: "Pay 2,900 ISK" })).toBeVisible();
      // Once, not also at the top of the page.
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(filledButtons()).toBe(1);
    });

    it("moves focus to the title once the seat is paid", async () => {
      const paymentId = "0190a1d6-0000-7000-8000-0000000000e1";
      await open(unpaidBooking, (fake) => {
        fake.answer("/v1/bookings/{id}/payment", () =>
          ok(200, {
            paymentId,
            provider: "test",
            amount: unpaidBooking.total,
            dueAt: unpaidBooking.paymentDueAt,
          }),
        );
        fake.answer("/v1/test-payments/{id}", () => ok(200, paidBooking));
      });
      await fireEvent.press(await bar().findByRole("button", { name: "Pay 2,900 ISK" }));
      await bar().findByRole("header", { name: "Test payment: no money moves" });
      const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
      focus.mockClear();
      await fireEvent.press(bar().getByRole("button", { name: "Pay 2,900 ISK" }));
      expect(await screen.findByRole("header", { name: "Your seat is confirmed" })).toBeVisible();
      expect(focus).toHaveBeenCalledTimes(1);
      focus.mockRestore();
      expect(screen.queryByTestId("bottom-bar")).toBeNull();
    });
  });

  describe("a booking that ended", () => {
    it("says how in its title, shows no road, and offers the same search again in the bar", async () => {
      await open({
        ...cancelledBooking,
        cancellation: {
          by: "driver",
          reason: "weather",
          note: "",
          wholeTrip: false,
          refund: paidBooking.total,
          countsOnReliability: false,
        },
      });
      expect(await screen.findByRole("header", { name: "Cancelled" })).toBeVisible();
      expect(screen.queryByLabelText(/^Step /)).toBeNull();
      expect(bar().getByRole("button", { name: "Find another ride" })).toBeVisible();
      expect(filledButtons()).toBe(1);
      expect(screen.getAllByText("Cancelled")).toHaveLength(1);
    });

    it("has no bar when the passenger cancelled it themselves", async () => {
      await open(cancelledBooking);
      expect(await screen.findByRole("header", { name: "Cancelled" })).toBeVisible();
      expect(screen.queryByTestId("bottom-bar")).toBeNull();
    });
  });

  describe("a ride that is over", () => {
    beforeEach(() => {
      mockNow = new Date("2026-11-16T09:00:00Z");
    });

    it("asks how it was, with Rate the driver as the main button and until when under the title", async () => {
      await open(completedBooking());
      expect(await screen.findByRole("header", { name: "How was your ride?" })).toBeVisible();
      expect(screen.getByText("You can review until 29 November at 16:00.")).toBeVisible();
      expect(bar().getByRole("link", { name: "Rate the driver" })).toBeVisible();
      expect(screen.getAllByRole("link", { name: "Rate the driver" })).toHaveLength(1);
      expect(filledButtons()).toBe(1);
      expect(screen.getByLabelText("Step 3 of 3: Done")).toBeVisible();
    });

    it("has The driver didn't come as a row while it can still be said", async () => {
      await open(completedBooking());
      await screen.findByRole("header", { name: "How was your ride?" });
      expect(rows()).toEqual(["The driver didn't come", "Report a problem with this ride"]);
      expect(screen.getByRole("link", { name: "The driver didn't come" })).toBeVisible();
    });
  });

  it("shows a driver the passenger's booking by its day and part, with Message as a row", async () => {
    await open({ ...paidBooking, viewer: "driver" });
    expect(await screen.findByRole("header", { name: "Borgarnes to Blönduós" })).toBeVisible();
    expect(screen.getByText("Sunday 15 November")).toBeVisible();
    expect(within(screen.getByTestId("screen-head")).getByText("Confirmed")).toBeVisible();
    expect(screen.queryByLabelText(/^Step /)).toBeNull();
    expect(rows()).toEqual([
      "Message Gunna",
      "Weather and roads",
      "Report a problem with this ride",
    ]);
    expect(screen.queryByText("Your seat is confirmed")).toBeNull();
    expect(filledButtons()).toBe(0);
  });

  it("names the passenger's part on the map for a driver who opens the booking", async () => {
    await open({ ...paidBooking, viewer: "driver" });
    const route = within(await screen.findByTestId("route-card"));
    expect(
      route.getByRole("image", {
        name: "The ride on a map of Iceland. The passenger's part: Borgarnes → Blönduós.",
      }),
    ).toBeVisible();
  });

  it("tells a driver that the passenger pays them in person (rule M6)", async () => {
    await open({ ...paidBooking, viewer: "driver", payment: "in_person" });
    await screen.findByRole("header", { name: "Borgarnes to Blönduós" });
    expect(
      within(screen.getByTestId("notice")).getByText(
        "Gunna pays you 2,900 ISK in cash or by bank transfer when they get in.",
      ),
    ).toBeVisible();
  });

  it.each([
    ["where the app takes the payment", { ...paidBooking, viewer: "driver" as const }],
    [
      "on a free ride",
      {
        ...paidBooking,
        viewer: "driver" as const,
        payment: "in_person" as const,
        total: { amount: 0, currency: "ISK" as const },
      },
    ],
  ])("tells a driver nothing about being paid in person %s", async (_, booking) => {
    await open(booking);
    await screen.findByRole("header", { name: "Borgarnes to Blönduós" });
    expect(screen.queryByText(/pays you/)).toBeNull();
  });
});

describe("the trip day on a phone (spec 31, 3.9)", () => {
  it("counts down in its title, with when and where under it", async () => {
    mockNow = new Date("2026-11-15T09:50:00Z");
    await open(onTheDay());
    expect(await screen.findByRole("header", { name: "Leaves in 10 minutes" })).toBeVisible();
    expect(screen.getByText("Today at 10:00 from Borgarnes.")).toBeVisible();
    expect(screen.getByLabelText("Step 2 of 3: Trip day")).toBeVisible();
  });

  it("keeps counting while the page is open", async () => {
    jest.useFakeTimers();
    try {
      mockNow = new Date("2026-11-15T09:50:00Z");
      await open(onTheDay());
      expect(await screen.findByRole("header", { name: "Leaves in 10 minutes" })).toBeVisible();
      mockNow = new Date("2026-11-15T09:51:00Z");
      await act(() => jest.advanceTimersByTimeAsync(30_000));
      expect(screen.getByRole("header", { name: "Leaves in 9 minutes" })).toBeVisible();
    } finally {
      jest.useRealTimers();
    }
  });

  it("says in its title that the driver is at the meeting point, and reads it out when it happens", async () => {
    jest.useFakeTimers();
    try {
      mockNow = new Date("2026-11-15T09:50:00Z");
      const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
      const { change } = await open(onTheDay());
      await screen.findByRole("header", { name: "Leaves in 10 minutes" });
      expect(announce).not.toHaveBeenCalledWith("Anna is at the meeting point");
      change(onTheDay({ driverCheckedInAt: "2026-11-15T09:50:30.000Z" }));
      await act(() => jest.advanceTimersByTimeAsync(30_000));
      expect(
        await screen.findByRole("header", { name: "Anna is at the meeting point" }),
      ).toBeVisible();
      expect(announce).toHaveBeenCalledWith("Anna is at the meeting point");
      announce.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it("puts where to stand first, then the driver, the ticket and the rows, with I'm here in the bar", async () => {
    mockNow = new Date("2026-11-15T09:50:00Z");
    await open(onTheDay());
    await screen.findByRole("header", { name: "Leaves in 10 minutes" });
    inOrder(
      "Leaves in 10 minutes",
      "Where to stand",
      "By the petrol pumps",
      "Message",
      "AB 123",
      "Passenger",
      "The route",
      "Share the ride's details",
      "I'm here",
    );
    expect(bar().getByRole("button", { name: "I'm here" })).toBeVisible();
    expect(filledButtons()).toBe(1);
    // Until the time to get in, the seat can still be cancelled.
    expect(rows()).toEqual([
      "Share the ride's details",
      "Weather and roads",
      "Report a problem with this ride",
      "Cancel booking",
    ]);
  });

  it("says in the bar when I'm here opens, before then", async () => {
    mockNow = new Date("2026-11-15T09:00:00Z");
    await open(onTheDay());
    expect(await bar().findByText("You can say you're here from 09:30.")).toBeVisible();
    expect(filledButtons()).toBe(0);
  });

  it("has The driver didn't come in the bar, under I'm here, once the wait has passed", async () => {
    mockNow = new Date("2026-11-15T10:11:00Z");
    await open(onTheDay());
    expect(await screen.findByRole("header", { name: "Trip day" })).toBeVisible();
    expect(bar().getByRole("button", { name: "I'm here" })).toBeVisible();
    expect(bar().getByRole("link", { name: "The driver didn't come" })).toBeVisible();
    expect(filledButtons()).toBe(1);
  });

  it("has The driver didn't come as the bar's button once I'm here has closed", async () => {
    mockNow = new Date("2026-11-15T11:01:00Z");
    await open(onTheDay());
    expect(await bar().findByRole("link", { name: "The driver didn't come" })).toBeVisible();
    expect(bar().queryByRole("button", { name: "I'm here" })).toBeNull();
    expect(filledButtons()).toBe(1);
  });

  it("has it as the bar's button under what I'm here told, once that was said", async () => {
    mockNow = new Date("2026-11-15T10:11:00Z");
    await open(onTheDay({ passengerCheckedInAt: "2026-11-15T09:55:00.000Z" }));
    expect(await bar().findByText("We've told the driver you're here.")).toBeVisible();
    expect(bar().getByRole("link", { name: "The driver didn't come" })).toBeVisible();
    expect(bar().queryByRole("button", { name: "I'm here" })).toBeNull();
    expect(filledButtons()).toBe(1);
  });

  it("says the driver didn't come in its title while that report is open, with no road", async () => {
    // The day after: the seat stays confirmed until the report is decided (R8.2).
    mockNow = new Date("2026-11-16T09:00:00Z");
    await open({
      ...onTheDay({ phase: "completed" }),
      dispute: dispute({ kind: "driver_absent" }),
    });
    expect(await screen.findByRole("header", { name: "The driver didn't come" })).toBeVisible();
    expect(screen.queryByText(/picks you up/)).toBeNull();
    expect(screen.queryByLabelText(/^Step /)).toBeNull();
    expect(screen.queryByRole("button", { name: "I'm here" })).toBeNull();
    expect(filledButtons()).toBe(0);
  });
});

describe("a booked seat on a laptop (spec 31, 3.16, item 2)", () => {
  beforeEach(() => {
    Dimensions.set({ window: laptop });
  });

  afterEach(async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
  });

  const main = () => within(screen.getByTestId("columns-main"));
  const side = () => within(screen.getByTestId("columns-side"));

  it("has the road, the driver and where to stand in the main column, the ticket and the rows beside them", async () => {
    await open(paidBooking);
    expect(await screen.findByRole("header", { name: "Your seat is confirmed" })).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    expect(main().getByLabelText("Step 1 of 3: Confirmed")).toBeVisible();
    expect(main().getByTestId("driver-card")).toBeVisible();
    expect(main().getByTestId("where-to-stand")).toBeVisible();
    expect(side().getByTestId("booking-ticket")).toBeVisible();
    expect(within(side().getByTestId("action-rows")).getByText("Cancel booking")).toBeVisible();
    inOrder("Message", "Where to stand", "Passenger", "2,900 ISK", "Cancel booking");
    // Each once, and no bar: the side column has what the bar would.
    expect(screen.getAllByTestId("booking-ticket")).toHaveLength(1);
    expect(screen.getAllByTestId("action-rows")).toHaveLength(1);
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
  });

  it("ends the main column with the ride on a map, as a band", async () => {
    await open(paidBooking);
    expect(await screen.findByRole("header", { name: "Your seat is confirmed" })).toBeVisible();
    const route = within(main().getByTestId("route-card"));
    expect(route.getByRole("header", { name: "The route" })).toBeVisible();
    inOrder("Message", "Where to stand", "The route", "Passenger");
    // Across Iceland, as the ride crosses it, and not as tall as the window.
    const area = StyleSheet.flatten(route.getByTestId("map-area").props.style as ViewStyle);
    const shape = Number(area?.aspectRatio);
    expect(shape).toBeGreaterThanOrEqual(1.8);
    expect(shape).toBeLessThanOrEqual(2.4);
    expect(screen.getAllByTestId("route-card")).toHaveLength(1);
  });

  it("has Pay at the top of the side column, over the ticket", async () => {
    await open(unpaidBooking);
    expect(await side().findByRole("button", { name: "Pay 2,900 ISK" })).toBeVisible();
    inOrder("Pay 2,900 ISK", "Passenger");
    expect(filledButtons()).toBe(1);
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
  });

  it("has I'm here at the top of the side column on the trip day, and where to stand before the driver", async () => {
    mockNow = new Date("2026-11-15T09:50:00Z");
    await open(onTheDay());
    expect(await side().findByRole("button", { name: "I'm here" })).toBeVisible();
    inOrder("Where to stand", "Message", "I'm here", "Passenger", "Share the ride's details");
    expect(main().getByTestId("where-to-stand")).toBeVisible();
    expect(filledButtons()).toBe(1);
  });
});
