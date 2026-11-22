import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { AccessibilityInfo, BackHandler, Dimensions } from "react-native";
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
import { bsi, hof, kef, meetingPoints } from "@/testing/meeting-points";
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

    expect(
      await screen.findByRole("button", {
        name: "Change search: Borgarnes → Blönduós, Any day, 1 seat",
      }),
    ).toBeVisible();
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

  it("lists towns and areas first, then meeting points, with the sample tag once (spec 16, 3.8)", async () => {
    const akureyri = {
      id: "0190a1d6-0000-7000-8000-0000000000c2",
      name: { is: "Akureyri", en: "Akureyri" },
      kind: "town" as const,
      region: "northeast" as const,
    };
    await openFrontPage((fake) => {
      searchApi(fake);
      // The API's order: a meeting point, the town, another meeting point.
      fake.answer("/v1/places/search", () =>
        ok(200, {
          results: [
            { kind: "meetingPoint", meetingPoint: hof },
            { kind: "place", place: akureyri },
            { kind: "meetingPoint", meetingPoint: kef },
          ],
        }),
      );
    });
    await fireEvent.press(await screen.findByRole("button", { name: /^From: / }));
    await fireEvent.changeText(await screen.findByLabelText("From"), "akur");
    expect(await screen.findByText("3 places found")).toBeVisible();

    const listed = screen
      .getAllByText(/^(Towns and areas|Meeting points|Akureyri|Hof, Akureyri|Keflavík Airport)$/)
      .map((text) => String(text.props.children));
    expect(listed).toEqual([
      "Towns and areas",
      "Akureyri",
      "Meeting points",
      "Hof, Akureyri",
      "Keflavík Airport",
    ]);
    expect(screen.getByRole("header", { name: "Towns and areas" })).toBeVisible();
    expect(screen.getByRole("header", { name: "Meeting points" })).toBeVisible();
    expect(screen.getAllByText("Sample meeting points")).toHaveLength(1);
    expect(screen.queryByText("Sample meeting point")).toBeNull();
    // Each row leaves the tag out, and so does what screen readers hear.
    expect(screen.getByRole("button", { name: /^Hof, Akureyri, .*, Akureyrarbær$/ })).toBeVisible();
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
    expect(screen.getByText("PuffinRide")).toBeVisible();
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
    expect(
      await screen.findByRole("button", {
        name: "Change search: Borgarnes → Blönduós, Any day, 2 seats",
      }),
    ).toBeVisible();
    expect(searchesOf(client)).toEqual([
      { from: borgarnes.id, to: blonduos.id, seats: 2, sort: "departure" },
    ]);
  });

  it("leads from Offer a ride to signing in, keeping the offer", async () => {
    await openFrontPage();
    await fireEvent.press(await screen.findByRole("button", { name: "Offer a ride" }));
    expect(await screen.findByText("Sign in or create an account")).toBeVisible();
    const [key, kept] = mockedWrite.mock.calls.at(-1) as [string, string];
    expect(key).toBe("pending-offer");
    expect(JSON.parse(kept)).toEqual({ keptAt: "2026-11-14T12:00:00.000Z" });
    // A booking chosen before it is forgotten: sign-up goes on to the offer.
    expect(mockedWrite).toHaveBeenCalledWith("pending-booking", "");
  });

  it("opens the form to offer a ride once the account is ready, when an offer was kept", async () => {
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
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
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

  it("shows a trip I drive with the seats taken", async () => {
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
              takings: { amount: 0, currency: "ISK" },
              openRequests: 0,
              requestsCloseAt: null,
            },
          ],
        );
      },
    });
    expect(
      await screen.findByRole("button", {
        name: "Driving, Sunday 15 November, BSÍ bus terminal → Hof, Akureyri, 09:00 to 14:00, 1 of 3 seats taken, Seats free on every stretch: 2",
      }),
    ).toBeVisible();
  });

  it("shows a ride already under way as the next ride", async () => {
    deviceLanguage("en-GB");
    // Gunna boarded at 11:00 today and is out at 13:00; it is noon.
    const underWay = northBooking({
      id: "0190a1d6-0000-7000-8000-0000000000c3",
      status: "confirmed",
      board: { ...northBooking().board, plannedAt: "2026-11-14T11:00:00.000Z" },
      alight: { ...northBooking().alight, plannedAt: "2026-11-14T13:00:00.000Z" },
    });
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        comingUp(client, [later, underWay]);
      },
    });
    expect(
      await screen.findByRole("button", { name: /^Passenger, Saturday 14 November, .*Confirmed/ }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Passenger, Monday/ })).toBeNull();
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

describe("Find on a laptop (spec 18, 3.5)", () => {
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

  const row = async () => within(await screen.findByTestId("search-row"));

  /** Rides leaving soon, and the sample meeting points for the map. */
  const withRides = (rides: Parameters<typeof soonestApi>[1]) => (fake: FakeClient) => {
    soonestApi(fake, rides);
    fake.answer("/v1/meeting-points", () => ok(200, { meetingPoints }));
  };
  /** From the airport into town, where the other rides go north. */
  const airportRide = soonRide("2026-11-16", 0, {
    board: { ...northResult.board, position: 0, meetingPoint: kef },
    alight: { ...northResult.alight, position: 1, meetingPoint: bsi },
  });
  const map = () => within(screen.getByTestId("columns-side")).getByTestId("iceland-map");
  const mapOf = (route: string) => `The trip on a map of Iceland: ${route}.`;
  /** The map's drawn parts, which screen readers skip: the label says them. */
  const drawn = (testID: string) =>
    within(map()).queryAllByTestId(testID, { includeHiddenElements: true });
  /** The part of Iceland the map shows. */
  const view = () => {
    const { minX, minY, vbWidth, vbHeight } = drawn("map-drawing")[0]?.props as Record<
      string,
      number
    >;
    return { minX, minY, vbWidth, vbHeight };
  };
  /** The edge of the card whose ride the map shows. */
  const marked = { borderBottomColor: colors.light.primary };
  /** The card of the ride at this place among those leaving soon, from 0. */
  const card = (place: number) => {
    const found = screen.getAllByRole("button", { name: /, Leaves / })[place];
    if (found === undefined) throw new Error(`No ride at ${String(place)}`);
    return found;
  };
  const meetingPointsCalls = (client: FakeClient) =>
    client.calls.filter((call) => call.path === "/v1/meeting-points");

  it("puts From, To, the date, the seats and Find a ride in one row", async () => {
    await openFrontPage();
    const search = await row();
    expect(
      search.getByRole("button", { name: "From: Choose a town or meeting point" }),
    ).toBeVisible();
    expect(
      search.getByRole("button", { name: "To: Choose a town or meeting point" }),
    ).toBeVisible();
    expect(search.getByRole("button", { name: "Swap from and to" })).toBeVisible();
    expect(search.getByRole("button", { name: "Date: Any day" })).toBeVisible();
    expect(search.getByRole("adjustable", { name: "Seats" })).toBeVisible();
    expect(search.getByRole("button", { name: "Find a ride" })).toBeVisible();
    // One search, not a second one under it.
    expect(screen.getAllByRole("button", { name: "Find a ride" })).toHaveLength(1);
    expect(screen.queryByRole("radio", { name: "Choose a day" })).toBeNull();
  });

  it("shows From, To and the date as fields a shade off the card, tinted under the pointer", async () => {
    await openFrontPage();
    const search = await row();
    const fields = search.getAllByTestId("search-field");
    expect(fields).toHaveLength(3);
    for (const field of fields) {
      expect(field).toHaveStyle({ backgroundColor: colors.light.background, minHeight: 48 });
    }
    const [from, to, date] = fields.map((field) => within(field));
    expect(from?.getByText("Choose a town or meeting point")).toBeVisible();
    expect(to?.getByText("Choose a town or meeting point")).toBeVisible();
    expect(date?.getByText("Any day")).toBeVisible();

    await fireEvent(search.getByRole("button", { name: /^From: / }), "hoverIn");
    expect(search.getAllByTestId("search-field")[0]).toHaveStyle({
      backgroundColor: colors.light.primarySoft,
    });
    await fireEvent(search.getByRole("button", { name: /^From: / }), "hoverOut");
    await fireEvent(search.getByRole("button", { name: "Date: Any day" }), "hoverIn");
    expect(search.getAllByTestId("search-field")[0]).toHaveStyle({
      backgroundColor: colors.light.background,
    });
    expect(search.getAllByTestId("search-field")[2]).toHaveStyle({
      backgroundColor: colors.light.primarySoft,
    });
  });

  it("keeps a phone's From, To and day as they were, without fields", async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
    await openFrontPage();
    expect(
      await screen.findByRole("button", { name: "From: Choose a town or meeting point" }),
    ).toBeVisible();
    expect(screen.queryByTestId("search-field")).toBeNull();
  });

  it("opens the place search in From's own part of the row", async () => {
    await openFrontPage((fake) => {
      searchApi(fake);
    });
    const search = await row();
    await fireEvent.press(search.getByRole("button", { name: /^From: / }));
    await fireEvent.changeText(await search.findByLabelText("From"), "borg");
    // To, the date and the button stay in the row beside it.
    expect(search.getByRole("button", { name: /^To: / })).toBeVisible();
    expect(search.getByRole("button", { name: "Date: Any day" })).toBeVisible();
    expect(search.getByRole("button", { name: "Find a ride" })).toBeVisible();
    await fireEvent.press(await search.findByRole("button", { name: /^Borgarnes/ }));
    expect(search.getByRole("button", { name: "From: Borgarnes" })).toBeVisible();
  });

  it("opens the calendar under the date, and closes it once a day is chosen", async () => {
    await openFrontPage();
    const search = await row();
    const date = search.getByRole("button", { name: "Date: Any day" });
    expect(date).toBeCollapsed();
    await fireEvent.press(date);
    expect(search.getByRole("button", { name: "Date: Any day" })).toBeExpanded();
    // Any day is one of the choices, and says that it is the one chosen.
    expect(search.getByRole("radio", { name: "Any day" })).toBeChecked();
    await fireEvent.press(await search.findByRole("radio", { name: "Friday 20 November" }));
    expect(search.getByRole("button", { name: "Date: Fri 20 Nov" })).toBeCollapsed();
    expect(search.queryByRole("radio", { name: "Friday 20 November" })).toBeNull();

    // Any day is one press away, beside the calendar.
    await fireEvent.press(search.getByRole("button", { name: "Date: Fri 20 Nov" }));
    expect(search.getByRole("radio", { name: "Friday 20 November" })).toBeChecked();
    expect(search.getByRole("radio", { name: "Any day" })).not.toBeChecked();
    await fireEvent.press(search.getByRole("radio", { name: "Any day" }));
    expect(search.getByRole("button", { name: "Date: Any day" })).toBeCollapsed();
  });

  it("gives focus back to the date once the calendar closes", async () => {
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    try {
      await openFrontPage();
      const search = await row();
      focusMoves.mockClear();
      await fireEvent.press(search.getByRole("button", { name: "Date: Any day" }));
      // Opening moves nothing: the calendar is the next thing after the date.
      expect(focusMoves).not.toHaveBeenCalled();
      await fireEvent.press(await search.findByRole("radio", { name: "Friday 20 November" }));
      expect(focusMoves).toHaveBeenCalledTimes(1);
      expect(focusMoves).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            accessibilityLabel: expect.stringMatching(/^Date: /) as unknown,
          }) as unknown,
        }),
        "focus",
      );
    } finally {
      focusMoves.mockRestore();
    }
  });

  it("closes the calendar with Android's back, staying on the front page", async () => {
    const listen = jest.spyOn(BackHandler, "addEventListener");
    try {
      await openFrontPage();
      const search = await row();
      await fireEvent.press(search.getByRole("button", { name: "Date: Any day" }));
      expect(await search.findByRole("radio", { name: "Friday 20 November" })).toBeVisible();
      // The listener added last is asked first, as on a phone.
      const [, back] = listen.mock.calls.at(-1) ?? [];
      let handled: boolean | undefined;
      await act(() => {
        handled = back?.({ type: "hardwareBackPress", timeStamp: 0 });
      });
      expect(handled).toBe(true);
      expect(search.queryByRole("radio", { name: "Friday 20 November" })).toBeNull();
      expect(search.getByRole("button", { name: "Date: Any day" })).toBeCollapsed();
    } finally {
      listen.mockRestore();
    }
  });

  it("leaves Android's back alone on a phone, where the calendar is part of the form", async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
    const listen = jest.spyOn(BackHandler, "addEventListener");
    try {
      await openFrontPage();
      await fireEvent.press(await screen.findByRole("radio", { name: "Choose a day" }));
      expect(await screen.findByRole("radio", { name: "Friday 20 November" })).toBeVisible();
      for (const [, back] of listen.mock.calls) {
        expect(back({ type: "hardwareBackPress", timeStamp: 0 })).not.toBe(true);
      }
      expect(screen.getByRole("radio", { name: "Friday 20 November" })).toBeVisible();
    } finally {
      listen.mockRestore();
    }
  });

  it("says under the row what is missing, and searches once it is there", async () => {
    const { client } = await openFrontPage((fake) => {
      searchApi(fake);
    });
    const search = await row();
    await fireEvent.press(search.getByRole("button", { name: "Find a ride" }));
    expect(
      await screen.findByText("Choose where you're leaving from and where you're going."),
    ).toBeVisible();
    await choose("From", "borg", "Borgarnes");
    await choose("To", "blön", "Blönduós");
    await fireEvent.press(search.getByRole("button", { name: "Date: Any day" }));
    await fireEvent.press(await search.findByRole("radio", { name: "Friday 20 November" }));
    await fireEvent.press(search.getByRole("button", { name: "One seat more" }));
    await fireEvent.press(search.getByRole("button", { name: "Find a ride" }));
    expect(
      await screen.findByRole("button", {
        name: "Change search: Borgarnes → Blönduós, Fri 20 Nov, 2 seats",
      }),
    ).toBeVisible();
    expect(searchesOf(client)).toEqual([
      { from: borgarnes.id, to: blonduos.id, date: "2026-11-20", seats: 2, sort: "departure" },
    ]);
  });

  it("keeps the places, the day, the seats and the message when the window turns narrow and wide again", async () => {
    await openFrontPage((fake) => {
      searchApi(fake);
    });
    const missing = "Choose where you're leaving from and where you're going.";
    await fireEvent.press((await row()).getByRole("button", { name: "Find a ride" }));
    expect(await screen.findByText(missing)).toBeVisible();
    await act(() => {
      Dimensions.set({ window: phone });
    });
    expect(screen.getByText(missing)).toBeVisible();
    await act(() => {
      Dimensions.set({ window: laptop });
    });
    expect(screen.getByText(missing)).toBeVisible();

    // The row is a new one each time the window turns wide.
    const search = await row();
    await choose("From", "borg", "Borgarnes");
    await fireEvent.press(search.getByRole("button", { name: "Date: Any day" }));
    await fireEvent.press(await search.findByRole("radio", { name: "Friday 20 November" }));
    await fireEvent.press(search.getByRole("button", { name: "One seat more" }));

    await act(() => {
      Dimensions.set({ window: phone });
    });
    expect(screen.queryByTestId("search-row")).toBeNull();
    expect(screen.getByRole("button", { name: "From: Borgarnes" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Fri 20 Nov" })).toBeChecked();
    expect(screen.getByRole("adjustable", { name: "Seats" })).toHaveAccessibilityValue({
      text: "2 seats",
    });

    await act(() => {
      Dimensions.set({ window: laptop });
    });
    const again = await row();
    expect(again.getByRole("button", { name: "From: Borgarnes" })).toBeVisible();
    expect(again.getByRole("button", { name: "Date: Fri 20 Nov" })).toBeVisible();
    expect(again.getByRole("adjustable", { name: "Seats" })).toHaveAccessibilityValue({
      text: "2 seats",
    });
  });

  it("shows the rides leaving soon in a grid, beside Your next ride and the map", async () => {
    deviceLanguage("en-GB");
    const { client } = await renderApp("/", {
      me: completeMe,
      setUp: (fake) => {
        withRides(soonRides(8))(fake);
        fake.answer("/v1/me/bookings", () => ok(200, { bookings: [northBooking()] }));
        fake.answer("/v1/me/trips", () => ok(200, { trips: [] }));
      },
    });
    expect(await screen.findByRole("header", { name: "Your next ride" })).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();

    // Six fill a grid of two columns; a seventh is asked for, to know of more.
    const main = within(screen.getByTestId("columns-main"));
    expect(main.getByRole("header", { name: "Leaving soon" })).toBeVisible();
    expect(main.getAllByTestId("trip-result")).toHaveLength(6);
    expect(main.getAllByTestId("grid-cell")).toHaveLength(6);
    // The cards of a row are as tall as the tallest, their drivers level.
    for (const one of main.getAllByTestId("card")) expect(one).toHaveStyle({ flexGrow: 1 });
    expect(main.getByRole("button", { name: "See all rides" })).toBeVisible();
    expect(searchesOf(client, "/v1/trips/soonest")).toEqual([{ limit: 7 }]);

    const side = within(screen.getByTestId("columns-side"));
    expect(side.getByRole("header", { name: "Your next ride" })).toBeVisible();
    expect(side.getByRole("button", { name: /^Passenger, Sunday 15 November/ })).toBeVisible();
    expect(map()).toBeVisible();
    expect(side.getByRole("button", { name: "See the meeting points" })).toBeVisible();
    // Each once: the side column takes the place of the page's last part.
    expect(screen.getAllByRole("button", { name: "See the meeting points" })).toHaveLength(1);
    expect(screen.getAllByRole("header", { name: "Your next ride" })).toHaveLength(1);
  });

  it("closes the rides with Offer a ride as a line, not a card beside them", async () => {
    await openFrontPage(withRides(soonRides(2)));
    const main = within(await screen.findByTestId("columns-main"));
    await main.findAllByTestId("trip-result");
    const line = within(main.getByTestId("offer-line"));
    expect(line.getByText("Driving somewhere? Share the empty seats in your car.")).toBeVisible();
    const offer = line.getByRole("button", { name: "Offer a ride" });
    // A text button: no outline, as "See all rides" has none.
    expect(within(offer).getByTestId("button-face")).not.toHaveStyle({
      borderColor: colors.light.control,
    });
    expect(screen.getAllByRole("button", { name: "Offer a ride" })).toHaveLength(1);
    expect(
      within(screen.getByTestId("columns-side")).queryByText(
        "Driving somewhere? Share the empty seats in your car.",
      ),
    ).toBeNull();

    await fireEvent.press(offer);
    expect(await screen.findByText("Sign in or create an account")).toBeVisible();
  });

  it("shows every meeting point and the first ride's road on the map", async () => {
    const { client } = await openFrontPage(withRides([...soonRides(1), airportRide]));
    expect(await screen.findAllByTestId("trip-result")).toHaveLength(2);
    await waitFor(() => {
      expect(drawn("map-dot-muted")).toHaveLength(2);
    });
    // The ride's two ends stand out among the meeting points, on its road.
    expect(map()).toHaveProp("accessibilityLabel", mapOf("BSÍ bus terminal → Hof, Akureyri"));
    expect(drawn("map-dot-chosen")).toHaveLength(2);
    expect(drawn("map-line-part")).toHaveLength(1);
    expect(drawn("map-line-route")).toHaveLength(0);
    expect(drawn("map-touch")).toHaveLength(0);
    expect(card(0)).toHaveStyle(marked);
    expect(card(1)).not.toHaveStyle(marked);
    expect(meetingPointsCalls(client)).toHaveLength(1);
  });

  /** The side column's parts that place the map, from the top. */
  const mapParts = () =>
    within(screen.getByTestId("columns-side"))
      .getAllByTestId(/^(map-level|find-map)$/)
      .map((part) => part.props.testID as string);

  it("starts the map level with the first row of rides, beside their heading's row", async () => {
    let answer: (value: unknown) => void = () => undefined;
    await openFrontPage((fake) => {
      fake.answer(
        "/v1/trips/soonest",
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
    });
    // From the start, so the map does not move when the rides come: a row
    // as high as "Leaving soon", then the map where the cards will start.
    await screen.findByTestId("columns-side");
    expect(mapParts()).toEqual(["map-level", "find-map"]);
    expect(screen.getByTestId("map-level")).toHaveStyle({ minHeight: 44 });
    await act(() => {
      answer(ok(200, { results: soonRides(2) }));
    });
    expect(await screen.findAllByTestId("trip-result")).toHaveLength(2);
    expect(mapParts()).toEqual(["map-level", "find-map"]);
  });

  it("starts the map level with the offer card when no rides leave soon", async () => {
    await openFrontPage(withRides([]));
    await screen.findByRole("button", { name: "Offer a ride" });
    // No heading in the main column, so none of its room beside it.
    expect(mapParts()).toEqual(["find-map"]);
  });

  it("puts the map under Your next ride, whose heading is the row beside Leaving soon", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", {
      me: completeMe,
      setUp: (fake) => {
        withRides(soonRides(2))(fake);
        fake.answer("/v1/me/bookings", () => ok(200, { bookings: [northBooking()] }));
      },
    });
    expect(await screen.findByRole("header", { name: "Your next ride" })).toBeVisible();
    await screen.findAllByTestId("trip-result");
    expect(mapParts()).toEqual(["find-map"]);
  });

  it("keeps the map level with the rides for someone signed in with no ride coming up", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", { me: completeMe, setUp: withRides(soonRides(2)) });
    await screen.findAllByTestId("trip-result");
    await waitFor(() => {
      expect(screen.queryByRole("header", { name: "Your next ride" })).toBeNull();
    });
    expect(mapParts()).toEqual(["map-level", "find-map"]);
  });

  it("shows the ride the pointer or the keyboard comes to, on a map that stays still", async () => {
    await openFrontPage(withRides([...soonRides(1), airportRide]));
    expect(await screen.findAllByTestId("trip-result")).toHaveLength(2);
    await waitFor(() => {
      expect(drawn("map-dot-muted")).toHaveLength(2);
    });
    const whole = view();
    expect(whole.vbWidth).toBeGreaterThan(0);

    await fireEvent(card(1), "focus");
    expect(map()).toHaveProp("accessibilityLabel", mapOf("Keflavík Airport → BSÍ bus terminal"));
    expect(card(1)).toHaveStyle(marked);
    expect(card(0)).not.toHaveStyle(marked);
    expect(drawn("map-line-part")).toHaveLength(1);
    expect(drawn("map-dot-chosen")).toHaveLength(2);
    // The whole of Iceland, whichever ride is shown.
    expect(view()).toEqual(whole);

    await fireEvent(card(0), "hoverIn");
    expect(map()).toHaveProp("accessibilityLabel", mapOf("BSÍ bus terminal → Hof, Akureyri"));
    // The map keeps the ride once the pointer has left its card.
    await fireEvent(card(0), "hoverOut");
    expect(map()).toHaveProp("accessibilityLabel", mapOf("BSÍ bus terminal → Hof, Akureyri"));
    expect(card(0)).toHaveStyle(marked);
    expect(card(1)).not.toHaveStyle(marked);
    expect(view()).toEqual(whole);
  });

  it("shows the ride on the map when the meeting points cannot be loaded", async () => {
    const { client } = await openFrontPage((fake) => {
      soonestApi(fake, soonRides(1));
      fake.answer("/v1/meeting-points", () => failure(0, "network_error"));
    });
    await screen.findByTestId("trip-result");
    // Once the failure is there, not only while the answer is on its way.
    await waitFor(() => {
      expect(meetingPointsCalls(client)).toHaveLength(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(map()).toHaveProp("accessibilityLabel", mapOf("BSÍ bus terminal → Hof, Akureyri"));
    expect(drawn("map-dot-chosen")).toHaveLength(2);
    expect(drawn("map-dot-muted")).toHaveLength(0);
    expect(drawn("map-line-part")).toHaveLength(1);
    // The page says nothing of it: the list has all a ride needs.
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  /** Leaves Find for Profile and comes back, as the top bar does it. */
  const awayAndBack = async () => {
    const bar = within(screen.getByTestId("top-bar"));
    await fireEvent.press(bar.getByRole("tab", { name: "Profile" }));
    expect(await screen.findByRole("header", { name: "Profile" })).toBeVisible();
    await fireEvent.press(bar.getByRole("tab", { name: "Find" }));
    expect(await screen.findByTestId("search-row")).toBeVisible();
  };

  it("asks for the meeting points again when Find comes back into view after they failed", async () => {
    let tries = 0;
    const { client } = await openFrontPage((fake) => {
      soonestApi(fake, soonRides(1));
      fake.answer("/v1/meeting-points", () => {
        tries += 1;
        return tries === 1 ? failure(0, "network_error") : ok(200, { meetingPoints });
      });
    });
    await screen.findByTestId("trip-result");
    await waitFor(() => {
      expect(meetingPointsCalls(client)).toHaveLength(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Not at once, over and over: only when the person comes back.
    expect(meetingPointsCalls(client)).toHaveLength(1);
    expect(drawn("map-dot-muted")).toHaveLength(0);

    await awayAndBack();
    await waitFor(() => {
      expect(drawn("map-dot-muted")).toHaveLength(2);
    });
    expect(meetingPointsCalls(client)).toHaveLength(2);
    // Now that they are there, coming back asks for nothing.
    await awayAndBack();
    expect(meetingPointsCalls(client)).toHaveLength(2);
  });

  it("goes back to the first ride when the one shown is no longer among the rides", async () => {
    let asked = 0;
    await openFrontPage((fake) => {
      fake.answer("/v1/trips/soonest", () => {
        asked += 1;
        const [north] = soonRides(1);
        return ok(200, { results: asked === 1 ? [north, airportRide] : [north] });
      });
      fake.answer("/v1/meeting-points", () => ok(200, { meetingPoints }));
    });
    expect(await screen.findAllByTestId("trip-result")).toHaveLength(2);
    await fireEvent(card(1), "focus");
    expect(map()).toHaveProp("accessibilityLabel", mapOf("Keflavík Airport → BSÍ bus terminal"));

    // A phone asks for five rides and a laptop for six, so the rides load anew.
    await act(() => {
      Dimensions.set({ window: phone });
    });
    await act(() => {
      Dimensions.set({ window: laptop });
    });
    await waitFor(() => {
      expect(screen.getAllByTestId("trip-result")).toHaveLength(1);
    });
    expect(map()).toHaveProp("accessibilityLabel", mapOf("BSÍ bus terminal → Hof, Akureyri"));
    expect(card(0)).toHaveStyle(marked);
  });

  it("shows the offer and the meeting points on the map when the rides cannot be loaded", async () => {
    await openFrontPage(withRides("failure"));
    const main = within(await screen.findByTestId("columns-main"));
    expect(await main.findByRole("button", { name: "Offer a ride" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Leaving soon" })).toBeNull();
    await waitFor(() => {
      expect(map()).toHaveProp("accessibilityLabel", "Map of Iceland with 4 meeting points.");
    });
    expect(drawn("map-line-part")).toHaveLength(0);
  });

  it("has the map there while the rides load, so it does not move when they come", async () => {
    let answer: (value: unknown) => void = () => undefined;
    await openFrontPage((fake) => {
      fake.answer(
        "/v1/trips/soonest",
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
      fake.answer("/v1/meeting-points", () => ok(200, { meetingPoints }));
    });
    await screen.findByTestId("columns-side");
    await waitFor(() => {
      expect(map()).toHaveProp("accessibilityLabel", "Map of Iceland with 4 meeting points.");
    });
    expect(drawn("map-dot-muted")).toHaveLength(4);
    expect(drawn("map-line-part")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Offer a ride" })).toBeNull();
    const main = within(screen.getByTestId("columns-main"));
    expect(main.getByRole("header", { name: "Leaving soon" })).toBeVisible();
    expect(main.getByLabelText("Loading")).toBeVisible();

    await act(() => {
      answer(ok(200, { results: soonRides(2) }));
    });
    expect(await main.findAllByTestId("trip-result")).toHaveLength(2);
    expect(main.queryByLabelText("Loading")).toBeNull();
    expect(map()).toHaveProp("accessibilityLabel", mapOf("BSÍ bus terminal → Hof, Akureyri"));
    expect(main.getByRole("button", { name: "Offer a ride" })).toBeVisible();
  });

  it("shows no See all rides with six rides or fewer, and only the map beside them when signed out", async () => {
    await openFrontPage(withRides(soonRides(6)));
    const main = within(await screen.findByTestId("columns-main"));
    expect(await main.findAllByTestId("trip-result")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: "See all rides" })).toBeNull();
    expect(map()).toBeVisible();
    expect(screen.queryByRole("header", { name: "Your next ride" })).toBeNull();
  });

  it("keeps the map, with the meeting points alone, beside the offer when no rides leave soon", async () => {
    await openFrontPage(withRides([]));
    expect(await screen.findByTestId("search-row")).toBeVisible();
    const main = within(await screen.findByTestId("columns-main"));
    // Then the offer is the most useful thing on the page: a card and a button.
    const offer = await main.findByRole("button", { name: "Offer a ride" });
    expect(within(offer).getByTestId("button-face")).toHaveStyle({
      borderColor: colors.light.control,
    });
    expect(
      within(main.getByTestId("card")).getByText(
        "Driving somewhere? Share the empty seats in your car.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("header", { name: "Leaving soon" })).toBeNull();
    expect(screen.queryByTestId("find-middle")).toBeNull();

    await waitFor(() => {
      expect(map()).toHaveProp("accessibilityLabel", "Map of Iceland with 4 meeting points.");
    });
    expect(drawn("map-dot-muted")).toHaveLength(4);
    expect(drawn("map-dot-chosen")).toHaveLength(0);
    expect(
      within(screen.getByTestId("columns-side")).getByRole("button", {
        name: "See the meeting points",
      }),
    ).toBeVisible();
  });

  it("is a plain map of Iceland with no rides and no meeting points", async () => {
    const { client } = await openFrontPage();
    expect(await screen.findByTestId("columns-side")).toBeVisible();
    await screen.findByRole("button", { name: "Offer a ride" });
    // Once the answer with no meeting points is there.
    await waitFor(() => {
      expect(meetingPointsCalls(client)).toHaveLength(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(map()).toHaveProp("accessibilityLabel", "Map of Iceland");
    expect(drawn("map-dot-muted")).toHaveLength(0);
  });

  it("asks for no meeting points on a phone, which has no map on Find", async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
    const { client } = await openFrontPage(withRides(soonRides(2)));
    expect(await screen.findAllByTestId("trip-result")).toHaveLength(2);
    expect(screen.queryByTestId("iceland-map")).toBeNull();
    expect(meetingPointsCalls(client)).toHaveLength(0);
    // No ride is marked where no map shows one.
    expect(card(0)).not.toHaveStyle(marked);
  });

  it("names every part of the row in Icelandic", async () => {
    deviceLanguage("is-IS");
    await renderApp("/");
    const search = await row();
    expect(search.getByRole("button", { name: "Frá: Veldu bæ eða mótsstað" })).toBeVisible();
    expect(search.getByRole("button", { name: "Til: Veldu bæ eða mótsstað" })).toBeVisible();
    expect(search.getByRole("button", { name: "Dagsetning: Hvaða dag sem er" })).toBeVisible();
    expect(search.getByRole("adjustable", { name: "Sæti" })).toBeVisible();
    expect(search.getByRole("button", { name: "Finna far" })).toBeVisible();
  });

  it("names the map and the offer in Icelandic", async () => {
    deviceLanguage("is-IS");
    await renderApp("/", { setUp: withRides(soonRides(1)) });
    await screen.findByTestId("trip-result");
    expect(map()).toHaveProp(
      "accessibilityLabel",
      "Ferðin á korti af Íslandi: BSÍ umferðarmiðstöð → Hof, Akureyri.",
    );
    expect(screen.getByRole("button", { name: "Bjóða far" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Skoða mótsstaði" })).toBeVisible();
  });

  it("counts the meeting points on the map in Icelandic", async () => {
    deviceLanguage("is-IS");
    await renderApp("/", { setUp: withRides([]) });
    await screen.findByTestId("columns-side");
    await waitFor(() => {
      expect(map()).toHaveProp("accessibilityLabel", "Kort af Íslandi með 4 mótsstöðum.");
    });
  });
});
