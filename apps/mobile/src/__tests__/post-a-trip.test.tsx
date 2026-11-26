import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { AccessibilityInfo, Dimensions } from "react-native";
import { shareLink } from "@/lib/share";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { filledButtons } from "@/testing/buttons";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { photoSizeIs, resetManipulator } from "@/testing/image-manipulator";
import { photoPickedIs } from "@/testing/image-picker";
import { bsi, fitjar, hof, kef, thorlakshofn } from "@/testing/meeting-points";
import { colors } from "@/theme/tokens";
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
jest.mock("@/lib/share", () => ({
  shareLink: jest.fn(() => Promise.resolve("copied")),
  canShareWindow: () => true,
  canCopy: () => true,
  copyText: jest.fn(() => Promise.resolve("copied")),
  // As in the apps: no story picture to share (spec 28, 3.5).
  pictureSharing: () => "none",
}));

const mockedShare = shareLink as jest.Mock;

async function open(url: string, start: Parameters<typeof tripsApi>[1] = []) {
  let api: ReturnType<typeof tripsApi> | undefined;
  const app = await renderApp(url, {
    me: completeMe,
    setUp: (client) => {
      api = tripsApi(client, start);
      // My rides, where a published ride is listed, loads my bookings too.
      client.answer("/v1/me/bookings", () => ok(200, { bookings: [] }));
      // A ride's own page, which its ticket opens, lists its passengers.
      client.answer("/v1/me/trips/{id}/bookings", () => ok(200, { bookings: [] }));
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

/**
 * Those of `wanted` that are on screen, in reading order; a label that is
 * also the text shown, as a row's is, counts once.
 */
const marksOf = (wanted: readonly string[]) =>
  marksInOrder()
    .filter((mark) => wanted.includes(mark))
    .filter((mark, index, marks) => mark !== marks[index - 1]);

/** The rows of "Check and publish" on show, by what a screen reader hears. */
const changeRows = () =>
  screen
    .getAllByRole("link", { name: /, Change$/ })
    .map((row) => row.props.accessibilityLabel as string);

/** The row of "Check and publish" that opens a part's step. */
const changeRow = (part: string) => screen.findByRole("link", { name: new RegExp(`^${part}, `) });

describe("Posting a trip (spec 3)", () => {
  it("goes from the route to a published trip", async () => {
    const { client, api } = await open("/drive/trips/new");
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    // The road stands where "Step 1 of 5" and its bars stood (spec 31, 3.11).
    expect(screen.getByRole("image", { name: "Step 1 of 5: Route" })).toBeVisible();
    expect(screen.queryByText("Step 1 of 5")).toBeNull();
    expect(filledButtons()).toBe(1);

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
    expect(screen.getByRole("image", { name: "Step 2 of 5: Time" })).toBeVisible();
    expect(bodiesOf(client, "/v1/trips")).toEqual([{ stops: [bsi.id, borgarnes.id, hof.id] }]);

    await fireEvent.press(screen.getByRole("radio", { name: "Sunday 15 November" }));
    await chooseTime("Leaving BSÍ bus terminal at", "09:00");
    expect(screen.getByRole("header", { name: "Times at the 2 stops" })).toBeVisible();
    expect(screen.getByText("10:00  Borgarnes")).toBeVisible();
    expect(screen.getByText("11:00  Hof, Akureyri")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Choose seats" }));
    expect(await screen.findByRole("header", { name: "Seats and preferences" })).toBeVisible();
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

    // The seats come before the price, which depends on them (spec 3, 3.6).
    expect(screen.getByRole("image", { name: "Step 3 of 5: Seats" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    expect(screen.getByTestId("stepper-value")).toHaveTextContent("4");
    await fireEvent.press(screen.getByRole("radio", { name: /^Instant booking/ }));
    await fireEvent.press(screen.getByRole("radio", { name: "Pets welcome" }));
    await fireEvent.changeText(
      screen.getByLabelText("Note to passengers (optional)"),
      "Room for skis on the roof.",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Set your price" }));
    expect(await screen.findByRole("header", { name: "Set your price" })).toBeVisible();
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

    // The price step works its limit out for the seats just chosen.
    expect(screen.getByRole("image", { name: "Step 4 of 5: Price" })).toBeVisible();
    expect(await screen.findByText("3,000 ISK")).toBeVisible();
    expect(bodiesOf(client, "/v1/routes/quote").at(-1)).toMatchObject({ seats: 4 });
    expect(screen.getByText("Suggested price")).toBeVisible();
    expect(screen.getByLabelText("BSÍ bus terminal to Borgarnes, 1,500 ISK")).toBeVisible();
    // Why there is a limit, and that it is for the whole trip (spec 17, section 9).
    expect(
      screen.getByText(
        "The limit is for the whole ride, so what passengers have already booked counts towards it.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Raise the price" }));
    expect(await screen.findByText("3,400 ISK")).toBeVisible();
    expect(screen.queryByText("Suggested price")).toBeNull();
    expect(screen.getByTestId("price-level-value")).toHaveTextContent("110%");
    await fireEvent.press(screen.getByRole("button", { name: "Check your ride" }));
    expect(await screen.findByRole("header", { name: "Check and publish" })).toBeVisible();
    expect(bodiesOf(client, "/v1/trips/{id}").at(-1)).toEqual({ priceLevel: 110 });

    expect(screen.getByRole("image", { name: "Step 5 of 5: Check" })).toBeVisible();
    expect(screen.getByText("This is how people will see your ride.")).toBeVisible();
    // The ride as its ticket in the results (spec 31, 3.11, item 3).
    const preview = within(await screen.findByTestId("preview-ticket"));
    expect(preview.getByText("Sun 15 Nov")).toBeVisible();
    expect(preview.getByText("Book instantly")).toBeVisible();
    expect(preview.getByText("09:00")).toBeVisible();
    expect(preview.getByText("BSÍ bus terminal")).toBeVisible();
    expect(preview.getByText("2 h, 1 stop")).toBeVisible();
    expect(preview.getByText("11:00")).toBeVisible();
    expect(preview.getByText("Hof, Akureyri")).toBeVisible();
    expect(await preview.findByText("3,400 ISK")).toBeVisible();
    expect(preview.getByText("the whole way")).toBeVisible();
    expect(preview.getByText("4 seats left")).toBeVisible();
    // Every part in one card of rows, each with what is set and Change.
    expect(changeRows()).toEqual([
      "Route, BSÍ bus terminal to Hof, Akureyri, with 1 stop on the way, Change",
      "Time, Sunday 15 November, 09:00 to 11:00, Change",
      "Price, 3,400 ISK the whole way, Change",
      "Seats and booking, 4 seats, Instant booking, Change",
      "Car, Toyota Yaris, white, Change",
      "Preferences and note, Some chat, one suitcase, pets welcome, no smoking, no child seat, Room for skis on the roof., Change",
    ]);
    expect(filledButtons()).toBe(1);
    await fireEvent.press(screen.getByRole("button", { name: "Publish ride" }));
    expect(await screen.findByRole("header", { name: "Your ride is published" })).toBeVisible();
    expect(screen).toHavePathname(`/drive/trips/${id}/published`);
    expect(screen.getByText("People can now find it and book a seat.")).toBeVisible();
    // The ride as the ticket it is in My rides (spec 31, 3.19).
    expect(
      screen.getByRole("button", {
        name: /^You drive, Sunday 15 November, Leaves BSÍ bus terminal at 09:00, arrives at Hof, Akureyri at 11:00, /,
      }),
    ).toBeVisible();
    expect(filledButtons()).toBe(1);

    // The driver shares the trip's page (spec 28, 3.2), or sees it as passengers do.
    expect(screen.getByRole("header", { name: "Share this ride" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Share" }));
    expect(mockedShare).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^http://localhost:3000/trips/${id}\\?from=0&to=\\d$`)),
      expect.stringMatching(/^Offering a ride: BSÍ bus terminal → Hof, Akureyri\n/),
      "BSÍ bus terminal → Hof, Akureyri on PuffinRide",
    );
    expect(await screen.findByText("Link copied. Paste it wherever you like.")).toBeVisible();
    expect(screen.getByRole("link", { name: "See your ride" })).toBeVisible();
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

  it("keeps Choose date and time busy until the stops on the way are known", async () => {
    const { client } = await open("/drive/trips/new");
    let release: () => void = () => undefined;
    client.answer(
      "/v1/routes/stops-along",
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(ok(200, { meetingPoints: [borgarnes, blonduos] }));
          };
        }),
    );
    await choosePoint("From", "bs", "BSÍ bus terminal");
    await choosePoint("To", "hof", "Hof, Akureyri");
    // A press now would be lost: the route is not known yet.
    expect(screen.getByRole("button", { name: "Choose date and time", busy: true })).toBeVisible();
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(await screen.findByRole("switch", { name: "Blönduós" })).toBeVisible();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Choose date and time", busy: false }),
    );
    expect(await screen.findByRole("header", { name: "When are you leaving?" })).toBeVisible();
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

  it("gives Add a meeting point the head of a step: Back, the title at the left, and no cross", async () => {
    await open("/drive/trips/new");
    await choosePoint("From", "bs", "BSÍ bus terminal");
    await choosePoint("To", "hof", "Hof, Akureyri");
    await screen.findByRole("switch", { name: "Borgarnes" });
    await fireEvent.press(screen.getByRole("button", { name: "Add a meeting point" }));
    const title = await screen.findByRole("header", { name: "Add a meeting point" });
    expect(title).not.toHaveStyle({ textAlign: "center" });
    expect(within(screen.getByTestId("screen-head")).getByRole("button", { name: "Back" })).toBe(
      screen.getByRole("button", { name: "Back" }),
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    // Back closes the picker: the step is there again, with the route as it was.
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Add a meeting point" })).toBeNull();
    expect(screen.getByRole("button", { name: /^From: BSÍ bus terminal/ })).toBeVisible();
    expect(screen.getByRole("switch", { name: "Borgarnes" })).toBeVisible();
  });

  it("says what meeting points are for until both ends are chosen", async () => {
    await open("/drive/trips/new");
    await screen.findByRole("header", { name: "Where are you driving?" });
    const hint =
      "Start and end at meeting points, so your passengers know where to find you. The meeting points on the way come next.";
    expect(screen.getByText(hint)).toBeVisible();
    // With the puffin by its pin, which screen readers skip.
    expect(screen.getByTestId("puffin-by-pin", { includeHiddenElements: true })).toBeTruthy();
    await choosePoint("From", "bs", "BSÍ bus terminal");
    expect(screen.getByText(hint)).toBeVisible();
    await choosePoint("To", "hof", "Hof, Akureyri");
    await screen.findByRole("switch", { name: "Borgarnes" });
    expect(screen.queryByText(hint)).toBeNull();
    expect(screen.queryByTestId("puffin-by-pin", { includeHiddenElements: true })).toBeNull();
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
    await fireEvent.press(screen.getByRole("button", { name: "Choose seats" }));
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
    await fireEvent.press(screen.getByRole("button", { name: "Choose seats" }));
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
    await fireEvent.press(screen.getByRole("button", { name: "Choose seats" }));
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

  it("starts the departure of another day at 08:00, not at the present time (spec 31, 3.11)", async () => {
    const draft = plannedDraft({
      stops: plannedDraft().stops.map((stop) => ({ ...stop, plannedAt: null })),
      departsAt: null,
      arrivesAt: null,
    });
    await open(`/drive/trips/${draft.id}/time`, [draft]);
    await fireEvent.press(await screen.findByRole("radio", { name: "Sunday 15 November" }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Leaving BSÍ bus terminal at: Choose a time" }),
    );
    expect(screen.getByRole("adjustable", { name: "Hour" })).toHaveAccessibilityValue({
      text: "08",
    });
    expect(timeOf("Leaving BSÍ bus terminal at")).toHaveAccessibleName(
      "Leaving BSÍ bus terminal at: 08:00",
    );
    expect(screen.getByText("09:00  Borgarnes")).toBeVisible();
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
    await fireEvent.press(screen.getByRole("button", { name: "Choose seats" }));
    expect(await screen.findByRole("header", { name: "Seats and preferences" })).toBeVisible();
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
    await fireEvent.press(screen.getByRole("button", { name: "Choose seats" }));
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

  it("quietly keeps a draft's price level within the highest for more seats, before the price step", async () => {
    const draft = plannedDraft({ priceLevel: 150 });
    const { client } = await open(`/drive/trips/${draft.id}/seats`, [draft]);
    await fireEvent.press(await screen.findByRole("button", { name: "One seat more" }));
    expect(await screen.findByTestId("stepper-value")).toHaveTextContent("4");
    // No price was chosen yet on this pass, so there is nothing to tell.
    expect(screen.queryByText(/so we lowered yours to it/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Set your price" }));
    await screen.findByRole("header", { name: "Set your price" });
    expect(bodiesOf(client, "/v1/trips/{id}")).toEqual([
      expect.objectContaining({ seats: 4, priceLevel: 110 }),
    ]);
    expect(await screen.findByTestId("price-level-value")).toHaveTextContent("110%");
  });

  it("tells the driver when more seats, changed from the review, lower the price chosen", async () => {
    const draft = plannedDraft({ priceLevel: 150 });
    const { client } = await open(`/drive/trips/${draft.id}/review`, [draft]);
    await fireEvent.press(await changeRow("Seats and booking"));
    await fireEvent.press(await screen.findByRole("button", { name: "One seat more" }));
    expect(
      await screen.findByText(
        "With 4 seats the highest price level is 110%, so we lowered yours to it.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
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
    await fireEvent.press(screen.getByRole("button", { name: "Set your price" }));
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
    expect(await changeRow("Time")).toHaveAccessibleName(
      "Time, Sunday 15 November at 09:00 to Monday 16 November at 01:00, Change",
    );
  });

  it("lists what to fix when the server refuses to publish", async () => {
    const { api } = await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    api.refuse([
      { path: "plannedTimes", issue: "departure_too_soon" },
      { path: "segments.1", issue: "stretch_too_fast" },
      { path: "stops.1", issue: "stop_unavailable" },
    ]);
    await fireEvent.press(await screen.findByRole("button", { name: "Publish ride" }));
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

  it("asks for what is missing in one card, with the button for the next one, and Publish waits", async () => {
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
    await fireEvent.press(await changeRow("Route"));
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    const card = within(await screen.findByTestId("needs-you-card"));
    expect(card.getByText("Two things before you publish")).toBeVisible();
    // The photo is not asked for while photos are off, so it is not named.
    expect(card.getByText("Your car and your driving licence are left.")).toBeVisible();
    // One button, for the next one; the licence comes after the car.
    expect(
      card.getAllByRole("button").map((button) => button.props.accessibilityLabel as string),
    ).toEqual(["Add a car"]);
    // It stands under the rows, over Delete draft, and is not the main button.
    expect(marksOf(["action-rows", "needs-you-card", "Delete draft"])).toEqual([
      "action-rows",
      "needs-you-card",
      "action-rows",
      "Delete draft",
    ]);
    // Outlined: Publish, which waits, stays the one filled button (R31.1).
    expect(card.queryByTestId("filled-button")).toBeNull();
    expect(filledButtons()).toBe(1);
    const publish = screen.getByRole("button", { name: "Publish ride" });
    expect(publish).toBeDisabled();
    expect(
      screen.getByText(
        "Add your car and confirm your licence to publish. Your ride is saved as a draft until then.",
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
    await fireEvent.press(await changeRow("Route"));
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    const card = within(await screen.findByTestId("needs-you-card"));
    expect(card.getByText("One thing before you publish")).toBeVisible();
    expect(card.getByText("Your car is done. Your driving licence is left.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add a car" })).toBeNull();
    expect(
      screen.getByText(
        "Confirm your licence to publish. Your ride is saved as a draft until then.",
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
    await fireEvent.press(await changeRow("Route"));
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    const card = within(await screen.findByTestId("needs-you-card"));
    expect(card.getByText("One thing before you publish")).toBeVisible();
    expect(
      card.getByText("Car and driving licence are done. Your profile photo is left."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Publish ride" })).toBeDisabled();
    expect(
      screen.getByText("Add a profile photo to publish. Your ride is saved as a draft until then."),
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
    expect(await screen.findByRole("button", { name: "Publish ride" })).toBeEnabled();
    expect(screen.queryByTestId("needs-you-card")).toBeNull();
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
    await fireEvent.press(await changeRow("Route"));
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    const card = within(await screen.findByTestId("needs-you-card"));
    expect(card.getByText("Three things before you publish")).toBeVisible();
    expect(
      card.getByText("Your profile photo, your car and your driving licence are left."),
    ).toBeVisible();
    // The photo is first; the car and the licence get their turn after it.
    expect(
      card.getAllByRole("button").map((button) => button.props.accessibilityLabel as string),
    ).toEqual(["Add a photo"]);
    expect(
      screen.getByText(
        "Add a profile photo and your car, and confirm your licence to publish. Your ride is saved as a draft until then.",
      ),
    ).toBeVisible();
  });

  it("has nothing in the way once the car and licence are done", async () => {
    await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    expect(await screen.findByRole("button", { name: "Publish ride" })).toBeEnabled();
    expect(screen.queryByTestId("needs-you-card")).toBeNull();
    expect(screen.queryByText(/before you publish$/)).toBeNull();
    expect(
      screen.queryByText(/to publish\. Your ride is saved as a draft until then\.$/),
    ).toBeNull();
  });

  it("gives a draft started before the first car that car on publishing", async () => {
    const draft = plannedDraft({ vehicleId: null });
    const { client, api } = await open(`/drive/trips/${draft.id}/review`, [draft]);
    expect(await screen.findByText("Toyota Yaris, white")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Publish ride" }));
    expect(await screen.findByRole("header", { name: "Your ride is published" })).toBeVisible();
    expect(bodiesOf(client, "/v1/trips/{id}")).toEqual([{ vehicleId: yaris.id }]);
    expect(api.trips()[0]).toMatchObject({ status: "published", vehicleId: yaris.id });
  });

  it("never saves an old copy of a step over a change made from the review", async () => {
    const draft = plannedDraft();
    const { api } = await open(`/drive/trips/${draft.id}/price`, [draft]);
    expect(await screen.findByText("3,000 ISK")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Check your ride" }));
    await fireEvent.press(await changeRow("Price"));
    await fireEvent.press(await screen.findByRole("button", { name: "Raise the price" }));
    expect(await screen.findByText("3,400 ISK")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("3,400 ISK the whole way")).toBeVisible();
    // Back from the review is the price step the driver came through, at 100% then.
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("header", { name: "Set your price" })).toBeVisible();
    expect(await screen.findByText("3,400 ISK")).toBeVisible();
    await fireEvent.press(await screen.findByRole("button", { name: "Check your ride" }));
    expect(await screen.findByText("3,400 ISK the whole way")).toBeVisible();
    expect(api.trips()[0]?.priceLevel).toBe(110);
  });

  it("says a ride is published only when it is", async () => {
    // A draft opens where it was left; a cancelled ride opens its own page.
    const draft = plannedDraft();
    await open(`/drive/trips/${draft.id}/published`, [draft]);
    expect(await screen.findByRole("header", { name: "Check and publish" })).toBeVisible();
    expect(screen).toHavePathname(`/drive/trips/${draft.id}/review`);
    expect(screen.queryByRole("header", { name: "Your ride is published" })).toBeNull();
  });

  it("opens a cancelled ride's page in place of Your ride is published", async () => {
    const cancelled = plannedDraft({
      status: "cancelled",
      publishedAt: "2026-11-14T11:00:00.000Z",
    });
    await open(`/drive/trips/${cancelled.id}/published`, [cancelled]);
    await waitFor(() => {
      expect(screen).toHavePathname(`/drive/trips/${cancelled.id}`);
    });
    expect(screen.queryByRole("header", { name: "Your ride is published" })).toBeNull();
  });

  it("leaves the posting steps behind once the trip is published", async () => {
    const draft = plannedDraft();
    await open(`/drive/trips/${draft.id}/price`, [draft]);
    expect(await screen.findByText("3,000 ISK")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Check your ride" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Publish ride" }));
    await fireEvent.press(await screen.findByRole("button", { name: "See my rides" }));
    // My rides, a place of the menu, with the ride just published on it.
    expect(await screen.findByRole("header", { name: "My rides" })).toBeVisible();
    expect(screen).toHavePathname("/my-rides");
    expect(
      await screen.findByRole("button", { name: /^You drive, Sunday 15 November/ }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("clears what to fix once the driver changes the trip", async () => {
    const { api } = await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    api.refuse([{ path: "plannedTimes", issue: "departure_too_soon" }]);
    await fireEvent.press(await screen.findByRole("button", { name: "Publish ride" }));
    expect(await screen.findByTestId("publish-problems")).toBeVisible();
    await fireEvent.press(await changeRow("Time"));
    await chooseTime("Leaving BSÍ bus terminal at", "10:00");
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Sunday 15 November, 10:00 to 12:00")).toBeVisible();
    expect(screen.queryByTestId("publish-problems")).toBeNull();
  });

  it("opens a step from the review and comes back to it", async () => {
    await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    await fireEvent.press(await changeRow("Seats and booking"));
    await fireEvent.press(await screen.findByRole("button", { name: "One seat fewer" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("2 seats")).toBeVisible();
    expect(screen.getByRole("header", { name: "Check and publish" })).toBeVisible();
  });

  it("deletes a draft after asking: a red row, last, as it cannot be undone (R31.3)", async () => {
    const { api } = await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    const row = await screen.findByRole("button", { name: "Delete draft" });
    expect(within(row).getByText("Delete draft")).toHaveStyle({ color: colors.light.error });
    // The last thing on the screen, under the rows that change the ride.
    expect(marksOf(["action-rows", "Delete draft"]).at(-1)).toBe("Delete draft");
    await fireEvent.press(row);
    expect(screen.getByText("Delete this draft? You can't undo this.")).toBeVisible();
    // Asked first: keeping it brings the row back, and nothing was deleted.
    await fireEvent.press(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByText("Delete this draft? You can't undo this.")).toBeNull();
    expect(api.trips()).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Delete draft" }));
    expect(filledButtons()).toBe(1);
    await fireEvent.press(screen.getByRole("button", { name: "Delete draft" }));
    // Offer, with the draft gone from over its form (spec 31, 3.10, item 4).
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen).toHavePathname("/offer");
    expect(screen.queryByRole("header", { name: "Drafts" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(api.trips()).toEqual([]);
  });

  it("leads back to Offer from a step opened by its address", async () => {
    const draft = plannedDraft();
    await open(`/drive/trips/${draft.id}/time`, [draft]);
    expect(await screen.findByRole("header", { name: "When are you leaving?" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen).toHavePathname("/offer");
  });
});

describe("Offer opens the form (spec 16, 3.6; spec 31, 3.11, item 6)", () => {
  const newestId = "0190a1d6-0000-7000-8000-000000000302";
  const plannedId = "0190a1d6-0000-7000-8000-000000000301";
  /** A draft with no times yet, changed after the planned one. */
  const unplanned = () =>
    plannedDraft({
      id: newestId,
      stops: plannedDraft().stops.map((stop) => ({ ...stop, plannedAt: null })),
      departsAt: null,
      arrivesAt: null,
      updatedAt: "2026-11-14T11:00:00.000Z",
    });
  const planned = () => plannedDraft({ id: plannedId, updatedAt: "2026-11-14T10:00:00.000Z" });
  /** A draft's row to a screen reader: what it does, the route and when, or that no time is chosen. */
  const continueRoute = "Continue your draft: BSÍ bus terminal → Hof, Akureyri";
  const continueDraft = `${continueRoute}, No time yet`;
  const continuePlanned = `${continueRoute}, Sunday 15 November at 09:00`;
  /** The view that takes focus around a row (`TakesFocus`): the nearest one above it. */
  const focusTaker = (row: ReturnType<typeof screen.getByRole>) => {
    let above = row.parent;
    while (above !== null && (above.props as { tabIndex?: number }).tabIndex !== -1) {
      above = above.parent;
    }
    return above;
  };
  /** The drafts' rows, in the order they stand. */
  const draftRows = () =>
    within(screen.getByTestId("draft-rows"))
      .getAllByRole("link")
      .map((row) => (row.props as { accessibilityLabel: string }).accessibilityLabel);
  /** Five drafts, each changed a minute after the one before; the last is the newest. */
  const five = () =>
    [1, 2, 3, 4, 5].map((minute) =>
      plannedDraft({
        id: `0190a1d6-0000-7000-8000-00000000040${String(minute)}`,
        // Each leaves an hour later, which tells them apart.
        departsAt: `2026-11-15T${String(9 + minute).padStart(2, "0")}:00:00.000Z`,
        updatedAt: `2026-11-14T10:0${String(minute)}:00.000Z`,
      }),
    );

  it("opens Where are you driving? straight away, with no Back on a place of the menu", async () => {
    await open("/offer");
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen.getByRole("image", { name: "Step 1 of 5: Route" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.queryByRole("header", { name: "Drafts" })).toBeNull();
    expect(screen.queryByTestId("draft-rows")).toBeNull();
    expect(screen.queryByRole("header", { name: "Before you publish" })).toBeNull();
  });

  it("opens the form even when the drafts do not load", async () => {
    const { client } = await open("/offer", [planned()]);
    expect(await screen.findByRole("link", { name: continuePlanned })).toBeVisible();
    client.answer("/v1/me/trips", () => failure(503, "server_error"));
    await fireEvent.press(screen.getByRole("tab", { name: "Find" }));
    await fireEvent.press(await screen.findByRole("tab", { name: "Offer" }));
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "From: Choose a meeting point" })).toBeVisible();
    expect(screen.queryByRole("link", { name: continuePlanned })).toBeNull();
  });

  it("lists the drafts as rows in one card, the one changed last first, with the day once it is chosen", async () => {
    // The API lists the older one first; the newest still comes on top.
    await open("/offer", [planned(), unplanned()]);
    expect(await screen.findByRole("header", { name: "Drafts" })).toBeVisible();
    expect(draftRows()).toEqual([continueDraft, continuePlanned]);
    const rows = within(screen.getByTestId("draft-rows"));
    // What stands in a row: the route, and under it the day and time, or
    // that none is chosen, which tells two drafts of one route apart.
    expect(rows.getAllByText("BSÍ bus terminal → Hof, Akureyri")).toHaveLength(2);
    expect(rows.getByText("Sunday 15 November at 09:00")).toBeVisible();
    expect(rows.getByText("No time yet")).toBeVisible();
    // One card of rows, and nothing else to press in it: two drafts need no "Show all drafts".
    expect(within(screen.getByTestId("draft-rows")).getByTestId("action-rows")).toBeVisible();
    expect(rows.queryByRole("button")).toBeNull();
  });

  it("continues a draft at the step where it was left", async () => {
    await open("/offer", [planned(), unplanned()]);
    await fireEvent.press(await screen.findByRole("link", { name: continueDraft }));
    expect(await screen.findByRole("header", { name: "When are you leaving?" })).toBeVisible();
    expect(screen).toHavePathname(`/drive/trips/${newestId}/time`);
  });

  it("opens a draft with its times at the review, and Back leads to Offer", async () => {
    await open("/offer", [planned()]);
    await fireEvent.press(await screen.findByRole("link", { name: continuePlanned }));
    expect(await screen.findByRole("header", { name: "Check and publish" })).toBeVisible();
    expect(screen).toHavePathname(`/drive/trips/${plannedId}/review`);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Show all drafts" })).toBeNull();
  });

  it("lists rides that are published on My rides only", async () => {
    const published = plannedDraft({
      id: "0190a1d6-0000-7000-8000-000000000303",
      status: "published",
      publishedAt: "2026-11-14T11:00:00.000Z",
    });
    await open("/offer", [published]);
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen.queryByTestId("draft-rows")).toBeNull();
  });

  it("shows three drafts at most, and the others under Show all drafts", async () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    try {
      const { client } = await open("/offer", five());
      expect(await screen.findByRole("header", { name: "Drafts" })).toBeVisible();
      const row = (hour: string) => `${continueRoute}, Sunday 15 November at ${hour}:00`;
      expect(draftRows()).toEqual([row("14"), row("13"), row("12")]);
      const showAll = screen.getByRole("button", { name: "Show all drafts" });
      // The last row of the same card, with a sign of its own as the drafts have.
      const card = within(screen.getByTestId("action-rows"));
      expect(card.getByText("Show all drafts")).toBeVisible();
      expect(card.getAllByTestId("row-icon", { includeHiddenElements: true })).toHaveLength(4);
      // The spy keeps what earlier tests did: count from here.
      focus.mockClear();
      await fireEvent.press(showAll);
      expect(draftRows()).toEqual([row("14"), row("13"), row("12"), row("11"), row("10")]);
      expect(screen.queryByRole("button", { name: "Show all drafts" })).toBeNull();
      // Focus goes to the first of the drafts that came, as the row pressed
      // is gone: the view that takes it holds that draft and no other.
      expect(focus).toHaveBeenCalledTimes(1);
      const fourth = screen.getByRole("link", { name: row("11") });
      const taker = focusTaker(fourth);
      if (taker === null) throw new Error("Nothing takes focus around the fourth draft");
      expect(within(taker).getAllByRole("link")).toEqual([fourth]);
      expect(focusTaker(screen.getByRole("link", { name: row("12") }))).not.toBe(taker);

      // Only the press moves focus: when the drafts cannot be read and then
      // come back, they are all there and focus stays where it is.
      focus.mockClear();
      const answer = { fails: true };
      const drafts = five();
      client.answer("/v1/me/trips", () =>
        answer.fails ? failure(503, "server_error") : ok(200, { trips: drafts }),
      );
      await fireEvent.press(screen.getByRole("tab", { name: "Find" }));
      await fireEvent.press(await screen.findByRole("tab", { name: "Offer" }));
      await waitFor(() => {
        expect(screen.queryByTestId("draft-rows")).toBeNull();
      });
      answer.fails = false;
      await fireEvent.press(screen.getByRole("tab", { name: "Find" }));
      await fireEvent.press(await screen.findByRole("tab", { name: "Offer" }));
      expect(await screen.findByRole("link", { name: row("10") })).toBeVisible();
      expect(focus).not.toHaveBeenCalled();
    } finally {
      focus.mockRestore();
    }
  });

  it("has no Show all drafts for three drafts", async () => {
    await open("/offer", five().slice(0, 3));
    expect(await screen.findByRole("header", { name: "Drafts" })).toBeVisible();
    expect(draftRows()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Show all drafts" })).toBeNull();
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
    expect(await screen.findByRole("link", { name: continueDraft })).toBeVisible();
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
    expect(main().getByRole("image", { name: "Step 1 of 5: Route" })).toBeVisible();
    expect(main().getByRole("header", { name: "Where are you driving?" })).not.toHaveStyle({
      textAlign: "center",
    });
    expect(main().getByRole("button", { name: "From: Choose a meeting point" })).toBeVisible();

    expect(soFar().getByRole("header", { name: "Your ride so far" })).toBeVisible();
    expect(soFar().getByLabelText("Route: Step 1")).toBeVisible();
    expect(soFar().getByLabelText("Date and times: Step 2")).toBeVisible();
    expect(soFar().getByLabelText("Seats and booking: Step 3")).toBeVisible();
    expect(soFar().getByLabelText("Price: Step 4")).toBeVisible();
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
    expect(soFar().getByLabelText("Seats and booking: Step 3")).toBeVisible();
    expect(soFar().getByLabelText("Price: Step 4")).toBeVisible();
    expect(side().getByRole("button", { name: "Choose seats" })).toBeVisible();
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
  });

  it("shows what earlier steps set, and the seats and price as they are chosen", async () => {
    const draft = plannedDraft();
    await open(`/drive/trips/${draft.id}/seats`, [draft]);
    expect(
      await soFar().findByLabelText("Seats and booking: 3 seats, I approve each passenger"),
    ).toBeVisible();
    expect(
      soFar().getByLabelText("Route: BSÍ bus terminal to Hof, Akureyri, 1 stop on the way"),
    ).toBeVisible();
    expect(
      soFar().getByLabelText("Date and times: Sunday 15 November, 09:00 to 11:00"),
    ).toBeVisible();
    expect(soFar().getByLabelText("Price: Step 4")).toBeVisible();
    expect(screen.queryByTestId("bottom-bar")).toBeNull();

    await fireEvent.press(main().getByRole("button", { name: "One seat more" }));
    await fireEvent.press(main().getByRole("radio", { name: /^Instant booking/ }));
    expect(soFar().getByLabelText("Seats and booking: 4 seats, Instant booking")).toBeVisible();
    await fireEvent.press(side().getByRole("button", { name: "Set your price" }));
    expect(await screen.findByRole("header", { name: "Set your price" })).toBeVisible();
    expect(
      await soFar().findByLabelText("Seats and booking: 4 seats, Instant booking"),
    ).toBeVisible();
    expect(await soFar().findByLabelText("Price: 3,000 ISK the whole way · 100%")).toBeVisible();
    await fireEvent.press(main().getByRole("button", { name: "Raise the price" }));
    expect(await soFar().findByLabelText("Price: 3,400 ISK the whole way · 110%")).toBeVisible();
    expect(side().getByRole("button", { name: "Check your ride" })).toBeVisible();
  });

  it("shows everything the trip has when a step is opened from the review", async () => {
    await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    await fireEvent.press(await changeRow("Route"));
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(
      soFar().getByLabelText("Route: BSÍ bus terminal to Hof, Akureyri, 1 stop on the way"),
    ).toBeVisible();
    expect(
      soFar().getByLabelText("Date and times: Sunday 15 November, 09:00 to 11:00"),
    ).toBeVisible();
    expect(await soFar().findByLabelText("Price: 3,000 ISK the whole way · 100%")).toBeVisible();
    expect(
      soFar().getByLabelText("Seats and booking: 3 seats, I approve each passenger"),
    ).toBeVisible();
    expect(soFar().getByText("09:00 → 11:00")).toBeVisible();
    expect(side().getByRole("button", { name: "Save changes" })).toBeVisible();
  });

  it("names the times' step again while the route is not the saved one", async () => {
    await open(`/drive/trips/${plannedDraft().id}/review`, [plannedDraft()]);
    await fireEvent.press(await changeRow("Route"));
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
    expect(await main().findByText("One thing before you publish")).toBeVisible();
    expect(screen.getByTestId("page")).toBeVisible();
    expect(main().getByRole("image", { name: "Step 5 of 5: Check" })).toBeVisible();
    expect(main().getByTestId("preview-ticket")).toBeVisible();
    expect(main().getByRole("link", { name: /^Route, / })).toBeVisible();
    expect(main().getByRole("button", { name: "Delete draft" })).toBeVisible();
    expect(side().getByRole("button", { name: "Publish ride" })).toBeDisabled();
    expect(
      side().getByText(
        "Confirm your licence to publish. Your ride is saved as a draft until then.",
      ),
    ).toBeVisible();
    // The review is the trip so far.
    expect(screen.queryByTestId("trip-so-far")).toBeNull();
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
  });

  it("keeps the drafts above the form on Offer", async () => {
    await open("/offer", [plannedDraft()]);
    expect(
      await main().findByRole("link", {
        name: "Continue your draft: BSÍ bus terminal → Hof, Akureyri, Sunday 15 November at 09:00",
      }),
    ).toBeVisible();
    expect(main().getByRole("image", { name: "Step 1 of 5: Route" })).toBeVisible();
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
    expect(main().getByRole("image", { name: "Step 4 of 5: Price" })).toBeVisible();
    expect(screen.queryByTestId("trip-so-far")).toBeNull();
  });

  it("keeps a phone to one column: the map under the ends, the button in the bottom bar", async () => {
    Dimensions.set({ window: phone });
    await open("/drive/trips/new");
    await choosePoint("From", "bs", "BSÍ bus terminal");
    await choosePoint("To", "hof", "Hof, Akureyri");
    expect(await screen.findByRole("switch", { name: "Blönduós" })).toBeChecked();
    expect(screen.queryByTestId("page")).toBeNull();
    expect(screen.queryByTestId("columns-side")).toBeNull();
    expect(screen.queryByTestId("trip-so-far")).toBeNull();
    // A step's title is at the left on a phone too (spec 31, 3.17).
    expect(screen.getByRole("header", { name: "Where are you driving?" })).not.toHaveStyle({
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
