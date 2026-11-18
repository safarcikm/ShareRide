import type { Booking } from "@shareride/contracts";
import { AccessibilityInfo } from "react-native";
import { act, fireEvent, screen, waitFor } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  driverApi,
  northBooking,
  northMyTrip,
  northStop,
  requestToDrive,
} from "@/testing/bookings";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
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

describe("Requests in My trips (spec 5, 3.3)", () => {
  it("shows how many requests wait on a published trip, and opens the trip", async () => {
    await openAsDriver("/drive/trips");
    const card = await screen.findByRole("button", {
      name: "BSÍ bus terminal → Hof, Akureyri, Sunday 15 November at 09:00, 3 seats, 1 request",
    });
    expect(screen.getByText("1 request")).toBeVisible();
    await fireEvent.press(card);
    expect(await screen.findByRole("header", { name: "Requests" })).toBeVisible();
    expect(screen).toHavePathname(tripPage);
  });
});

describe("The driver's trip page (spec 5, 3.3 and 3.7)", () => {
  it("shows who is asking, their part, message and time left, and the seats if accepted", async () => {
    await openAsDriver(tripPage);
    expect(await screen.findByRole("header", { name: "Requests" })).toBeVisible();
    expect(screen.getByRole("header", { name: "BSÍ bus terminal → Hof, Akureyri" })).toBeVisible();
    expect(screen.getByText("Gunna")).toBeVisible();
    expect(screen.getByText("Member since November 2026")).toBeVisible();
    expect(screen.getByText("No reviews yet")).toBeVisible();
    expect(screen.getByText("10 h left to answer")).toBeVisible();
    expect(screen.getByText("One small bag.")).toBeVisible();
    expect(screen.getByText("1 seat")).toBeVisible();
    expect(screen.getByText("2,900 ISK")).toBeVisible();
    // The request holds its seat already; the driver sees the stretch without and with it.
    expect(
      screen.getByLabelText("Borgarnes to Blönduós, 0 of 3 seats taken, 1 if you accept"),
    ).toBeVisible();
    expect(screen.getByLabelText("Borgarnes to Blönduós, 1 of 3 seats taken")).toBeVisible();
    expect(
      screen.getByLabelText("BSÍ bus terminal to Borgarnes, 0 of 3 seats taken"),
    ).toBeVisible();
    expect(screen.queryByRole("header", { name: "Passengers" })).toBeNull();
  });

  it("accepts a request: the passenger pays next, and shows under passengers", async () => {
    const { client } = await openAsDriver(tripPage);
    await fireEvent.press(await screen.findByRole("button", { name: "Accept" }));
    expect(
      await screen.findByText("Request accepted. Gunna has until 12:30 to pay."),
    ).toBeVisible();
    expect(screen.queryByRole("header", { name: "Requests" })).toBeNull();
    expect(screen.getByRole("header", { name: "Passengers" })).toBeVisible();
    expect(screen.getByLabelText("Gunna, 1 seat, Waiting for payment")).toBeVisible();
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

  it("declines with an optional reason that only ShareRide sees (R5.7)", async () => {
    const { client } = await openAsDriver(tripPage);
    await fireEvent.press(await screen.findByRole("button", { name: "Decline" }));
    expect(
      screen.getByText(
        "Only ShareRide sees the reason. Gunna is told you couldn't take the request.",
      ),
    ).toBeVisible();
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
    expect(await screen.findByLabelText("Gunna, 1 seat, Waiting for payment")).toBeVisible();
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
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByText("Gunna")).toBeVisible();
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
    expect(screen.getByLabelText("Jón, 1 seat, Waiting for payment")).toBeVisible();
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

  it("lists passengers by where they get in and out, with the seats on each stretch", async () => {
    const gunna = northBooking({
      viewer: "driver",
      status: "accepted",
      requestExpiresAt: null,
      paymentDueAt: "2026-11-14T12:30:00.000Z",
    });
    await openAsDriver(tripPage, [gunna, jon]);
    expect(await screen.findByRole("header", { name: "Passengers" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Requests" })).toBeNull();
    expect(screen.getByText("BSÍ bus terminal → Blönduós")).toBeVisible();
    expect(screen.getByText("09:00 → 12:05")).toBeVisible();
    expect(screen.getByLabelText("BSÍ bus terminal to Blönduós, 09:00 to 12:05")).toBeVisible();
    expect(screen.getByLabelText("Jón, 2 seats, Confirmed")).toBeVisible();
    expect(screen.getByLabelText("Borgarnes to Blönduós, 10:00 to 12:05")).toBeVisible();
    expect(screen.getByLabelText("Gunna, 1 seat, Waiting for payment")).toBeVisible();
    expect(
      screen.getByLabelText("BSÍ bus terminal to Borgarnes, 2 of 3 seats taken"),
    ).toBeVisible();
    expect(screen.getByLabelText("Borgarnes to Blönduós, 3 of 3 seats taken")).toBeVisible();
    expect(screen.getByLabelText("Blönduós to Hof, Akureyri, 0 of 3 seats taken")).toBeVisible();
    // In trip order, though Gunna's booking came first.
    expect(
      screen
        .getAllByLabelText(/ to \d\d:\d\d$/)
        .map((part) => (part.props as { accessibilityLabel: string }).accessibilityLabel),
    ).toEqual([
      "BSÍ bus terminal to Blönduós, 09:00 to 12:05",
      "Borgarnes to Blönduós, 10:00 to 12:05",
    ]);
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
      await screen.findByText("The trip's requests and bookings could not be loaded."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No requests or bookings yet.")).toBeVisible();
  });
});
