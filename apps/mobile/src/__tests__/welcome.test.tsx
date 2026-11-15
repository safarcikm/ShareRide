import { act, fireEvent, screen, within } from "expo-router/testing-library";
import { BackHandler } from "react-native";
import { getLocales } from "expo-localization";
import type { DriverReadiness } from "@shareride/contracts";
import { readAppData, writeAppData } from "@/lib/app-data";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { ok, type FakeClient } from "@/testing/fake-client";
import {
  northResult,
  searchApi,
  searchesOf,
  soonestApi,
  soonRide,
  soonRides,
  tripDetailsApi,
} from "@/testing/search";
import { blonduos, borgarnes } from "@/testing/trips";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Recent searches and an offer kept through sign-up live in the app's own storage.
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn(() => Promise.resolve(null)),
  writeAppData: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

const mockedGetLocales = getLocales as jest.Mock;
const mockedRead = readAppData as jest.Mock;
const mockedWrite = writeAppData as jest.Mock;

beforeEach(() => {
  mockedRead.mockReset().mockResolvedValue(null);
  mockedWrite.mockClear();
});

function deviceLanguage(languageTag: string) {
  mockedGetLocales.mockReturnValue([{ languageTag }]);
}

describe("Welcome", () => {
  it("opens in English on an English device", async () => {
    deviceLanguage("en-GB");
    await renderApp("/");
    expect(await screen.findByText("Share the ride across Iceland")).toBeVisible();
  });

  it("opens in Icelandic on an Icelandic device", async () => {
    deviceLanguage("is-IS");
    await renderApp("/");
    expect(await screen.findByText("Samferða um allt Ísland")).toBeVisible();
  });

  it("opens in English on a device in another language", async () => {
    deviceLanguage("pl-PL");
    await renderApp("/");
    expect(await screen.findByText("Share the ride across Iceland")).toBeVisible();
  });

  it("switches to Icelandic and back with the language button", async () => {
    deviceLanguage("en-GB");
    await renderApp("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Change the language to Icelandic" }),
    );
    expect(await screen.findByText("Samferða um allt Ísland")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Skipta yfir í ensku" }));
    expect(await screen.findByText("Share the ride across Iceland")).toBeVisible();
  });

  it("labels the title as a heading for screen readers", async () => {
    deviceLanguage("en-GB");
    await renderApp("/");
    expect(
      await screen.findByRole("header", { name: "Share the ride across Iceland" }),
    ).toBeVisible();
  });
});

async function openFrontPage(setUp: (client: FakeClient) => void = () => undefined) {
  deviceLanguage("en-GB");
  return renderApp("/", { setUp });
}

async function choose(field: RegExp, typed: string, name: string) {
  await fireEvent.press(screen.getByRole("button", { name: field }));
  await fireEvent.changeText(await screen.findByLabelText("Town or meeting point"), typed);
  await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^${name}`) }));
}

describe("The front page (spec 1, 3.1; spec 4, 3.8)", () => {
  it("shows the five rides leaving soonest, and See all rides when there are more", async () => {
    const { client } = await openFrontPage((fake) => {
      soonestApi(fake, soonRides(6));
    });
    expect(await screen.findByRole("header", { name: "Leaving soon" })).toBeVisible();
    const rides = screen.getAllByTestId("trip-result");
    expect(rides).toHaveLength(5);
    // Each for the whole route, with its day.
    expect(
      screen.getByRole("button", {
        name:
          "Sun 15 Nov, Leaves BSÍ bus terminal at 09:00, arrives at Hof, Akureyri at 14:00, " +
          "5 h, 6,000 ISK per seat, BSÍ bus terminal → Hof, Akureyri, Request, Anna, New driver, " +
          "3 seats left",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "See all rides" })).toBeVisible();
    expect(searchesOf(client, "/v1/trips/soonest")).toEqual([{ limit: 6 }]);
  });

  it("opens a ride for its whole route, where booking starts with signing in", async () => {
    const ride = soonRide("2026-11-15", 0, { tripId: northResult.tripId });
    await openFrontPage((fake) => {
      soonestApi(fake, [ride]);
      tripDetailsApi(fake);
    });
    await fireEvent.press(await screen.findByTestId("trip-result"));
    expect(screen).toHavePathname(`/trips/${ride.tripId}`);
    expect(screen).toHaveSearchParams({ id: ride.tripId, from: "0", to: "3" });
    const bar = await screen.findByTestId("bottom-bar");
    expect(within(bar).getByText("You'll sign in or create an account first.")).toBeVisible();
  });

  it("shows no See all rides with five rides or fewer", async () => {
    await openFrontPage((fake) => {
      soonestApi(fake, soonRides(5));
    });
    expect(await screen.findByRole("header", { name: "Leaving soon" })).toBeVisible();
    expect(screen.getAllByTestId("trip-result")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "See all rides" })).toBeNull();
  });

  it("leaves the rides out when there are none", async () => {
    const { client } = await openFrontPage();
    expect(await screen.findByRole("button", { name: "Offer a ride" })).toBeVisible();
    await screen.findByText("Share the ride across Iceland");
    expect(searchesOf(client, "/v1/trips/soonest")).toHaveLength(1);
    expect(screen.queryByRole("header", { name: "Leaving soon" })).toBeNull();
    expect(screen.queryByRole("button", { name: "See all rides" })).toBeNull();
  });

  it("leaves the rides out when they can't be loaded, and the rest still works", async () => {
    await openFrontPage((fake) => {
      soonestApi(fake, "failure");
      searchApi(fake);
    });
    expect(await screen.findByRole("button", { name: "Offer a ride" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Leaving soon" })).toBeNull();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
    await choose(/^From: /, "borg", "Borgarnes");
    expect(screen.getByRole("button", { name: "From: Borgarnes" })).toBeVisible();
  });

  it("searches a route from the front page, and keeps it among recent searches", async () => {
    const { client } = await openFrontPage((fake) => {
      searchApi(fake);
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Find a ride" }));
    expect(
      await screen.findByText("Choose where you're leaving from and where you're going."),
    ).toBeVisible();
    await choose(/^From: /, "borg", "Borgarnes");
    await choose(/^To: /, "blön", "Blönduós");
    expect(screen.getByRole("header", { name: "Share the ride across Iceland" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Find a ride" }));

    expect(await screen.findByRole("header", { name: "Borgarnes → Blönduós" })).toBeVisible();
    expect(searchesOf(client)).toEqual([
      { from: borgarnes.id, to: blonduos.id, seats: 1, sort: "departure" },
    ]);
    const [key, value] = (mockedWrite.mock.calls as [string, string][]).at(-1) ?? [];
    expect(key).toBe("recentSearches");
    expect(JSON.parse(value ?? "null")).toEqual([
      {
        from: { id: borgarnes.id, name: borgarnes.name },
        to: { id: blonduos.id, name: blonduos.name },
        date: null,
        seats: 1,
      },
    ]);
  });

  it("closes the place search with Android's back, staying on the front page", async () => {
    const listen = jest.spyOn(BackHandler, "addEventListener");
    try {
      await openFrontPage();
      await fireEvent.press(await screen.findByRole("button", { name: /^From: / }));
      expect(await screen.findByLabelText("Town or meeting point")).toBeVisible();
      // The listener added last is asked first, as on a phone.
      const [, back] = listen.mock.calls.at(-1) ?? [];
      let handled: boolean | undefined;
      await act(() => {
        handled = back?.({ type: "hardwareBackPress", timeStamp: 0 });
      });
      expect(handled).toBe(true);
      expect(await screen.findByRole("button", { name: "Offer a ride" })).toBeVisible();
      expect(screen.queryByLabelText("Town or meeting point")).toBeNull();
    } finally {
      listen.mockRestore();
    }
  });

  it("leads from Sign in to the sign-in screen", async () => {
    await openFrontPage();
    await fireEvent.press(await screen.findByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("What's your phone number?")).toBeVisible();
    expect(mockedWrite).not.toHaveBeenCalledWith("pending-offer", expect.anything());
  });

  it("leads from Offer a ride to signing in, keeping the offer", async () => {
    await openFrontPage();
    await fireEvent.press(await screen.findByRole("button", { name: "Offer a ride" }));
    expect(await screen.findByText("What's your phone number?")).toBeVisible();
    const [key, kept] = mockedWrite.mock.calls.at(-1) as [string, string];
    expect(key).toBe("pending-offer");
    expect(JSON.parse(kept)).toEqual({ keptAt: "2026-11-14T12:00:00.000Z" });
    // A booking chosen before it is forgotten: sign-up goes on to the offer.
    expect(mockedWrite).toHaveBeenCalledWith("pending-booking", "");
  });

  it("opens Ready to drive once the account is ready, when an offer was kept", async () => {
    mockedRead.mockImplementation((name: string) =>
      Promise.resolve(
        name === "pending-offer" ? JSON.stringify({ keptAt: "2026-11-14T11:30:00.000Z" }) : null,
      ),
    );
    const readiness: DriverReadiness = {
      ready: false,
      items: [
        { item: "photo", done: false, blocking: false },
        { item: "car", done: false, blocking: true },
        { item: "licence", done: false, blocking: true },
      ],
      licenceDeclaredAt: null,
    };
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/me/driver-readiness", () => ok(200, readiness));
        client.answer("/v1/me/vehicles", () => ok(200, { vehicles: [] }));
      },
    });
    expect(await screen.findByRole("header", { name: "Before you publish" })).toBeVisible();
    expect(screen).toHavePathname("/drive");
    expect(mockedWrite).toHaveBeenLastCalledWith("pending-offer", "");
  });
});
