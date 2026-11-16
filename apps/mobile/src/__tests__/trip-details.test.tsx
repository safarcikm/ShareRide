import { fireEvent, screen, within } from "expo-router/testing-library";
import { shareLink } from "@/lib/share";
import { renderApp, completeMe } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { failure, ok } from "@/testing/fake-client";
import { northResult, northStops, northTrip, searchApi, tripDetailsApi } from "@/testing/search";
import { blonduos, borgarnes } from "@/testing/trips";
import { getInAt, getOutAt } from "@/trip-details/route-list";

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
const id = northResult.tripId;
/** The screen's headings, title first, in the order they show. */
const headings = () =>
  screen.getAllByRole("header").map((heading) => String(heading.props.children));
/** The stops offered by Change, in route order. */
const radioNames = () =>
  screen.getAllByRole("radio").map((radio) => String(radio.props.accessibilityLabel));
const detailsCalls = (client: { calls: { path: string; input: Record<string, unknown> }[] }) =>
  client.calls.filter((call) => call.path === "/v1/trips/{id}").map((call) => call.input["query"]);

async function openTrip(
  path = `/trips/${id}?from=1&to=2`,
  answer?: Parameters<typeof tripDetailsApi>[1],
) {
  return renderApp(path, {
    setUp: (client) => {
      tripDetailsApi(client, answer);
    },
  });
}

describe("Trip details (spec 4, 3.6)", () => {
  it("opens from a search result for that part, without an account", async () => {
    const { client } = await renderApp(
      `/search/results?from=${borgarnes.id}&to=${blonduos.id}&fromName=Borgarnes&toName=Bl%C3%B6ndu%C3%B3s&seats=2`,
      {
        setUp: (fake) => {
          searchApi(fake);
          tripDetailsApi(fake);
        },
      },
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: /^Leaves Borgarnes at 10:00/ }),
    );
    expect(await screen.findByRole("header", { name: "Borgarnes → Blönduós" })).toBeVisible();
    expect(screen).toHavePathname(`/trips/${id}`);
    expect(screen).toHaveSearchParams({ id, from: "1", to: "2", seats: "2" });
    expect(detailsCalls(client)).toEqual([{ seats: 2, fromStop: 1, toStop: 2 }]);
  });

  it("puts your part first, then who you ride with, then the route (spec 16, 3.7)", async () => {
    await openTrip();
    expect(await screen.findByRole("header", { name: "Borgarnes → Blönduós" })).toBeVisible();
    expect(headings()).toEqual(["Borgarnes → Blönduós", "Your part", "Who you ride with", "Route"]);
    expect(screen.getByText("Sunday 15 November")).toBeVisible();
    expect(screen.getByText("Part of BSÍ bus terminal → Hof, Akureyri")).toBeVisible();

    // Your part: how booking works, where you get in and out, and the seats.
    expect(screen.getByText("Driver approves")).toBeVisible();
    const [getIn, getOut] = screen.getAllByTestId("stop-choice").map((row) => within(row));
    expect(getIn?.getByText("Get in")).toBeVisible();
    expect(getIn?.getByText("10:00")).toBeVisible();
    expect(getIn?.getByText("Borgarnes")).toBeVisible();
    expect(getIn?.getByRole("button", { name: "Change where you get in" })).toBeVisible();
    expect(getOut?.getByText("Get out")).toBeVisible();
    expect(getOut?.getByText("12:05")).toBeVisible();
    expect(getOut?.getByText("Blönduós")).toBeVisible();
    expect(getOut?.getByRole("button", { name: "Change where you get out" })).toBeVisible();
    expect(screen.getByText("2 free on your part · 2,900 ISK per seat")).toBeVisible();
    expect(screen.getByRole("button", { name: "One seat fewer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "One seat more" })).toBeEnabled();

    // Who you ride with: the driver, the car, their preferences and the seats.
    expect(screen.getByText("Anna")).toBeVisible();
    expect(screen.getByText("New driver")).toBeVisible();
    expect(screen.getByText("White Toyota Yaris")).toBeVisible();
    expect(screen.getByText("Number plate shown once your seat is confirmed")).toBeVisible();
    for (const need of [
      "Some chat",
      "One suitcase",
      "Ask about pets",
      "No smoking",
      "No child seat",
    ]) {
      expect(screen.getByText(need)).toBeVisible();
    }
    expect(
      screen.getByRole("image", {
        name: "Seats on your part: 3 offered, 1 taken, 1 yours and 1 free.",
      }),
    ).toBeVisible();

    // The route, its stops and what cancelling costs.
    expect(screen.getByRole("button", { name: "10:00, Borgarnes, getting in" })).toBeVisible();
    expect(screen.getByRole("button", { name: "12:05, Blönduós, getting out" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "09:00, BSÍ bus terminal, not on your part" }),
    ).toBeVisible();
    expect(
      screen.getByRole("image", {
        name: "The trip on a map of Iceland: BSÍ bus terminal → Hof, Akureyri. Your part: Borgarnes → Blönduós.",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Free cancellation, with a full refund, up to 15 minutes before you get in.",
      ),
    ).toBeVisible();
    // Said once, in Your part, rather than again further down.
    expect(screen.queryByText("The driver approves each request")).toBeNull();
    expect(screen.queryByText(/free on your part$/)).toBeNull();

    const bar = screen.getByTestId("bottom-bar");
    expect(within(bar).getByText("2,900 ISK")).toBeVisible();
    expect(within(bar).getByText("1 seat")).toBeVisible();
    expect(within(bar).getByRole("button", { name: "Send request" })).toBeEnabled();
    expect(within(bar).getByText("You'll sign in or create an account first.")).toBeVisible();
  });

  it("tags a trip people book straight away, and a free one", async () => {
    await openTrip(undefined, () =>
      ok(
        200,
        northTrip(
          { board: 1, alight: 2 },
          {
            bookingMode: "instant",
            part: {
              pricePerSeat: { amount: 0, currency: "ISK" },
              total: { amount: 0, currency: "ISK" },
            },
          },
        ),
      ),
    );
    expect(await screen.findByText("Book instantly")).toBeVisible();
    expect(screen.getByText("2 free on your part · Free")).toBeVisible();
    // Nothing is paid, so there is nothing to refund.
    expect(screen.queryByText(/^Free cancellation/)).toBeNull();
    expect(
      within(screen.getByTestId("bottom-bar")).getByRole("button", { name: "Book" }),
    ).toBeEnabled();
  });

  it("changes where you get in from the stops before you get out, and the other way", async () => {
    const { client } = await openTrip();
    await fireEvent.press(await screen.findByRole("button", { name: "Change where you get in" }));
    expect(radioNames()).toEqual(["09:00, BSÍ bus terminal", "10:00, Borgarnes"]);
    expect(screen.getByRole("radio", { name: "10:00, Borgarnes" })).toBeChecked();
    await fireEvent.press(screen.getByRole("radio", { name: "09:00, BSÍ bus terminal" }));
    expect(
      await screen.findByRole("header", { name: "BSÍ bus terminal → Blönduós" }),
    ).toBeVisible();
    expect(screen.queryAllByRole("radio")).toEqual([]);
    expect(screen).toHaveSearchParams({ id, from: "0", to: "2" });
    expect(await within(screen.getByTestId("bottom-bar")).findByText("4,000 ISK")).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Change where you get out" }));
    expect(radioNames()).toEqual(["10:00, Borgarnes", "12:05, Blönduós", "14:00, Hof, Akureyri"]);
    expect(screen.getByRole("radio", { name: "12:05, Blönduós" })).toBeChecked();
    await fireEvent.press(screen.getByRole("radio", { name: "14:00, Hof, Akureyri" }));
    expect(await screen.findByText("The whole trip")).toBeVisible();
    expect(await within(screen.getByTestId("bottom-bar")).findByText("6,000 ISK")).toBeVisible();
    expect(detailsCalls(client)).toEqual([
      { seats: 1, fromStop: 1, toStop: 2 },
      { seats: 1, fromStop: 0, toStop: 2 },
      { seats: 1, fromStop: 0, toStop: 3 },
    ]);
  });

  it("offers no Change on a trip with only two stops", async () => {
    await openTrip(`/trips/${id}?from=0&to=1`, () =>
      ok(200, northTrip({ board: 0, alight: 1 }, { stops: northStops.slice(0, 2) })),
    );
    const [getIn] = await screen.findAllByTestId("stop-choice");
    expect(getIn).toHaveTextContent(/^Get in/);
    expect(screen.queryByRole("button", { name: "Change where you get in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change where you get out" })).toBeNull();
  });

  it("closes the stops again when Change is pressed a second time", async () => {
    await openTrip();
    const change = await screen.findByRole("button", { name: "Change where you get out" });
    expect(change).not.toBeExpanded();
    await fireEvent.press(change);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByLabelText("Where you get out")).toHaveProp(
      "accessibilityRole",
      "radiogroup",
    );
    expect(screen.getByRole("button", { name: "Change where you get out" })).toBeExpanded();
    await fireEvent.press(screen.getByRole("button", { name: "Change where you get out" }));
    expect(screen.queryAllByRole("radio")).toEqual([]);
    expect(screen.getByRole("button", { name: "Change where you get out" })).not.toBeExpanded();
    expect(screen).toHaveSearchParams({ id, from: "1", to: "2" });
  });

  it("gets in or out at another stop on the route, and keeps the part in the address", async () => {
    const { client } = await openTrip();
    await fireEvent.press(
      await screen.findByRole("button", { name: "09:00, BSÍ bus terminal, not on your part" }),
    );
    expect(screen.getByRole("link", { name: "About this meeting point" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Get out here" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Get in here" }));
    expect(
      await screen.findByRole("header", { name: "BSÍ bus terminal → Blönduós" }),
    ).toBeVisible();
    expect(screen).toHaveSearchParams({ id, from: "0", to: "2" });

    await fireEvent.press(
      screen.getByRole("button", { name: "14:00, Hof, Akureyri, not on your part" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Get out here" }));
    expect(await screen.findByText("The whole trip")).toBeVisible();
    expect(screen.getByRole("button", { name: "10:00, Borgarnes, on your part" })).toBeVisible();
    expect(screen.getByRole("header", { name: "BSÍ bus terminal → Hof, Akureyri" })).toBeVisible();
    expect(within(screen.getByTestId("bottom-bar")).getByText("6,000 ISK")).toBeVisible();
    expect(detailsCalls(client)).toEqual([
      { seats: 1, fromStop: 1, toStop: 2 },
      { seats: 1, fromStop: 0, toStop: 2 },
      { seats: 1, fromStop: 0, toStop: 3 },
    ]);
  });

  it("builds quick changes of the part on each other while one loads", async () => {
    let release: () => void = () => undefined;
    const { client } = await openTrip(undefined, (query) => {
      const board = Number(query["fromStop"]);
      const alight = Number(query["toStop"]);
      const answer = ok(200, northTrip({ board, alight }));
      if (board !== 0 || alight !== 2) return answer;
      return new Promise((resolve) => {
        release = () => {
          resolve(answer);
        };
      });
    });
    await fireEvent.press(
      await screen.findByRole("button", { name: "09:00, BSÍ bus terminal, not on your part" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Get in here" }));
    // Still loading: the route and the link already have the new part.
    expect(
      screen.getByRole("button", { name: "09:00, BSÍ bus terminal, getting in" }),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Share" }));
    expect(mockedShare).toHaveBeenLastCalledWith(
      `http://localhost:3000/trips/${id}?from=0&to=2`,
      "BSÍ bus terminal → Blönduós on ShareRide",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "14:00, Hof, Akureyri, not on your part" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Get out here" }));
    expect(await screen.findByText("The whole trip")).toBeVisible();
    release();
    expect(
      await screen.findByRole("header", { name: "BSÍ bus terminal → Hof, Akureyri" }),
    ).toBeVisible();
    expect(screen).toHaveSearchParams({ id, from: "0", to: "3" });
    expect(detailsCalls(client)).toEqual([
      { seats: 1, fromStop: 1, toStop: 2 },
      { seats: 1, fromStop: 0, toStop: 2 },
      { seats: 1, fromStop: 0, toStop: 3 },
    ]);
  });

  it("lets a passenger who asked for more seats than are free choose fewer", async () => {
    const { client } = await openTrip(`/trips/${id}?from=1&to=2&seats=2`, (query) => {
      const seats = Number(query["seats"]);
      return ok(
        200,
        northTrip(
          { board: 1, alight: 2, seats },
          { part: { freeSeats: 1, state: seats > 1 ? "full" : "open" } },
        ),
      );
    });
    const bar = await screen.findByTestId("bottom-bar");
    expect(await within(bar).findByText("Only 1 seat is free on your part.")).toBeVisible();
    expect(within(bar).getByText("5,800 ISK")).toBeVisible();
    expect(within(bar).getByText("2 seats")).toBeVisible();
    expect(screen.getByRole("button", { name: "One seat more" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "One seat fewer" }));
    expect(await within(bar).findByText("2,900 ISK")).toBeVisible();
    expect(within(bar).getByRole("button", { name: "Send request" })).toBeEnabled();
    expect(detailsCalls(client).at(-1)).toEqual({ seats: 1, fromStop: 1, toStop: 2 });
  });

  it("reads seats in the address as a whole number", async () => {
    const { client } = await openTrip(`/trips/${id}?from=1&to=2&seats=2.5`);
    expect(await screen.findByText("Anna")).toBeVisible();
    expect(detailsCalls(client)).toEqual([{ seats: 2, fromStop: 1, toStop: 2 }]);
  });

  it("asks to wait when too many trips were opened in a short time", async () => {
    await openTrip(undefined, () => failure(429, "rate_limited", { retryAfterSeconds: 120 }));
    expect(
      await screen.findByText("Too many trips opened in a short time. Try again in 2 minutes."),
    ).toBeVisible();
  });

  it("prices the seats chosen, up to the seats free", async () => {
    const { client } = await openTrip();
    await fireEvent.press(await screen.findByRole("button", { name: "One seat more" }));
    expect(await within(screen.getByTestId("bottom-bar")).findByText("5,800 ISK")).toBeVisible();
    expect(screen.getByText("2 seats")).toBeVisible();
    expect(
      screen.getByRole("image", {
        name: "Seats on your part: 3 offered, 1 taken, 2 yours and 0 free.",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "One seat more" })).toBeDisabled();
    expect(detailsCalls(client).at(-1)).toEqual({ seats: 2, fromStop: 1, toStop: 2 });
  });

  it.each([
    [{ freeSeats: 0, state: "full" as const }, "Full on your part of the trip"],
    [{ freeSeats: 1, state: "full" as const }, "Only 1 seat is free on your part."],
    [{ state: "closed" as const }, "Booking for this part has closed."],
    [{ state: "departed" as const }, "This trip has left."],
    [{ state: "cancelled" as const }, "This trip was cancelled."],
    [{ state: "own" as const }, "This is your trip."],
  ])("says plainly when the part cannot be booked: %o", async (part, text) => {
    await openTrip(undefined, () => ok(200, northTrip({ board: 1, alight: 2 }, { part })));
    const bar = await screen.findByTestId("bottom-bar");
    expect(await within(bar).findByText(text)).toBeVisible();
    expect(within(bar).queryByRole("button", { name: "Send request" })).toBeNull();
    const tryAnother = within(bar).queryByText("Try another part of the trip.");
    if (part.state === "full") expect(tryAnother).toBeVisible();
    // The departed part here leaves a later stop ahead; see the next tests.
    else if (part.state !== "departed") expect(tryAnother).toBeNull();
  });

  /** The north trip as if Anna left at `left` stops' times, before the clock's noon. */
  const underWay = (left: number) =>
    northStops.map((stop, index) =>
      index < left ? { ...stop, plannedAt: `2026-11-14T0${String(index)}:00:00.000Z` } : stop,
    );

  it("points to a later stop of a trip under way, opened from its first stop (rule S4)", async () => {
    await openTrip(`/trips/${id}`, () =>
      ok(
        200,
        northTrip({ board: 0, alight: 3 }, { stops: underWay(1), part: { state: "departed" } }),
      ),
    );
    const bar = await screen.findByTestId("bottom-bar");
    expect(await within(bar).findByText("This trip has left.")).toBeVisible();
    expect(within(bar).getByText("Try another part of the trip.")).toBeVisible();
  });

  it("points nowhere once the trip has passed every stop to get in at", async () => {
    await openTrip(`/trips/${id}`, () =>
      ok(
        200,
        northTrip({ board: 0, alight: 3 }, { stops: underWay(3), part: { state: "departed" } }),
      ),
    );
    const bar = await screen.findByTestId("bottom-bar");
    expect(await within(bar).findByText("This trip has left.")).toBeVisible();
    expect(within(bar).queryByText("Try another part of the trip.")).toBeNull();
  });

  it("shares the trip's web address for the part", async () => {
    await openTrip();
    await fireEvent.press(await screen.findByRole("button", { name: "Share" }));
    expect(mockedShare).toHaveBeenCalledWith(
      `http://localhost:3000/trips/${id}?from=1&to=2`,
      "Borgarnes → Blönduós on ShareRide",
    );
    expect(await screen.findByText("Link copied. Paste it wherever you like.")).toBeVisible();

    mockedShare.mockImplementationOnce(() => Promise.resolve("failed"));
    await fireEvent.press(screen.getByRole("button", { name: "Share" }));
    expect(
      await screen.findByText(
        `The link could not be shared. Here it is to copy: http://localhost:3000/trips/${id}?from=1&to=2`,
      ),
    ).toBeVisible();
  });

  it("shows the driver's note, and a car of another colour by make and model", async () => {
    await openTrip(undefined, () =>
      ok(
        200,
        northTrip(
          { board: 1, alight: 2 },
          { note: "Room for skis.", car: { make: "Toyota", model: "Yaris", colour: "other" } },
        ),
      ),
    );
    expect(await screen.findByText("Room for skis.")).toBeVisible();
    expect(screen.getByText("Note from the driver")).toBeVisible();
    expect(screen.getByText("Toyota Yaris")).toBeVisible();
  });

  it.each([
    ["no trip has", "0190a1d6-0000-7000-8000-0000000000ff"],
    ["is not a trip's", "not-a-trip"],
  ])("says when the trip cannot be found: an id %s", async (_, missing) => {
    await renderApp(`/trips/${missing}`, {
      setUp: (client) => {
        tripDetailsApi(client);
      },
    });
    expect(await screen.findByText(/^This trip can't be found/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "See the whole trip" })).toBeNull();
  });

  it("offers the whole trip when the link asks for stops it does not have", async () => {
    const { client } = await openTrip(`/trips/${id}?from=2&to=1`);
    expect(
      await screen.findByText("This trip doesn't have the stops the link asks for."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "See the whole trip" }));
    expect(await screen.findByText("The whole trip")).toBeVisible();
    expect(detailsCalls(client).at(-1)).toEqual({ seats: 1 });
  });

  it("sends a signed-in person's token, so the driver hears it is their own trip", async () => {
    const { client } = await renderApp(`/trips/${id}?from=1&to=2`, {
      me: completeMe,
      setUp: (fake) => {
        tripDetailsApi(fake);
      },
    });
    expect(await screen.findByText("Anna")).toBeVisible();
    const [call] = client.calls.filter((made) => made.path === "/v1/trips/{id}");
    expect(call?.input["accessToken"]).toEqual(expect.stringMatching(/^sr_at_/));
  });
});

describe("getInAt and getOutAt", () => {
  const part = { board: 1, alight: 2 };
  it("moves only the end chosen while the part still runs forwards", () => {
    expect(getInAt(part, 0, 3)).toEqual({ board: 0, alight: 2 });
    expect(getOutAt(part, 3)).toEqual({ board: 1, alight: 3 });
  });
  it("moves the other end along when it would come first", () => {
    expect(getInAt(part, 2, 3)).toEqual({ board: 2, alight: 3 });
    expect(getOutAt(part, 1)).toEqual({ board: 0, alight: 1 });
  });
});
