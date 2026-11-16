import { act, fireEvent, screen } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { driverApi, northMyTrip } from "@/testing/bookings";
import { failure, type FakeClient } from "@/testing/fake-client";
import { blonduos, tripsApi, type TripsApi } from "@/testing/trips";

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

/** The driver's page for the north trip, with the trips API it answers from. */
async function openTrip(
  answers: Parameters<typeof tripsApi>[2] = {},
  trip: typeof northMyTrip = northMyTrip,
) {
  let api: TripsApi | undefined;
  const app = await renderApp(tripPage, {
    me: completeMe,
    setUp: (client) => {
      api = tripsApi(client, [trip], answers);
      driverApi(client, []);
    },
  });
  if (api === undefined) throw new Error("The trips API was not set up.");
  return { ...app, api };
}

const copies = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/trips/{id}/copy")
    .map((call) => call.input["query"]);

describe("Post again and Post the return (spec 6, 3.6)", () => {
  it("posts the trip again: a draft with its choices, at the date and times", async () => {
    const { client, api } = await openTrip();
    await fireEvent.press(await screen.findByRole("button", { name: "Post again" }));

    expect(await screen.findByRole("header", { name: "When are you leaving?" })).toBeVisible();
    expect(screen.getByLabelText(/^Leaving BSÍ bus terminal at/)).toBeVisible();
    expect(copies(client)).toEqual([{ reverse: false }]);
    const draft = api.trips().find((trip) => trip.status === "draft");
    expect(draft).toMatchObject({
      seats: northMyTrip.seats,
      priceLevel: northMyTrip.priceLevel,
      vehicleId: northMyTrip.vehicleId,
      departsAt: null,
    });
    expect(draft?.stops.map((stop) => stop.meetingPoint.id)).toEqual(
      northMyTrip.stops.map((stop) => stop.meetingPoint.id),
    );
    expect(screen.queryByText(/^No longer in use/)).toBeNull();
  });

  it("posts the return with the stops the other way", async () => {
    const { client, api } = await openTrip();
    await fireEvent.press(await screen.findByRole("button", { name: "Post the return trip" }));

    expect(await screen.findByRole("header", { name: "When are you leaving?" })).toBeVisible();
    expect(screen.getByLabelText(/^Leaving Hof, Akureyri at/)).toBeVisible();
    expect(copies(client)).toEqual([{ reverse: true }]);
    const draft = api.trips().find((trip) => trip.status === "draft");
    expect(draft?.stops.map((stop) => stop.meetingPoint.id)).toEqual(
      northMyTrip.stops.map((stop) => stop.meetingPoint.id).reverse(),
    );
  });

  it("names the meeting points left out as no longer in use", async () => {
    await openTrip({ dropped: [blonduos] });
    await fireEvent.press(await screen.findByRole("button", { name: "Post the return trip" }));

    expect(await screen.findByText("No longer in use, so left out: Blönduós.")).toBeVisible();
  });

  it("says when too few of the meeting points are still in use, and stays on the trip", async () => {
    await openTrip({ copy: () => failure(422, "too_few_stops") });
    await fireEvent.press(await screen.findByRole("button", { name: "Post again" }));

    expect(
      await screen.findByText(
        "Fewer than two of this trip's meeting points are still in use. Post a new trip instead.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("header", { name: "When are you leaving?" })).toBeNull();
  });

  it("makes one draft however often it is tapped, and another once back on the trip", async () => {
    let release = () => {};
    const copyAfter = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { client } = await openTrip({ copyAfter });
    const again = await screen.findByRole("button", { name: "Post again" });
    await fireEvent.press(again);
    await fireEvent.press(again);
    await fireEvent.press(screen.getByRole("button", { name: "Post the return trip" }));
    expect(copies(client)).toEqual([{ reverse: false }]);
    await act(async () => {
      release();
      await copyAfter;
    });
    expect(await screen.findByRole("header", { name: "When are you leaving?" })).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Post the return trip" }));
    expect(await screen.findByLabelText(/^Leaving Hof, Akureyri at/)).toBeVisible();
    expect(copies(client)).toEqual([{ reverse: false }, { reverse: true }]);
  });

  it("is offered on a cancelled trip too", async () => {
    await openTrip(
      {},
      {
        ...northMyTrip,
        status: "cancelled",
        cancellation: { reason: "weather", note: "", countsOnReliability: false },
      },
    );
    expect(await screen.findByRole("button", { name: "Post again" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Post the return trip" })).toBeVisible();
  });
});
