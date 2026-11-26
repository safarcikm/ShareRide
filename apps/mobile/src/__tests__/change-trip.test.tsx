import type { Booking } from "@shareride/contracts";
import { AccessibilityInfo } from "react-native";
import { fireEvent, screen, within } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { driverApi, northBooking, northMyTrip, northSegments, northStop } from "@/testing/bookings";
import { passengerRow } from "@/testing/driver-trip";
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
// Saturday 14 November 2026, noon in Iceland; the north trip leaves tomorrow at 09:00.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

const tripPage = `/drive/trips/${northMyTrip.id}`;

/** Jón rides from the bus terminal to Blönduós, paid. */
const jon = northBooking({
  id: "0190a1d6-0000-7000-8000-0000000000b5",
  viewer: "driver",
  status: "confirmed",
  board: northStop(0),
  alight: northStop(2),
  total: { amount: 4000, currency: "ISK" },
  requestExpiresAt: null,
  passenger: {
    firstName: "Jón",
    colour: 3,
    memberSince: "2026-10",
    profileId: aProfileId(11),
    photo: null,
    ...newcomer,
  },
  confirmed: { registration: "AB 123", whereToStand: null },
});

async function openTrip(
  bookings: readonly Booking[] = [jon],
  answers: Parameters<typeof tripsApi>[2] = {},
  trip = northMyTrip,
) {
  let api: ReturnType<typeof tripsApi> | undefined;
  const app = await renderApp(tripPage, {
    me: completeMe,
    setUp: (client) => {
      api = tripsApi(client, [trip], answers);
      driverApi(client, bookings);
    },
  });
  if (api === undefined) throw new Error("No rides API");
  return { ...app, trips: api.trips };
}

/** The trip page, Edit trip, then Change the time. */
async function openTime(...trip: Parameters<typeof openTrip>) {
  const app = await openTrip(...trip);
  await fireEvent.press(await screen.findByRole("link", { name: "Edit the ride" }));
  expect(await screen.findByRole("header", { name: "Edit the ride" })).toBeVisible();
  await fireEvent.press(screen.getByRole("link", { name: "Change the time" }));
  expect(await screen.findByRole("header", { name: "Change the departure" })).toBeVisible();
  return app;
}

/** Opens the departure's wheel, taps the hour and the minutes, and closes it. */
async function chooseDeparture(time: string) {
  const [hour = "", minute = ""] = time.split(":");
  await fireEvent.press(
    await screen.findByRole("button", { name: /^Leaving BSÍ bus terminal at: / }),
  );
  await fireEvent.press(within(screen.getByRole("adjustable", { name: "Hour" })).getByText(hour));
  await fireEvent.press(
    within(screen.getByRole("adjustable", { name: "Minutes" })).getByText(minute),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
}

const changes = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/trips/{id}/changes")
    .map((call) => ({ preview: call.input["query"], body: call.input["body"] }));

const preview = { preview: true };
const at0945 = { kind: "departure", departsAt: "2026-11-15T09:45:00.000Z" };

describe("The driver moves the departure (spec 6, 3.2)", () => {
  it("offers Edit the ride first of the ride's rows, until the ride leaves", async () => {
    await openTrip();
    const edit = await screen.findByRole("link", { name: "Edit the ride" });
    const rows = within(screen.getByTestId("ride-rows")).getAllByRole(/^(button|link)$/);
    expect(rows[0]).toBe(edit);
  });

  it("offers no Edit trip once the planned departure has come", async () => {
    await openTrip([jon], {}, { ...northMyTrip, departsAt: "2026-11-14T12:00:00.000Z" });
    expect(await screen.findByRole("button", { name: passengerRow("Jón") })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Edit the ride" })).toBeNull();
  });

  it("moves every stop by 45 minutes, says who is told, then says so on the trip with focus", async () => {
    const { client, trips } = await openTime([jon], { told: { told: 1, freeCancellations: 1 } });
    expect(screen).toHavePathname(`${tripPage}/edit/time`);
    expect(
      screen.getByText(
        "With bookings, the departure can move by up to 2 h from the time your passengers booked.",
      ),
    ).toBeVisible();
    await chooseDeparture("09:45");
    // Every stop moves with it (R6.2).
    expect(screen.getByText("10:45  Borgarnes")).toBeVisible();
    expect(screen.getByText("12:50  Blönduós")).toBeVisible();
    expect(screen.getByText("14:45  Hof, Akureyri")).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));
    expect(await screen.findByRole("header", { name: "Check the change" })).toBeVisible();
    expect(screen).toHavePathname(`${tripPage}/edit/check`);
    expect(screen.getByText("Departure changed from 09:00 to 09:45")).toBeVisible();
    expect(screen.getByText("09:45  BSÍ bus terminal")).toBeVisible();
    expect(screen.getByText("14:45  Hof, Akureyri")).toBeVisible();
    expect(screen.getByText("1 passenger is told the new time now.")).toBeVisible();
    expect(
      screen.getByText(
        "It moves far enough from when they booked that 1 passenger can cancel with a full refund, without it counting against them.",
      ),
    ).toBeVisible();
    // Checked on the time step, and again here, as of now; nothing is saved yet.
    expect(changes(client)).toEqual([
      { preview, body: at0945 },
      { preview, body: at0945 },
    ]);
    expect(trips()[0]?.departsAt).toBe("2026-11-15T09:00:00.000Z");

    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
    expect(await screen.findByText("Ride changed. Your passengers have been told.")).toBeVisible();
    expect(focusMoves).toHaveBeenCalledTimes(1);
    focusMoves.mockRestore();
    expect(screen).toHavePathname(tripPage);
    expect(changes(client).at(-1)).toEqual({ preview: { preview: false }, body: at0945 });
    expect(trips()[0]?.departsAt).toBe("2026-11-15T09:45:00.000Z");
    expect(await screen.findByText(/^Sunday 15 November at 09:45/)).toBeVisible();
  });

  it("tells nobody when nobody booked", async () => {
    await openTime([], {}, { ...northMyTrip, segments: northSegments([0, 0, 0]), openRequests: 0 });
    expect(screen.queryByText(/^With bookings/)).toBeNull();
    await chooseDeparture("10:30");
    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));
    expect(
      await screen.findByText("Nobody has booked yet, so nobody needs to be told."),
    ).toBeVisible();
    expect(screen.queryByText(/full refund/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
    expect(await screen.findByText("Ride changed.")).toBeVisible();
  });

  it("says which requests still wait, and which the move makes expire (R5.5)", async () => {
    await openTime([jon], { told: { told: 0, requests: 2, expiring: 1 } });
    await chooseDeparture("08:00");
    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));
    expect(
      await screen.findByText("2 people who asked for a seat see the new time in the app."),
    ).toBeVisible();
    expect(
      screen.getByText("1 request can no longer be answered in time, so it expires."),
    ).toBeVisible();
    expect(screen.queryByText(/^Nobody has booked yet/)).toBeNull();
    expect(screen.queryByText(/told the new time now/)).toBeNull();
  });

  it("asks for another time when it is the one the trip has, or too soon, without asking the server", async () => {
    const { client } = await openTime();
    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));
    expect(
      screen.getByText("This is the departure the ride has now. Choose another time."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Saturday 14 November" }));
    await chooseDeparture("12:15");
    expect(screen.queryByText(/^This is the departure/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));
    expect(screen.getByText("Leave at least 30 minutes from now.")).toBeVisible();
    expect(changes(client)).toEqual([]);
  });

  it("says which departures the bookings allow when the move is too far (R6.4)", async () => {
    const { client } = await openTime([jon], {
      change: () =>
        failure(422, "change_not_allowed", {
          details: [{ path: "departsAt", issue: "move_too_far" }],
          departureWindow: {
            earliest: "2026-11-15T07:00:00.000Z",
            latest: "2026-11-15T11:00:00.000Z",
          },
        }),
    });
    await chooseDeparture("11:30");
    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));
    expect(
      await screen.findByText("With bookings, the departure can be between 07:00 and 11:00."),
    ).toBeVisible();
    // Under the time, which is what to change.
    expect(screen.queryByTestId("notice")).toBeNull();
    expect(screen).toHavePathname(`${tripPage}/edit/time`);
    expect(changes(client)).toHaveLength(1);
  });

  it("tells passengers of a move of 30 minutes or less, without a free cancellation", async () => {
    await openTime([jon], { told: { told: 1, freeCancellations: 0 } });
    await chooseDeparture("09:20");
    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));
    expect(await screen.findByText("1 passenger is told the new time now.")).toBeVisible();
    expect(screen.queryByText(/full refund/)).toBeNull();
  });

  it("names the rule a change breaks, such as another trip of the driver's", async () => {
    await openTime([jon], {
      change: () =>
        failure(422, "change_not_allowed", {
          details: [{ path: "departsAt", issue: "overlaps_trip" }],
        }),
    });
    await chooseDeparture("10:00");
    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));
    expect(
      await screen.findByText("You're already driving another ride at that time."),
    ).toBeVisible();
  });

  it("says when saving is refused after the check, and saves nothing", async () => {
    const { trips } = await openTime([jon], {
      change: (previewing) =>
        previewing
          ? undefined
          : failure(422, "change_not_allowed", {
              details: [{ path: "departsAt", issue: "overlaps_trip" }],
            }),
    });
    await chooseDeparture("10:00");
    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Save the change" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You're already driving another ride at that time.",
    );
    expect(screen).toHavePathname(`${tripPage}/edit/check`);
    expect(trips()[0]?.departsAt).toBe("2026-11-15T09:00:00.000Z");
  });

  it("says when the trip can no longer be changed", async () => {
    await openTime([jon], { change: () => failure(409, "trip_not_changeable") });
    await chooseDeparture("10:00");
    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This ride can no longer be changed.",
    );
  });

  it("offers nothing to check once the trip has left, opened from a link", async () => {
    const left = { ...northMyTrip, departsAt: "2026-11-14T12:00:00.000Z" };
    await renderApp(`${tripPage}/edit/check?departsAt=2026-11-14T12:45:00.000Z`, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [left]);
        driverApi(client, [jon]);
      },
    });
    expect(await screen.findByText("This ride can no longer be changed.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save the change" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Back to the ride" }));
    expect(screen).toHavePathname(tripPage);
  });

  it("offers nothing to change on a cancelled trip opened from a link", async () => {
    const cancelled = {
      ...northMyTrip,
      status: "cancelled" as const,
      cancellation: { reason: "weather" as const, note: "", countsOnReliability: false },
    };
    await renderApp(`${tripPage}/edit`, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [cancelled]);
        driverApi(client, []);
      },
    });
    expect(await screen.findByText("This ride can no longer be changed.")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Change the time" })).toBeNull();
  });
});
