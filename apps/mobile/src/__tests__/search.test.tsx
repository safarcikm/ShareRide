import { getLocales } from "expo-localization";
import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { AccessibilityInfo, Dimensions } from "react-native";
import type * as Days from "@/lib/days";
import { showsOtherTime } from "@/lib/days";
import { readAppData, writeAppData } from "@/lib/app-data";
import { writePreference } from "@/lib/preferences";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { filledButtons } from "@/testing/buttons";
import { failure, ok } from "@/testing/fake-client";
import { bsi, hof, thorlakshofn } from "@/testing/meeting-points";
import { northResult, resultOn, searchApi, searchesOf, type SearchAnswers } from "@/testing/search";
import { blonduos, borgarnes, tripsApi } from "@/testing/trips";
import { cardFace } from "@/testing/lift";
import { colors, typography } from "@/theme/tokens";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Recent searches live in the app's own storage, which goes with the app.
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn(() => Promise.resolve(null)),
  writeAppData: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));
// The device's time zone, which one test changes.
jest.mock("@/lib/days", () => ({
  ...jest.requireActual<typeof Days>("@/lib/days"),
  showsOtherTime: jest.fn(() => false),
}));

const mockedRead = readAppData as jest.Mock;
const mockedWrite = writeAppData as jest.Mock;
const mockedShowsOtherTime = showsOtherTime as jest.Mock;
const mockedGetLocales = getLocales as jest.Mock;

beforeEach(() => {
  mockedRead.mockImplementation(() => Promise.resolve(null));
  mockedWrite.mockClear();
  mockedGetLocales.mockReturnValue([{ languageTag: "en-GB" }]);
});

/** A second ride, on the Monday after `northResult`'s Sunday. */
const mondayRide = resultOn("2026-11-16", { tripId: "0190a1d6-0000-7000-8000-0000000611b6" });

const resultsUrl = (extra = "") =>
  `/search/results?from=${borgarnes.id}&to=${blonduos.id}&fromName=Borgarnes&toName=Bl%C3%B6ndu%C3%B3s&seats=1${extra}`;

async function openResults(extra = "", answers: SearchAnswers = {}) {
  return renderApp(resultsUrl(extra), {
    setUp: (client) => {
      searchApi(client, answers);
    },
  });
}

/** Chooses the order with the one Sort chip (spec 16, 3.8). */
async function sortBy(name: "Earliest" | "Cheapest") {
  await fireEvent.press(screen.getByRole("button", { name: /^Sort: / }));
  await fireEvent.press(screen.getByRole("radio", { name }));
}

/** Opens the filters under the one Filters chip (spec 31, 3.6 item 2). */
async function openFilters() {
  await fireEvent.press(screen.getByRole("button", { name: /^Filters/ }));
}

/** The one row over the rides: the order, Filters and how many rides there are. */
const resultsRow = () => within(screen.getByTestId("results-row"));

/** The results header, one button that opens the search form in place (spec 16, 3.8). */
const changeSearch = (route: string, summary: string) =>
  screen.findByRole("button", { name: `Change search: ${route}, ${summary}` });

/** Chooses a place in the list that drops down under From or To. */
async function choose(field: "From" | "To", typed: string, name: string) {
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${field}: `) }));
  await fireEvent.changeText(await screen.findByLabelText(field), typed);
  await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^${name}`) }));
}

describe("Searching for a ride (spec 4)", () => {
  it("finds Reykjavík to Akureyri for Borgarnes to Blönduós, without an account", async () => {
    const { client } = await renderApp("/search", {
      setUp: (fake) => {
        searchApi(fake);
      },
    });
    // The title at the left beside Back, and the front page's search card
    // with its one button in it: no bar at the bottom (spec 31, 3.5 item 3).
    const head = within(await screen.findByTestId("screen-head"));
    expect(head.getByRole("header", { name: "Find a ride" })).not.toHaveStyle({
      textAlign: "center",
    });
    expect(head.getByRole("button", { name: "Back" })).toBeVisible();
    const form = screen
      .getAllByTestId("card")
      .find((found) => within(found).queryByRole("button", { name: /^From: / }) !== null);
    if (form === undefined) throw new Error("No card with From");
    expect(within(form).getByRole("button", { name: "Find a ride" })).toBeVisible();
    expect(within(form).getByTestId("search-when")).toBeVisible();
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
    expect(filledButtons()).toBe(1);
    await fireEvent.press(screen.getByRole("button", { name: "Find a ride" }));
    expect(
      await screen.findByText("Choose where you're leaving from and where you're going."),
    ).toBeVisible();

    await choose("From", "borg", "Borgarnes");
    await choose("To", "blön", "Blönduós");
    expect(screen.getByRole("button", { name: "From: Borgarnes" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    await fireEvent.press(screen.getByRole("button", { name: "Find a ride" }));

    expect(await changeSearch("Borgarnes → Blönduós", "Any day, 2 seats")).toBeVisible();
    expect(screen.getByText("Any day, 2 seats")).toBeVisible();
    expect(searchesOf(client)).toEqual([
      { from: borgarnes.id, to: blonduos.id, seats: 2, sort: "departure" },
    ]);
    // The card opens the trip, and says everything on it in one line.
    const card = await screen.findByRole("button", {
      name:
        "Leaves Borgarnes at 10:00, arrives at Blönduós at 12:05, 2 h 5 min, 2,900 ISK per seat, " +
        "5,800 ISK for 2 seats, Anna drives BSÍ bus terminal → Hof, Akureyri, Driver approves, " +
        "Anna, New driver, 3 seats left",
    });
    expect(within(card).getByText("2,900 ISK")).toBeVisible();
    expect(within(card).getByText("Anna drives BSÍ bus terminal → Hof, Akureyri")).toBeVisible();
    expect(screen.getByRole("header", { name: "Sunday 15 November" })).toBeVisible();
    expect(resultsRow().getByText("1 ride")).toBeVisible();
    expect(screen.getByText("That's every ride found")).toBeVisible();

    // The search is kept on this device, with its names, in the app's own
    // storage rather than the secure storage, which iOS can keep after the
    // app is deleted.
    const [key, value] = (mockedWrite.mock.calls as [string, string][]).at(-1) ?? [];
    expect(key).toBe("recentSearches");
    expect(writePreference).not.toHaveBeenCalledWith("recentSearches", expect.anything());
    expect(JSON.parse(value ?? "null")).toEqual([
      {
        from: { id: borgarnes.id, name: borgarnes.name },
        to: { id: blonduos.id, name: blonduos.name },
        date: null,
        seats: 2,
      },
    ]);
  });

  it("searches a town and a day, and swaps from and to", async () => {
    const { client } = await renderApp("/search", {
      setUp: (fake) => {
        searchApi(fake);
      },
    });
    await choose("From", "borg", "Borgarnes");
    await choose("To", "þorl", "Þorlákshöfn");
    await fireEvent.press(screen.getByRole("button", { name: "Swap from and to" }));
    expect(screen.getByRole("button", { name: "From: Þorlákshöfn" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Date: Any day" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Friday 20 November" }));
    expect(screen.getByRole("button", { name: "Date: Fri 20 Nov" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Find a ride" }));
    expect(await screen.findByText("Fri 20 Nov, 1 seat")).toBeVisible();
    expect(searchesOf(client)).toEqual([
      { from: thorlakshofn.id, to: borgarnes.id, seats: 1, sort: "departure", date: "2026-11-20" },
    ]);
  });

  it("refuses the same place twice", async () => {
    await renderApp("/search", {
      setUp: (fake) => {
        searchApi(fake);
      },
    });
    await choose("From", "borg", "Borgarnes");
    await choose("To", "borg", "Borgarnes");
    await fireEvent.press(screen.getByRole("button", { name: "Find a ride" }));
    expect(await screen.findByText("Choose two different places.")).toBeVisible();
  });

  it("finds places again when the text is cut short and typed again before the pause", async () => {
    await renderApp("/search", {
      setUp: (fake) => {
        searchApi(fake);
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: /^From: / }));
    const field = await screen.findByLabelText("From");
    await fireEvent.changeText(field, "borg");
    expect(await screen.findByRole("button", { name: /^Borgarnes/ })).toBeVisible();
    await fireEvent.changeText(field, "b");
    expect(screen.queryByRole("button", { name: /^Borgarnes/ })).toBeNull();
    await fireEvent.changeText(field, "borg");
    expect(await screen.findByRole("button", { name: /^Borgarnes/ })).toBeVisible();
  });

  it("repeats a recent search, as any day once its date has passed", async () => {
    const end = (point: typeof borgarnes) => ({ id: point.id, name: point.name });
    const recent = [
      { from: end(borgarnes), to: end(blonduos), date: "2026-11-10", seats: 1 },
      { from: end(blonduos), to: end(borgarnes), date: "2026-11-21", seats: 3 },
      // The same search as the first once its date has passed: shown once.
      { from: end(borgarnes), to: end(blonduos), date: null, seats: 1 },
    ];
    mockedRead.mockImplementation((key: string) =>
      Promise.resolve(key === "recentSearches" ? JSON.stringify(recent) : null),
    );
    const { client } = await renderApp("/search", {
      setUp: (fake) => {
        searchApi(fake);
      },
    });
    expect(await screen.findByRole("header", { name: "Recent searches" })).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Borgarnes → Blönduós, Any day, 1 seat" }),
    ).toHaveLength(1);
    await fireEvent.press(
      screen.getByRole("button", { name: "Blönduós → Borgarnes, Sat 21 Nov, 3 seats" }),
    );
    expect(await screen.findByText("Sat 21 Nov, 3 seats")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Borgarnes → Blönduós, Any day, 1 seat" }),
    );
    expect(await screen.findByText("Any day, 1 seat")).toBeVisible();
    expect(searchesOf(client).map((query) => (query as { date?: string }).date)).toEqual([
      "2026-11-21",
      undefined,
    ]);
  });

  it("forgets the recent searches when asked", async () => {
    const recent = [
      {
        from: { id: borgarnes.id, name: borgarnes.name },
        to: { id: blonduos.id, name: blonduos.name },
        date: null,
        seats: 1,
      },
    ];
    mockedRead.mockImplementation((key: string) =>
      Promise.resolve(key === "recentSearches" ? JSON.stringify(recent) : null),
    );
    await renderApp("/search", {
      setUp: (fake) => {
        searchApi(fake);
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Clear recent searches" }));
    expect(screen.queryByRole("header", { name: "Recent searches" })).toBeNull();
    expect(mockedWrite).toHaveBeenLastCalledWith("recentSearches", "[]");
  });
});

describe("Results header and chips (spec 16, 3.8)", () => {
  it("opens the search filled in from the header, and Find a ride shows the new results", async () => {
    const { client } = await openResults();
    await screen.findByTestId("trip-result");
    await fireEvent.press(await changeSearch("Borgarnes → Blönduós", "Any day, 1 seat"));

    expect(await screen.findByRole("header", { name: "Change search" })).toBeVisible();
    expect(screen.getByRole("button", { name: "From: Borgarnes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "To: Blönduós" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Date: Any day" })).toBeVisible();
    expect(screen.queryByTestId("trip-result")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Sort: / })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Swap from and to" }));
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    await fireEvent.press(screen.getByRole("button", { name: "Find a ride" }));

    expect(await changeSearch("Blönduós → Borgarnes", "Any day, 2 seats")).toBeVisible();
    expect(screen.queryByRole("header", { name: "Change search" })).toBeNull();
    expect(screen).toHavePathname("/search/results");
    expect(searchesOf(client).at(-1)).toEqual({
      from: blonduos.id,
      to: borgarnes.id,
      seats: 2,
      sort: "departure",
    });
  });

  it("keeps the header a heading, with the button inside it", async () => {
    await openResults();
    const heading = await screen.findByTestId("results-heading");
    expect(heading).toHaveProp("accessibilityRole", "header");
    expect(
      within(heading).getByRole("button", {
        name: "Change search: Borgarnes → Blönduós, Any day, 1 seat",
      }),
    ).toBeVisible();
  });

  it("does not show the last route's trips while a changed search loads", async () => {
    let answerTwoSeats: (value: unknown) => void = () => undefined;
    await renderApp(resultsUrl(), {
      setUp: (client) => {
        searchApi(client);
        client.answer("/v1/trips/search", (input) => {
          const query = input["query"] as Record<string, unknown>;
          if (query["seats"] === 1) return ok(200, { results: [northResult] });
          return new Promise((resolve) => {
            answerTwoSeats = resolve;
          });
        });
      },
    });
    await screen.findByTestId("trip-result");
    await fireEvent.press(await changeSearch("Borgarnes → Blönduós", "Any day, 1 seat"));
    await fireEvent.press(await screen.findByRole("button", { name: "One seat more" }));
    await fireEvent.press(screen.getByRole("button", { name: "Find a ride" }));

    // Its totals were for one seat, so they wait for the answer for two.
    expect(await changeSearch("Borgarnes → Blönduós", "Any day, 2 seats")).toBeVisible();
    expect(screen.queryByTestId("trip-result")).toBeNull();
    expect(screen.getByLabelText("Loading")).toBeVisible();
    answerTwoSeats(ok(200, { results: [{ ...northResult, freeSeats: 2 }] }));
    expect(await screen.findByTestId("trip-result")).toBeVisible();
  });

  it("keeps the day searched in the form, and Cancel leaves the search as it was", async () => {
    const { client } = await openResults("&date=2026-11-15");
    await fireEvent.press(await changeSearch("Borgarnes → Blönduós", "Sun 15 Nov, 1 seat"));
    expect(await screen.findByRole("button", { name: "Date: Sun 15 Nov" })).toBeVisible();
    const searches = searchesOf(client).length;

    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(await changeSearch("Borgarnes → Blönduós", "Sun 15 Nov, 1 seat")).toBeVisible();
    expect(screen.queryByRole("header", { name: "Change search" })).toBeNull();
    expect(searchesOf(client)).toHaveLength(searches);
  });

  it("sorts with one chip that opens the two orders, apart from the filters", async () => {
    const { client } = await openResults();
    await screen.findByTestId("trip-result");
    const sort = screen.getByRole("button", { name: "Sort: Earliest" });
    expect(sort).toBeCollapsed();
    expect(screen.queryByRole("radio", { name: "Cheapest" })).toBeNull();

    await fireEvent.press(sort);
    expect(screen.getByRole("button", { name: "Sort: Earliest" })).toBeExpanded();
    expect(screen.getByRole("radio", { name: "Earliest" })).toBeChecked();
    // The radio pressed goes, so screen readers go back to the Sort chip.
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focus.mockClear();
    try {
      await fireEvent.press(screen.getByRole("radio", { name: "Cheapest" }));
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenLastCalledWith(expect.anything(), "focus");
    } finally {
      focus.mockRestore();
    }

    expect(await screen.findByRole("button", { name: "Sort: Cheapest" })).toBeVisible();
    expect(screen.queryByRole("radio", { name: "Earliest" })).toBeNull();
    expect(searchesOf(client).at(-1)).toMatchObject({ sort: "price" });
    // Filtering is its own chip, which keeps the filters until it is pressed.
    expect(screen.getByRole("button", { name: "Filters" })).toBeCollapsed();
    expect(screen.queryByRole("checkbox", { name: "Book instantly only" })).toBeNull();
  });

  it("puts the order, one Filters chip and the number of rides in one row (spec 31, 3.6)", async () => {
    await openResults("", { results: () => [northResult, mondayRide] });
    await screen.findAllByTestId("trip-result");
    const row = screen.getByTestId("results-row");
    expect(row).toHaveStyle({ flexDirection: "row", flexWrap: "wrap", alignItems: "center" });
    // The order says only what is chosen; its name says what it is.
    const sort = resultsRow().getByRole("button", { name: "Sort: Earliest" });
    expect(within(sort).getByText("Earliest")).toBeVisible();
    expect(within(sort).queryByText(/Sort/)).toBeNull();
    const filters = resultsRow().getByRole("button", { name: "Filters" });
    expect(within(filters).getByTestId("chip-icon", { includeHiddenElements: true })).toBeTruthy();
    expect(filters).toHaveStyle({ backgroundColor: colors.light.surface });
    // How many rides there are, at the right, said when it changes.
    const count = resultsRow().getByText("2 rides");
    expect(count).toHaveStyle({ color: colors.light.textMuted });
    expect(count.props.accessibilityLiveRegion).toBe("polite");
    expect(count).toHaveProp("testID", "results-count");
    expect(
      resultsRow()
        .getAllByRole("button")
        .map((chip) => String(chip.props.accessibilityLabel)),
    ).toEqual(["Sort: Earliest", "Filters"]);
  });

  it("opens today's filters under Filters, which says how many are on", async () => {
    const { client } = await openResults();
    await screen.findByTestId("trip-result");
    await openFilters();
    expect(screen.getByRole("button", { name: "Filters" })).toBeExpanded();
    // A group of its own, named for screen readers, under the row.
    expect(screen.getByTestId("results-filters")).toHaveProp("aria-label", "Filters");
    const filters = within(screen.getByTestId("results-filters"));
    expect(
      filters.getAllByRole("checkbox").map((chip) => String(chip.props.accessibilityLabel)),
    ).toEqual(["Book instantly only", "Morning", "Afternoon", "Evening"]);
    await fireEvent.press(filters.getByRole("checkbox", { name: "Book instantly only" }));
    // They stay open, to choose another; the chip counts them, in moss.
    const one = await screen.findByRole("button", { name: "Filters: 1 on" });
    expect(one).toBeExpanded();
    expect(one).toHaveStyle({
      backgroundColor: colors.light.primarySoft,
      borderColor: colors.light.primary,
    });
    await fireEvent.press(screen.getByRole("checkbox", { name: "Evening" }));
    expect(await screen.findByRole("button", { name: "Filters: 2 on" })).toBeVisible();
    expect(searchesOf(client).at(-1)).toMatchObject({ instant: true, timeOfDay: "evening" });
    // Closed, the chip still says so.
    await fireEvent.press(screen.getByRole("button", { name: "Filters: 2 on" }));
    expect(screen.getByRole("button", { name: "Filters: 2 on" })).toBeCollapsed();
    expect(screen.queryByRole("checkbox", { name: "Evening" })).toBeNull();
    // One thing opens at a time: the orders close the filters.
    await openFilters();
    await fireEvent.press(screen.getByRole("button", { name: "Sort: Earliest" }));
    expect(screen.getByRole("radio", { name: "Cheapest" })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: "Evening" })).toBeNull();
    expect(screen.getByRole("button", { name: "Filters: 2 on" })).toBeCollapsed();
  });

  it("says it all in Icelandic", async () => {
    mockedGetLocales.mockReturnValue([{ languageTag: "is-IS" }]);
    await openResults("", { results: () => [northResult, mondayRide] });
    await screen.findAllByTestId("trip-result");
    expect(resultsRow().getByRole("button", { name: "Röðun: Fyrst" })).toBeVisible();
    expect(resultsRow().getByText("2 ferðir")).toBeVisible();
    await fireEvent.press(resultsRow().getByRole("button", { name: "Síur" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Aðeins bókun strax" }));
    expect(await screen.findByRole("button", { name: "Síur: 1 virk" })).toBeVisible();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Kvöld" }));
    expect(await screen.findByRole("button", { name: "Síur: 2 virkar" })).toBeVisible();
    const end = within(screen.getByTestId("results-end"));
    expect(end.getByText("Ekki fundust fleiri ferðir")).toBeVisible();
    expect(end.getByText("Þú getur líka skoðað allar ferðir á næstunni.")).toBeVisible();
    expect(end.getByRole("link", { name: "Allar ferðir" })).toBeVisible();
  });
});

describe("Search results (spec 4, 3.4)", () => {
  it("sorts by price and filters by instant booking and time of day", async () => {
    const { client } = await openResults();
    await screen.findByTestId("trip-result");
    await sortBy("Cheapest");
    await openFilters();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Book instantly only" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Evening" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Morning" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Morning" }));
    expect(searchesOf(client).at(-1)).toEqual({
      from: borgarnes.id,
      to: blonduos.id,
      seats: 1,
      sort: "price",
      instant: true,
    });
    expect(searchesOf(client).at(-2)).toMatchObject({ timeOfDay: "morning" });
    expect(searchesOf(client).at(-3)).toMatchObject({ timeOfDay: "evening" });
  });

  it("groups by day when sorted by time, and shows the day on each trip by price", async () => {
    const results = [
      resultOn("2026-11-15"),
      resultOn("2026-11-16"),
      resultOn("2026-11-16", { tripId: "0190a1d6-0000-7000-8000-0000000611b6" }),
    ];
    await openResults("", { results: () => results });
    expect(await screen.findByRole("header", { name: "Sunday 15 November" })).toBeVisible();
    expect(screen.getByRole("header", { name: "Monday 16 November" })).toBeVisible();
    // The rides are counted once, in the row over them, not day by day.
    expect(resultsRow().getByText("3 rides")).toBeVisible();
    expect(screen.queryByText("1 ride")).toBeNull();
    expect(screen.queryByText("2 rides")).toBeNull();
    await sortBy("Cheapest");
    await waitFor(() => {
      expect(screen.queryByRole("header", { name: "Sunday 15 November" })).toBeNull();
    });
    // Each ticket says its day, as it does under a day's heading.
    expect(screen.getByText("Sun 15 Nov")).toBeVisible();
    expect(screen.getAllByText("Mon 16 Nov")).toHaveLength(2);
  });

  it("ends the list with a card: the puffin, that this is every ride, and All rides (spec 31, 3.6)", async () => {
    await openResults("", { results: () => [northResult] });
    await screen.findByTestId("trip-result");
    const card = screen.getByTestId("results-end");
    const end = within(card);
    expect(end.getByTestId("puffin-by-pin", { includeHiddenElements: true })).toBeTruthy();
    expect(end.getByText("That's every ride found")).toHaveStyle(typography.bodyStrong);
    // Any day was searched: there is no other day to try.
    expect(end.getByText("You can also see every ride leaving soon.")).toHaveStyle({
      color: colors.light.textMuted,
    });
    expect(screen.queryByText(/^Try another day/)).toBeNull();
    // It follows the last ride, and is no main button (R31.1).
    expect(
      screen.getAllByTestId(/^(trip-result|results-end)$/).map((part) => String(part.props.testID)),
    ).toEqual(["trip-result", "results-end"]);
    expect(filledButtons()).toBe(0);
    await fireEvent.press(end.getByRole("link", { name: "All rides" }));
    expect(await screen.findByRole("header", { name: "Rides leaving soon" })).toBeVisible();
    expect(screen).toHavePathname("/rides");
  });

  it("says to try another day at the end of a day's rides, over the other days", async () => {
    await openResults("&date=2026-11-15", {
      results: (query) => [resultOn(String(query["date"]))],
      days: [{ date: "2026-11-16", count: 2 }],
    });
    await screen.findByTestId("trip-result");
    const end = within(screen.getByTestId("results-end"));
    expect(end.getByText("Try another day, or see every ride leaving soon.")).toBeVisible();
    await screen.findByRole("button", { name: "Mon 16 Nov, 2 rides" });
    expect(
      screen
        .getAllByTestId(/^(trip-result|results-end|other-days)$/)
        .map((part) => String(part.props.testID)),
    ).toEqual(["trip-result", "results-end", "other-days"]);
  });

  it("shows a nearby stop's distance from the place searched, and free trips", async () => {
    const nearby = {
      ...northResult,
      board: { ...northResult.board, nearbyM: 2100 },
      pricePerSeat: { amount: 0, currency: "ISK" as const },
      total: { amount: 0, currency: "ISK" as const },
      bookingMode: "instant" as const,
      freeSeats: 1,
    };
    await openResults("", { results: () => [nearby] });
    const card = await screen.findByTestId("trip-result");
    expect(within(card).getByText("2.1 km from Borgarnes")).toBeVisible();
    expect(within(card).getByText("Free")).toBeVisible();
    expect(within(card).getByText("Book instantly")).toBeVisible();
    expect(within(card).getByText("1 seat left")).toBeVisible();
  });

  it("offers other days at the end of a day's trips", async () => {
    const { client } = await openResults("&date=2026-11-15", {
      results: (query) => [resultOn(String(query["date"]))],
      days: [
        { date: "2026-11-12", count: 4 },
        { date: "2026-11-16", count: 2 },
        { date: "2026-11-17", count: 0 },
      ],
    });
    expect(await screen.findByText("Sun 15 Nov, 1 seat")).toBeVisible();
    // Past days and days without trips are left out.
    const chip = await screen.findByRole("button", { name: "Mon 16 Nov, 2 rides" });
    expect(screen.queryByRole("button", { name: /^Thu 12 Nov/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Tue 17 Nov/ })).toBeNull();
    await fireEvent.press(chip);
    expect(await screen.findByText("Mon 16 Nov, 1 seat")).toBeVisible();
    expect(await screen.findByRole("header", { name: "Monday 16 November" })).toBeVisible();
    expect(searchesOf(client).at(-1)).toMatchObject({ date: "2026-11-16" });
  });

  it("asks for other days once a search, not again for each sort or filter", async () => {
    const { client } = await openResults("&date=2026-11-15", {
      days: [{ date: "2026-11-16", count: 2 }],
    });
    expect(await screen.findByRole("button", { name: "Mon 16 Nov, 2 rides" })).toBeVisible();
    await sortBy("Cheapest");
    await sortBy("Earliest");
    expect(await screen.findByRole("button", { name: "Mon 16 Nov, 2 rides" })).toBeVisible();
    expect(searchesOf(client, "/v1/trips/search/alternatives")).toHaveLength(1);
  });

  it("says when only the first 50 trips are shown", async () => {
    const many = Array.from({ length: 50 }, (_, index) =>
      resultOn("2026-11-15", {
        tripId: `0190a1d6-0000-7000-8000-${String(index).padStart(12, "0")}`,
      }),
    );
    await openResults("", { results: () => many });
    const end = within(await screen.findByTestId("results-end"));
    expect(end.getByText("These are the first 50 rides")).toBeVisible();
    expect(end.getByText("Choose a day to see others.")).toBeVisible();
    expect(end.getByRole("link", { name: "All rides" })).toBeVisible();
    expect(screen.queryByText("That's every ride found")).toBeNull();
    expect(resultsRow().getByText("50 rides")).toBeVisible();
  });

  it("says to filter by time of day when the first 50 are of the day searched", async () => {
    const many = Array.from({ length: 50 }, (_, index) =>
      resultOn("2026-11-15", {
        tripId: `0190a1d6-0000-7000-8000-${String(index).padStart(12, "0")}`,
      }),
    );
    await openResults("&date=2026-11-15", { results: () => many });
    const end = within(await screen.findByTestId("results-end"));
    expect(end.getByText("These are the first 50 rides")).toBeVisible();
    // A day is chosen already: choosing one would say nothing new.
    expect(end.getByText("Filter by time of day to see others.")).toBeVisible();
    expect(end.queryByText("Choose a day to see others.")).toBeNull();
  });

  it("says the times are Iceland's on a device set to another time zone", async () => {
    mockedShowsOtherTime.mockReturnValue(true);
    try {
      await openResults();
      expect(await screen.findByText("Times are in Iceland time.")).toBeVisible();
    } finally {
      mockedShowsOtherTime.mockReturnValue(false);
    }
  });
});

describe("Nothing matches (spec 4, 3.5)", () => {
  it("shows other days and trips from nearby meeting points", async () => {
    const nearby = { ...northResult, board: { ...northResult.board, nearbyM: 8_400 } };
    const { client } = await openResults("&date=2026-11-15", {
      results: () => [],
      days: [{ date: "2026-11-18", count: 1 }],
      nearby: [nearby],
    });
    expect(await screen.findByRole("header", { name: "No rides on Sun 15 Nov" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Wed 18 Nov, 1 ride" })).toBeVisible();
    expect(screen.getByRole("header", { name: "Rides from nearby meeting points" })).toBeVisible();
    expect(screen.getByText("8.4 km from Borgarnes")).toBeVisible();
    expect(screen.getByText("Sun 15 Nov")).toBeVisible();
    expect(searchesOf(client, "/v1/trips/search/alternatives")).toEqual([
      { from: borgarnes.id, to: blonduos.id, seats: 1, date: "2026-11-15" },
    ]);
  });

  it("says when there are no trips on the route yet, and sends drivers to sign in", async () => {
    await openResults("", { results: () => [] });
    expect(await screen.findByRole("header", { name: "No rides yet on this route" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "No rides found" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Offer a ride" }));
    expect(screen).toHavePathname("/sign-in");
  });

  it("offers any day when there is nothing on or around the date", async () => {
    const { client } = await openResults("&date=2026-11-15", { results: () => [] });
    expect(await screen.findByRole("header", { name: "No rides on Sun 15 Nov" })).toBeVisible();
    expect(
      await screen.findByText(
        "There are none on the days around it or from meeting points nearby either.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Search any day" }));
    expect(await screen.findByText("Any day, 1 seat")).toBeVisible();
    expect(searchesOf(client).at(-1)).not.toHaveProperty("date");
  });

  it("sends a signed-in driver to offer a ride", async () => {
    await renderApp(resultsUrl(), {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client);
        searchApi(client, { results: () => [] });
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Offer a ride" }));
    expect(screen).toHavePathname("/offer");
  });

  it("offers to show all trips when filters leave none", async () => {
    const { client } = await openResults("", {
      results: (query) => (query["instant"] === true ? [] : [northResult]),
    });
    await screen.findByTestId("trip-result");
    await openFilters();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Book instantly only" }));
    expect(
      await screen.findByRole("header", { name: "No rides match these filters." }),
    ).toBeVisible();
    // The count stays where it was and says none, so a screen reader hears
    // what the filter did; nothing ends where there is no ride.
    const count = screen.getByTestId("results-count");
    expect(count).toHaveTextContent("0 rides");
    expect(count).toHaveProp("accessibilityLiveRegion", "polite");
    expect(screen.queryByTestId("results-end")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show all rides" }));
    expect(await screen.findByTestId("trip-result")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Book instantly only" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Filters" })).toBeExpanded();
    // Filters do not look for alternatives.
    expect(searchesOf(client, "/v1/trips/search/alternatives")).toEqual([]);
  });

  it("says when the other days could not be loaded, and tries again", async () => {
    let fail = true;
    await renderApp(resultsUrl("&date=2026-11-15"), {
      setUp: (client) => {
        searchApi(client, { results: () => [], days: [{ date: "2026-11-16", count: 1 }] });
        client.answer("/v1/trips/search/alternatives", () =>
          fail
            ? failure(0, "network_error")
            : ok(200, { days: [{ date: "2026-11-16", count: 1 }], nearby: [] }),
        );
      },
    });
    expect(
      await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Search any day" })).toBeNull();
    fail = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Mon 16 Nov, 1 ride" })).toBeVisible();
  });

  it("does not show an old answer's message while a changed search loads", async () => {
    let answerAnyDay: (value: unknown) => void = () => undefined;
    await renderApp(resultsUrl("&date=2026-11-15"), {
      setUp: (client) => {
        searchApi(client, { results: () => [] });
        client.answer("/v1/trips/search", (input) => {
          const query = input["query"] as Record<string, unknown>;
          if (query["date"] !== undefined) return ok(200, { results: [] });
          return new Promise((resolve) => {
            answerAnyDay = resolve;
          });
        });
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Search any day" }));
    expect(await screen.findByText("Any day, 1 seat")).toBeVisible();
    expect(screen.queryByRole("header", { name: "No rides on Sun 15 Nov" })).toBeNull();
    expect(screen.queryByRole("header", { name: "No rides yet on this route" })).toBeNull();
    expect(screen.getByLabelText("Loading")).toBeVisible();
    answerAnyDay(ok(200, { results: [northResult] }));
    expect(await screen.findByTestId("trip-result")).toBeVisible();
  });

  it("says how long to wait when there were too many searches", async () => {
    await renderApp(resultsUrl(), {
      setUp: (client) => {
        searchApi(client);
        client.answer("/v1/trips/search", () =>
          failure(429, "rate_limited", { retryAfterSeconds: 42 }),
        );
      },
    });
    expect(
      await screen.findByText("Too many searches in a short time. Try again in 42 seconds."),
    ).toBeVisible();
  });
});

describe("Search results on a laptop (spec 18, 3.6)", () => {
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

  /** The whole trip, from Reykjavík to Akureyri, on the day after. */
  const wholeTrip = resultOn("2026-11-16", {
    board: { ...northResult.board, position: 0, meetingPoint: bsi },
    alight: { ...northResult.alight, position: 3, meetingPoint: hof },
  });
  const map = () => within(screen.getByTestId("aside")).getByRole("image");
  const mapOf = (route: string) => `The ride on a map of Iceland: ${route}.`;
  /** The outline of the card whose trip the map shows. */
  const marked = cardFace(colors.light.primary);
  /** The card of the trip at this place in the list, from 0. */
  const card = (place: number) => {
    // By price a card's name starts with its day.
    const found = screen.getAllByRole("button", { name: /(^|, )Leaves / })[place];
    if (found === undefined) throw new Error(`No ride at ${String(place)}`);
    return found;
  };
  /** The face of that card, which draws its outline. */
  const face = (place: number) => within(card(place)).getByTestId("card-face");
  /** The map's drawn parts, which screen readers skip: the label says them. */
  const drawn = (testID: string) =>
    within(map()).queryAllByTestId(testID, { includeHiddenElements: true });

  it("shows the first trip found on a map beside the list", async () => {
    await openResults("", { results: () => [northResult, wholeTrip] });
    await screen.findAllByTestId("trip-result");
    expect(map()).toHaveProp("accessibilityLabel", mapOf("Borgarnes → Blönduós"));
    // Its two meeting points stand out, and the stretch is drawn.
    expect(drawn("map-dot-chosen")).toHaveLength(2);
    expect(drawn("map-line-part")).toHaveLength(1);
    // The list keeps its place: the column, with the map as the aside.
    expect(screen.queryByTestId("page")).toBeNull();
  });

  it("shows the trip the pointer or the keyboard comes to, and marks its card", async () => {
    await openResults("", { results: () => [northResult, wholeTrip] });
    expect(await screen.findAllByRole("button", { name: /^Leaves / })).toHaveLength(2);
    // The first trip's card carries the mark from the start.
    expect(face(0)).toHaveStyle(marked);
    expect(face(1)).not.toHaveStyle(marked);

    await fireEvent(card(1), "focus");
    expect(map()).toHaveProp("accessibilityLabel", mapOf("BSÍ bus terminal → Hof, Akureyri"));
    expect(face(1)).toHaveStyle(marked);
    expect(face(0)).not.toHaveStyle(marked);

    await fireEvent(card(0), "hoverIn");
    expect(map()).toHaveProp("accessibilityLabel", mapOf("Borgarnes → Blönduós"));
    // The map keeps the trip once the pointer has left its card.
    await fireEvent(card(0), "hoverOut");
    expect(map()).toHaveProp("accessibilityLabel", mapOf("Borgarnes → Blönduós"));
    expect(face(0)).toHaveStyle(marked);
    expect(face(1)).not.toHaveStyle(marked);
  });

  it("keeps the map still as it shows one trip and then another", async () => {
    await openResults("", { results: () => [northResult, wholeTrip] });
    await screen.findAllByTestId("trip-result");
    // Every stretch found is on the map, so each trip fits what is shown.
    expect(drawn("map-line-route")).toHaveLength(2);
    /** The part of Iceland the map shows. */
    const view = () => {
      const { minX, minY, vbWidth, vbHeight } = drawn("map-drawing")[0]?.props as Record<
        string,
        number
      >;
      return { minX, minY, vbWidth, vbHeight };
    };
    const before = view();
    expect(before.vbWidth).toBeGreaterThan(0);
    await fireEvent(card(1), "focus");
    expect(map()).toHaveProp("accessibilityLabel", mapOf("BSÍ bus terminal → Hof, Akureyri"));
    expect(view()).toEqual(before);
    expect(drawn("map-line-route")).toHaveLength(2);
  });

  it("keeps the trip shown when the order changes", async () => {
    await openResults("", { results: () => [northResult, wholeTrip] });
    await screen.findAllByTestId("trip-result");
    await fireEvent(card(1), "focus");
    await sortBy("Cheapest");
    // By price each card says its day, and the list is one, not one a day.
    expect(await screen.findAllByText("Sun 15 Nov")).toHaveLength(2);
    expect(map()).toHaveProp("accessibilityLabel", mapOf("BSÍ bus terminal → Hof, Akureyri"));
    expect(face(1)).toHaveStyle(marked);
    expect(face(0)).not.toHaveStyle(marked);
  });

  it("goes back to the first trip when the one shown is filtered away", async () => {
    await openResults("", {
      results: (query) => (query["instant"] === true ? [northResult] : [northResult, wholeTrip]),
    });
    await screen.findAllByTestId("trip-result");
    await fireEvent(card(1), "focus");
    expect(map()).toHaveProp("accessibilityLabel", mapOf("BSÍ bus terminal → Hof, Akureyri"));
    await openFilters();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Book instantly only" }));
    await screen.findByText("1 ride");
    expect(screen.getAllByTestId("trip-result")).toHaveLength(1);
    expect(map()).toHaveProp("accessibilityLabel", mapOf("Borgarnes → Blönduós"));
  });

  it("has the map there while the trips load, so the list does not move", async () => {
    let answer: (value: unknown) => void = () => undefined;
    await renderApp(resultsUrl(), {
      setUp: (client) => {
        searchApi(client);
        client.answer(
          "/v1/trips/search",
          () =>
            new Promise((resolve) => {
              answer = resolve;
            }),
        );
      },
    });
    expect(await screen.findByLabelText("Loading")).toBeVisible();
    expect(map()).toHaveProp("accessibilityLabel", "Map of Iceland");
    expect(drawn("map-dot-chosen")).toHaveLength(0);
    await act(() => {
      answer(ok(200, { results: [northResult] }));
    });
    await screen.findByTestId("trip-result");
    expect(map()).toHaveProp("accessibilityLabel", mapOf("Borgarnes → Blönduós"));
  });

  it("keeps the map, without a trip, when nothing matches", async () => {
    await openResults("", { results: () => [] });
    expect(await screen.findByRole("header", { name: "No rides yet on this route" })).toBeVisible();
    expect(map()).toHaveProp("accessibilityLabel", "Map of Iceland");
    expect(drawn("map-dot-chosen")).toHaveLength(0);
  });

  it("keeps the map, without a trip, when the search fails", async () => {
    await renderApp(resultsUrl(), {
      setUp: (client) => {
        searchApi(client);
        client.answer("/v1/trips/search", () =>
          failure(429, "rate_limited", { retryAfterSeconds: 42 }),
        );
      },
    });
    expect(await screen.findByText(/^Too many searches/)).toBeVisible();
    expect(map()).toHaveProp("accessibilityLabel", "Map of Iceland");
  });

  it("keeps the list in its place, and focus where it is, when a filter leaves no trips", async () => {
    await openResults("", {
      results: (query) => (query["timeOfDay"] === "evening" ? [] : [northResult]),
    });
    await screen.findByTestId("trip-result");
    // Choosing an order gives focus back to the Sort chip, once.
    await sortBy("Cheapest");
    await screen.findByText("Sun 15 Nov");
    await openFilters();
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    try {
      focusMoves.mockClear();
      const evening = screen.getByRole("checkbox", { name: "Evening" });
      await fireEvent.press(evening);
      expect(
        await screen.findByRole("header", { name: "No rides match these filters." }),
      ).toBeVisible();
      // The map stays, without a trip, so the column did not move: the chip
      // pressed is the one still there, and nothing took focus from it.
      expect(map()).toHaveProp("accessibilityLabel", "Map of Iceland");
      expect(screen.getByRole("checkbox", { name: "Evening" })).toBe(evening);
      expect(focusMoves).not.toHaveBeenCalled();
    } finally {
      focusMoves.mockRestore();
    }
  });

  it("shows the trips from nearby points on the map when only they match", async () => {
    const nearby = { ...wholeTrip, board: { ...wholeTrip.board, nearbyM: 8_400 } };
    await openResults("&date=2026-11-15", { results: () => [], nearby: [nearby] });
    expect(await screen.findByText("8.4 km from Borgarnes")).toBeVisible();
    expect(map()).toHaveProp("accessibilityLabel", mapOf("BSÍ bus terminal → Hof, Akureyri"));
  });

  it("wraps the filters instead of scrolling them sideways", async () => {
    await openResults();
    await screen.findByTestId("trip-result");
    expect(screen.getByTestId("results-row")).toHaveStyle({ flexWrap: "wrap" });
    await openFilters();
    const filters = screen.getByTestId("results-filters");
    expect(filters).toHaveStyle({ flexDirection: "row", flexWrap: "wrap" });
    expect(within(filters).getByRole("checkbox", { name: "Evening" })).toBeVisible();
  });

  it("opens the search form in the list's column, with the map still beside it", async () => {
    await openResults();
    await screen.findByTestId("trip-result");
    await fireEvent.press(await changeSearch("Borgarnes → Blönduós", "Any day, 1 seat"));
    expect(await screen.findByRole("header", { name: "Change search" })).toBeVisible();
    expect(map()).toHaveProp("accessibilityLabel", mapOf("Borgarnes → Blönduós"));
    // The form is the phone's, one field under another, not Find's row.
    expect(screen.queryByTestId("search-row")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByTestId("trip-result")).toBeVisible();
  });

  it("has no map and no mark on a phone, with the same one row over the rides", async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
    await openResults("", { results: () => [northResult, wholeTrip] });
    await screen.findAllByTestId("trip-result");
    expect(screen.queryByTestId("aside")).toBeNull();
    expect(screen.queryByTestId("iceland-map")).toBeNull();
    expect(face(0)).not.toHaveStyle(marked);
    // Nothing scrolls sideways: two chips and the count fit a phone.
    expect(resultsRow().getByRole("button", { name: "Sort: Earliest" })).toBeVisible();
    expect(resultsRow().getByRole("button", { name: "Filters" })).toBeVisible();
    expect(resultsRow().getByText("2 rides")).toBeVisible();
  });
});
