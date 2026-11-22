import { act, fireEvent, screen, within } from "expo-router/testing-library";
import { Dimensions } from "react-native";
import { shareLink } from "@/lib/share";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { photoSizeIs, resetManipulator } from "@/testing/image-manipulator";
import { photoPickedIs } from "@/testing/image-picker";
import { bsi, fitjar, hof, kef, thorlakshofn } from "@/testing/meeting-points";
import { blonduos, borgarnes, plannedDraft, quoteFor, tripsApi, yaris } from "@/testing/trips";

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
jest.mock("@/lib/share", () => ({ shareLink: jest.fn(() => Promise.resolve("copied")) }));

const mockedShare = shareLink as jest.Mock;

async function open(url: string, start: Parameters<typeof tripsApi>[1] = []) {
  let api: ReturnType<typeof tripsApi> | undefined;
  const app = await renderApp(url, {
    me: completeMe,
    setUp: (client) => {
      api = tripsApi(client, start);
    },
  });
  if (api === undefined) throw new Error("The fake API was not set up.");
  return { ...app, api };
}

const bodiesOf = (client: FakeClient, path: string) =>
  client.calls.filter((call) => call.path === path).map((call) => call.input["body"]);

/** Chooses a place in the list that drops down under From or To. */
async function choosePoint(field: "From" | "To", typed: string, name: string) {
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${field}: `) }));
  await fireEvent.changeText(await screen.findByLabelText(field), typed);
  await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^${name}`) }));
}

/**
 * Opens the wheel of a time, taps the hour and the minutes in it and closes
 * it with Done, as a driver does on the time step.
 */
async function chooseTime(label: string, time: string) {
  const [hour = "", minute = ""] = time.split(":");
  await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^${label}: `) }));
  await fireEvent.press(within(screen.getByRole("adjustable", { name: "Hour" })).getByText(hour));
  await fireEvent.press(
    within(screen.getByRole("adjustable", { name: "Minutes" })).getByText(minute),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
}

/** Unfolds the times at the stops, worked out and folded at first (spec 16, 3.6). */
async function changeStopTimes() {
  await fireEvent.press(
    await screen.findByRole("button", { name: "Change the times at the stops" }),
  );
}

/** The time a field shows, from its name: "Time at Borgarnes: 10:00". */
const timeOf = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}: `) });

describe("Posting a trip (spec 3)", () => {
  it("goes from the route to a published trip", async () => {
    const { client, api } = await open("/drive/trips/new");
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen.getByText("Step 1 of 5")).toBeVisible();

    await choosePoint("From", "bs", "BSÍ bus terminal");
    await choosePoint("To", "hof", "Hof, Akureyri");
    expect(screen.getByRole("button", { name: "From: BSÍ bus terminal" })).toBeVisible();
    // The meeting points on the way are stops; the driver skips one.
    const blonduosSwitch = await screen.findByRole("switch", { name: "Blönduós" });
    expect(blonduosSwitch).toBeChecked();
    expect(screen.getByRole("switch", { name: "Borgarnes" })).toBeChecked();
    expect(
      screen.getByRole("image", {
        name: "Your route on a map of Iceland: BSÍ bus terminal → Hof, Akureyri.",
      }),
    ).toBeVisible();
    await fireEvent.press(blonduosSwitch);
    expect(blonduosSwitch).not.toBeChecked();
    expect(await screen.findByText("200 km · about 2 h")).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Choose date and time" }));
    expect(await screen.findByRole("header", { name: "When are you leaving?" })).toBeVisible();
    expect(bodiesOf(client, "/v1/trips")).toEqual([{ stops: [bsi.id, borgarnes.id, hof.id] }]);

    await fireEvent.press(screen.getByRole("radio", { name: "Sunday 15 November" }));
    await chooseTime("Leaving BSÍ bus terminal at", "09:00");
    expect(screen.getByRole("header", { name: "Times at the 2 stops" })).toBeVisible();
    expect(screen.getByText("10:00  Borgarnes")).toBeVisible();
    expect(screen.getByText("11:00  Hof, Akureyri")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Set your price" }));
    expect(await screen.findByRole("header", { name: "Set your price" })).toBeVisible();
    const id = api.trips()[0]?.id ?? "";
    expect(bodiesOf(client, "/v1/trips/{id}")).toEqual([
      {
        plannedTimes: [
          "2026-11-15T09:00:00.000Z",
          "2026-11-15T10:00:00.000Z",
          "2026-11-15T11:00:00.000Z",
        ],
      },
    ]);

    expect(await screen.findByText("3,000 ISK")).toBeVisible();
    expect(screen.getByText("Suggested price")).toBeVisible();
    expect(screen.getByLabelText("BSÍ bus terminal to Borgarnes, 1,500 ISK")).toBeVisible();
    // Why there is a limit, and that it is for the whole trip (spec 17, section 9).
    expect(
      screen.getByText(
        "The limit is for the whole trip, so what passengers have already booked counts towards it.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Raise the price" }));
    expect(await screen.findByText("3,400 ISK")).toBeVisible();
    expect(screen.queryByText("Suggested price")).toBeNull();
    expect(screen.getByTestId("price-level-value")).toHaveTextContent("110%");
    await fireEvent.press(screen.getByRole("button", { name: "Choose seats" }));
    expect(await screen.findByRole("header", { name: "Seats and preferences" })).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    expect(screen.getByTestId("stepper-value")).toHaveTextContent("4");
    await fireEvent.press(screen.getByRole("radio", { name: /^Instant booking/ }));
    await fireEvent.press(screen.getByRole("radio", { name: "Pets welcome" }));
    await fireEvent.changeText(
      screen.getByLabelText("Note to passengers (optional)"),
      "Room for skis on the roof.",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Review your trip" }));
    expect(await screen.findByRole("header", { name: "Check and publish" })).toBeVisible();
    expect(bodiesOf(client, "/v1/trips/{id}").at(-1)).toEqual({
      seats: 4,
      bookingMode: "instant",
      vehicleId: yaris.id,
      preferences: {
        luggage: "suitcase",
        pets: "yes",
        smoking: "no",
        childSeat: false,
        chat: "some",
      },
      note: "Room for skis on the roof.",
    });

    expect(screen.getByText("Sunday 15 November")).toBeVisible();
    expect(screen.getByText("09:00  BSÍ bus terminal")).toBeVisible();
    expect(screen.getByText("4 seats")).toBeVisible();
    expect(screen.getByText("Instant booking")).toBeVisible();
    expect(screen.getByText("Pets welcome")).toBeVisible();
    expect(screen.getByText("Toyota Yaris, white")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Publish trip" }));
    expect(await screen.findByRole("header", { name: "Your trip is published" })).toBeVisible();
    expect(screen).toHavePathname(`/drive/trips/${id}/published`);
    expect(screen.getByText("People can now find it and book a seat.")).toBeVisible();

    // The driver shares the trip's page, or sees it as passengers do.
    await fireEvent.press(screen.getByRole("button", { name: "Share the trip" }));
    expect(mockedShare).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^http://localhost:3000/trips/${id}\\?from=0&to=\\d$`)),
      expect.stringMatching(/ on PuffinRide$/),
    );
    expect(await screen.findByText("Link copied. Paste it wherever you like.")).toBeVisible();
    expect(screen.getByRole("link", { name: "See the trip page" })).toBeVisible();
  });

  it("keeps the new draft's route when the driver goes back to it", async () => {
    const { api } = await open("/drive/trips/new");
    await choosePoint("From", "bs", "BSÍ bus terminal");
    await choosePoint("To", "hof", "Hof, Akureyri");
    await fireEvent.press(await screen.findByRole("switch", { name: "Blönduós" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose date and time" }));
    expect(await screen.findByRole("header", { name: "When are you leaving?" })).toBeVisible();
    const id = api.trips()[0]?.id ?? "";
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(screen).toHavePathname(`/drive/trips/${id}/route`);
    expect(await screen.findByRole("button", { name: "From: BSÍ bus terminal" })).toBeVisible();
    expect(screen.queryByRole("switch", { name: "Blönduós" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Choose date and time" }));
    expect(await screen.findByRole("header", { name: "When are you leaving?" })).toBeVisible();
    expect(api.trips()).toHaveLength(1);
  });

  it("looks up the stops on the way for the new direction after a swap", async () => {
    const { client } = await open("/drive/trips/new");
    client.answer("/v1/routes/stops-along", () => failure(503, "distances_pending"));
    await choosePoint("From", "bs", "BSÍ bus terminal");
    await choosePoint("To", "hof", "Hof, Akureyri");
    expect(await screen.findByRole("button", { name: "Try again" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Swap start and end" }));
    expect(await screen.findByRole("button", { name: "Try again" })).toBeVisible();
    client.answer("/v1/routes/stops-along", () =>
      ok(200, { meetingPoints: [blonduos, borgarnes] }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("switch", { name: "Blönduós" })).toBeVisible();
    const queries = client.calls
      .filter((call) => call.path === "/v1/routes/stops-along")
      .map((call) => call.input["query"]);
    expect(queries.at(-1)).toEqual({ from: hof.id, to: bsi.id });
    expect(screen.getByRole("button", { name: "From: Hof, Akureyri" })).toBeVisible();
  });

  it("adds a meeting point where it adds least, and says how far it takes you", async () => {
    const { client } = await open("/drive/trips/new");
    await choosePoint("From", "bs", "BSÍ bus terminal");
    await choosePoint("To", "hof", "Hof, Akureyri");
    await screen.findByRole("switch", { name: "Borgarnes" });
    await fireEvent.press(screen.getByRole("button", { name: "Add a meeting point" }));
    expect(await screen.findByRole("header", { name: "Add a meeting point" })).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText("Town or meeting point"), "kef");
    await fireEvent.press(await screen.findByRole("button", { name: /^Keflavík Airport/ }));

    expect(await screen.findByText("This stop adds 35 km")).toBeVisible();
    // Screen readers hear the detour with the stop's name.
    const switches = screen.getAllByRole("switch");
    expect(switches.map((found) => found.props.accessibilityLabel as string)).toEqual([
      "Keflavík Airport, This stop adds 35 km",
      "Borgarnes",
      "Blönduós",
    ]);
    expect(bodiesOf(client, "/v1/routes/quote")).toContainEqual({
      stops: [bsi.id, borgarnes.id, blonduos.id, hof.id],
      add: kef.id,
      seats: 3,
      priceLevel: 100,
    });

    // A point already on the route is not added twice.
    await fireEvent.press(screen.getByRole("button", { name: "Add a meeting point" }));
    await fireEvent.changeText(await screen.findByLabelText("Town or meeting point"), "bor");
    await fireEvent.press(await screen.findByRole("button", { name: /^Borgarnes/ }));
    expect(await screen.findByText("Borgarnes is already on your route.")).toBeVisible();
  });

  it("needs both ends, and swaps them with the stops in between", async () => {
    await open("/drive/trips/new");
    await screen.findByRole("header", { name: "Where are you driving?" });
    await fireEvent.press(screen.getByRole("button", { name: "Choose date and time" }));
    expect(await screen.findByText("Choose where you start and where you're going.")).toBeVisible();

    await choosePoint("From", "bs", "BSÍ bus terminal");
    await choosePoint("To", "hof", "Hof, Akureyri");
    await screen.findByRole("switch", { name: "Borgarnes" });
    await fireEvent.press(screen.getByRole("button", { name: "Swap start and end" }));
    expect(screen.getByRole("button", { name: "From: Hof, Akureyri" })).toBeVisible();
    const switches = screen.getAllByRole("switch");
    expect(switches.map((found) => found.props.accessibilityLabel as string)).toEqual([
      "Blönduós",
      "Borgarnes",
    ]);
  });

  it("lists the meeting points near a town under From, where a paused one can't be chosen", async () => {
    const { client } = await open("/drive/trips/new");
    await screen.findByRole("header", { name: "Where are you driving?" });
    client.answer("/v1/places/search", () =>
      ok(200, { results: [{ kind: "place", place: thorlakshofn }] }),
    );
    client.answer("/v1/places/{id}/nearest-meeting-points", () =>
      ok(200, {
        place: thorlakshofn,
        withinReach: true,
        meetingPoints: [
          { meetingPoint: fitjar, distanceM: 2440 },
          { meetingPoint: bsi, distanceM: 38_200 },
        ],
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: /^From: / }));
    expect(
      await screen.findByText(
        "Search for a meeting point, or for a town to see the points near it.",
      ),
    ).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText("From"), "thorl");
    await fireEvent.press(await screen.findByRole("button", { name: /^Þorlákshöfn/ }));

    // The points near the town drop down in the same list, on the same step.
    expect(
      await screen.findByRole("header", { name: "Meeting points near Þorlákshöfn" }),
    ).toBeVisible();
    expect(screen.getByRole("header", { name: "Where are you driving?" })).toBeVisible();
    // This list has no tag under it, so each sample point says so itself.
    expect(
      screen.getByRole("button", { name: /^BSÍ bus terminal, .*, Sample meeting point$/ }),
    ).toBeVisible();
    expect(screen.getAllByText("Sample meeting point")).toHaveLength(2);
    await fireEvent.press(screen.getByRole("button", { name: /^Fitjar/ }));
    expect(
      await screen.findByText("This meeting point is paused right now. Choose another."),
    ).toBeVisible();
    expect(screen.getByLabelText("From")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: /^BSÍ bus terminal/ }));
    expect(screen.queryByLabelText("From")).toBeNull();
    expect(screen.getByRole("button", { name: "From: BSÍ bus terminal" })).toBeVisible();
  });

  it("checks the times before going on", async () => {
    const { client } = await open(`/drive/trips/${plannedDraft().id}/time`, [plannedDraft()]);
    expect(
      await screen.findByRole("button", { name: "Leaving BSÍ bus terminal at: 09:00" }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: "Sunday 15 November" })).toBeChecked();

    // Ten minutes for an hour's drive, then a long break.
    await changeStopTimes();
    await chooseTime("Time at Borgarnes", "09:10");
    await chooseTime("Time at Hof, Akureyri", "14:00");
    expect(
      screen.getByText("Planning a long break? This stretch usually takes 1 h."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Set your price" }));
    expect(
      await screen.findByText("Too soon after BSÍ bus terminal: the drive usually takes 1 h."),
    ).toBeVisible();
    expect(bodiesOf(client, "/v1/trips/{id}")).toEqual([]);

    // A time past midnight is the next day.
    await chooseTime("Time at Borgarnes", "23:00");
    await chooseTime("Time at Hof, Akureyri", "00:00");
    expect(screen.getByText("On Monday 16 November")).toBeVisible();
  });

  it("says when a time earlier than the stop before falls on the next day", async () => {
    await open(`/drive/trips/${plannedDraft().id}/time`, [plannedDraft()]);
    // 08:30 after leaving at 09:00 is the next morning, and a long break too.
    await changeStopTimes();
    await chooseTime("Time at Borgarnes", "08:30");
    expect(
      screen.getByText(
        "On Monday 16 November. Planning a long break? This stretch usually takes 1 h.",
      ),
    ).toBeVisible();
  });

  it("plans the stops again from a new departure", async () => {
    await open(`/drive/trips/${plannedDraft().id}/time`, [plannedDraft()]);
    await changeStopTimes();
    await chooseTime("Time at Borgarnes", "10:30");
    await chooseTime("Leaving BSÍ bus terminal at", "10:00");
    expect(timeOf("Time at Borgarnes")).toHaveAccessibleName("Time at Borgarnes: 11:00");
    expect(timeOf("Time at Hof, Akureyri")).toHaveAccessibleName("Time at Hof, Akureyri: 12:00");
  });

  it("folds the times at the stops, worked out from the departure", async () => {
    await open(`/drive/trips/${plannedDraft().id}/time`, [plannedDraft()]);
    expect(await screen.findByRole("header", { name: "Times at the 2 stops" })).toBeVisible();
    expect(screen.getByText("Worked out from typical driving times.")).toBeVisible();
    expect(screen.getByText("10:00  Borgarnes")).toBeVisible();
    expect(screen.getByText("11:00  Hof, Akureyri")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Time at Borgarnes: / })).toBeNull();
    await chooseTime("Leaving BSÍ bus terminal at", "23:30");
    // Past midnight, a stop says its day.
    expect(screen.getByText("00:30  Borgarnes, Monday 16 November")).toBeVisible();
    expect(screen.getByText("01:30  Hof, Akureyri, Monday 16 November")).toBeVisible();
  });

  it("unfolds the times at the stops with Change", async () => {
    await open(`/drive/trips/${plannedDraft().id}/time`, [plannedDraft()]);
    await changeStopTimes();
    expect(screen.getByRole("header", { name: "Times at the stops" })).toBeVisible();
    expect(screen.getByText(/^We worked these out from typical driving times\./)).toBeVisible();
    expect(timeOf("Time at Borgarnes")).toHaveAccessibleName("Time at Borgarnes: 10:00");
    expect(timeOf("Time at Hof, Akureyri")).toHaveAccessibleName("Time at Hof, Akureyri: 11:00");
    expect(screen.queryByRole("button", { name: "Change the times at the stops" })).toBeNull();
    expect(screen.queryByText("10:00  Borgarnes")).toBeNull();
  });

  it("unfolds the times at the stops when one of them has a problem", async () => {
    const tooSoon = plannedDraft({
      stops: plannedDraft().stops.map((stop, index) =>
        index === 1 ? { ...stop, plannedAt: "2026-11-15T09:10:00.000Z" } : stop,
      ),
    });
    const { client } = await open(`/drive/trips/${tooSoon.id}/time`, [tooSoon]);
    expect(await screen.findByText("09:10  Borgarnes")).toBeVisible();
    // A time the driver chose is not worked out.
    expect(screen.queryByText("Worked out from typical driving times.")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Set your price" }));
    expect(
      await screen.findByText("Too soon after BSÍ bus terminal: the drive usually takes 1 h."),
    ).toBeVisible();
    expect(timeOf("Time at Borgarnes")).toHaveAccessibleName("Time at Borgarnes: 09:10");
    expect(screen.getByText("Change any of them, for example for a break.")).toBeVisible();
    expect(screen.queryByText(/^We worked these out/)).toBeNull();
    expect(bodiesOf(client, "/v1/trips/{id}")).toEqual([]);
  });

  it("says the times at the stops come once the departure is chosen", async () => {
    const draft = plannedDraft({
      stops: plannedDraft().stops.map((stop) => ({ ...stop, plannedAt: null })),
      departsAt: null,
      arrivesAt: null,
    });
    await open(`/drive/trips/${draft.id}/time`, [draft]);
    expect(
      await screen.findByText(
        "Worked out from typical driving times once you choose the date and the time you leave.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Sunday 15 November" }));
    await chooseTime("Leaving BSÍ bus terminal at", "09:00");
    expect(screen.getByText("10:00  Borgarnes")).toBeVisible();
    expect(screen.getByText("Worked out from typical driving times.")).toBeVisible();
  });

  it("starts the departure at the earliest time one can leave", async () => {
    const draft = plannedDraft({
      stops: plannedDraft().stops.map((stop) => ({ ...stop, plannedAt: null })),
      departsAt: null,
      arrivesAt: null,
    });
    const { client } = await open(`/drive/trips/${draft.id}/time`, [draft]);
    await fireEvent.press(await screen.findByRole("radio", { name: "Saturday 14 November" }));
    await fireEvent.press(screen.getByRole("button", { name: "Set your price" }));
    expect(await screen.findByText("Choose the time you're leaving.")).toBeVisible();
    expect(bodiesOf(client, "/v1/trips/{id}")).toEqual([]);
    // It is noon, so 12:30 is the earliest; the stops follow from it.
    await fireEvent.press(
      screen.getByRole("button", { name: "Leaving BSÍ bus terminal at: Choose a time" }),
    );
    expect(screen.getByRole("adjustable", { name: "Hour" })).toHaveAccessibilityValue({
      text: "12",
    });
    expect(timeOf("Leaving BSÍ bus terminal at")).toHaveAccessibleName(
      "Leaving BSÍ bus terminal at: 12:30",
    );
    expect(screen.getByText("13:30  Borgarnes")).toBeVisible();
    expect(screen.queryByText("Choose the time you're leaving.")).toBeNull();
  });

  it("rounds times that are not on 5 minutes up to the next 5 minutes", async () => {
    const odd = plannedDraft({
      stops: plannedDraft().stops.map((stop, index) => ({
        ...stop,
        plannedAt: ["2026-11-15T09:02:00.000Z", "2026-11-15T10:03:00.000Z", null][index] ?? null,
      })),
    });
    const { client } = await open(`/drive/trips/${odd.id}/time`, [odd]);
    expect(
      await screen.findByRole("button", { name: "Leaving BSÍ bus terminal at: 09:05" }),
    ).toBeVisible();
    expect(timeOf("Time at Borgarnes")).toHaveAccessibleName("Time at Borgarnes: 10:05");
    expect(timeOf("Time at Hof, Akureyri")).toHaveAccessibleName(
      "Time at Hof, Akureyri: Choose a time",
    );
    await chooseTime("Time at Hof, Akureyri", "11:05");
    await fireEvent.press(screen.getByRole("button", { name: "Set your price" }));
    expect(await screen.findByRole("header", { name: "Set your price" })).toBeVisible();
    expect(bodiesOf(client, "/v1/trips/{id}")).toEqual([
      {
        plannedTimes: [
          "2026-11-15T09:05:00.000Z",
          "2026-11-15T10:05:00.000Z",
          "2026-11-15T11:05:00.000Z",
        ],
      },
    ]);
  });

  it("refuses a departure less than 30 minutes away", async () => {
    await open(`/drive/trips/${plannedDraft().id}/time`, [plannedDraft()]);
    await fireEvent.press(await screen.findByRole("radio", { name: "Saturday 14 November" }));
    await chooseTime("Leaving BSÍ bus terminal at", "12:10");
    await fireEvent.press(screen.getByRole("button", { name: "Set your price" }));
    expect(await screen.findByText("Leave at least 30 minutes from now.")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Friday 13 November" })).toBeDisabled();
  });

  it("counts every tap on the price level, before the prices come back", async () => {
    const { client } = await open(`/drive/trips/${plannedDraft().id}/price`, [plannedDraft()]);
    expect(await screen.findByText("3,000 ISK")).toBeVisible();
    // Quotes wait until the test lets them through, as on a slow network.
    const held: (() => void)[] = [];
    client.answer(
      "/v1/routes/quote",
      (input) =>
        new Promise((resolve) => {
          held.push(() => {
            resolve(ok(200, quoteFor(input["body"] as never)));
          });
        }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Lower the price" }));
    await fireEvent.press(screen.getByRole("button", { name: "Lower the price" }));
    expect(screen.getByTestId("price-level-value")).toHaveTextContent("80%");
    for (const release of held) release();
    expect(await screen.findByText("2,400 ISK")).toBeVisible();
    expect(bodiesOf(client, "/v1/routes/quote").at(-1)).toMatchObject({ priceLevel: 80 });
  });

  it("lowers the price level when more seats bring the highest down", async () => {
    const draft = plannedDraft({ priceLevel: 150 });
    const { client } = await open(`/drive/trips/${draft.id}/seats`, [draft]);
    await fireEvent.press(await screen.findByRole("button", { name: "One seat more" }));
    expect(
      await screen.findByText(
        "With 4 seats the highest price level is 110%, so we lowered yours to it.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Review your trip" }));
    await screen.findByRole("header", { name: "Check and publish" });
    expect(bodiesOf(client, "/v1/trips/{id}")).toEqual([
      expect.objectContaining({ seats: 4, priceLevel: 110 }),
    ]);
  });

  it("does not let a note share contact details", async () => {
    const { client } = await open(`/drive/trips/${plannedDraft().id}/seats`, [plannedDraft()]);
    await fireEvent.changeText(
      await screen.findByLabelText("Note to passengers (optional)"),
      "Text me on 555 1234",
    );
    expect(
      screen.getByText(
        "Please don't share phone numbers, emails or links. Passengers can chat with you in the app once they book.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Review your trip" }));
    expect(bodiesOf(client, "/v1/trips/{id}")).toEqual([]);
  });

  it("names the day of a stop that falls on a later day", async () => {
    const draft = plannedDraft();
    // Arriving at one in the morning, the day after leaving.
    const stops = draft.stops.map((stop, index) =>
      index === 2 ? { ...stop, plannedAt: "2026-11-16T01:00:00.000Z" } : stop,
    );
    await open(`/drive/trips/${draft.id}/review`, [
      plannedDraft({ stops, arrivesAt: "2026-11-16T01:00:00.000Z" }),
    ]);
    expect(await screen.findByText("Sunday 15 November")).toBeVisible();
    expect(screen.getByText("10:00  Borgarnes")).toBeVisible();
    expect(screen.getByText("01:00  Hof, Akureyri, Monday 16 November")).toBeVisible();
  });

  it("lists what to fix when the server refuses to publish", async () => {
    const { api } = await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    api.refuse([
      { path: "plannedTimes", issue: "departure_too_soon" },
      { path: "segments.1", issue: "stretch_too_fast" },
      { path: "stops.1", issue: "stop_unavailable" },
    ]);
    await fireEvent.press(await screen.findByRole("button", { name: "Publish trip" }));
    const problems = await screen.findByTestId("publish-problems");
    expect(within(problems).getByText("Fix these before you publish:")).toBeVisible();
    expect(within(problems).getByText("• Leave at least 30 minutes from now.")).toBeVisible();
    expect(
      within(problems).getByText(
        "• The time at Hof, Akureyri leaves too little time to drive there.",
      ),
    ).toBeVisible();
    expect(
      within(problems).getByText("• Borgarnes isn't in use right now. Take it off the route."),
    ).toBeVisible();
    expect(api.trips()[0]?.status).toBe("draft");
  });

  it("asks first for what is missing, and Publish waits until it is done", async () => {
    const draft = plannedDraft({ vehicleId: null });
    const { client } = await open(`/drive/trips/${draft.id}/review`, [draft]);
    client.answer("/v1/me/vehicles", () => ok(200, { vehicles: [] }));
    client.answer("/v1/me/driver-readiness", () =>
      ok(200, {
        ready: false,
        items: [
          { item: "photo", done: false, blocking: false },
          { item: "car", done: false, blocking: true },
          { item: "licence", done: false, blocking: true },
        ],
        licenceDeclaredAt: null,
      }),
    );
    // Back on the review from another step, it loads the driver again.
    await fireEvent.press(await screen.findByRole("link", { name: "Edit: Route" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    expect(
      await screen.findByRole("header", { name: "Two things before you publish" }),
    ).toBeVisible();
    expect(screen.getByText("Make, model and colour")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add a car" })).toBeVisible();
    expect(screen.getByText("One tick, no upload")).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm your licence" })).toBeVisible();
    expect(screen.queryByText("Profile photo")).toBeNull();
    expect(screen.queryByRole("header", { name: "Before you publish" })).toBeNull();
    const publish = screen.getByRole("button", { name: "Publish trip" });
    expect(publish).toBeDisabled();
    expect(
      screen.getByText(
        "Add your car and confirm your licence to publish. Your trip is saved as a draft until then.",
      ),
    ).toBeVisible();
    await fireEvent.press(publish);
    expect(client.calls.some((call) => call.path === "/v1/trips/{id}/publish")).toBe(false);

    await fireEvent.press(screen.getByRole("button", { name: "Add a car" }));
    expect(await screen.findByRole("header", { name: "Add a car" })).toBeVisible();
  });

  it("names the one thing left before publishing", async () => {
    const draft = plannedDraft();
    const { client } = await open(`/drive/trips/${draft.id}/review`, [draft]);
    client.answer("/v1/me/driver-readiness", () =>
      ok(200, {
        ready: false,
        items: [
          { item: "photo", done: false, blocking: false },
          { item: "car", done: true, blocking: true },
          { item: "licence", done: false, blocking: true },
        ],
        licenceDeclaredAt: null,
      }),
    );
    await fireEvent.press(await screen.findByRole("link", { name: "Edit: Route" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    expect(
      await screen.findByRole("header", { name: "One thing before you publish" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add a car" })).toBeNull();
    expect(
      screen.getByText(
        "Confirm your licence to publish. Your trip is saved as a draft until then.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Confirm your licence" }));
    expect(await screen.findByRole("header", { name: "Your driving licence" })).toBeVisible();
  });

  it("asks for a profile photo while photos are on, and comes back once one is added (spec 16, 3.6, item 5)", async () => {
    const draft = plannedDraft();
    const { client } = await open(`/drive/trips/${draft.id}/review`, [draft]);
    let hasPhoto = false;
    client.answer("/v1/me/driver-readiness", () =>
      ok(200, {
        ready: hasPhoto,
        items: [
          { item: "photo", done: hasPhoto, blocking: true },
          { item: "car", done: true, blocking: true },
          { item: "licence", done: true, blocking: true },
        ],
        licenceDeclaredAt: "2026-11-14T12:00:00.000Z",
      }),
    );
    await fireEvent.press(await screen.findByRole("link", { name: "Edit: Route" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    expect(
      await screen.findByRole("header", { name: "One thing before you publish" }),
    ).toBeVisible();
    expect(screen.getByText("Profile photo")).toBeVisible();
    expect(screen.getByText("So passengers know who to look for")).toBeVisible();
    expect(screen.getByRole("button", { name: "Publish trip" })).toBeDisabled();
    expect(
      screen.getByText(
        "Add a profile photo to publish. Your trip is saved as a draft until then.",
      ),
    ).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Add a photo" }));
    expect(await screen.findByRole("header", { name: "Your profile photo" })).toBeVisible();
    resetManipulator();
    photoPickedIs({ uri: "file:///picked.jpg", width: 800, height: 800 });
    photoSizeIs("file:///picked.jpg", { width: 800, height: 800 });
    const url = "https://photos.test/profile-photos/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg";
    client.answer(
      "/v1/me/photo",
      () => {
        hasPhoto = true;
        return ok(200, { ...completeMe, photo: { url, hidden: false } });
      },
      "put",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Add a photo" }));
    expect(await screen.findByRole("button", { name: "Publish trip" })).toBeEnabled();
    expect(screen.queryByRole("header", { name: /before you publish$/ })).toBeNull();
  });

  it("names all three when the photo, the car and the licence are missing", async () => {
    const draft = plannedDraft({ vehicleId: null });
    const { client } = await open(`/drive/trips/${draft.id}/review`, [draft]);
    client.answer("/v1/me/vehicles", () => ok(200, { vehicles: [] }));
    client.answer("/v1/me/driver-readiness", () =>
      ok(200, {
        ready: false,
        items: [
          { item: "photo", done: false, blocking: true },
          { item: "car", done: false, blocking: true },
          { item: "licence", done: false, blocking: true },
        ],
        licenceDeclaredAt: null,
      }),
    );
    await fireEvent.press(await screen.findByRole("link", { name: "Edit: Route" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    expect(
      await screen.findByRole("header", { name: "Three things before you publish" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Add a photo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add a car" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm your licence" })).toBeVisible();
    expect(
      screen.getByText(
        "Add a profile photo and your car, and confirm your licence to publish. Your trip is saved as a draft until then.",
      ),
    ).toBeVisible();
  });

  it("has nothing in the way once the car and licence are done", async () => {
    await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    expect(await screen.findByRole("button", { name: "Publish trip" })).toBeEnabled();
    expect(screen.queryByRole("header", { name: /before you publish$/ })).toBeNull();
    expect(
      screen.queryByText(/to publish\. Your trip is saved as a draft until then\.$/),
    ).toBeNull();
  });

  it("gives a draft started before the first car that car on publishing", async () => {
    const draft = plannedDraft({ vehicleId: null });
    const { client, api } = await open(`/drive/trips/${draft.id}/review`, [draft]);
    expect(await screen.findByText("Toyota Yaris, white")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Publish trip" }));
    expect(await screen.findByRole("header", { name: "Your trip is published" })).toBeVisible();
    expect(bodiesOf(client, "/v1/trips/{id}")).toEqual([{ vehicleId: yaris.id }]);
    expect(api.trips()[0]).toMatchObject({ status: "published", vehicleId: yaris.id });
  });

  it("never saves an old copy of a step over a change made from the review", async () => {
    const draft = plannedDraft();
    const { api } = await open(`/drive/trips/${draft.id}/seats`, [draft]);
    await fireEvent.press(await screen.findByRole("button", { name: "Review your trip" }));
    await fireEvent.press(await screen.findByRole("link", { name: "Edit: Price" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Raise the price" }));
    expect(await screen.findByText("3,400 ISK")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("110% · the whole route 3,400 ISK")).toBeVisible();
    // Back from the review is the seats step the driver came through.
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("header", { name: "Seats and preferences" })).toBeVisible();
    await fireEvent.press(await screen.findByRole("button", { name: "Review your trip" }));
    expect(await screen.findByText("110% · the whole route 3,400 ISK")).toBeVisible();
    expect(api.trips()[0]?.priceLevel).toBe(110);
  });

  it("leaves the posting steps behind once the trip is published", async () => {
    const draft = plannedDraft();
    await open(`/drive/trips/${draft.id}/seats`, [draft]);
    await fireEvent.press(await screen.findByRole("button", { name: "Review your trip" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Publish trip" }));
    await fireEvent.press(await screen.findByRole("button", { name: "See my trips" }));
    expect(await screen.findByRole("header", { name: "My trips" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(screen).toHavePathname("/offer");
  });

  it("clears what to fix once the driver changes the trip", async () => {
    const { api } = await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    api.refuse([{ path: "plannedTimes", issue: "departure_too_soon" }]);
    await fireEvent.press(await screen.findByRole("button", { name: "Publish trip" }));
    expect(await screen.findByTestId("publish-problems")).toBeVisible();
    await fireEvent.press(screen.getByRole("link", { name: "Edit: Date and times" }));
    await chooseTime("Leaving BSÍ bus terminal at", "10:00");
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("10:00  BSÍ bus terminal")).toBeVisible();
    expect(screen.queryByTestId("publish-problems")).toBeNull();
  });

  it("opens a step from the review and comes back to it", async () => {
    await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    await fireEvent.press(await screen.findByRole("link", { name: "Edit: Seats and booking" }));
    await fireEvent.press(await screen.findByRole("button", { name: "One seat fewer" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("2 seats")).toBeVisible();
    expect(screen.getByRole("header", { name: "Check and publish" })).toBeVisible();
  });

  it("deletes a draft after asking", async () => {
    const { api } = await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    await fireEvent.press(await screen.findByRole("button", { name: "Delete draft" }));
    expect(screen.getByText("Delete this draft? You can't undo this.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Delete draft" }));
    expect(await screen.findByText("You have no trips yet.")).toBeVisible();
    expect(api.trips()).toEqual([]);
  });
});

describe("My trips (spec 3, 3.8.4)", () => {
  it("lists drafts, which open where the driver left off, then published trips", async () => {
    const unplanned = plannedDraft({
      id: "0190a1d6-0000-7000-8000-000000000202",
      stops: plannedDraft().stops.map((stop) => ({ ...stop, plannedAt: null })),
      departsAt: null,
      arrivesAt: null,
    });
    const published = plannedDraft({
      id: "0190a1d6-0000-7000-8000-000000000203",
      status: "published",
      publishedAt: "2026-11-14T11:00:00.000Z",
    });
    await open("/drive/trips", [unplanned, published]);
    expect(await screen.findByRole("header", { name: "Drafts" })).toBeVisible();
    expect(screen.getByRole("header", { name: "Published" })).toBeVisible();
    expect(screen.getByText("Sunday 15 November at 09:00", { exact: false })).toBeVisible();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "BSÍ bus terminal → Hof, Akureyri, Not published yet, 3 seats",
      }),
    );
    expect(await screen.findByRole("header", { name: "When are you leaving?" })).toBeVisible();
  });

  it("keeps a trip under way with the published ones until its last stop (spec 8, R8.1)", async () => {
    const underWay = plannedDraft({
      id: "0190a1d6-0000-7000-8000-000000000204",
      status: "departed",
      publishedAt: "2026-11-14T11:00:00.000Z",
    });
    await open("/drive/trips", [underWay]);
    expect(await screen.findByRole("header", { name: "Published" })).toBeVisible();
    expect(screen.getByText("Sunday 15 November at 09:00", { exact: false })).toBeVisible();
  });

  it("starts a trip from Post a trip", async () => {
    await open("/drive/trips");
    await fireEvent.press(await screen.findByRole("button", { name: "Post a trip" }));
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
  });
});

describe("Offer opens the form (spec 16, 3.6)", () => {
  const newestId = "0190a1d6-0000-7000-8000-000000000302";
  /** A draft with no times yet, changed after the planned one. */
  const unplanned = () =>
    plannedDraft({
      id: newestId,
      stops: plannedDraft().stops.map((stop) => ({ ...stop, plannedAt: null })),
      departsAt: null,
      arrivesAt: null,
      updatedAt: "2026-11-14T11:00:00.000Z",
    });
  const planned = () =>
    plannedDraft({
      id: "0190a1d6-0000-7000-8000-000000000301",
      updatedAt: "2026-11-14T10:00:00.000Z",
    });
  const continueDraft = "Continue your draft: BSÍ bus terminal → Hof, Akureyri";

  it("opens Where are you driving? straight away, with no Back on a place of the menu", async () => {
    await open("/offer");
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen.getByText("Step 1 of 5")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Continue your draft/ })).toBeNull();
    expect(screen.queryByRole("header", { name: "Before you publish" })).toBeNull();
  });

  it("opens the form even when the drafts do not load", async () => {
    const { client } = await open("/offer", [planned()]);
    expect(await screen.findByRole("button", { name: continueDraft })).toBeVisible();
    client.answer("/v1/me/trips", () => failure(503, "server_error"));
    await fireEvent.press(screen.getByRole("tab", { name: "Find" }));
    await fireEvent.press(await screen.findByRole("tab", { name: "Offer" }));
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "From: Choose a meeting point" })).toBeVisible();
    expect(screen.queryByRole("button", { name: continueDraft })).toBeNull();
  });

  it("continues the newest draft at the step where it was left", async () => {
    // The API lists the older one first; the newest still comes on top.
    await open("/offer", [planned(), unplanned()]);
    await fireEvent.press(await screen.findByRole("button", { name: continueDraft }));
    expect(await screen.findByRole("header", { name: "When are you leaving?" })).toBeVisible();
    expect(screen).toHavePathname(`/drive/trips/${newestId}/time`);
  });

  it("opens a draft with its times at the review, and has no list for one draft", async () => {
    await open("/offer", [planned()]);
    await fireEvent.press(await screen.findByRole("button", { name: continueDraft }));
    expect(await screen.findByRole("header", { name: "Check and publish" })).toBeVisible();
    expect(screen).toHavePathname("/drive/trips/0190a1d6-0000-7000-8000-000000000301/review");
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "See all drafts" })).toBeNull();
  });

  it("lists every draft from See all drafts", async () => {
    await open("/offer", [planned(), unplanned()]);
    await fireEvent.press(await screen.findByRole("link", { name: "See all drafts" }));
    expect(await screen.findByRole("header", { name: "Drafts" })).toBeVisible();
    expect(screen).toHavePathname("/drive/trips");
  });

  it("starts a new draft, and the form is empty again back on Offer", async () => {
    const { client } = await open("/offer");
    await choosePoint("From", "bs", "BSÍ bus terminal");
    await choosePoint("To", "hof", "Hof, Akureyri");
    expect(await screen.findByText(/ km · about /)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Choose date and time" }));
    expect(await screen.findByRole("header", { name: "When are you leaving?" })).toBeVisible();
    const [created] = bodiesOf(client, "/v1/trips");
    expect(created).toEqual({ stops: [bsi.id, borgarnes.id, blonduos.id, hof.id] });
    expect(screen).toHavePathname("/drive/trips/0190a1d6-0000-7000-8000-000000000100/time");

    // Back finds the new draft's own route, as saved, then Offer.
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen).toHavePathname("/drive/trips/0190a1d6-0000-7000-8000-000000000100/route");
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("button", { name: continueDraft })).toBeVisible();
    expect(screen).toHavePathname("/offer");
    expect(screen.getByRole("button", { name: "From: Choose a meeting point" })).toBeVisible();
  });
});

describe("Posting a trip on a laptop (spec 18, 3.13)", () => {
  const phone = { width: 750, height: 1334, scale: 2, fontScale: 2 };
  const laptop = { width: 1280, height: 800, scale: 1, fontScale: 1 };
  const map = "Your route on a map of Iceland: BSÍ bus terminal → Hof, Akureyri.";

  beforeEach(() => {
    Dimensions.set({ window: laptop });
  });

  afterEach(async () => {
    // The screen is still on show here, so its update goes through act.
    await act(() => {
      Dimensions.set({ window: phone });
    });
  });

  /** The step on show: the steps before it stay under it. */
  const onShow = (testID: string) => {
    const found = screen.getAllByTestId(testID).at(-1);
    if (found === undefined) throw new Error(`No ${testID} on screen.`);
    return found;
  };
  const main = () => within(onShow("columns-main"));
  const side = () => within(onShow("columns-side"));
  const soFar = () => within(onShow("trip-so-far"));

  /** The test IDs, spoken labels and texts on screen, in reading order. */
  function marksInOrder(): string[] {
    const marks: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === "string") marks.push(node);
      else if (Array.isArray(node)) node.forEach(walk);
      else if (typeof node === "object" && node !== null) {
        if ("props" in node && typeof node.props === "object" && node.props !== null) {
          const props = node.props as { testID?: unknown; accessibilityLabel?: unknown };
          if (typeof props.testID === "string") marks.push(props.testID);
          if (typeof props.accessibilityLabel === "string") marks.push(props.accessibilityLabel);
        }
        if ("children" in node) walk(node.children);
      }
    };
    walk(screen.toJSON());
    return marks;
  }

  /** A draft with a route and nothing else chosen yet. */
  const unplanned = () =>
    plannedDraft({
      stops: plannedDraft().stops.map((stop) => ({ ...stop, plannedAt: null })),
      departsAt: null,
      arrivesAt: null,
    });

  it("puts the step in the main column, with the trip so far and the button beside it", async () => {
    await open("/drive/trips/new");
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    expect(main().getByRole("button", { name: "Back" })).toBeVisible();
    expect(main().getByText("Step 1 of 5")).toBeVisible();
    expect(main().getByRole("header", { name: "Where are you driving?" })).not.toHaveStyle({
      textAlign: "center",
    });
    expect(main().getByRole("button", { name: "From: Choose a meeting point" })).toBeVisible();

    expect(soFar().getByRole("header", { name: "Your trip so far" })).toBeVisible();
    expect(soFar().getByLabelText("Route: Step 1")).toBeVisible();
    expect(soFar().getByLabelText("Date and times: Step 2")).toBeVisible();
    expect(soFar().getByLabelText("Price: Step 3")).toBeVisible();
    expect(soFar().getByLabelText("Seats and booking: Step 4")).toBeVisible();
    expect(side().getByRole("button", { name: "Choose date and time" })).toBeVisible();

    // The side column takes the bottom bar's place, and each thing is there once.
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Choose date and time" })).toHaveLength(1);
    expect(screen.queryByRole("image", { name: map })).toBeNull();
  });

  it("shows the route as it is chosen, with its map under the button", async () => {
    await open("/drive/trips/new");
    await choosePoint("From", "bs", "BSÍ bus terminal");
    await choosePoint("To", "hof", "Hof, Akureyri");
    const blonduosSwitch = await main().findByRole("switch", { name: "Blönduós" });
    expect(
      soFar().getByLabelText("Route: BSÍ bus terminal to Hof, Akureyri, 2 stops on the way"),
    ).toBeVisible();
    // Shown with an arrow, read out as "to".
    expect(soFar().getByText("BSÍ bus terminal → Hof, Akureyri")).toBeVisible();
    expect(side().getByRole("image", { name: map })).toBeVisible();
    expect(screen.getAllByRole("image", { name: map })).toHaveLength(1);
    // The button keeps its place when the map comes: the map goes under it.
    const marks = marksInOrder();
    expect(marks.indexOf("trip-so-far")).toBeLessThan(marks.indexOf("Choose date and time"));
    expect(marks.indexOf("Choose date and time")).toBeLessThan(marks.indexOf(map));

    await fireEvent.press(blonduosSwitch);
    expect(
      soFar().getByLabelText("Route: BSÍ bus terminal to Hof, Akureyri, 1 stop on the way"),
    ).toBeVisible();
    expect(await main().findByText("200 km · about 2 h")).toBeVisible();
    expect(soFar().getByLabelText("Date and times: Step 2")).toBeVisible();
    // With no stop on the way, the ends alone.
    await fireEvent.press(main().getByRole("switch", { name: "Borgarnes" }));
    expect(soFar().getByLabelText("Route: BSÍ bus terminal to Hof, Akureyri")).toBeVisible();
  });

  it("keeps what is typed and switched off when the window turns narrow and wide again", async () => {
    await open("/drive/trips/new");
    await choosePoint("From", "bs", "BSÍ bus terminal");
    await choosePoint("To", "hof", "Hof, Akureyri");
    await fireEvent.press(await screen.findByRole("switch", { name: "Blönduós" }));
    // A search under To, still open.
    await fireEvent.press(screen.getByRole("button", { name: /^To: / }));
    await fireEvent.changeText(await screen.findByLabelText("To"), "bor");

    await act(() => {
      Dimensions.set({ window: phone });
    });
    expect(screen.queryByTestId("columns-side")).toBeNull();
    expect(screen.queryByTestId("trip-so-far")).toBeNull();
    expect(screen.getByLabelText("To")).toHaveDisplayValue("bor");
    expect(screen.getByRole("switch", { name: "Blönduós" })).not.toBeChecked();
    expect(
      within(screen.getByTestId("bottom-bar")).getByRole("button", {
        name: "Choose date and time",
      }),
    ).toBeVisible();
    expect(screen.getAllByRole("image", { name: map })).toHaveLength(1);

    await act(() => {
      Dimensions.set({ window: laptop });
    });
    expect(main().getByLabelText("To")).toHaveDisplayValue("bor");
    expect(main().getByRole("switch", { name: "Blönduós" })).not.toBeChecked();
    expect(side().getByRole("button", { name: "Choose date and time" })).toBeVisible();
    expect(side().getByRole("image", { name: map })).toBeVisible();
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
  });

  it("shows the day and times as they are chosen", async () => {
    const draft = unplanned();
    await open(`/drive/trips/${draft.id}/time`, [draft]);
    expect(await soFar().findByLabelText("Date and times: Step 2")).toBeVisible();
    expect(
      soFar().getByLabelText("Route: BSÍ bus terminal to Hof, Akureyri, 1 stop on the way"),
    ).toBeVisible();
    await fireEvent.press(main().getByRole("radio", { name: "Sunday 15 November" }));
    await chooseTime("Leaving BSÍ bus terminal at", "09:00");
    expect(
      soFar().getByLabelText("Date and times: Sunday 15 November, 09:00 to 11:00"),
    ).toBeVisible();
    expect(soFar().getByLabelText("Price: Step 3")).toBeVisible();
    expect(soFar().getByLabelText("Seats and booking: Step 4")).toBeVisible();
    expect(side().getByRole("button", { name: "Set your price" })).toBeVisible();
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
  });

  it("shows what earlier steps set, and the price and seats as they are chosen", async () => {
    const draft = plannedDraft();
    await open(`/drive/trips/${draft.id}/price`, [draft]);
    expect(await main().findByText("3,000 ISK")).toBeVisible();
    expect(
      soFar().getByLabelText("Route: BSÍ bus terminal to Hof, Akureyri, 1 stop on the way"),
    ).toBeVisible();
    expect(
      soFar().getByLabelText("Date and times: Sunday 15 November, 09:00 to 11:00"),
    ).toBeVisible();
    expect(soFar().getByLabelText("Price: 100% · the whole route 3,000 ISK")).toBeVisible();
    expect(soFar().getByLabelText("Seats and booking: Step 4")).toBeVisible();
    expect(screen.queryByTestId("bottom-bar")).toBeNull();

    await fireEvent.press(main().getByRole("button", { name: "Raise the price" }));
    expect(await soFar().findByLabelText("Price: 110% · the whole route 3,400 ISK")).toBeVisible();
    await fireEvent.press(side().getByRole("button", { name: "Choose seats" }));
    expect(await screen.findByRole("header", { name: "Seats and preferences" })).toBeVisible();
    expect(await soFar().findByLabelText("Price: 110% · the whole route 3,400 ISK")).toBeVisible();
    expect(
      soFar().getByLabelText("Seats and booking: 3 seats, I approve each passenger"),
    ).toBeVisible();
    await fireEvent.press(main().getByRole("button", { name: "One seat more" }));
    await fireEvent.press(main().getByRole("radio", { name: /^Instant booking/ }));
    expect(soFar().getByLabelText("Seats and booking: 4 seats, Instant booking")).toBeVisible();
    expect(side().getByRole("button", { name: "Review your trip" })).toBeVisible();
  });

  it("shows everything the trip has when a step is opened from the review", async () => {
    await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    await fireEvent.press(await screen.findByRole("link", { name: "Edit: Route" }));
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(
      soFar().getByLabelText("Route: BSÍ bus terminal to Hof, Akureyri, 1 stop on the way"),
    ).toBeVisible();
    expect(
      soFar().getByLabelText("Date and times: Sunday 15 November, 09:00 to 11:00"),
    ).toBeVisible();
    expect(await soFar().findByLabelText("Price: 100% · the whole route 3,000 ISK")).toBeVisible();
    expect(
      soFar().getByLabelText("Seats and booking: 3 seats, I approve each passenger"),
    ).toBeVisible();
    expect(soFar().getByText("09:00 → 11:00")).toBeVisible();
    expect(side().getByRole("button", { name: "Save changes" })).toBeVisible();
  });

  it("names the times' step again while the route is not the saved one", async () => {
    await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    await fireEvent.press(await screen.findByRole("link", { name: "Edit: Route" }));
    expect(
      await soFar().findByLabelText("Date and times: Sunday 15 November, 09:00 to 11:00"),
    ).toBeVisible();
    // The saved times are the saved route's: with other stops they are counted anew.
    await fireEvent.press(main().getByRole("switch", { name: "Borgarnes" }));
    expect(soFar().getByLabelText("Route: BSÍ bus terminal to Hof, Akureyri")).toBeVisible();
    expect(soFar().getByLabelText("Date and times: Step 2")).toBeVisible();
    expect(soFar().queryByText("09:00 → 11:00")).toBeNull();
    // Back on the saved route, they are its times again.
    await fireEvent.press(main().getByRole("switch", { name: "Borgarnes" }));
    expect(
      soFar().getByLabelText("Date and times: Sunday 15 November, 09:00 to 11:00"),
    ).toBeVisible();
  });

  it("has Publish and what it waits for beside the summary, with no trip so far", async () => {
    const draft = plannedDraft();
    await renderApp(`/drive/trips/${draft.id}/review`, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [draft]);
        client.answer("/v1/me/driver-readiness", () =>
          ok(200, {
            ready: false,
            items: [
              { item: "photo", done: false, blocking: false },
              { item: "car", done: true, blocking: true },
              { item: "licence", done: false, blocking: true },
            ],
            licenceDeclaredAt: null,
          }),
        );
      },
    });
    expect(
      await main().findByRole("header", { name: "One thing before you publish" }),
    ).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    expect(main().getByText("Step 5 of 5")).toBeVisible();
    expect(main().getByRole("link", { name: "Edit: Route" })).toBeVisible();
    expect(main().getByRole("button", { name: "Delete draft" })).toBeVisible();
    expect(side().getByRole("button", { name: "Publish trip" })).toBeDisabled();
    expect(
      side().getByText(
        "Confirm your licence to publish. Your trip is saved as a draft until then.",
      ),
    ).toBeVisible();
    // The review is the trip so far.
    expect(screen.queryByTestId("trip-so-far")).toBeNull();
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
  });

  it("keeps the draft to continue above the form on Offer", async () => {
    await open("/offer", [plannedDraft()]);
    expect(
      await main().findByRole("button", {
        name: "Continue your draft: BSÍ bus terminal → Hof, Akureyri",
      }),
    ).toBeVisible();
    expect(main().getByText("Step 1 of 5")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(soFar().getByLabelText("Route: Step 1")).toBeVisible();
    expect(side().getByRole("button", { name: "Choose date and time" })).toBeVisible();
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
  });

  it("is a page from the start, also when the draft cannot be loaded", async () => {
    await open("/drive/trips/0190a1d6-0000-7000-8000-000000000999/price");
    expect(await main().findByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    expect(main().getByRole("button", { name: "Back" })).toBeVisible();
    expect(main().getByText("Step 3 of 5")).toBeVisible();
    expect(screen.queryByTestId("trip-so-far")).toBeNull();
  });

  it("leaves a phone as it was: one column, the map under the ends, the button in the bottom bar", async () => {
    Dimensions.set({ window: phone });
    await open("/drive/trips/new");
    await choosePoint("From", "bs", "BSÍ bus terminal");
    await choosePoint("To", "hof", "Hof, Akureyri");
    expect(await screen.findByRole("switch", { name: "Blönduós" })).toBeChecked();
    expect(screen.queryByTestId("page")).toBeNull();
    expect(screen.queryByTestId("columns-side")).toBeNull();
    expect(screen.queryByTestId("trip-so-far")).toBeNull();
    expect(screen.getByRole("header", { name: "Where are you driving?" })).toHaveStyle({
      textAlign: "center",
    });
    expect(
      within(screen.getByTestId("bottom-bar")).getByRole("button", {
        name: "Choose date and time",
      }),
    ).toBeVisible();
    const marks = marksInOrder();
    expect(marks.indexOf("From: BSÍ bus terminal")).toBeLessThan(marks.indexOf(map));
    expect(marks.indexOf(map)).toBeLessThan(marks.indexOf("Stops on the way"));
  });
});
