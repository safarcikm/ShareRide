import { AccessibilityInfo } from "react-native";
import { fireEvent, screen } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { driverApi, northMyTrip, northSegments } from "@/testing/bookings";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { tripsApi, volvo, yaris } from "@/testing/trips";

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
    },
  });
  await fireEvent.press(await screen.findByRole("button", { name: "Edit trip" }));
  expect(await screen.findByRole("header", { name: "Edit trip" })).toBeVisible();
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

/** Saves, and expects the trip page to say so, with focus. */
async function saveAndSeeIt() {
  const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
  focusMoves.mockClear();
  await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
  expect(await screen.findByText("Trip changed.")).toBeVisible();
  expect(screen).toHavePathname(tripPage);
  expect(focusMoves).toHaveBeenCalled();
  focusMoves.mockRestore();
}

describe("Edit trip: the seats, price, car, booking mode and details (spec 6, 3.2)", () => {
  it("lists each part of the trip, each with a way to change it", async () => {
    await openEdit();
    for (const [title, line, link] of [
      ["Time", "Sunday 15 November", "Change the time"],
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
    await fireEvent.press(screen.getByRole("button", { name: "Edit trip" }));
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
      await screen.findByText("This is what the trip has now. Change something first."),
    ).toBeVisible();
    expect(changes(client)).toEqual([]);
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
      screen.getByText("2 seats are taken on part of the trip, so you can offer no fewer."),
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

  it("says why the server refused the seats", async () => {
    await openPart("Change the seats", north, {
      change: () =>
        failure(422, "change_not_allowed", {
          details: [{ path: "seats", issue: "seats_below_taken" }],
        }),
    });
    expect(
      screen.getByText("1 seat is taken on part of the trip, so you can offer no fewer."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save the change" }));
    expect(
      await screen.findByText("Passengers have taken more seats than that on part of the trip."),
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
    expect(await screen.findByText("Trip changed. Your passengers have been told.")).toBeVisible();
    expect(changes(client)).toEqual([
      { preview: saved, body: { kind: "vehicle", vehicleId: volvo.id } },
    ]);
    await fireEvent.press(screen.getByRole("button", { name: "Edit trip" }));
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
      await screen.findByText("This is what the trip has now. Change something first."),
    ).toBeVisible();
    expect(changes(client)).toEqual([]);
  });

  it("changes a preference", async () => {
    const { client } = await openPart("Change the preferences and note");
    expect(
      screen.getByText("Passengers see the change on the trip. Nobody is notified."),
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

  it.each(["price", "seats", "car", "booking", "details"])(
    "changes nothing on a trip that has left, opened from a link (%s)",
    async (part) => {
      const left = { ...north, departsAt: "2026-11-14T12:00:00.000Z" };
      const { client } = await renderApp(`${tripPage}/edit/${part}`, {
        me: completeMe,
        setUp: (fake) => {
          tripsApi(fake, [left]);
          driverApi(fake, []);
        },
      });
      expect(await screen.findByText("This trip can no longer be changed.")).toBeVisible();
      expect(screen.queryByRole("button", { name: "Save the change" })).toBeNull();
      expect(changes(client)).toEqual([]);
    },
  );
});
