import { AccessibilityInfo } from "react-native";
import { fireEvent, screen } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { driverApi, northMyTrip, northSegments } from "@/testing/bookings";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { searchApi } from "@/testing/search";
import { blonduos, mosfellsbaer, tripsApi, volvo, yaris } from "@/testing/trips";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland; the north trip leaves tomorrow at 09:00.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

const tripPage = `/drive/trips/${northMyTrip.id}`;

/**
 * Anna's north trip, 100 km a stretch, priced as the rules price it: 1,500
 * ISK a stretch at the suggested level, Gunna's request holding a seat
 * from Borgarnes to Blönduós.
 */
const north = {
  ...northMyTrip,
  segments: northSegments([0, 1, 0]).map((segment) => ({
    ...segment,
    price: { amount: 1500, currency: "ISK" as const },
  })),
};

async function openEdit(
  trip = north,
  answers: Parameters<typeof tripsApi>[2] = {},
): Promise<{ readonly client: FakeClient }> {
  const app = await renderApp(tripPage, {
    me: completeMe,
    setUp: (client) => {
      tripsApi(client, [trip], answers);
      driverApi(client, []);
      searchApi(client);
    },
  });
  await fireEvent.press(await screen.findByRole("link", { name: "Edit the ride" }));
  expect(await screen.findByRole("header", { name: "Edit the ride" })).toBeVisible();
  return app;
}

/** Edit trip, then the link to one part of it, which opens its screen. */
async function openPart(link: string, ...edit: Parameters<typeof openEdit>) {
  const app = await openEdit(...edit);
  await fireEvent.press(screen.getByRole("link", { name: link }));
  expect(await screen.findByRole("header", { name: link })).toBeVisible();
  return app;
}

const changes = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/trips/{id}/changes")
    .map((call) => ({ preview: call.input["query"], body: call.input["body"] }));

const saved = { preview: false };

/** What the check says when a stop lowers the whole trip's level (spec 17). */
const lowersAll = "Saving lowers the price of every stretch for new bookings.";

/** Saves, and expects the trip page to say so, with focus. */
async function saveAndSeeIt() {
  const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
  focusMoves.mockClear();
  await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
  expect(await screen.findByText("Ride changed.")).toBeVisible();
  expect(screen).toHavePathname(tripPage);
  expect(focusMoves).toHaveBeenCalled();
  focusMoves.mockRestore();
}

describe("Edit trip: the seats, price, car, booking mode and details (spec 6, 3.2)", () => {
  it("lists each part of the trip, each with a way to change it", async () => {
    await openEdit();
    for (const [title, line, link] of [
      ["Time", "Sunday 15 November", "Change the time"],
      ["Stops", "BSÍ bus terminal → Borgarnes → Blönduós → Hof, Akureyri", "Add a stop"],
      ["Stops", "BSÍ bus terminal → Borgarnes → Blönduós → Hof, Akureyri", "Remove a stop"],
      ["Price", "100% · the whole route 4,500 ISK", "Change the price"],
      ["Seats", "3 seats", "Change the seats"],
      ["Car", "Toyota Yaris, white", "Change the car"],
      ["How people book", "I approve each passenger", "Change how people book"],
      ["Preferences and note", "Ask me", "Change the preferences and note"],
    ] as const) {
      expect(screen.getByRole("header", { name: title })).toBeVisible();
      expect(screen.getByText(line)).toBeVisible();
      expect(screen.getByRole("link", { name: link })).toBeVisible();
    }
    expect(screen.getByText("No note")).toBeVisible();
  });

  it("changes the price level for new bookings, with the new prices before saving", async () => {
    const { client } = await openPart("Change the price");
    expect(screen.getByTestId("whole-route-price")).toHaveTextContent("4,500 ISK");
    expect(
      screen.getByText(
        "The new price is for new bookings. Passengers who booked keep the price they booked at.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Raise the price" }));
    // 110% of 1,500 ISK a stretch, to the nearest 100 (rule P4).
    expect(screen.getByTestId("whole-route-price")).toHaveTextContent("5,100 ISK");
    expect(screen.getAllByText("1,700 ISK")).toHaveLength(3);
    expect(changes(client)).toEqual([]);

    await saveAndSeeIt();
    expect(changes(client)).toEqual([
      { preview: saved, body: { kind: "priceLevel", priceLevel: 110 } },
    ]);
    await fireEvent.press(screen.getByRole("link", { name: "Edit the ride" }));
    expect(await screen.findByText("110% · the whole route 5,100 ISK")).toBeVisible();
  });

  it.each([
    "Change the price",
    "Change the seats",
    "Change the car",
    "Change how people book",
    "Change the preferences and note",
  ])("says when nothing has changed, without saving (%s)", async (link) => {
    const { client } = await openPart(link);
    await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
    expect(
      await screen.findByText("This is what the ride has now. Change something first."),
    ).toBeVisible();
    expect(changes(client)).toEqual([]);
  });

  it("prices with the values the trip was published under, whatever they are now (R10.3)", async () => {
    await openPart("Change the price", {
      ...north,
      priceSettings: { ...north.priceSettings, suggestedRatePerKm: 20, priceLevelStep: 20 },
    });
    // 100 km a stretch at 20 kr per km: 2,000 ISK a stretch, 6,000 for the three.
    expect(screen.getByTestId("whole-route-price")).toHaveTextContent("6,000 ISK");
    await fireEvent.press(screen.getByRole("button", { name: "Raise the price" }));
    // One level step of 20%: 2,400 ISK a stretch.
    expect(screen.getByTestId("whole-route-price")).toHaveTextContent("7,200 ISK");
  });

  it("offers no more seats than the operator's limit, read from the settings (rule S1)", async () => {
    const app = await renderApp(tripPage, {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/config", () =>
          ok(200, {
            beta: false,
            paused: [],
            maxSeats: 4,
            freeCancellationMinutes: 15,
            maxMoveMinutes: 120,
            reliabilityMonths: 12,
            signInProviders: [],
          }),
        );
        tripsApi(client, [north]);
        driverApi(client, []);
        searchApi(client);
      },
    });
    await fireEvent.press(await screen.findByRole("link", { name: "Edit the ride" }));
    await fireEvent.press(await screen.findByRole("link", { name: "Change the seats" }));
    expect(await screen.findByRole("header", { name: "Change the seats" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    expect(screen.getByRole("button", { name: "One seat more" })).toBeDisabled();
    expect(app.client.calls.filter((call) => call.path === "/v1/config")).not.toHaveLength(0);
  });

  it("offers no fewer seats than are taken, and says when more seats lower the price level (rules S5, P4)", async () => {
    const { client } = await openPart("Change the seats", {
      ...north,
      priceLevel: 250,
      segments: north.segments.map((segment, index) => ({
        ...segment,
        seatsTaken: index === 1 ? 2 : 0,
      })),
    });
    expect(
      screen.getByText("2 seats are taken on part of the ride, so you can offer no fewer."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "One seat fewer" }));
    expect(screen.getByRole("button", { name: "One seat fewer" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    expect(
      screen.getByText(
        "With 4 seats the highest price level is 200%, so yours goes down to it for new bookings.",
      ),
    ).toBeVisible();

    await saveAndSeeIt();
    expect(changes(client)).toEqual([{ preview: saved, body: { kind: "seats", seats: 4 } }]);
  });

  /**
   * The north trip with one seat, booked on the whole route at 500% for
   * 22,500 ISK (spec 17, gap 1).
   */
  const paidAtOneSeat = {
    ...north,
    seats: 1,
    priceLevel: 500,
    segments: north.segments.map((segment) => ({ ...segment, seatsTaken: 1 })),
    takings: { amount: 22_500, currency: "ISK" as const },
  };

  it("says when what passengers paid lowers the price level for more seats (spec 17)", async () => {
    const { client } = await openPart("Change the seats", paidAtOneSeat);
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    expect(
      screen.getByText(
        "What passengers have already booked counts towards this ride's limit, so the seats left can cost at most 160%.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    expect(
      screen.getByText(
        "What passengers have already booked counts towards this ride's limit, so the seats left can cost at most 120%.",
      ),
    ).toBeVisible();
    await saveAndSeeIt();
    expect(changes(client)).toEqual([{ preview: saved, body: { kind: "seats", seats: 3 } }]);
  });

  it("stops the price at what the trip limit leaves, and says why (spec 17)", async () => {
    await openPart("Change the price", { ...paidAtOneSeat, seats: 3, priceLevel: 120 });
    expect(screen.getByRole("button", { name: "Raise the price" })).toBeDisabled();
    expect(
      screen.getByText(
        "What passengers have already booked counts towards this ride's limit, so the seats left can cost at most 120%.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "The limit is for the whole ride, so what passengers have already booked counts towards it.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Lower the price" }));
    expect(screen.getByRole("button", { name: "Raise the price" })).toBeEnabled();
  });

  it("says the seats left are free once passengers have paid the whole limit (spec 17)", async () => {
    await openPart("Change the price", {
      ...paidAtOneSeat,
      seats: 3,
      priceLevel: 0,
      takings: { amount: 99_000, currency: "ISK" as const },
    });
    expect(
      screen.getByText(
        "What passengers have already booked uses up this ride's limit, so the seats left are free.",
      ),
    ).toBeVisible();
  });

  it("says why the server refused the seats", async () => {
    await openPart("Change the seats", north, {
      change: () =>
        failure(422, "change_not_allowed", {
          details: [{ path: "seats", issue: "seats_below_taken" }],
        }),
    });
    expect(
      screen.getByText("1 seat is taken on part of the ride, so you can offer no fewer."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
    expect(
      await screen.findByText("Passengers have taken more seats than that on part of the ride."),
    ).toBeVisible();
    expect(screen).toHavePathname(`${tripPage}/edit/seats`);
  });

  it("changes the car, telling the passengers who booked", async () => {
    const { client } = await openPart("Change the car", north, {
      cars: [yaris, volvo],
      told: { told: 2 },
    });
    expect(
      screen.getByText("Passengers who have booked are told about the new car when you save."),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: /^Toyota Yaris, white/ })).toBeChecked();
    await fireEvent.press(screen.getByRole("radio", { name: /^Volvo XC40, red/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
    expect(await screen.findByText("Ride changed. Your passengers have been told.")).toBeVisible();
    expect(changes(client)).toEqual([
      { preview: saved, body: { kind: "vehicle", vehicleId: volvo.id } },
    ]);
    await fireEvent.press(screen.getByRole("link", { name: "Edit the ride" }));
    expect(await screen.findByText("Volvo XC40, red")).toBeVisible();
  });

  it("offers to add a car, and offers it on coming back", async () => {
    const { client } = await openPart("Change the car");
    await fireEvent.press(screen.getByRole("link", { name: "Add a car" }));
    expect(screen).toHavePathname("/drive/cars/new");
    client.answer("/v1/me/vehicles", () => ok(200, { vehicles: [yaris, volvo] }));
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("radio", { name: /^Volvo XC40, red/ })).toBeVisible();
    expect(screen).toHavePathname(`${tripPage}/edit/car`);
  });

  it("says why the server refused the car", async () => {
    await openPart("Change the car", north, {
      cars: [yaris, volvo],
      change: () =>
        failure(422, "change_not_allowed", {
          details: [{ path: "vehicleId", issue: "car_missing" }],
        }),
    });
    await fireEvent.press(screen.getByRole("radio", { name: /^Volvo XC40, red/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
    expect(await screen.findByText("Choose the car you're driving.")).toBeVisible();
    expect(screen).toHavePathname(`${tripPage}/edit/car`);
  });

  it("changes how people book, keeping requests open", async () => {
    const { client } = await openPart("Change how people book");
    expect(screen.getByText("1 request waiting for your answer stays open.")).toBeVisible();
    expect(screen.getByRole("radio", { name: /^I approve each passenger/ })).toBeChecked();
    await fireEvent.press(screen.getByRole("radio", { name: /^Instant booking/ }));

    await saveAndSeeIt();
    expect(changes(client)).toEqual([
      { preview: saved, body: { kind: "bookingMode", bookingMode: "instant" } },
    ]);
  });

  it("takes a note with spaces around it, as another client saved it, as unchanged", async () => {
    const { client } = await openPart("Change the preferences and note", {
      ...north,
      note: " Coffee stop on the way. ",
    });
    await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
    expect(
      await screen.findByText("This is what the ride has now. Change something first."),
    ).toBeVisible();
    expect(changes(client)).toEqual([]);
  });

  it("changes a preference", async () => {
    const { client } = await openPart("Change the preferences and note");
    expect(
      screen.getByText("Passengers see the change when they open the ride. Nobody is notified."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Pets welcome" }));
    await saveAndSeeIt();
    expect(changes(client)).toEqual([
      {
        preview: saved,
        body: { kind: "details", preferences: { ...north.preferences, pets: "yes" }, note: "" },
      },
    ]);
  });

  it("changes the note, never with contact details (R3.10)", async () => {
    const { client } = await openPart("Change the preferences and note");
    const note = screen.getByLabelText("Note to passengers (optional)");
    await fireEvent.changeText(note, "Text me on 555 1234");
    expect(
      screen.getByText(
        "Please don't share phone numbers, emails or links. Passengers can chat with you in the app once they book.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
    expect(changes(client)).toEqual([]);

    await fireEvent.changeText(note, "  Meet by the café.  ");
    await saveAndSeeIt();
    expect(changes(client)).toEqual([
      {
        preview: saved,
        body: { kind: "details", preferences: north.preferences, note: "Meet by the café." },
      },
    ]);
  });

  it.each(["price", "seats", "car", "booking", "details", "stop", "remove-stop"])(
    "changes nothing on a ride that has left, opened from a link (%s)",
    async (part) => {
      const left = { ...north, departsAt: "2026-11-14T12:00:00.000Z" };
      const { client } = await renderApp(`${tripPage}/edit/${part}`, {
        me: completeMe,
        setUp: (fake) => {
          tripsApi(fake, [left]);
          driverApi(fake, []);
        },
      });
      expect(await screen.findByText("This ride can no longer be changed.")).toBeVisible();
      expect(screen.queryByRole("button", { name: "Save the change" })).toBeNull();
      expect(changes(client)).toEqual([]);
    },
  );
});

describe("Edit trip: adding a stop (spec 6, 3.2; milestone 6 plan, decision 2)", () => {
  /** Opens Add a stop and chooses the point named `name` by typing `typed`. */
  async function choose(typed: string, name: string, ...edit: Parameters<typeof openEdit>) {
    const app = await openPart("Add a stop", ...edit);
    expect(
      screen.getByText(
        "The stop goes where it's least out of your way, at a time between the stops either side. They keep their times.",
      ),
    ).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText("Town or meeting point"), typed);
    await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^${name}`) }));
    return app;
  }

  const addMosfellsbaer = { kind: "addStop", meetingPointId: mosfellsbaer.id };

  it("checks where and when the stop goes and what it costs, then adds it, telling the passengers who booked", async () => {
    const { client } = await choose("mos", "Mosfellsbær", north, {
      told: { told: 2, requests: 1 },
    });
    expect(await screen.findByRole("header", { name: "Check the change" })).toBeVisible();
    expect(screen.getByText("New stop: Mosfellsbær at 09:30")).toBeVisible();
    expect(screen.getByText("09:30  Mosfellsbær")).toBeVisible();
    expect(screen.getByText("10:00  Borgarnes")).toBeVisible();
    expect(screen.getByText("BSÍ bus terminal → Mosfellsbær · 300 ISK per seat")).toBeVisible();
    expect(screen.getByText("Mosfellsbær → Borgarnes · 1,200 ISK per seat")).toBeVisible();
    expect(screen.queryByText(lowersAll)).toBeNull();
    expect(screen.getByText("2 passengers are told of the new stop now.")).toBeVisible();
    expect(
      screen.getByText("1 person who asked for a seat sees the new stop in the app."),
    ).toBeVisible();
    expect(
      screen.getByText("Passengers who booked keep their stops and the price they booked at."),
    ).toBeVisible();
    expect(changes(client)).toEqual([{ preview: { preview: true }, body: addMosfellsbaer }]);

    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
    expect(await screen.findByText("Ride changed. Your passengers have been told.")).toBeVisible();
    expect(screen).toHavePathname(tripPage);
    expect(focusMoves).toHaveBeenCalled();
    focusMoves.mockRestore();
    expect(changes(client).at(-1)).toEqual({ preview: saved, body: addMosfellsbaer });
    await fireEvent.press(screen.getByRole("link", { name: "Edit the ride" }));
    expect(
      await screen.findByText(
        "BSÍ bus terminal → Mosfellsbær → Borgarnes → Blönduós → Hof, Akureyri",
      ),
    ).toBeVisible();
  });

  it("says when the stop lowers the level for the whole trip, before saving (spec 17)", async () => {
    await choose("mos", "Mosfellsbær", north, {
      stopEffect: { priceLevel: 90, priceLevelLowered: true, levelLimitedBy: "trip_limit" },
    });
    expect(
      await screen.findByText(
        "What passengers have already booked counts towards this ride's limit, so the seats left can cost at most 90%.",
      ),
    ).toBeVisible();
    expect(screen.getByText(lowersAll)).toBeVisible();
  });

  it("says nobody needs to be told without bookings", async () => {
    await choose("mos", "Mosfellsbær");
    expect(
      await screen.findByText("Nobody has booked yet, so nobody needs to be told."),
    ).toBeVisible();
  });

  it("says a stop already on the trip is there, without asking the server", async () => {
    const { client } = await choose("bor", "Borgarnes");
    expect(await screen.findByText("Borgarnes is already on your route.")).toBeVisible();
    expect(changes(client)).toEqual([]);
    await fireEvent.press(screen.getByRole("button", { name: "Choose another meeting point" }));
    expect(await screen.findByLabelText("Town or meeting point")).toBeVisible();
  });

  it.each([
    [
      { path: "segments.0", issue: "stop_does_not_fit" },
      "Mosfellsbær is too far out of your way to fit between BSÍ bus terminal and Borgarnes, which keep their times.",
    ],
    [
      { path: "meetingPointId", issue: "route_too_long" },
      "Through Mosfellsbær the route would be more than 1.5 times as long as the direct way.",
    ],
    [
      { path: "meetingPointId", issue: "stop_out_of_season" },
      "Mosfellsbær isn't open on that date.",
    ],
    [
      { path: "meetingPointId", issue: "stop_unavailable" },
      "This meeting point is paused right now. Choose another.",
    ],
  ])("says why the server refused the stop: %o", async (detail, text) => {
    await choose("mos", "Mosfellsbær", north, {
      change: () => failure(422, "change_not_allowed", { details: [detail] }),
    });
    expect(await screen.findByText(text)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save the change" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Choose another meeting point" }));
    expect(await screen.findByLabelText("Town or meeting point")).toBeVisible();
  });

  it("waits for the distances to a new meeting point, and tries again", async () => {
    let pending = true;
    const { client } = await choose("mos", "Mosfellsbær", north, {
      change: () => (pending ? failure(503, "distances_pending") : undefined),
    });
    expect(
      await screen.findByText(
        "We're still working out the distances for this route. Try again in a moment.",
      ),
    ).toBeVisible();
    pending = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("New stop: Mosfellsbær at 09:30")).toBeVisible();
    expect(changes(client)).toHaveLength(2);
  });
});

describe("Edit trip: removing a stop (spec 6, 3.2; R6.5)", () => {
  const removeBlonduos = { kind: "removeStop", meetingPointId: blonduos.id };

  /** Opens Remove a stop and checks the stop named `name`. */
  async function check(name: string, ...edit: Parameters<typeof openEdit>) {
    const app = await openPart("Remove a stop", ...edit);
    await fireEvent.press(screen.getByRole("radio", { name: new RegExp(`^${name}`) }));
    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));
    return app;
  }

  it("says when removing the stop leaves the seats left free, before saving (spec 17)", async () => {
    await check("Blönduós", north, {
      stopEffect: { priceLevel: 0, priceLevelLowered: true, levelLimitedBy: "trip_limit" },
    });
    expect(
      await screen.findByText(
        "What passengers have already booked uses up this ride's limit, so the seats left are free.",
      ),
    ).toBeVisible();
    expect(screen.getByText(lowersAll)).toBeVisible();
  });

  it("offers the stops between the ends, checks what changes, and removes one, telling the passengers who booked", async () => {
    const { client } = await openPart("Remove a stop", north, { told: { told: 2, requests: 1 } });
    expect(
      screen.getByText(
        "Choose the stop to leave out. The stops either side keep their times. Where passengers get in or out, their bookings have to end first.",
      ),
    ).toBeVisible();
    expect(
      screen.getAllByRole("radio").map((radio) => String(radio.props.accessibilityLabel)),
    ).toEqual([expect.stringMatching(/^Borgarnes/), expect.stringMatching(/^Blönduós/)]);
    expect(screen.getByText("10:00")).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: /^Blönduós/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));

    expect(await screen.findByRole("header", { name: "Check the change" })).toBeVisible();
    expect(screen.getByText("Stop removed: Blönduós")).toBeVisible();
    expect(screen.getByText("10:00  Borgarnes")).toBeVisible();
    expect(screen.getByText("14:00  Hof, Akureyri")).toBeVisible();
    expect(screen.queryByText(/^\d\d:\d\d {2}Blönduós$/)).toBeNull();
    expect(screen.getByText("Borgarnes → Hof, Akureyri · 2,700 ISK per seat")).toBeVisible();
    expect(screen.queryByText(lowersAll)).toBeNull();
    expect(screen.getByText("2 passengers are told the stop is removed now.")).toBeVisible();
    expect(
      screen.getByText("1 person who asked for a seat sees the change in the app."),
    ).toBeVisible();
    expect(
      screen.getByText("Passengers who booked keep their stops and the price they booked at."),
    ).toBeVisible();
    expect(changes(client)).toEqual([{ preview: { preview: true }, body: removeBlonduos }]);

    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
    expect(await screen.findByText("Ride changed. Your passengers have been told.")).toBeVisible();
    expect(screen).toHavePathname(tripPage);
    expect(focusMoves).toHaveBeenCalled();
    focusMoves.mockRestore();
    expect(changes(client).at(-1)).toEqual({ preview: saved, body: removeBlonduos });
    await fireEvent.press(screen.getByRole("link", { name: "Edit the ride" }));
    expect(await screen.findByText("BSÍ bus terminal → Borgarnes → Hof, Akureyri")).toBeVisible();
  });

  it("asks which stop before checking", async () => {
    const { client } = await openPart("Remove a stop");
    await fireEvent.press(screen.getByRole("button", { name: "Check the change" }));
    expect(await screen.findByText("Choose the stop to remove.")).toBeVisible();
    expect(changes(client)).toEqual([]);
  });

  it("says nobody needs to be told without bookings", async () => {
    await check("Borgarnes");
    expect(
      await screen.findByText("Nobody has booked yet, so nobody needs to be told."),
    ).toBeVisible();
  });

  it.each([
    [
      { bookingsAtStop: 2, details: [{ path: "meetingPointId", issue: "stop_in_use" }] },
      "2 passengers get in or out at Blönduós. Cancel or decline their bookings on this ride first, or ask them to cancel.",
    ],
    [
      { details: [{ path: "meetingPointId", issue: "stop_in_use" }] },
      "Passengers get in or out at Blönduós. Cancel or decline their bookings on this ride first, or ask them to cancel.",
    ],
    [
      { details: [{ path: "segments.1", issue: "stretch_too_fast" }] },
      "Without Blönduós, the drive from Borgarnes to Hof, Akureyri needs more time than the ride leaves between them.",
    ],
    [
      { details: [{ path: "meetingPointId", issue: "stop_at_end" }] },
      "The first and last stops make the ride. To change them, cancel the ride and offer a new one.",
    ],
  ])("says why the server refused: %o", async (extras, text) => {
    await check("Blönduós", north, {
      change: () => failure(422, "change_not_allowed", extras),
    });
    expect(await screen.findByText(text)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save the change" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Choose another stop" }));
    expect(await screen.findByRole("radio", { name: /^Borgarnes/ })).toBeVisible();
  });

  it("waits for the distances past the stop, and tries again", async () => {
    let pending = true;
    const { client } = await check("Blönduós", north, {
      change: () => (pending ? failure(503, "distances_pending") : undefined),
    });
    expect(
      await screen.findByText(
        "We're still working out the distances for this route. Try again in a moment.",
      ),
    ).toBeVisible();
    pending = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Stop removed: Blönduós")).toBeVisible();
    expect(changes(client)).toHaveLength(2);
  });

  it("offers nothing to remove on a trip with only its two ends", async () => {
    const direct = {
      ...north,
      stops: [north.stops[0], north.stops.at(-1)].filter((stop) => stop !== undefined),
      segments: north.segments.slice(0, 1),
    };
    await openEdit(direct);
    expect(screen.queryByRole("link", { name: "Remove a stop" })).toBeNull();
    expect(screen.getByRole("link", { name: "Add a stop" })).toBeVisible();
  });
});
