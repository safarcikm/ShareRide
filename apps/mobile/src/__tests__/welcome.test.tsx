import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { AccessibilityInfo, BackHandler, Dimensions } from "react-native";
import { getLocales } from "expo-localization";
import type { Booking, DriverReadiness, MyTrip } from "@shareride/contracts";
import { readAppData, writeAppData } from "@/lib/app-data";
import { now } from "@/lib/clock";
import { completeMe, renderApp } from "@/testing/app";
import {
  bookingApi,
  driverApi,
  northBooking,
  northMyTrip,
  northSegments,
  requestToDrive,
  unpaidBooking,
} from "@/testing/bookings";
import { filledButtons } from "@/testing/buttons";
import { onTheDay } from "@/testing/trip-day";
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
import { blonduos, borgarnes, tripsApi } from "@/testing/trips";
import { bsi, hof, kef, meetingPoints } from "@/testing/meeting-points";
import {
  colors,
  icelandScene,
  pageMaxWidth,
  radii,
  sizes,
  spacing,
  typography,
} from "@/theme/tokens";

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
// Saturday 14 November 2026, noon in Iceland; a test may move the clock on.
jest.mock("@/lib/clock", () => ({ now: jest.fn(() => new Date("2026-11-14T12:00:00Z")) }));

const mockedGetLocales = getLocales as jest.Mock;
const mockedNow = now as jest.Mock<Date, []>;
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
    expect(await screen.findByText("Share your ride")).toBeVisible();
  });

  it("opens in Icelandic on an Icelandic device", async () => {
    deviceLanguage("is-IS");
    await renderApp("/");
    expect(await screen.findByText("Verum samferða")).toBeVisible();
  });

  it("opens in English on a device in another language", async () => {
    deviceLanguage("pl-PL");
    await renderApp("/");
    expect(await screen.findByText("Share your ride")).toBeVisible();
  });

  it("switches to Icelandic and back with the language button", async () => {
    deviceLanguage("en-GB");
    await renderApp("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Change the language to Icelandic" }),
    );
    expect(await screen.findByText("Verum samferða")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Skipta yfir í ensku" }));
    expect(await screen.findByText("Share your ride")).toBeVisible();
  });

  it("labels the title as a heading for screen readers", async () => {
    deviceLanguage("en-GB");
    await renderApp("/");
    expect(await screen.findByRole("header", { name: "Share your ride" })).toBeVisible();
  });

  it("says under the title what PuffinRide is, for someone new", async () => {
    deviceLanguage("en-GB");
    await renderApp("/");
    expect(
      await screen.findByText(
        "Carpool across Iceland: find a seat in someone else's car, or offer the empty seats in yours.",
      ),
    ).toBeVisible();
  });

  it("says what PuffinRide is in Icelandic too", async () => {
    deviceLanguage("is-IS");
    await renderApp("/");
    expect(
      await screen.findByText(
        "Samakstur um allt Ísland: finndu far með öðrum eða bjóddu laus sæti í bílnum þínum.",
      ),
    ).toBeVisible();
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
    await screen.findByText("Share your ride");
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
    expect(screen.getByRole("header", { name: "Share your ride" })).toBeVisible();
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
    expect(screen.getByRole("header", { name: "Share your ride" })).toBeVisible();
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
    expect(await screen.findByRole("header", { name: "Share your ride" })).toBeVisible();
    expect(screen.getByTestId("logo", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("PuffinRide")).toBeVisible();
    const find = screen.getByRole("button", { name: "Find a ride" });
    expect(within(find).getByTestId("button-face")).toHaveStyle({
      backgroundColor: colors.light.primary,
    });
    // Signing in is in the menu, under My rides, Offer and Profile.
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("draws two puffins in a little car over the title, which screen readers skip (spec 15, 5.3)", async () => {
    await openFrontPage();
    await screen.findByRole("header", { name: "Share your ride" });
    expect(screen.getByTestId("puffins-in-car", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("puffins-in-car")).toBeNull();
  });

  it("puts the name, the language and the car on an Iceland scene, the title under it (spec 15, 5.3)", async () => {
    await openFrontPage();
    await screen.findByRole("header", { name: "Share your ride" });
    // Behind the top of the page: a picture, which takes no presses.
    const backdrop = screen.getByTestId("screen-backdrop", { includeHiddenElements: true });
    expect(backdrop).toHaveProp("pointerEvents", "none");
    const scene = within(backdrop).getByTestId("iceland-scene", { includeHiddenElements: true });
    expect(screen.queryByTestId("iceland-scene")).toBeNull();
    // On it the name, the language switch and the car; the title on the screen under it.
    const top = screen.getByTestId("scene-top");
    expect(within(top).getByText("PuffinRide")).toBeVisible();
    expect(within(top).getByText("Íslenska")).toBeVisible();
    expect(within(top).getByTestId("puffins-in-car", { includeHiddenElements: true })).toBeTruthy();
    expect(within(top).queryByRole("header", { name: "Share your ride" })).toBeNull();
    // From the top of the screen to just under the car, its wheels on the road.
    await fireEvent(top, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 343, height: 180 } },
    });
    expect(scene).toHaveStyle({ height: spacing.md + 180 + spacing.sm });
    // Behind the status bar, over the notch, the sky goes on.
    expect(screen.getByTestId("screen-safe-area")).toHaveStyle({
      backgroundColor: icelandScene.light.sky,
    });
    expect(screen.getByTestId("screen-scroll-area")).toHaveStyle({
      backgroundColor: colors.light.background,
    });
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
    expect(screen.getByRole("link", { name: "See the meeting points" })).toBeVisible();
  });

  it("has the same search and offer for someone signed in, under a greeting", async () => {
    await renderApp("/", { me: completeMe });
    expect(await screen.findByRole("header", { name: "Hi Anna" })).toBeVisible();
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

  /** The card with From and To, which holds the rest of the search on a phone. */
  const searchCard = async () => {
    await screen.findByRole("button", { name: /^From: / });
    const card = screen
      .getAllByTestId("card")
      .find((found) => within(found).queryByRole("button", { name: /^From: / }) !== null);
    if (card === undefined) throw new Error("No card with From");
    return within(card);
  };

  it("puts the whole search in one card, with the date and the seats on one line", async () => {
    await openFrontPage();
    const card = await searchCard();
    expect(card.getByRole("button", { name: "To: Choose a town or meeting point" })).toBeVisible();
    // The main button, as wide as the card.
    expect(card.getByRole("button", { name: "Find a ride" })).toHaveStyle({
      alignSelf: "stretch",
      minHeight: 56,
    });
    expect(screen.getAllByRole("button", { name: "Find a ride" })).toHaveLength(1);
    // Side by side, and onto two lines only where the text is too large.
    const line = card.getByTestId("search-when");
    expect(line).toHaveStyle({ flexDirection: "row", flexWrap: "wrap" });
    expect(within(line).getByRole("button", { name: "Date: Any day" })).toBeVisible();
    expect(within(line).getByRole("adjustable", { name: "Seats" })).toBeVisible();
    // The seats keep their value close between the buttons, for the date's room.
    expect(within(line).getByTestId("stepper-buttons")).toHaveStyle({ gap: 4 });
    // The date needs room for "Allir dagar" and its chevron at the text size
    // used: twice as large here, so it takes a line of its own.
    expect(within(line).getByTestId("search-when-date")).toHaveStyle({ flexBasis: 136 * 2 });
    // The day is chosen from the date, not from chips over a calendar.
    expect(screen.queryByRole("radio", { name: "Choose a day" })).toBeNull();
  });

  it("gives the calendar in the card some of the card's padding, so its days keep their size", async () => {
    await openFrontPage();
    const card = await searchCard();
    await fireEvent.press(card.getByRole("button", { name: "Date: Any day" }));
    expect(card.getByTestId("search-calendar")).toHaveStyle({ marginHorizontal: -spacing.sm });
  });

  it("leaves Android's back to the screen on top while the calendar is open on Find", async () => {
    const listen = jest.spyOn(BackHandler, "addEventListener");
    try {
      await openFrontPage();
      await fireEvent.press(await screen.findByRole("button", { name: "Date: Any day" }));
      expect(await screen.findByRole("radio", { name: "Friday 20 November" })).toBeVisible();
      // The listener added last is the calendar's.
      const [, back] = listen.mock.calls.at(-1) ?? [];
      await fireEvent.press(screen.getByRole("tab", { name: "My rides" }));
      expect(
        await screen.findByRole("header", { name: "Sign in to see your rides" }),
      ).toBeVisible();
      let handled: boolean | undefined;
      await act(() => {
        handled = back?.({ type: "hardwareBackPress", timeStamp: 0 });
      });
      expect(handled).toBe(false);
      // Back on Find, the calendar is still open.
      await fireEvent.press(screen.getByRole("tab", { name: "Find" }));
      expect(await screen.findByRole("radio", { name: "Friday 20 November" })).toBeVisible();
    } finally {
      listen.mockRestore();
    }
  });

  it("opens the calendar in the card under the date, and searches the day chosen", async () => {
    const { client } = await openFrontPage((fake) => {
      searchApi(fake);
    });
    await choose("From", "borg", "Borgarnes");
    await choose("To", "blön", "Blönduós");
    const card = await searchCard();
    await fireEvent.press(card.getByRole("button", { name: "Date: Any day" }));
    expect(card.getByRole("button", { name: "Date: Any day" })).toBeExpanded();
    expect(card.getByRole("radio", { name: "Any day" })).toBeChecked();
    await fireEvent.press(await card.findByRole("radio", { name: "Friday 20 November" }));
    expect(card.getByRole("button", { name: "Date: Fri 20 Nov" })).toBeCollapsed();
    expect(card.queryByRole("radio", { name: "Friday 20 November" })).toBeNull();
    await fireEvent.press(card.getByRole("button", { name: "Find a ride" }));
    expect(
      await screen.findByRole("button", {
        name: "Change search: Borgarnes → Blönduós, Fri 20 Nov, 1 seat",
      }),
    ).toBeVisible();
    expect(searchesOf(client)).toEqual([
      { from: borgarnes.id, to: blonduos.id, date: "2026-11-20", seats: 1, sort: "departure" },
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

describe("Find, signed in (spec 31, 3.5)", () => {
  /** Answers the rides coming up: my bookings and the rides I drive. */
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
  /** Anna drives on Sunday at 09:00, nobody asking. */
  const quietDrive: MyTrip = {
    ...northMyTrip,
    segments: northSegments([1, 1, 1]),
    takings: { amount: 0, currency: "ISK" },
    openRequests: 0,
    requestsCloseAt: null,
    firstRequest: null,
    toRate: null,
  };
  /** The parts of Find in the order they stand: the card, the search, my ride, the rides. */
  const parts = () =>
    screen
      .getAllByTestId(/^(needs-you-card|search-when|my-ride|trip-result)$/)
      .map((part) => String(part.props.testID));

  it("greets me by name at the left, with my next ride as a ticket over the search", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        soonestApi(client, soonRides(1));
        comingUp(client, [northBooking(), later]);
        bookingApi(client, () => northBooking());
      },
    });
    // At the left, as the search card under it is.
    expect(await screen.findByRole("header", { name: "Hi Anna" })).not.toHaveStyle({
      textAlign: "center",
    });
    // The greeting is the title: what PuffinRide is, is for someone new.
    expect(screen.queryByRole("header", { name: "Share your ride" })).toBeNull();
    expect(screen.queryByText(/^Carpool across Iceland/)).toBeNull();
    expect(await screen.findByRole("header", { name: "Your next ride" })).toBeVisible();
    const ride = screen.getByRole("button", {
      name: "Passenger, Sunday 15 November, Leaves Borgarnes at 10:00, arrives at Blönduós at 12:05, 2 h 5 min, 1 seat, 2,900 ISK, Anna, Waiting for Anna's answer",
    });
    expect(screen.queryByRole("button", { name: /^Passenger, Monday/ })).toBeNull();
    await screen.findByTestId("trip-result");
    expect(parts()).toEqual(["my-ride", "search-when", "trip-result"]);
    // Nothing needs me: no yellow card, and the search has the one main button.
    expect(screen.queryByTestId("needs-you-card")).toBeNull();
    expect(filledButtons()).toBe(1);
    await fireEvent.press(ride);
    expect(await screen.findByText("Anna has until 22:00 to answer.")).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${northBooking().id}`);
  });

  it("puts a seat to pay for first, in the yellow card, whose button opens it", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        comingUp(client, [unpaidBooking]);
        bookingApi(client, () => unpaidBooking);
      },
    });
    const card = within(await screen.findByTestId("needs-you-card"));
    expect(card.getByText("Pay to keep your seat")).toBeVisible();
    expect(card.getByText("Borgarnes to Blönduós, Sun 15 Nov. Pay by 12:30.")).toBeVisible();
    // The card is about my next ride, which is not shown a second time.
    expect(parts()).toEqual(["needs-you-card", "search-when"]);
    expect(screen.queryByRole("header", { name: "Your next ride" })).toBeNull();
    // One filled button outside the card (R31.1): Find a ride.
    expect(filledButtons()).toBe(1);
    await fireEvent.press(card.getByRole("link", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByRole("header", { name: "Pay to keep your seat" })).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${unpaidBooking.id}`);
  });

  it("names who asks for a seat on a ride I drive, and opens the ride to answer", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        comingUp(client, [], [northMyTrip]);
        tripsApi(client, [northMyTrip]);
        driverApi(client, [requestToDrive]);
      },
    });
    const card = within(await screen.findByTestId("needs-you-card"));
    expect(card.getByText("Gunna asks for 1 seat")).toBeVisible();
    expect(card.getByText("Borgarnes to Blönduós, Sun 15 Nov. 10 h left to answer.")).toBeVisible();
    await fireEvent.press(card.getByRole("link", { name: "See the request" }));
    expect(await screen.findByText("“One small bag.”")).toBeVisible();
    expect(screen).toHavePathname(`/drive/trips/${northMyTrip.id}`);
  });

  it("says when a ride on its trip day leaves", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        comingUp(client, [onTheDay()]);
      },
    });
    const card = within(await screen.findByTestId("needs-you-card"));
    expect(card.getByText("Leaves at 10:00")).toBeVisible();
    expect(card.getByText("Borgarnes to Blönduós, Sun 15 Nov.")).toBeVisible();
    expect(card.getByRole("link", { name: "See your ride" })).toBeVisible();
  });

  it("keeps counting while Find stays open, and drops a need whose deadline passes", async () => {
    jest.useFakeTimers();
    try {
      deviceLanguage("en-GB");
      await renderApp("/", {
        me: completeMe,
        setUp: (client) => {
          comingUp(client, [], [northMyTrip]);
        },
      });
      const card = within(await screen.findByTestId("needs-you-card"));
      const left = (time: string) => `Borgarnes to Blönduós, Sun 15 Nov. ${time} left to answer.`;
      expect(card.getByText(left("10 h"))).toBeVisible();
      // An hour and a half on, nothing pressed: the card says what is left now.
      mockedNow.mockReturnValue(new Date("2026-11-14T13:30:00Z"));
      await act(() => jest.advanceTimersByTimeAsync(30_000));
      expect(card.getByText(left("8 h 30 min"))).toBeVisible();
      // The request closes at 22:00: after that it is not mine to answer.
      mockedNow.mockReturnValue(new Date("2026-11-14T22:00:20Z"));
      await act(() => jest.advanceTimersByTimeAsync(30_000));
      expect(screen.queryByTestId("needs-you-card")).toBeNull();
    } finally {
      mockedNow.mockImplementation(() => new Date("2026-11-14T12:00:00Z"));
      jest.useRealTimers();
    }
  });

  it("shows Your next ride under the search when the card is about another ride", async () => {
    deviceLanguage("en-GB");
    // Gunna got in at 11:00 today and is out at 13:00; it is noon. The
    // request is on tomorrow's ride.
    const underWay = northBooking({
      id: "0190a1d6-0000-7000-8000-0000000000c3",
      status: "confirmed",
      board: { ...northBooking().board, plannedAt: "2026-11-14T11:00:00.000Z" },
      alight: { ...northBooking().alight, plannedAt: "2026-11-14T13:00:00.000Z" },
    });
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        soonestApi(client, soonRides(1));
        comingUp(client, [later, underWay], [northMyTrip]);
      },
    });
    expect(await screen.findByText("Gunna asks for 1 seat")).toBeVisible();
    expect(screen.getByRole("header", { name: "Your next ride" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^Passenger, Saturday 14 November, .*Seat confirmed$/ }),
    ).toBeVisible();
    await screen.findByTestId("trip-result");
    expect(parts()).toEqual(["needs-you-card", "search-when", "my-ride", "trip-result"]);
    expect(screen.queryByText(/^and \d+ more$/)).toBeNull();
  });

  it("shows the soonest need, and says how many more there are in My rides", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        // To pay by 12:30 today; to answer by 22:00 today.
        comingUp(client, [unpaidBooking], [northMyTrip]);
      },
    });
    const card = within(await screen.findByTestId("needs-you-card"));
    expect(card.getByText("Pay to keep your seat")).toBeVisible();
    expect(screen.queryByText("Gunna asks for 1 seat")).toBeNull();
    expect(screen.getAllByTestId("needs-you-card")).toHaveLength(1);
    // The ride that leaves first is the one I drive, which the card is not about.
    expect(screen.getByRole("button", { name: /^You drive, Sunday 15 November/ })).toBeVisible();
    await fireEvent.press(screen.getByRole("link", { name: "and 1 more: open My rides" }));
    expect(await screen.findByRole("header", { name: "Needs you" })).toBeVisible();
    expect(screen).toHavePathname("/my-rides");
  });

  it("shows a ride I drive as my next ride, with the seats taken", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        comingUp(client, [later], [quietDrive]);
      },
    });
    expect(
      await screen.findByRole("button", {
        name: "You drive, Sunday 15 November, Leaves BSÍ bus terminal at 09:00, arrives at Hof, Akureyri at 14:00, 5 h, 2 stops, 1 of 3 seats taken",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Passenger, Monday/ })).toBeNull();
  });

  it("is the page of someone new when signed out, asking for no rides of mine", async () => {
    const { client } = await openFrontPage();
    expect(await screen.findByRole("header", { name: "Share your ride" })).toHaveStyle({
      textAlign: "center",
    });
    expect(screen.queryByRole("header", { name: /^Hi / })).toBeNull();
    expect(screen.queryByRole("header", { name: "Your next ride" })).toBeNull();
    expect(client.calls.map((call) => call.path)).not.toContain("/v1/me/bookings");
  });

  it("keeps the title of someone new until the account has a first name", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", { me: { ...completeMe, firstName: null } });
    expect(await screen.findByRole("header", { name: "Share your ride" })).toBeVisible();
    expect(screen.queryByRole("header", { name: /^Hi/ })).toBeNull();
  });

  it("greets me with nothing under it when nothing is coming up", async () => {
    deviceLanguage("en-GB");
    const { client } = await renderApp("/", {
      me: completeMe,
      setUp: (fake) => {
        comingUp(fake, []);
      },
    });
    expect(await screen.findByRole("header", { name: "Hi Anna" })).toBeVisible();
    await waitFor(() => {
      expect(client.calls.map((call) => call.path)).toContain("/v1/me/trips");
    });
    expect(screen.queryByRole("header", { name: "Your next ride" })).toBeNull();
    expect(screen.queryByTestId("needs-you-card")).toBeNull();
    expect(screen.queryByTestId("my-ride")).toBeNull();
  });

  it("greets in Icelandic", async () => {
    deviceLanguage("is-IS");
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        comingUp(client, [], [northMyTrip]);
      },
    });
    expect(await screen.findByRole("header", { name: "Hæ Anna" })).toBeVisible();
    expect(await screen.findByText("Gunna biður um 1 sæti")).toBeVisible();
    expect(screen.getByRole("link", { name: "Sjá beiðnina" })).toBeVisible();
  });

  it("says when my rides could not be loaded, with a retry", async () => {
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
  const mapOf = (route: string) => `The ride on a map of Iceland: ${route}.`;
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

  it("draws the puffins' car on the title's line on a wide page, so the page under it stays put (spec 15, 5.3)", async () => {
    await openFrontPage();
    await screen.findByRole("header", { name: "Share your ride" });
    const line = screen.getByTestId("title-line");
    const car = within(line).getByTestId("puffins-in-car", { includeHiddenElements: true });
    expect(within(car).getByTestId("puffin-driver", { includeHiddenElements: true })).toBeTruthy();
    // Beside the title, not over it: the map beside the rides stays whole.
    expect(line).toHaveStyle({ flexDirection: "row" });
  });

  it("draws the Iceland scene in a rounded panel as wide as the page, under the title's line and the search's top (spec 15, 5.3)", async () => {
    await openFrontPage();
    await screen.findByRole("header", { name: "Share your ride" });
    const backdrop = screen.getByTestId("screen-backdrop", { includeHiddenElements: true });
    const panel = within(backdrop).getByTestId("scene-panel", { includeHiddenElements: true });
    // The panel stands in the page: no sky behind the window's edges.
    expect(screen.getByTestId("screen-safe-area")).toHaveStyle({
      backgroundColor: colors.light.background,
    });
    expect(panel).toHaveStyle({
      maxWidth: pageMaxWidth,
      borderRadius: radii.card,
      overflow: "hidden",
    });
    // The line is taller than the title alone, so the mountains show; the
    // panel goes on under the top half of the search row's card.
    const line = screen.getByTestId("title-line");
    expect(line).toHaveStyle({ minHeight: sizes.sceneLine });
    const searchTop =
      spacing.md + (typography.caption.lineHeight + spacing.xs + sizes.buttonHeight) / 2;
    expect(panel).toHaveStyle({ height: sizes.sceneLine + spacing.md + searchTop });
    await fireEvent(line, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 1144, height: 120 } },
    });
    expect(panel).toHaveStyle({ height: 120 + spacing.md + searchTop });
    // The car drives on the hills at the right of the line, larger than on a
    // phone; the title stands at the left, kept clear of it (spec 31, 3.16).
    const hills = within(line).getByTestId("car-on-hills", { includeHiddenElements: true });
    expect(hills).toHaveStyle({ position: "absolute", right: spacing.xxl * 2 });
    expect(line).toHaveStyle({
      paddingLeft: spacing.xl,
      paddingRight: spacing.xxl * 2 + sizes.sceneCarWide + spacing.lg,
    });
    expect(screen.getByRole("header", { name: "Share your ride" })).toHaveStyle(typography.display);
    expect(
      within(hills).getByTestId("puffins-in-car", { includeHiddenElements: true }),
    ).toBeTruthy();
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

  it("keeps a phone's From and To as a list, with only the date as a field", async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
    await openFrontPage();
    expect(
      await screen.findByRole("button", { name: "From: Choose a town or meeting point" }),
    ).toBeVisible();
    // One field: getBy finds no more than one.
    expect(within(screen.getByTestId("search-field")).getByText("Any day")).toBeVisible();
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

  it("closes the calendar with Android's back on a phone too, where it opens under the date", async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
    const listen = jest.spyOn(BackHandler, "addEventListener");
    try {
      await openFrontPage();
      await fireEvent.press(await screen.findByRole("button", { name: "Date: Any day" }));
      expect(await screen.findByRole("radio", { name: "Friday 20 November" })).toBeVisible();
      const [, back] = listen.mock.calls.at(-1) ?? [];
      let handled: boolean | undefined;
      await act(() => {
        handled = back?.({ type: "hardwareBackPress", timeStamp: 0 });
      });
      expect(handled).toBe(true);
      expect(screen.queryByRole("radio", { name: "Friday 20 November" })).toBeNull();
      expect(screen.getByRole("button", { name: "Date: Any day" })).toBeCollapsed();
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
    expect(screen.getByRole("button", { name: "Date: Fri 20 Nov" })).toBeVisible();
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
    expect(side.getByRole("link", { name: "See the meeting points" })).toBeVisible();
    // Each once: the side column takes the place of the page's last part.
    expect(screen.getAllByRole("link", { name: "See the meeting points" })).toHaveLength(1);
    expect(screen.getAllByRole("header", { name: "Your next ride" })).toHaveLength(1);
  });

  it("says how it works beside the rides for someone new, with the offer under it (spec 31, 3.16)", async () => {
    await openFrontPage(withRides(soonRides(2)));
    const main = within(await screen.findByTestId("columns-main"));
    await main.findAllByTestId("trip-result");
    const how = within(within(screen.getByTestId("columns-side")).getByTestId("how-it-works"));
    expect(how.getByRole("header", { name: "How it works" })).toBeVisible();
    // Three steps, each a number, a name and a line.
    expect(how.getByText("1")).toBeVisible();
    expect(how.getByText("Find a ride")).toBeVisible();
    expect(how.getByText("Choose where from, where to and the day.")).toBeVisible();
    expect(how.getByText("2")).toBeVisible();
    expect(how.getByText("Book a seat")).toBeVisible();
    expect(how.getByText("At once, or the driver says yes first.")).toBeVisible();
    expect(how.getByText("3")).toBeVisible();
    expect(how.getByText("Meet and go")).toBeVisible();
    expect(how.getByText("Get in at a meeting point, at the time the ride shows.")).toBeVisible();
    // The offer is here, once: no line under the rides says it again.
    expect(how.getByText("Driving somewhere?")).toBeVisible();
    expect(how.getByText("Offer the empty seats in your car.")).toBeVisible();
    const offer = how.getByRole("button", { name: "Offer a ride" });
    expect(within(offer).getByTestId("button-face")).toHaveStyle({
      borderColor: colors.light.control,
    });
    expect(screen.getAllByRole("button", { name: "Offer a ride" })).toHaveLength(1);
    expect(main.queryByTestId("offer-line")).toBeNull();
    // The search has the page's one main button (R31.1).
    expect(filledButtons()).toBe(1);

    await fireEvent.press(offer);
    expect(await screen.findByText("Sign in or create an account")).toBeVisible();
  });

  it("closes the rides with Offer a ride as a line for someone signed in, not a card beside them", async () => {
    deviceLanguage("en-GB");
    await renderApp("/", { me: completeMe, setUp: withRides(soonRides(2)) });
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
    // How it works is for someone new.
    expect(screen.queryByTestId("how-it-works")).toBeNull();
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
      .getAllByTestId(/^(how-it-works|map-level|find-map)$/)
      .map((part) => part.props.testID as string);

  it("has How it works over the map from the start, its heading's row beside Leaving soon", async () => {
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
    // From the start, so the map does not move when the rides come: the
    // heading in a row as high as "Leaving soon", so the card under it
    // starts where the tickets will.
    const side = within(await screen.findByTestId("columns-side"));
    expect(mapParts()).toEqual(["how-it-works", "find-map"]);
    const heading = side.getByRole("header", { name: "How it works" });
    expect(heading.parent).toHaveStyle({ minHeight: 44 });
    await act(() => {
      answer(ok(200, { results: soonRides(2) }));
    });
    expect(await screen.findAllByTestId("trip-result")).toHaveLength(2);
    expect(mapParts()).toEqual(["how-it-works", "find-map"]);
    // Two rides have no "See all rides": the heading still stands in the
    // middle of its row, level with the one beside it.
    const soon = within(screen.getByTestId("columns-main")).getByRole("header", {
      name: "Leaving soon",
    });
    expect(soon.parent).toHaveStyle({ minHeight: 44, alignContent: "center" });
  });

  it("says the offer once when no rides leave soon: in the card where they would be", async () => {
    await openFrontPage(withRides([]));
    const main = within(await screen.findByTestId("columns-main"));
    expect(await main.findByRole("button", { name: "Offer a ride" })).toBeVisible();
    expect(mapParts()).toEqual(["how-it-works", "find-map"]);
    // How it works keeps its three steps, and leaves the offer to the card.
    const how = within(screen.getByTestId("how-it-works"));
    expect(how.getByText("Meet and go")).toBeVisible();
    expect(how.queryByText("Driving somewhere?")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Offer a ride" })).toHaveLength(1);
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
    // The offer is beside the rides, in How it works, from the start.
    const side = within(screen.getByTestId("columns-side"));
    expect(side.getByRole("button", { name: "Offer a ride" })).toBeVisible();
    const main = within(screen.getByTestId("columns-main"));
    expect(main.queryByRole("button", { name: "Offer a ride" })).toBeNull();
    expect(main.getByRole("header", { name: "Leaving soon" })).toBeVisible();
    expect(main.getByLabelText("Loading")).toBeVisible();

    await act(() => {
      answer(ok(200, { results: soonRides(2) }));
    });
    expect(await main.findAllByTestId("trip-result")).toHaveLength(2);
    expect(main.queryByLabelText("Loading")).toBeNull();
    expect(map()).toHaveProp("accessibilityLabel", mapOf("BSÍ bus terminal → Hof, Akureyri"));
    expect(screen.getAllByRole("button", { name: "Offer a ride" })).toHaveLength(1);
  });

  it("shows no See all rides with six rides or fewer, and nothing of mine beside them when signed out", async () => {
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
      within(screen.getByTestId("columns-side")).getByRole("link", {
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
    expect(search.getByRole("button", { name: "Dagsetning: Allir dagar" })).toBeVisible();
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
    expect(screen.getByRole("link", { name: "Skoða mótsstaði" })).toBeVisible();
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
