import { fireEvent, screen, within } from "expo-router/testing-library";
import type * as Days from "@/lib/days";
import { showsOtherTime } from "@/lib/days";
import { readPreference, writePreference } from "@/lib/preferences";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { failure, ok } from "@/testing/fake-client";
import { thorlakshofn } from "@/testing/meeting-points";
import { northResult, resultOn, searchApi, searchesOf, type SearchAnswers } from "@/testing/search";
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
// The device's time zone, which one test changes.
jest.mock("@/lib/days", () => ({
  ...jest.requireActual<typeof Days>("@/lib/days"),
  showsOtherTime: jest.fn(() => false),
}));

const mockedRead = readPreference as jest.Mock;
const mockedWrite = writePreference as jest.Mock;
const mockedShowsOtherTime = showsOtherTime as jest.Mock;

beforeEach(() => {
  mockedRead.mockImplementation(() => Promise.resolve(null));
  mockedWrite.mockClear();
});

const resultsUrl = (extra = "") =>
  `/search/results?from=${borgarnes.id}&to=${blonduos.id}&fromName=Borgarnes&toName=Bl%C3%B6ndu%C3%B3s&seats=1${extra}`;

async function openResults(extra = "", answers: SearchAnswers = {}) {
  return renderApp(resultsUrl(extra), {
    setUp: (client) => {
      searchApi(client, answers);
    },
  });
}

async function choose(field: RegExp, typed: string, name: string) {
  await fireEvent.press(screen.getByRole("button", { name: field }));
  await fireEvent.changeText(await screen.findByLabelText("Town or meeting point"), typed);
  await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^${name}`) }));
}

describe("Searching for a ride (spec 4)", () => {
  it("finds Reykjavík to Akureyri for Borgarnes to Blönduós, without an account", async () => {
    const { client } = await renderApp("/search", {
      setUp: (fake) => {
        searchApi(fake);
      },
    });
    expect(await screen.findByRole("header", { name: "Find a ride" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Search" }));
    expect(
      await screen.findByText("Choose where you're leaving from and where you're going."),
    ).toBeVisible();

    await choose(/^From: /, "borg", "Borgarnes");
    await choose(/^To: /, "blön", "Blönduós");
    expect(screen.getByRole("button", { name: "From: Borgarnes" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    await fireEvent.press(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByRole("header", { name: "Borgarnes → Blönduós" })).toBeVisible();
    expect(screen.getByText("Any day, 2 seats")).toBeVisible();
    expect(searchesOf(client)).toEqual([
      { from: borgarnes.id, to: blonduos.id, seats: 2, sort: "departure" },
    ]);
    const card = await screen.findByTestId("trip-result");
    expect(card).toHaveAccessibleName(
      "Leaves Borgarnes at 10:00, arrives at Blönduós at 12:05, 2 h 5 min, 2,900 ISK per seat, " +
        "5,800 ISK for 2 seats, Part of BSÍ bus terminal → Hof, Akureyri, Request, " +
        "Anna, New driver, 3 seats left",
    );
    expect(within(card).getByText("2,900 ISK")).toBeVisible();
    expect(screen.getByRole("header", { name: "Sunday 15 November" })).toBeVisible();
    expect(screen.getByText("That's every trip found.")).toBeVisible();

    // The search is kept on this device, with its names.
    const [key, value] = (mockedWrite.mock.calls as [string, string][]).at(-1) ?? [];
    expect(key).toBe("recentSearches");
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
    await choose(/^From: /, "borg", "Borgarnes");
    await choose(/^To: /, "þorl", "Þorlákshöfn");
    await fireEvent.press(screen.getByRole("button", { name: "Swap from and to" }));
    expect(screen.getByRole("button", { name: "From: Þorlákshöfn" })).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Choose a day" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Friday 20 November" }));
    expect(screen.getByRole("radio", { name: "Fri 20 Nov" })).toBeChecked();
    await fireEvent.press(screen.getByRole("button", { name: "Search" }));
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
    await choose(/^From: /, "borg", "Borgarnes");
    await choose(/^To: /, "borg", "Borgarnes");
    await fireEvent.press(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Choose two different places.")).toBeVisible();
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

describe("Search results (spec 4, 3.4)", () => {
  it("sorts by price and filters by instant booking and time of day", async () => {
    const { client } = await openResults();
    await screen.findByTestId("trip-result");
    await fireEvent.press(screen.getByRole("radio", { name: "Cheapest" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Instant booking only" }));
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
    const results = [resultOn("2026-11-15"), resultOn("2026-11-16"), resultOn("2026-11-16")];
    await openResults("", { results: () => results });
    expect(await screen.findByRole("header", { name: "Sunday 15 November" })).toBeVisible();
    expect(screen.getByRole("header", { name: "Monday 16 November" })).toBeVisible();
    expect(screen.getByText("1 trip")).toBeVisible();
    expect(screen.getByText("2 trips")).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Cheapest" }));
    expect(await screen.findByText("Sun 15 Nov")).toBeVisible();
    expect(screen.queryByRole("header", { name: "Sunday 15 November" })).toBeNull();
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
    expect(within(card).getByText("Instant")).toBeVisible();
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
    const chip = await screen.findByRole("button", { name: "Mon 16 Nov, 2 trips" });
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
    expect(await screen.findByRole("button", { name: "Mon 16 Nov, 2 trips" })).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Cheapest" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Earliest" }));
    expect(await screen.findByRole("button", { name: "Mon 16 Nov, 2 trips" })).toBeVisible();
    expect(searchesOf(client, "/v1/trips/search/alternatives")).toHaveLength(1);
  });

  it("says when only the first 50 trips are shown", async () => {
    const many = Array.from({ length: 50 }, (_, index) =>
      resultOn("2026-11-15", {
        tripId: `0190a1d6-0000-7000-8000-${String(index).padStart(12, "0")}`,
      }),
    );
    await openResults("", { results: () => many });
    expect(
      await screen.findByText("These are the first 50 trips. Choose a day to see others."),
    ).toBeVisible();
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
    expect(await screen.findByRole("header", { name: "No trips on Sun 15 Nov" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Wed 18 Nov, 1 trip" })).toBeVisible();
    expect(screen.getByRole("header", { name: "Trips from nearby meeting points" })).toBeVisible();
    expect(screen.getByText("8.4 km from Borgarnes")).toBeVisible();
    expect(screen.getByText("Sun 15 Nov")).toBeVisible();
    expect(searchesOf(client, "/v1/trips/search/alternatives")).toEqual([
      { from: borgarnes.id, to: blonduos.id, seats: 1, date: "2026-11-15" },
    ]);
  });

  it("says when there are no trips on the route yet, and sends drivers to sign in", async () => {
    await openResults("", { results: () => [] });
    expect(await screen.findByRole("header", { name: "No trips yet on this route" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "No trips found" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Offer a ride" }));
    expect(screen).toHavePathname("/sign-in");
  });

  it("offers any day when there is nothing on or around the date", async () => {
    const { client } = await openResults("&date=2026-11-15", { results: () => [] });
    expect(await screen.findByRole("header", { name: "No trips on Sun 15 Nov" })).toBeVisible();
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
    expect(screen).toHavePathname("/drive");
  });

  it("offers to show all trips when filters leave none", async () => {
    const { client } = await openResults("", {
      results: (query) => (query["instant"] === true ? [] : [northResult]),
    });
    await screen.findByTestId("trip-result");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Instant booking only" }));
    expect(
      await screen.findByRole("header", { name: "No trips match these filters." }),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Show all trips" }));
    expect(await screen.findByTestId("trip-result")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Instant booking only" })).not.toBeChecked();
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
      await screen.findByText("We couldn't reach ShareRide. Check your connection and try again."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Search any day" })).toBeNull();
    fail = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Mon 16 Nov, 1 trip" })).toBeVisible();
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
    expect(screen.queryByRole("header", { name: "No trips on Sun 15 Nov" })).toBeNull();
    expect(screen.queryByRole("header", { name: "No trips yet on this route" })).toBeNull();
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
