import { act, fireEvent, screen, waitFor } from "expo-router/testing-library";
import type { ReactElement } from "react";
import { Dimensions, type RefreshControlProps, type ScrollViewProps } from "react-native";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  bookingApi,
  driverApi,
  northBooking,
  northMyTrip,
  requestToDrive,
} from "@/testing/bookings";
import { chatBooking, conversationOf } from "@/testing/chat";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { northResult, searchApi, soonRides, soonestApi } from "@/testing/search";
import { blonduos, borgarnes, tripsApi } from "@/testing/trips";

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

/** How many times the app asked for `path`. */
const callsTo = (client: FakeClient, path: string) =>
  client.calls.filter((call) => call.path === path).length;

/** The screen's pull to refresh, as React Native's RefreshControl gets it. */
const pullControl = () =>
  (screen.getByTestId("screen-scroll").props as ScrollViewProps).refreshControl as
    ReactElement<RefreshControlProps> | undefined;

/** Pulls the screen down on a phone, as RefreshControl does. */
async function pullDown() {
  const control = pullControl();
  if (control === undefined) throw new Error("This screen does not pull to refresh.");
  await act(() => {
    void control.props.onRefresh?.();
  });
}

function myRidesApi(client: FakeClient) {
  client.answer("/v1/me/bookings", () => ok(200, { bookings: [northBooking()] }));
  client.answer("/v1/me/trips", () => ok(200, { trips: [] }));
}

describe("Pulling down to refresh (spec 16, 3.9)", () => {
  it("loads My rides again, keeps them on screen meanwhile, then says Updated", async () => {
    const app = await renderApp("/my-rides", {
      me: completeMe,
      setUp: myRidesApi,
    });
    expect(
      await screen.findByRole("button", { name: /^Passenger, Sunday 15 November/ }),
    ).toBeVisible();
    const before = callsTo(app.client, "/v1/me/bookings");
    await pullDown();
    expect(await screen.findByText("Updated")).toBeVisible();
    expect(callsTo(app.client, "/v1/me/bookings")).toBe(before + 1);
    expect(callsTo(app.client, "/v1/me/trips")).toBe(before + 1);
    expect(screen.getByRole("button", { name: /^Passenger, Sunday 15 November/ })).toBeVisible();
    // The phone's own spinner shows while it loads, and stops after.
    expect(pullControl()?.props.refreshing).toBe(false);
  });

  it("keeps the rides and says so when they could not be loaded again", async () => {
    const app = await renderApp("/my-rides", {
      me: completeMe,
      setUp: myRidesApi,
    });
    expect(
      await screen.findByRole("button", { name: /^Passenger, Sunday 15 November/ }),
    ).toBeVisible();
    app.client.answer("/v1/me/bookings", () => failure(0, "network_error"));
    await pullDown();
    expect(await screen.findByText("Couldn't update")).toBeVisible();
    expect(screen.getByRole("button", { name: /^Passenger, Sunday 15 November/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    // Pulled again once PuffinRide answers, it is up to date.
    myRidesApi(app.client);
    await pullDown();
    expect(await screen.findByText("Updated")).toBeVisible();
  });

  it("shows My rides once a pull loads them, after they could not be loaded", async () => {
    let fails = true;
    await renderApp("/my-rides", {
      me: completeMe,
      setUp: (client) => {
        myRidesApi(client);
        client.answer("/v1/me/bookings", () =>
          fails ? failure(0, "network_error") : ok(200, { bookings: [northBooking()] }),
        );
      },
    });
    expect(await screen.findByRole("button", { name: "Try again" })).toBeVisible();
    fails = false;
    await pullDown();
    expect(await screen.findByText("Updated")).toBeVisible();
    expect(screen.getByRole("button", { name: /^Passenger, Sunday 15 November/ })).toBeVisible();
  });

  it("takes Updated away after two seconds", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    try {
      await renderApp("/my-rides", { me: completeMe, setUp: myRidesApi });
      expect(
        await screen.findByRole("button", { name: /^Passenger, Sunday 15 November/ }),
      ).toBeVisible();
      await pullDown();
      expect(await screen.findByText("Updated")).toBeVisible();
      await act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.queryByText("Updated")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("loads the front page's rides and your next ride again", async () => {
    const app = await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        soonestApi(client, soonRides(2));
        myRidesApi(client);
      },
    });
    expect(await screen.findByRole("header", { name: "Your next ride" })).toBeVisible();
    const rides = callsTo(app.client, "/v1/trips/soonest");
    const next = callsTo(app.client, "/v1/me/bookings");
    await pullDown();
    expect(await screen.findByText("Updated")).toBeVisible();
    expect(callsTo(app.client, "/v1/trips/soonest")).toBe(rides + 1);
    expect(callsTo(app.client, "/v1/me/bookings")).toBe(next + 1);
  });

  it("loads the front page again when the logo is pressed", async () => {
    const app = await renderApp("/", {
      setUp: (client) => {
        soonestApi(client, soonRides(2));
      },
    });
    expect(await screen.findByRole("header", { name: "Leaving soon" })).toBeVisible();
    const rides = callsTo(app.client, "/v1/trips/soonest");
    await fireEvent.press(
      screen.getByRole("button", { name: "PuffinRide, update the front page" }),
    );
    expect(await screen.findByText("Updated")).toBeVisible();
    expect(callsTo(app.client, "/v1/trips/soonest")).toBe(rides + 1);
    // Signed out, nobody has rides of their own to load.
    expect(callsTo(app.client, "/v1/me/bookings")).toBe(0);
  });

  it("loads all the rides leaving soon again", async () => {
    const app = await renderApp("/rides", {
      setUp: (client) => {
        soonestApi(client, soonRides(2));
      },
    });
    expect(await screen.findByRole("header", { name: "Rides leaving soon" })).toBeVisible();
    const before = callsTo(app.client, "/v1/trips/soonest");
    await pullDown();
    expect(await screen.findByText("Updated")).toBeVisible();
    expect(callsTo(app.client, "/v1/trips/soonest")).toBe(before + 1);
  });

  it("searches again on the results", async () => {
    const app = await renderApp(
      `/search/results?from=${borgarnes.id}&to=${blonduos.id}&fromName=Borgarnes&toName=Bl%C3%B6ndu%C3%B3s&seats=1`,
      {
        setUp: (client) => {
          searchApi(client, { results: () => [northResult] });
        },
      },
    );
    expect(await screen.findByText("That's every trip found.")).toBeVisible();
    const before = callsTo(app.client, "/v1/trips/search");
    await pullDown();
    expect(await screen.findByText("Updated")).toBeVisible();
    expect(callsTo(app.client, "/v1/trips/search")).toBe(before + 1);
  });

  it("keeps the trips from nearby points on screen while they load again", async () => {
    const nearby = { ...northResult, board: { ...northResult.board, nearbyM: 8_400 } };
    let answerNearby: () => void = () => undefined;
    const app = await renderApp(
      `/search/results?from=${borgarnes.id}&to=${blonduos.id}&fromName=Borgarnes&toName=Bl%C3%B6ndu%C3%B3s&seats=1`,
      {
        setUp: (client) => {
          searchApi(client, { results: () => [], nearby: [nearby] });
        },
      },
    );
    expect(await screen.findByText("8.4 km from Borgarnes")).toBeVisible();
    const before = callsTo(app.client, "/v1/trips/search/alternatives");
    app.client.answer(
      "/v1/trips/search/alternatives",
      () =>
        new Promise((resolve) => {
          answerNearby = () => {
            resolve(ok(200, { days: [], nearby: [nearby] }));
          };
        }),
    );
    await pullDown();
    expect(callsTo(app.client, "/v1/trips/search/alternatives")).toBe(before + 1);
    // Still waiting for the nearby trips: the last ones stay, nothing is updated yet.
    expect(screen.getByText("8.4 km from Borgarnes")).toBeVisible();
    expect(screen.queryByText("Updated")).toBeNull();
    await act(() => {
      answerNearby();
    });
    expect(await screen.findByText("Updated")).toBeVisible();
    expect(screen.getByText("8.4 km from Borgarnes")).toBeVisible();
  });

  it("loads my conversations again", async () => {
    const app = await renderApp("/messages", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/me/conversations", () =>
          ok(200, { conversations: [conversationOf(chatBooking)] }),
        );
      },
    });
    expect(await screen.findByRole("header", { name: "Messages" })).toBeVisible();
    await waitFor(() => {
      expect(callsTo(app.client, "/v1/me/conversations")).toBeGreaterThan(0);
    });
    const before = callsTo(app.client, "/v1/me/conversations");
    await pullDown();
    expect(await screen.findByText("Updated")).toBeVisible();
    expect(callsTo(app.client, "/v1/me/conversations")).toBe(before + 1);
  });

  it("loads a booking again", async () => {
    const app = await renderApp(`/bookings/${northBooking().id}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => northBooking());
      },
    });
    expect(await screen.findByText("Request sent")).toBeVisible();
    const before = callsTo(app.client, "/v1/bookings/{id}");
    await pullDown();
    expect(await screen.findByText("Updated")).toBeVisible();
    expect(callsTo(app.client, "/v1/bookings/{id}")).toBe(before + 1);
  });

  it("keeps a booking on screen and says so when it could not be loaded again", async () => {
    const app = await renderApp(`/bookings/${northBooking().id}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => northBooking());
      },
    });
    expect(await screen.findByText("Request sent")).toBeVisible();
    app.client.answer("/v1/bookings/{id}", () => failure(0, "network_error"), "get");
    await pullDown();
    expect(await screen.findByText("Couldn't update")).toBeVisible();
    expect(screen.getByText("Request sent")).toBeVisible();
  });

  it("loads the driver's trip page again, with its requests", async () => {
    const app = await renderApp(`/drive/trips/${northMyTrip.id}`, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [northMyTrip]);
        driverApi(client, [requestToDrive]);
      },
    });
    expect(await screen.findByRole("header", { name: "Requests" })).toBeVisible();
    const before = callsTo(app.client, "/v1/me/trips/{id}/bookings");
    await pullDown();
    expect(await screen.findByText("Updated")).toBeVisible();
    expect(callsTo(app.client, "/v1/me/trips/{id}/bookings")).toBe(before + 1);
  });
});

describe("The logo on a laptop (spec 18, 3.3)", () => {
  const phone = { width: 750, height: 1334, scale: 2, fontScale: 2 };
  const laptop = { width: 1280, height: 800, scale: 1, fontScale: 1 };

  beforeEach(() => {
    Dimensions.set({ window: laptop });
  });

  afterEach(async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
  });

  it("opens Find from another place and loads its rides again", async () => {
    const app = await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        soonestApi(client, soonRides(2));
        myRidesApi(client);
      },
    });
    expect(await screen.findByRole("header", { name: "Leaving soon" })).toBeVisible();
    await fireEvent.press(screen.getByRole("tab", { name: "My rides" }));
    expect(await screen.findByRole("header", { name: "My rides" })).toBeVisible();
    const before = callsTo(app.client, "/v1/trips/soonest");
    await fireEvent.press(screen.getByRole("link", { name: "PuffinRide, to the front page" }));
    expect(await screen.findByText("Updated")).toBeVisible();
    expect(screen).toHavePathname("/");
    expect(callsTo(app.client, "/v1/trips/soonest")).toBe(before + 1);
  });
});
