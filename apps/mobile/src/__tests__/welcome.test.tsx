import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { AccessibilityInfo, BackHandler } from "react-native";
import { getLocales } from "expo-localization";
import type { Booking, DriverReadiness, MyTrip } from "@shareride/contracts";
import { readAppData, writeAppData } from "@/lib/app-data";
import { completeMe, renderApp } from "@/testing/app";
import {
  bookingApi,
  northBooking,
  northMyTrip,
  northSegments,
  unpaidBooking,
} from "@/testing/bookings";
import type * as TestApp from "@/testing/app";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
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
import { colors } from "@/theme/tokens";

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

describe("Find, the home (spec 16, 3.2)", () => {
  it("opens in English on an English device", async () => {
    deviceLanguage("en-GB");
    await renderApp("/");
    expect(await screen.findByText("Where are you going?")).toBeVisible();
  });

  it("opens in Icelandic on an Icelandic device", async () => {
    deviceLanguage("is-IS");
    await renderApp("/");
    expect(await screen.findByText("Hvert ertu að fara?")).toBeVisible();
  });

  it("opens in English on a device in another language", async () => {
    deviceLanguage("pl-PL");
    await renderApp("/");
    expect(await screen.findByText("Where are you going?")).toBeVisible();
  });

  it("switches to Icelandic and back with the language button", async () => {
    deviceLanguage("en-GB");
    await renderApp("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Change the language to Icelandic" }),
    );
    expect(await screen.findByText("Hvert ertu að fara?")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Skipta yfir í ensku" }));
    expect(await screen.findByText("Where are you going?")).toBeVisible();
  });

  it("labels the title as a heading for screen readers", async () => {
    deviceLanguage("en-GB");
    await renderApp("/");
    expect(await screen.findByRole("header", { name: "Where are you going?" })).toBeVisible();
  });
});

async function openFrontPage(setUp: (client: FakeClient) => void = () => undefined) {
  deviceLanguage("en-GB");
  return renderApp("/", { setUp });
}

/** Chooses a place in the list that drops down under From or To. */
async function choose(field: "From" | "To", typed: string, name: string) {
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${field}: `) }));
  await fireEvent.changeText(await screen.findByLabelText(field), typed);
  await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^${name}`) }));
}

describe("Find: search, rides and offering (spec 16, 3.2; spec 4, 3.8)", () => {
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
          "5 h, 6,000 ISK per seat, Driver approves, Anna, New driver, " +
          "3 seats left",
      }),
    ).toBeVisible();
    // Each is the driver's whole trip, so no card names it a second time.
    expect(screen.queryByText(/ drives /u)).toBeNull();
    expect(screen.getAllByText("Driver approves")).toHaveLength(5);
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
    await screen.findByText("Where are you going?");
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
    await choose("From", "borg", "Borgarnes");
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
    await choose("From", "borg", "Borgarnes");
    await choose("To", "blön", "Blönduós");
    expect(screen.getByRole("header", { name: "Where are you going?" })).toBeVisible();
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

  it("drops the place search down under From, on the front page itself", async () => {
    await openFrontPage((fake) => {
      searchApi(fake);
    });
    await fireEvent.press(await screen.findByRole("button", { name: /^From: / }));
    const field = await screen.findByLabelText("From");
    // No new screen: the page and the To field stay where they are.
    expect(screen.getByRole("header", { name: "Where are you going?" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^To: / })).toBeVisible();
    expect(screen.getByRole("button", { name: "Offer a ride" })).toBeVisible();
    // Nothing to swap while a place is being typed.
    expect(screen.queryByRole("button", { name: "Swap from and to" })).toBeNull();

    await fireEvent.changeText(field, "borg");
    await fireEvent.press(await screen.findByRole("button", { name: /^Borgarnes/ }));
    expect(screen.queryByLabelText("From")).toBeNull();
    expect(screen.getByRole("button", { name: "From: Borgarnes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Swap from and to" })).toBeVisible();
  });

  it("keeps one place search open at a time, and closes it without changing the choice", async () => {
    await openFrontPage((fake) => {
      searchApi(fake);
    });
    await choose("From", "borg", "Borgarnes");
    await fireEvent.press(screen.getByRole("button", { name: /^To: / }));
    expect(await screen.findByLabelText("To")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "From: Borgarnes" }));
    const field = await screen.findByLabelText("From");
    expect(screen.queryByLabelText("To")).toBeNull();
    // Close is a small X inside the field's moss outline, at its end.
    const box = screen.getByTestId("place-field");
    expect(box).toHaveStyle({ borderColor: colors.light.primary });
    expect(within(box).getByRole("button", { name: "Close" })).toBeVisible();

    // Close, or Escape on a keyboard, leaves Borgarnes chosen, and screen
    // readers go back to From.
    await fireEvent.changeText(field, "blön");
    await screen.findByRole("button", { name: /^Blönduós/ });
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    try {
      await fireEvent.press(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByLabelText("From")).toBeNull();
      expect(screen.getByRole("button", { name: "From: Borgarnes" })).toBeVisible();
      expect(focus).toHaveBeenLastCalledWith(expect.anything(), "focus");
    } finally {
      focus.mockRestore();
    }
    await fireEvent.press(screen.getByRole("button", { name: "From: Borgarnes" }));
    await fireEvent(await screen.findByLabelText("From"), "keyPress", {
      nativeEvent: { key: "Escape" },
    });
    expect(screen.queryByLabelText("From")).toBeNull();
    expect(screen.getByRole("button", { name: "From: Borgarnes" })).toBeVisible();
  });

  it("closes the place search with Android's back, staying on the front page", async () => {
    const listen = jest.spyOn(BackHandler, "addEventListener");
    try {
      await openFrontPage();
      await fireEvent.press(await screen.findByRole("button", { name: /^From: / }));
      expect(await screen.findByLabelText("From")).toBeVisible();
      // The listener added last is asked first, as on a phone.
      const [, back] = listen.mock.calls.at(-1) ?? [];
      let handled: boolean | undefined;
      await act(() => {
        handled = back?.({ type: "hardwareBackPress", timeStamp: 0 });
      });
      expect(handled).toBe(true);
      expect(screen.queryByLabelText("From")).toBeNull();
      expect(screen.getByRole("button", { name: /^From: / })).toBeVisible();
    } finally {
      listen.mockRestore();
    }
  });

  it("shows the logo and the name on top, then the search with Find a ride as the main button", async () => {
    await openFrontPage();
    expect(await screen.findByRole("header", { name: "Where are you going?" })).toBeVisible();
    expect(screen.getByTestId("logo", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("ShareRide")).toBeVisible();
    const find = screen.getByRole("button", { name: "Find a ride" });
    expect(within(find).getByTestId("button-face")).toHaveStyle({
      backgroundColor: colors.light.primary,
    });
    // Signing in is in the menu, under My rides, Offer and Profile.
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("ends with Offer a ride as a secondary button, and the meeting points", async () => {
    await openFrontPage();
    expect(
      await screen.findByText("Driving somewhere? Share the empty seats in your car."),
    ).toBeVisible();
    const offer = screen.getByRole("button", { name: "Offer a ride" });
    expect(within(offer).getByTestId("button-face")).toHaveStyle({
      borderColor: colors.light.control,
    });
    expect(screen.getByRole("button", { name: "See the meeting points" })).toBeVisible();
  });

  it("is the same page for someone signed in", async () => {
    await renderApp("/", { me: completeMe });
    expect(await screen.findByRole("header", { name: "Where are you going?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Find a ride" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Offer a ride" })).toBeVisible();
  });

  it("searches for the seats chosen in the form", async () => {
    const { client } = await openFrontPage((fake) => {
      searchApi(fake);
    });
    await choose("From", "borg", "Borgarnes");
    await choose("To", "blön", "Blönduós");
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    expect(screen.getByRole("adjustable", { name: "Seats" })).toHaveAccessibilityValue({
      text: "2 seats",
    });
    await fireEvent.press(screen.getByRole("button", { name: "Find a ride" }));
    expect(await screen.findByRole("header", { name: "Borgarnes → Blönduós" })).toBeVisible();
    expect(searchesOf(client)).toEqual([
      { from: borgarnes.id, to: blonduos.id, seats: 2, sort: "departure" },
    ]);
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
    expect(screen).toHavePathname("/offer");
    expect(mockedWrite).toHaveBeenLastCalledWith("pending-offer", "");
  });
});

describe("Your next ride (spec 16, 3.2 item 2)", () => {
  /** Answers the rides coming up: my bookings and the trips I drive. */
  function comingUp(client: FakeClient, bookings: Booking[], trips: MyTrip[] = []) {
    client.answer("/v1/me/bookings", () => ok(200, { bookings }));
    client.answer("/v1/me/trips", () => ok(200, { trips }));
  }
  const later = northBooking({
    id: "0190a1d6-0000-7000-8000-0000000000c2",
    status: "confirmed",
    board: { ...northBooking().board, plannedAt: "2026-11-16T10:00:00.000Z" },
    alight: { ...northBooking().alight, plannedAt: "2026-11-16T12:05:00.000Z" },
  });

  it("shows the soonest ride on top, with its status, and opens it", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        comingUp(client, [northBooking(), later]);
        bookingApi(client, () => northBooking());
      },
    });
    expect(await screen.findByRole("header", { name: "Your next ride" })).toBeVisible();
    const ride = screen.getByRole("button", {
      name: "Passenger, Sunday 15 November, Borgarnes → Blönduós, 10:00 to 12:05, Request sent, Anna, White Toyota Yaris, 1 seat, 2,900 ISK",
    });
    expect(screen.queryByRole("button", { name: /^Passenger, Monday/ })).toBeNull();
    await fireEvent.press(ride);
    expect(await screen.findByText("Request sent. Anna has until 22:00 to answer.")).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${northBooking().id}`);
  });

  it("asks to pay when the next ride waits for payment", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        comingUp(client, [unpaidBooking]);
        bookingApi(client, () => unpaidBooking);
      },
    });
    expect(await screen.findByText("Pay by 12:30 to keep your seat")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByText("Pay 2,900 ISK to confirm your seat")).toBeVisible();
  });

  it("shows a trip I drive with the seats booked", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        comingUp(
          client,
          [later],
          [
            {
              ...northMyTrip,
              segments: northSegments([1, 1, 1]),
              openRequests: 0,
              requestsCloseAt: null,
            },
          ],
        );
      },
    });
    expect(
      await screen.findByRole("button", {
        name: "Driving, Sunday 15 November, BSÍ bus terminal → Hof, Akureyri, 09:00 to 14:00, 1 of 3 seats booked, Seats free on every stretch: 2",
      }),
    ).toBeVisible();
  });

  it("is left out signed out", async () => {
    const { client } = await openFrontPage();
    expect(await screen.findByRole("header", { name: "Where are you going?" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Your next ride" })).toBeNull();
    expect(client.calls.map((call) => call.path)).not.toContain("/v1/me/bookings");
  });

  it("is left out when nothing is coming up", async () => {
    deviceLanguage("en-GB");
    const { client } = await renderApp("/", {
      me: completeMe,
      setUp: (fake) => {
        comingUp(fake, []);
      },
    });
    expect(await screen.findByRole("header", { name: "Where are you going?" })).toBeVisible();
    await waitFor(() => {
      expect(client.calls.map((call) => call.path)).toContain("/v1/me/trips");
    });
    expect(screen.queryByRole("header", { name: "Your next ride" })).toBeNull();
  });

  it("says when it could not be loaded, with a retry", async () => {
    deviceLanguage("en-GB");
    let tries = 0;
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        comingUp(client, [northBooking()]);
        client.answer("/v1/me/bookings", () => {
          tries += 1;
          return tries === 1
            ? failure(500, "internal_error")
            : ok(200, { bookings: [northBooking()] });
        });
      },
    });
    expect(await screen.findByText("Your next ride could not be loaded.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("header", { name: "Your next ride" })).toBeVisible();
    expect(screen.queryByText("Your next ride could not be loaded.")).toBeNull();
  });
});
