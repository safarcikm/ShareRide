import type { Booking } from "@shareride/contracts";
import { AccessibilityInfo, Dimensions } from "react-native";
import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  driverApi,
  northBooking,
  northMyTrip,
  northStop,
  requestToDrive,
} from "@/testing/bookings";
import { filledButtons } from "@/testing/buttons";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { tripsApi } from "@/testing/trips";
import { aProfileId, newcomer } from "@/testing/people";
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
    profileId: aProfileId(18),
    photo: null,
    ...newcomer,
  },
  confirmed: { registration: "AB 123", whereToStand: null },
});

/** Jón asks for one seat from the bus terminal to Borgarnes. */
const jonRequest = northBooking({
  id: "0190a1d6-0000-7000-8000-0000000000b6",
  viewer: "driver",
  board: northStop(0),
  alight: northStop(1),
  total: { amount: 1100, currency: "ISK" },
  passenger: {
    firstName: "Jón",
    colour: 3,
    memberSince: "2026-10",
    profileId: aProfileId(18),
    photo: null,
    ...newcomer,
  },
});

async function openAsDriver(
  url: string,
  bookings: readonly Booking[] = [requestToDrive],
  answers: Parameters<typeof driverApi>[2] = {},
) {
  let driver: ReturnType<typeof driverApi> | undefined;
  const app = await renderApp(url, {
    me: completeMe,
    setUp: (client) => {
      tripsApi(client, [northMyTrip]);
      driver = driverApi(client, bookings, answers);
    },
  });
  if (driver === undefined) throw new Error("The fake API was not set up.");
  return { ...app, driver };
}

const bodiesOf = (client: FakeClient, path: string) =>
  client.calls.filter((call) => call.path === path).map((call) => call.input["body"]);

/** Where each of `marks` first stands among the spoken labels and texts on screen. */
function placesOf(marks: readonly string[]): number[] {
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string") found.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === "object" && node !== null) {
      if ("props" in node && typeof node.props === "object" && node.props !== null) {
        const props = node.props as { accessibilityLabel?: unknown };
        if (typeof props.accessibilityLabel === "string") found.push(props.accessibilityLabel);
      }
      if ("children" in node) walk(node.children);
    }
  };
  walk(screen.toJSON());
  return marks.map((mark) => {
    const place = found.indexOf(mark);
    if (place < 0) throw new Error(`"${mark}" is not on screen.`);
    return place;
  });
}
const inOrder = (places: readonly number[]) => [...places].sort((a, b) => a - b);

/** Gunna said yes to, with the seat still to pay for. */
const gunnaAccepted = northBooking({
  viewer: "driver",
  status: "accepted",
  requestExpiresAt: null,
  paymentDueAt: "2026-11-14T12:30:00.000Z",
});

/** What a passenger's row says to a screen reader, and what unfolds it. */
const jonRow = "Jón, BSÍ bus terminal to Blönduós, 2 seats, 8,000 ISK, Confirmed";
const gunnaRow = "Gunna, Borgarnes to Blönduós, 1 seat, 2,900 ISK, Waiting for payment";

/** The names of what can be pressed inside `testID`, in the order they stand. */
function pressedIn(testID: string): string[] {
  return within(screen.getByTestId(testID))
    .getAllByRole(/^(button|link)$/)
    .map((row) => (row.props as { accessibilityLabel: string }).accessibilityLabel);
}

describe("The driver's ride (spec 31, 3.12; spec 5, 3.3 and 3.7)", () => {
  it("is headed by where the ride goes and what it needs, with the ride as its ticket", async () => {
    await openAsDriver(tripPage);
    expect(await screen.findByRole("header", { name: "Your ride to Hof, Akureyri" })).toBeVisible();
    const head = within(screen.getByTestId("screen-head"));
    expect(head.getByRole("button", { name: "Back" })).toBeVisible();
    expect(head.getByText("1 request needs your answer.")).toBeVisible();

    const ticket = within(screen.getByTestId("driver-ride-ticket"));
    expect(ticket.getByText("Sun 15 Nov")).toBeVisible();
    expect(ticket.getByText("You drive")).toBeVisible();
    expect(ticket.getByText("09:00")).toBeVisible();
    expect(ticket.getByText("BSÍ bus terminal")).toBeVisible();
    expect(ticket.getByText("14:00")).toBeVisible();
    expect(ticket.getByText("Hof, Akureyri")).toBeVisible();
    expect(ticket.getByText("5 h, 2 stops")).toBeVisible();
    // Under the tear line: what the whole way costs a passenger, and the car.
    const foot = within(ticket.getByTestId("ticket-foot"));
    expect(foot.getByText("6,000 ISK")).toBeVisible();
    expect(foot.getByText("the whole way")).toBeVisible();
    expect(foot.getByText("Toyota Yaris, white")).toBeVisible();
    // Sharing it is the button in its corner (spec 28, 3.1).
    expect(screen.getByRole("button", { name: "Share this ride" })).toBeVisible();
  });

  it("says the day and the time under the title while nothing is asked", async () => {
    await openAsDriver(tripPage, []);
    const head = within(await screen.findByTestId("screen-head"));
    expect(head.getByText("Sunday 15 November at 09:00")).toBeVisible();
    expect(screen.getByText("No requests or bookings yet.")).toBeVisible();
    expect(screen.queryByRole("header", { name: "Needs you" })).toBeNull();
    expect(screen.queryByRole("header", { name: "Passengers" })).toBeNull();
  });

  it("shows the ride without the car when the cars cannot be loaded", async () => {
    await renderApp(tripPage, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [northMyTrip]);
        driverApi(client, []);
        client.answer("/v1/me/vehicles", () => failure(500, "internal_error"));
      },
    });
    const ticket = within(await screen.findByTestId("driver-ride-ticket"));
    expect(ticket.getByText("6,000 ISK")).toBeVisible();
    expect(ticket.queryByText("Toyota Yaris, white")).toBeNull();
  });

  it("shows a request as what needs the driver: who asks, their part, their words and the seats if accepted", async () => {
    await openAsDriver(tripPage);
    expect(await screen.findByRole("header", { name: "Needs you" })).toBeVisible();
    const card = within(screen.getByTestId("needs-you-card"));
    // Who asks, opening their profile.
    expect(card.getByText("Gunna")).toBeVisible();
    expect(card.getByText("No reviews yet")).toBeVisible();
    // The card is yellow, so the yellow tag stands on white to show as one.
    expect(card.getByTestId("tag")).toHaveStyle({ backgroundColor: colors.light.surface });
    expect(card.getByText("Member since November 2026")).toBeVisible();
    expect(card.getByRole("link", { name: /^See profile: Gunna, No reviews yet/ })).toBeVisible();
    expect(card.getByText("10 h left to answer")).toBeVisible();
    // Their part as a timetable, with the seats and the price beside its line.
    expect(card.getByText("10:00")).toBeVisible();
    expect(card.getByText("Borgarnes")).toBeVisible();
    expect(card.getByText("12:05")).toBeVisible();
    expect(card.getByText("Blönduós")).toBeVisible();
    expect(card.getByText("1 seat, 2,900 ISK")).toBeVisible();
    expect(card.getByText("“One small bag.”")).toBeVisible();
    // The request holds its seat already (rule S1): one line names the
    // fullest stretch of the part, in place of a bar for each stretch.
    expect(
      card.getByText("If you accept, 1 of 3 seats is taken from Borgarnes to Blönduós."),
    ).toBeVisible();
    // Decline and Accept side by side, Accept filled.
    expect(card.getByTestId("request-answer")).toHaveStyle({ flexDirection: "row" });
    expect(pressedIn("request-answer")).toEqual(["Decline", "Accept"]);
    expect(within(card.getByTestId("request-answer")).getAllByTestId("filled-button")).toHaveLength(
      1,
    );
    expect(card.getByRole("button", { name: "Report Gunna" })).toBeVisible();
    // A button in the yellow card is not the screen's main button (R31.1).
    expect(filledButtons()).toBe(0);
    expect(screen.queryByRole("header", { name: "Passengers" })).toBeNull();
  });

  it("names the fullest run of the part when a request crosses stretches that differ", async () => {
    // Jón rides the first two stretches with a friend; Gunna asks for all three.
    const wholeWay = { ...requestToDrive, board: northStop(0), alight: northStop(3) };
    await openAsDriver(tripPage, [wholeWay, jon]);
    const card = within(await screen.findByTestId("needs-you-card"));
    expect(
      card.getByText("If you accept, 3 of 3 seats are taken from BSÍ bus terminal to Blönduós."),
    ).toBeVisible();
  });

  it("accepts a request: the passenger pays next, and shows under passengers", async () => {
    const { client } = await openAsDriver(tripPage);
    await fireEvent.press(await screen.findByRole("button", { name: "Accept" }));
    expect(
      await screen.findByText("Request accepted. Gunna has until 12:30 to pay."),
    ).toBeVisible();
    expect(screen.queryByRole("header", { name: "Needs you" })).toBeNull();
    expect(screen.getByRole("header", { name: "Passengers" })).toBeVisible();
    expect(screen.getByRole("button", { name: gunnaRow })).toBeVisible();
    expect(bodiesOf(client, "/v1/bookings/{id}/accept")).toEqual([{}]);
  });

  it("sends one answer for a double tap", async () => {
    const { client } = await openAsDriver(tripPage);
    const accept = await screen.findByRole("button", { name: "Accept" });
    // Both presses land before the card shows the button busy.
    await act(async () => {
      await Promise.all([fireEvent.press(accept), fireEvent.press(accept)]);
    });
    expect(
      await screen.findByText("Request accepted. Gunna has until 12:30 to pay."),
    ).toBeVisible();
    expect(bodiesOf(client, "/v1/bookings/{id}/accept")).toHaveLength(1);
  });

  it("says a free ride is confirmed once accepted", async () => {
    await openAsDriver(tripPage, [requestToDrive], {
      accept: () =>
        ok(200, { ...requestToDrive, status: "confirmed", total: { amount: 0, currency: "ISK" } }),
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Request accepted. The booking is confirmed.")).toBeVisible();
  });

  it("declines with an optional reason that only PuffinRide sees (R5.7)", async () => {
    const { client } = await openAsDriver(tripPage);
    await fireEvent.press(await screen.findByRole("button", { name: "Decline" }));
    expect(
      screen.getByText(
        "Only PuffinRide sees the reason. Gunna is told you couldn't take the request.",
      ),
    ).toBeVisible();
    // Declining takes the seat asked for away: red, over the way out of it.
    const decline = screen.getByRole("button", { name: "Decline request" });
    expect(within(decline).getByTestId("button-face")).toHaveStyle({
      backgroundColor: colors.light.error,
    });
    await fireEvent.press(screen.getByRole("button", { name: "Don't decline" }));
    expect(screen.queryByRole("radio", { name: "The luggage won't fit" })).toBeNull();
    expect(bodiesOf(client, "/v1/bookings/{id}/decline")).toEqual([]);

    await fireEvent.press(screen.getByRole("button", { name: "Decline" }));
    await fireEvent.press(screen.getByRole("radio", { name: "The luggage won't fit" }));
    expect(screen.getByRole("radio", { name: "The luggage won't fit" })).toBeChecked();
    await fireEvent.press(screen.getByRole("button", { name: "Decline request" }));
    expect(await screen.findByText("Request declined.")).toBeVisible();
    expect(screen.getByText("No requests or bookings yet.")).toBeVisible();
    expect(bodiesOf(client, "/v1/bookings/{id}/decline")).toEqual([{ reason: "luggage" }]);
  });

  it("declines without a reason", async () => {
    const { client } = await openAsDriver(tripPage);
    await fireEvent.press(await screen.findByRole("button", { name: "Decline" }));
    await fireEvent.press(screen.getByRole("button", { name: "Decline request" }));
    expect(await screen.findByText("Request declined.")).toBeVisible();
    expect(bodiesOf(client, "/v1/bookings/{id}/decline")).toEqual([{ reason: null }]);
  });

  it("says when the request was withdrawn or ran out before the driver answered", async () => {
    let gone = () => undefined as unknown;
    const app = await openAsDriver(tripPage, [requestToDrive], {
      accept: () => gone(),
    });
    gone = () => {
      app.driver.remove(requestToDrive.id);
      return failure(409, "booking_not_requested");
    };
    await fireEvent.press(await screen.findByRole("button", { name: "Accept" }));
    expect(
      await screen.findByText("This request was already answered, withdrawn or ran out."),
    ).toBeVisible();
    expect(screen.getByText("No requests or bookings yet.")).toBeVisible();
  });

  it("shows the request as it stands when it was already answered, such as on another device", async () => {
    let answeredElsewhere = () => undefined as unknown;
    const app = await openAsDriver(tripPage, [requestToDrive], {
      accept: () => answeredElsewhere(),
    });
    answeredElsewhere = () => {
      app.driver.remove(requestToDrive.id);
      app.driver.add({ ...requestToDrive, status: "accepted", requestExpiresAt: null });
      return failure(409, "booking_not_requested");
    };
    await fireEvent.press(await screen.findByRole("button", { name: "Accept" }));
    expect(
      await screen.findByText("This request was already answered, withdrawn or ran out."),
    ).toBeVisible();
    expect(await screen.findByRole("button", { name: gunnaRow })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("says when the time to answer has run out while the page was open", async () => {
    await openAsDriver(tripPage, [
      { ...requestToDrive, requestExpiresAt: "2026-11-14T11:59:00.000Z" },
    ]);
    expect(await screen.findByText("The time to answer ran out")).toBeVisible();
  });

  it("keeps the request when answering fails, to try again", async () => {
    let tries = 0;
    await openAsDriver(tripPage, [requestToDrive], {
      accept: () => {
        tries += 1;
        return tries === 1
          ? failure(500, "internal_error")
          : ok(200, {
              ...requestToDrive,
              status: "accepted",
              paymentDueAt: "2026-11-14T12:30:00.000Z",
            });
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Accept" }));
    // Why nothing was answered stands in the card, over its buttons.
    const card = within(screen.getByTestId("needs-you-card"));
    expect(await card.findByRole("alert")).toBeVisible();
    expect(card.getByText("Gunna")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Accept" }));
    expect(
      await screen.findByText("Request accepted. Gunna has until 12:30 to pay."),
    ).toBeVisible();
  });

  it("shows each answer at once when two requests are answered quickly", async () => {
    let bookings: Booking[] = [requestToDrive, jonRequest];
    let holdLists = false;
    const heldLists: (() => void)[] = [];
    let answerJon: (() => void) | undefined;
    const accepted = (id: string) => (booking: Booking) =>
      booking.id === id
        ? {
            ...booking,
            status: "accepted" as const,
            requestExpiresAt: null,
            paymentDueAt: "2026-11-14T12:30:00.000Z",
          }
        : booking;
    const acceptedOne = (id: string) => {
      bookings = bookings.map(accepted(id));
      return ok(
        200,
        bookings.find((booking) => booking.id === id),
      );
    };
    await renderApp(tripPage, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [northMyTrip]);
        client.answer("/v1/me/trips/{id}/bookings", () => {
          const list = ok(200, {
            bookings,
            segments: [0, 1, 2].map((position) => ({ position, occupancy: 1 })),
            capacity: 3,
          });
          if (!holdLists) return list;
          return new Promise((resolve) => {
            heldLists.push(() => {
              resolve(list);
            });
          });
        });
        client.answer("/v1/bookings/{id}/accept", (input) => {
          const id = (input["params"] as { id: string }).id;
          if (id !== jonRequest.id) return acceptedOne(id);
          return new Promise((resolve) => {
            answerJon = () => {
              resolve(acceptedOne(id));
            };
          });
        });
      },
    });
    expect(await screen.findByText("Jón")).toBeVisible();
    expect(screen.getByText("2 requests need your answer.")).toBeVisible();
    const [gunnaAccept, jonAccept] = screen.getAllByRole("button", { name: "Accept" });
    // Jón's answer is on its way; Gunna's comes back at once, and the page loads again.
    await fireEvent.press(jonAccept as never);
    await fireEvent.press(gunnaAccept as never);
    expect(
      await screen.findByText("Request accepted. Gunna has until 12:30 to pay."),
    ).toBeVisible();
    // Jón's answer comes back after that; the list it asks for again is slow.
    holdLists = true;
    await act(async () => {
      answerJon?.();
      await Promise.resolve();
    });
    expect(await screen.findByText("Request accepted. Jón has until 12:30 to pay.")).toBeVisible();
    expect(screen.queryAllByRole("button", { name: "Accept" })).toEqual([]);
    expect(
      screen.getByRole("button", {
        name: "Jón, BSÍ bus terminal to Borgarnes, 1 seat, 1,100 ISK, Waiting for payment",
      }),
    ).toBeVisible();
    await act(async () => {
      for (const release of heldLists) release();
      await Promise.resolve();
    });
  });

  it("moves focus to the outcome each time, even when it reads the same", async () => {
    await openAsDriver(tripPage, [requestToDrive, jonRequest]);
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    for (const name of ["Gunna", "Jón"]) {
      expect(await screen.findByText(name)).toBeVisible();
      const [decline] = screen.getAllByRole("button", { name: "Decline" });
      await fireEvent.press(decline as never);
      focusMoves.mockClear();
      await fireEvent.press(screen.getByRole("button", { name: "Decline request" }));
      expect(await screen.findByText("Request declined.")).toBeVisible();
      await waitFor(() => {
        expect(screen.queryByText(name)).toBeNull();
      });
      // The outcome takes focus, as the button pressed has gone.
      expect(focusMoves).toHaveBeenCalledTimes(1);
    }
    focusMoves.mockRestore();
  });

  it("lists the passengers as rows in ride order, a seat still to pay for in blue", async () => {
    await openAsDriver(tripPage, [gunnaAccepted, jon]);
    expect(await screen.findByRole("header", { name: "Passengers" })).toBeVisible();
    expect(screen.getByText("1 confirmed")).toBeVisible();
    expect(screen.queryByRole("header", { name: "Needs you" })).toBeNull();
    // In the order they get in, though Gunna's booking came first.
    const rows = screen.getAllByTestId("passenger-row");
    expect(rows).toHaveLength(2);
    const [first, second] = rows.map((row) => within(row));
    if (first === undefined || second === undefined) throw new Error("Two rows are expected.");
    expect(first.getByRole("button", { name: jonRow })).toBeCollapsed();
    expect(first.getByText("BSÍ bus terminal to Blönduós, 2 seats, 8,000 ISK")).toBeVisible();
    expect(first.getByText("Confirmed")).toBeVisible();
    expect(second.getByRole("button", { name: gunnaRow })).toBeCollapsed();
    expect(second.getByText("Borgarnes to Blönduós, 1 seat, 2,900 ISK")).toBeVisible();
    // Paying is Gunna's to do, not the driver's: the tag waits, in blue (spec 31, 3.10).
    expect(second.getByTestId("tag")).toHaveStyle({ backgroundColor: colors.light.infoSoft });
    // A confirmed seat has its conversation, one press away.
    expect(first.getByRole("button", { name: "Message Jón" })).toBeVisible();
    expect(second.queryByRole("button", { name: "Message Gunna" })).toBeNull();
    // The card's last row writes to everyone with a seat.
    expect(pressedIn("passengers").at(-1)).toBe("Message all passengers");
  });

  it("unfolds a passenger's row to their part and to what can be done, cancelling red and last", async () => {
    await openAsDriver(tripPage, [gunnaAccepted, jon]);
    const toggle = await screen.findByRole("button", { name: jonRow });
    expect(screen.queryByRole("link", { name: "See profile: Jón" })).toBeNull();
    await fireEvent.press(toggle);
    expect(screen.getByRole("button", { name: jonRow })).toBeExpanded();
    const [row] = screen.getAllByTestId("passenger-row");
    if (row === undefined) throw new Error("A row is expected.");
    const under = within(within(row).getByTestId("passenger-under"));
    // When they get in and out: the ride's ticket shows only its two ends.
    expect(under.getByText("09:00")).toBeVisible();
    expect(under.getByText("BSÍ bus terminal")).toBeVisible();
    expect(under.getByText("12:05")).toBeVisible();
    expect(under.getByText("Blönduós")).toBeVisible();
    expect(
      under
        .getAllByRole(/^(button|link)$/)
        .map((part) => (part.props as { accessibilityLabel: string }).accessibilityLabel),
    ).toEqual(["See profile: Jón", "Report Jón", "Cancel booking: Jón"]);
    // It opens the screen that asks; a link, as "Cancel the ride" is.
    const cancel = under.getByRole("link", { name: "Cancel booking: Jón" });
    expect(within(cancel).getByText("Cancel booking")).toHaveStyle({ color: colors.light.error });
    await fireEvent.press(cancel);
    expect(screen).toHavePathname(`/bookings/${jon.id}/cancel`);
  });

  it("tints a passenger's row under the pointer and while it is pressed, as any row", async () => {
    await openAsDriver(tripPage, [jon]);
    const toggle = await screen.findByRole("button", { name: jonRow });
    const face = screen.getByTestId("passenger-face");
    expect(face).toHaveStyle({ backgroundColor: colors.light.surface });
    await fireEvent(toggle, "pressIn");
    expect(face).toHaveStyle({ backgroundColor: colors.light.primarySoft });
    await fireEvent(toggle, "pressOut");
    expect(face).toHaveStyle({ backgroundColor: colors.light.surface });
    await fireEvent(toggle, "hoverIn");
    expect(face).toHaveStyle({ backgroundColor: colors.light.primarySoft });
    await fireEvent(toggle, "hoverOut");
    expect(face).toHaveStyle({ backgroundColor: colors.light.surface });
  });

  it("shows a passenger whose account is gone without a name or a profile, and can still report and cancel", async () => {
    await openAsDriver(tripPage, [
      { ...jon, passenger: { ...jon.passenger, firstName: null, profileId: null } },
    ]);
    const formerRow =
      "A former member, BSÍ bus terminal to Blönduós, 2 seats, 8,000 ISK, Confirmed";
    await fireEvent.press(await screen.findByRole("button", { name: formerRow }));
    expect(screen.getByRole("button", { name: "Message A former member" })).toBeVisible();
    const under = within(screen.getByTestId("passenger-under"));
    expect(
      under
        .getAllByRole(/^(button|link)$/)
        .map((part) => (part.props as { accessibilityLabel: string }).accessibilityLabel),
    ).toEqual(["Report A former member", "Cancel booking: A former member"]);
    expect(screen.queryByRole("link", { name: /^See profile/ })).toBeNull();
  });

  it("shows a request from someone whose account is gone without a name, a link or how they stand", async () => {
    await openAsDriver(tripPage, [
      {
        ...requestToDrive,
        passenger: { ...requestToDrive.passenger, firstName: null, profileId: null },
      },
    ]);
    const card = within(await screen.findByTestId("needs-you-card"));
    expect(card.getByText("A former member")).toBeVisible();
    expect(card.queryByRole("link")).toBeNull();
    expect(card.queryByText("No reviews yet")).toBeNull();
    expect(card.queryByText(/^Reliability/)).toBeNull();
    // Their part and the answer are as for anyone.
    expect(card.getByText("1 seat, 2,900 ISK")).toBeVisible();
    expect(pressedIn("request-answer")).toEqual(["Decline", "Accept"]);
    expect(card.getByRole("button", { name: "Report A former member" })).toBeVisible();
  });

  it("folds a row again, and keeps another one open meanwhile", async () => {
    await openAsDriver(tripPage, [gunnaAccepted, jon]);
    await fireEvent.press(await screen.findByRole("button", { name: jonRow }));
    await fireEvent.press(screen.getByRole("button", { name: gunnaRow }));
    expect(screen.getByRole("link", { name: "See profile: Jón" })).toBeVisible();
    expect(screen.getByRole("link", { name: "See profile: Gunna" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: jonRow }));
    expect(screen.queryByRole("link", { name: "See profile: Jón" })).toBeNull();
    expect(screen.getByRole("link", { name: "See profile: Gunna" })).toBeVisible();
    expect(screen.getByRole("button", { name: jonRow })).toBeCollapsed();
  });

  it("says the seats in one line, at the fullest stretch, and unfolds each stretch", async () => {
    await openAsDriver(tripPage, [gunnaAccepted, jon]);
    const seats = within(await screen.findByTestId("seats-card"));
    expect(seats.getByRole("header", { name: "Seats" })).toBeVisible();
    expect(seats.getByText("3 of 3 taken")).toBeVisible();
    expect(seats.getByText("at the busiest, Borgarnes to Blönduós")).toBeVisible();
    // A square for each seat, the taken ones filled; the words say the same.
    expect(seats.getAllByTestId("seat-taken", { includeHiddenElements: true })).toHaveLength(3);
    expect(seats.queryAllByTestId("seat-free", { includeHiddenElements: true })).toHaveLength(0);
    const each = seats.getByRole("button", { name: "Each stretch" });
    expect(each).toBeCollapsed();
    expect(seats.queryByLabelText("Borgarnes to Blönduós, 3 of 3 seats taken")).toBeNull();
    await fireEvent.press(each);
    expect(seats.getByRole("button", { name: "Each stretch" })).toBeExpanded();
    expect(seats.getByLabelText("BSÍ bus terminal to Borgarnes, 2 of 3 seats taken")).toBeVisible();
    expect(seats.getByLabelText("Borgarnes to Blönduós, 3 of 3 seats taken")).toBeVisible();
    expect(seats.getByLabelText("Blönduós to Hof, Akureyri, 0 of 3 seats taken")).toBeVisible();
  });

  it("says no seat is taken without naming a stretch", async () => {
    await openAsDriver(tripPage, []);
    const seats = within(await screen.findByTestId("seats-card"));
    expect(seats.getByText("0 of 3 taken")).toBeVisible();
    expect(seats.queryByText(/at the busiest/)).toBeNull();
    expect(seats.getAllByTestId("seat-free", { includeHiddenElements: true })).toHaveLength(3);
    expect(seats.queryAllByTestId("seat-taken", { includeHiddenElements: true })).toHaveLength(0);
  });

  it("ends in rows for the rest, with cancelling the ride red and last (R31.3)", async () => {
    await openAsDriver(tripPage, [requestToDrive, jon]);
    expect(await screen.findByRole("header", { name: "Needs you" })).toBeVisible();
    expect(pressedIn("ride-rows")).toEqual([
      "Edit the ride",
      "Share this ride",
      "Share the ride's details",
      "Weather and roads",
      "Post it again",
      "Post the way back",
      "Cancel the ride",
    ]);
    const cancel = within(screen.getByTestId("ride-rows")).getByRole("link", {
      name: "Cancel the ride",
    });
    expect(within(cancel).getByText("Cancel the ride")).toHaveStyle({ color: colors.light.error });
    // No column of outlined buttons is left, and nothing filled outside the yellow card.
    expect(filledButtons()).toBe(0);
    await fireEvent.press(
      within(screen.getByTestId("ride-rows")).getByRole("link", { name: "Edit the ride" }),
    );
    expect(screen).toHavePathname(`${tripPage}/edit`);
  });

  it("stands in one column on a phone: the ticket, what needs the driver, the passengers, the seats, the rows", async () => {
    await openAsDriver(tripPage, [requestToDrive, jon]);
    expect(await screen.findByRole("header", { name: "Needs you" })).toBeVisible();
    expect(screen.queryByTestId("page")).toBeNull();
    expect(screen.queryByTestId("columns-side")).toBeNull();
    const places = placesOf([
      "Your ride to Hof, Akureyri",
      "You drive",
      "Needs you",
      "Passengers",
      "Message all passengers",
      "Seats",
      "Edit the ride",
      "Post it again",
      "Cancel the ride",
    ]);
    expect(places).toEqual(inOrder(places));
    // A phone's rows have no heading of their own.
    expect(screen.queryByRole("header", { name: "Drive it again" })).toBeNull();
  });

  it("says when the requests could not be loaded, with a retry", async () => {
    let tries = 0;
    await renderApp(tripPage, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [northMyTrip]);
        driverApi(client, []);
        client.answer("/v1/me/trips/{id}/bookings", () => {
          tries += 1;
          return tries === 1
            ? failure(500, "internal_error")
            : ok(200, { bookings: [], segments: [], capacity: 3 });
        });
      },
    });
    expect(
      await screen.findByText("The ride's requests and bookings could not be loaded."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No requests or bookings yet.")).toBeVisible();
  });
});

describe("The driver's ride on a laptop (spec 31, 3.16 item 3; spec 18, 3.14)", () => {
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

  it("has what needs the driver, the passengers and driving it again in the main column, and the ticket, the seats and the rows beside them", async () => {
    await openAsDriver(tripPage, [requestToDrive, jon]);
    expect(await main().findByRole("header", { name: "Needs you" })).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    // The title is the page's head, over both columns.
    expect(screen.getByRole("header", { name: "Your ride to Hof, Akureyri" })).toBeVisible();
    expect(within(screen.getByTestId("columns")).queryByTestId("screen-head")).toBeNull();

    expect(main().getByText("Gunna")).toBeVisible();
    expect(main().getByRole("button", { name: "Accept" })).toBeVisible();
    expect(main().getByRole("header", { name: "Passengers" })).toBeVisible();
    expect(main().getByRole("button", { name: jonRow })).toBeVisible();
    expect(main().getByRole("link", { name: "Message all passengers" })).toBeVisible();
    expect(main().getByRole("header", { name: "Drive it again" })).toBeVisible();
    expect(main().getByRole("button", { name: "Post it again" })).toBeVisible();
    expect(main().getByRole("button", { name: "Post the way back" })).toBeVisible();

    expect(side().getByTestId("driver-ride-ticket")).toBeVisible();
    expect(side().getByTestId("seats-card")).toBeVisible();
    // Sharing the ride is the button in the ticket's corner, right over the
    // rows: with no row of its own the column is whole in a small laptop's
    // window (spec 31, 3.16, item 3).
    expect(side().getByRole("button", { name: "Share this ride" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Share this ride" })).toBeNull();
    expect(pressedIn("ride-rows")).toEqual([
      "Edit the ride",
      "Share the ride's details",
      "Weather and roads",
      "Cancel the ride",
    ]);
    expect(side().getByTestId("ride-rows")).toBeVisible();

    // Each thing is there once.
    for (const name of ["Message all passengers", "Edit the ride", "Cancel the ride"]) {
      expect(screen.getAllByRole("link", { name })).toHaveLength(1);
    }
    expect(screen.getAllByRole("button", { name: "Post it again" })).toHaveLength(1);
    expect(screen.getAllByTestId("seats-card")).toHaveLength(1);
    expect(screen.getAllByTestId("driver-ride-ticket")).toHaveLength(1);
    const places = placesOf([
      "Needs you",
      "Passengers",
      "Message all passengers",
      "Drive it again",
      "Post it again",
      "You drive",
      "Seats",
      "Edit the ride",
      "Cancel the ride",
    ]);
    expect(places).toEqual(inOrder(places));
    expect(filledButtons()).toBe(0);
  });

  it("keeps a question that is open when the window turns narrow and wide again", async () => {
    await openAsDriver(tripPage);
    await fireEvent.press(await main().findByRole("button", { name: "Decline" }));
    await fireEvent.press(main().getByRole("radio", { name: "The luggage won't fit" }));

    await act(() => {
      Dimensions.set({ window: phone });
    });
    expect(screen.queryByTestId("columns-side")).toBeNull();
    expect(screen.queryByTestId("page")).toBeNull();
    expect(screen.getByRole("radio", { name: "The luggage won't fit" })).toBeChecked();
    expect(screen.getAllByRole("link", { name: "Edit the ride" })).toHaveLength(1);

    await act(() => {
      Dimensions.set({ window: laptop });
    });
    expect(main().getByRole("radio", { name: "The luggage won't fit" })).toBeChecked();
    expect(side().getByTestId("seats-card")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Edit the ride" })).toHaveLength(1);
  });

  it("keeps a passenger's row and the stretches open when the window turns narrow and wide again", async () => {
    await openAsDriver(tripPage, [jon]);
    await fireEvent.press(await main().findByRole("button", { name: jonRow }));
    await fireEvent.press(side().getByRole("button", { name: "Each stretch" }));
    await act(() => {
      Dimensions.set({ window: phone });
    });
    expect(screen.getByRole("button", { name: jonRow })).toBeExpanded();
    expect(screen.getByRole("button", { name: "Each stretch" })).toBeExpanded();
    await act(() => {
      Dimensions.set({ window: laptop });
    });
    expect(main().getByRole("button", { name: jonRow })).toBeExpanded();
    expect(side().getByRole("button", { name: "Each stretch" })).toBeExpanded();
  });

  it("says at the left that nobody has asked yet, with no way to message nobody", async () => {
    await openAsDriver(tripPage, []);
    const none = await main().findByText("No requests or bookings yet.");
    expect(none).toBeVisible();
    expect(none).not.toHaveStyle({ textAlign: "center" });
    expect(screen.queryByRole("link", { name: "Message all passengers" })).toBeNull();
    expect(side().getByRole("link", { name: "Edit the ride" })).toBeVisible();
    expect(side().getByTestId("seats-card")).toBeVisible();
  });

  it("is a page from the start, also when the trip cannot be loaded", async () => {
    await renderApp(tripPage, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [northMyTrip]);
        driverApi(client, []);
        client.answer("/v1/me/trips/{id}/bookings", () => failure(500, "internal_error"));
      },
    });
    const column = within(await screen.findByTestId("page-column"));
    expect(column.getByText("The ride's requests and bookings could not be loaded.")).toBeVisible();
    expect(column.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
    expect(screen.queryByTestId("columns")).toBeNull();
  });

  it("keeps a cancelled ride in a column at the page's left: why, its ticket and driving it again", async () => {
    await renderApp(tripPage, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [{ ...northMyTrip, status: "cancelled", cancellation: null }]);
        driverApi(client, []);
      },
    });
    const column = within(await screen.findByTestId("page-column"));
    expect(screen.getByRole("header", { name: "Your ride to Hof, Akureyri" })).toBeVisible();
    expect(
      within(screen.getByTestId("screen-head")).getByText("This ride was cancelled."),
    ).toBeVisible();
    expect(column.getByTestId("driver-ride-ticket")).toBeVisible();
    expect(column.getByRole("button", { name: "Post it again" })).toBeVisible();
    expect(column.getByRole("button", { name: "Post the way back" })).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Edit the ride" })).toBeNull();
    // A ride that is off cannot be shared.
    expect(screen.queryByRole("button", { name: "Share this ride" })).toBeNull();
    expect(screen.queryByTestId("columns")).toBeNull();
  });
});
