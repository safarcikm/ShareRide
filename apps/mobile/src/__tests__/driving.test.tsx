import { fireEvent, screen, within } from "expo-router/testing-library";
import type { DriverReadiness, Vehicle } from "@shareride/contracts";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

const yaris: Vehicle = {
  id: "0190a1d6-0000-7000-8000-0000000000a1",
  make: "Toyota",
  model: "Yaris",
  colour: "white",
  registration: null,
};

/** A driver the fake API remembers: cars added, changed and removed, and the licence. */
function driver(client: FakeClient, start: { cars?: Vehicle[]; licence?: string | null } = {}) {
  let cars = [...(start.cars ?? [])];
  let licenceDeclaredAt = start.licence ?? null;
  const readiness = (): DriverReadiness => ({
    ready: cars.length > 0 && licenceDeclaredAt !== null,
    items: [
      { item: "photo", done: false, blocking: false },
      { item: "car", done: cars.length > 0, blocking: true },
      { item: "licence", done: licenceDeclaredAt !== null, blocking: true },
    ],
    licenceDeclaredAt,
  });
  client.answer("/v1/me/driver-readiness", () => ok(200, readiness()));
  client.answer("/v1/me/driver-licence-declaration", () => {
    licenceDeclaredAt = "2026-11-14T12:00:00.000Z";
    return ok(200, readiness());
  });
  client.answer("/v1/me/vehicles", (input) => {
    const body = input["body"] as Omit<Vehicle, "id"> | undefined;
    if (body === undefined) return ok(200, { vehicles: cars });
    const car = { ...body, id: "0190a1d6-0000-7000-8000-0000000000a2" };
    cars = [...cars, car];
    return ok(201, car);
  });
  client.answer("/v1/me/vehicles/{id}", (input) => {
    const { id } = input["params"] as { id: string };
    const body = input["body"] as Omit<Vehicle, "id"> | undefined;
    if (!cars.some((car) => car.id === id)) return failure(404, "not_found");
    if (body === undefined) {
      cars = cars.filter((car) => car.id !== id);
      return ok(204);
    }
    const car = { ...body, id };
    cars = cars.map((known) => (known.id === id ? car : known));
    return ok(200, car);
  });
  return { cars: () => cars };
}

async function openDrive(start: Parameters<typeof driver>[1] = {}) {
  let state: ReturnType<typeof driver> | undefined;
  const app = await renderApp("/drive", {
    me: completeMe,
    setUp: (client) => {
      state = driver(client, start);
    },
  });
  expect(await screen.findByRole("header", { name: "Before you publish" })).toBeVisible();
  if (state === undefined) throw new Error("The fake driver was not set up.");
  return { ...app, driver: state };
}

const row = (name: string) => screen.getByTestId(`readiness-${name}`);

describe("Before you publish (spec 3, 3.1)", () => {
  it("shows what a new driver still needs, with the photo not blocking yet", async () => {
    await openDrive();
    expect(within(row("photo")).getByText("Profile photo")).toBeVisible();
    expect(within(row("photo")).getByText(/Adding a photo comes soon/)).toBeVisible();
    expect(within(row("car")).getByLabelText("A car: Not done yet")).toBeVisible();
    expect(within(row("car")).getByRole("button", { name: "Add a car" })).toBeVisible();
    expect(
      within(row("licence")).getByRole("button", { name: "Confirm your licence" }),
    ).toBeVisible();
    expect(screen.queryByText("Everything is ready for your first trip.")).toBeNull();
  });

  it("opens from my profile", async () => {
    await renderApp("/", { me: completeMe, setUp: (client) => driver(client) });
    await fireEvent.press(await screen.findByRole("button", { name: "Offer a ride" }));
    expect(await screen.findByRole("header", { name: "Before you publish" })).toBeVisible();
    expect(screen).toHavePathname("/drive");
  });

  it("offers to try again when it does not load", async () => {
    let down = true;
    await renderApp("/drive", {
      me: completeMe,
      setUp: (client) => {
        driver(client);
        client.answer("/v1/me/driver-readiness", () =>
          down
            ? failure(503, "server_error")
            : ok(200, { ready: false, items: [], licenceDeclaredAt: null }),
        );
      },
    });
    expect(await screen.findByText("Something went wrong on our side. Try again.")).toBeVisible();
    down = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText(
        "Before your first trip, add your car and confirm your driving licence.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Something went wrong on our side. Try again.")).toBeNull();
  });

  it("is only for signed-in people", async () => {
    await renderApp("/drive");
    expect(await screen.findByText("Share the ride across Iceland")).toBeVisible();
  });
});

describe("Add a car (spec 3, 3.2)", () => {
  it("adds a car with a suggested make and a colour, then shows it", async () => {
    const app = await openDrive({ licence: "2026-11-14T12:00:00.000Z" });
    await fireEvent.press(within(row("car")).getByRole("button", { name: "Add a car" }));
    expect(await screen.findByRole("header", { name: "Add a car" })).toBeVisible();
    expect(screen).toHavePathname("/drive/cars/new");

    await fireEvent.changeText(screen.getByLabelText("Make"), "toy");
    await fireEvent.press(screen.getByRole("button", { name: "Toyota" }));
    expect(screen.getByLabelText("Make")).toHaveDisplayValue("Toyota");
    await fireEvent.changeText(screen.getByLabelText("Model"), "Yaris");
    await fireEvent.press(screen.getByRole("radio", { name: "Blue" }));
    expect(screen.getByRole("radio", { name: "Blue" })).toBeChecked();
    await fireEvent.changeText(screen.getByLabelText("Number plate"), "test-0001");
    await fireEvent.press(screen.getByRole("button", { name: "Save car" }));

    expect(await screen.findByText("Toyota Yaris, blue")).toBeVisible();
    expect(screen).toHavePathname("/drive");
    expect(
      app.client.calls.find((call) => call.path === "/v1/me/vehicles" && "body" in call.input)
        ?.input,
    ).toEqual({
      body: { make: "Toyota", model: "Yaris", colour: "blue", registration: "test-0001" },
      accessToken: "sr_at_access-1",
    });
    expect(screen.getByText("Everything is ready for your first trip.")).toBeVisible();
  });

  it("asks for a colour before sending", async () => {
    const app = await openDrive();
    await fireEvent.press(within(row("car")).getByRole("button", { name: "Add a car" }));
    await fireEvent.changeText(await screen.findByLabelText("Make"), "Kia");
    await fireEvent.changeText(screen.getByLabelText("Model"), "Ceed");
    await fireEvent.press(screen.getByRole("button", { name: "Save car" }));
    expect(await screen.findByText("Choose a colour.")).toBeVisible();
    expect(
      app.client.calls.some((call) => "body" in call.input && call.path === "/v1/me/vehicles"),
    ).toBe(false);
  });

  it("clears a field's error as soon as it changes", async () => {
    await openDrive();
    await fireEvent.press(within(row("car")).getByRole("button", { name: "Add a car" }));
    await fireEvent.changeText(await screen.findByLabelText("Make"), "Kia");
    await fireEvent.changeText(screen.getByLabelText("Model"), "Ceed");
    await fireEvent.press(screen.getByRole("button", { name: "Save car" }));
    expect(await screen.findByText("Choose a colour.")).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Green" }));
    expect(screen.queryByText("Choose a colour.")).toBeNull();
  });

  it("shows the field the server finds wrong", async () => {
    const app = await openDrive();
    app.client.answer("/v1/me/vehicles", () =>
      failure(400, "vehicle_invalid", { details: [{ path: "registration", issue: "invalid" }] }),
    );
    await fireEvent.press(within(row("car")).getByRole("button", { name: "Add a car" }));
    await fireEvent.changeText(await screen.findByLabelText("Make"), "Kia");
    await fireEvent.changeText(screen.getByLabelText("Model"), "Ceed");
    await fireEvent.press(screen.getByRole("radio", { name: "Red" }));
    await fireEvent.changeText(screen.getByLabelText("Number plate"), "TEST 0001");
    await fireEvent.press(screen.getByRole("button", { name: "Save car" }));
    expect(
      await screen.findByText("Use 2 to 8 letters and numbers, or leave it empty for now."),
    ).toBeVisible();
    expect(screen).toHavePathname("/drive/cars/new");
  });
});

describe("Edit a car", () => {
  it("adds the number plate later", async () => {
    const app = await openDrive({ cars: [yaris] });
    expect(screen.getByText("No number plate yet")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: /^Toyota Yaris, white/ }));
    expect(await screen.findByRole("header", { name: "Edit your car" })).toBeVisible();
    expect(screen.getByLabelText("Model")).toHaveDisplayValue("Yaris");
    expect(screen.getByRole("radio", { name: "White" })).toBeChecked();
    await fireEvent.changeText(screen.getByLabelText("Number plate"), "ÞÓRTEST1");
    await fireEvent.press(screen.getByRole("button", { name: "Save car" }));
    expect(await screen.findByText("ÞÓRTEST1")).toBeVisible();
    expect(app.driver.cars()[0]?.registration).toBe("ÞÓRTEST1");
  });

  it("says so when the car was removed elsewhere before saving", async () => {
    const app = await openDrive({ cars: [yaris] });
    await fireEvent.press(screen.getByRole("button", { name: /^Toyota Yaris, white/ }));
    await fireEvent.changeText(await screen.findByLabelText("Model"), "Yaris Cross");
    app.client.answer("/v1/me/vehicles/{id}", () => failure(404, "not_found"));
    await fireEvent.press(screen.getByRole("button", { name: "Save car" }));
    expect(
      await screen.findByText("We couldn't find this car. It may have been removed."),
    ).toBeVisible();
  });

  it("removes a car after naming it", async () => {
    const app = await openDrive({ cars: [yaris] });
    await fireEvent.press(screen.getByRole("button", { name: /^Toyota Yaris, white/ }));
    await fireEvent.press(await screen.findByRole("button", { name: "Remove car" }));
    expect(screen.getByText("Remove Toyota Yaris? It stays on your past trips.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByText(/It stays on your past trips/)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Remove car" }));
    await fireEvent.press(screen.getByRole("button", { name: "Remove Toyota Yaris" }));
    expect(await screen.findByRole("header", { name: "Before you publish" })).toBeVisible();
    expect(app.driver.cars()).toEqual([]);
    expect(screen.queryByText("Toyota Yaris, white")).toBeNull();
  });

  it("says so when the car is gone", async () => {
    await renderApp(`/drive/cars/0190a1d6-0000-7000-8000-0000000000ff`, {
      me: completeMe,
      setUp: (client) => driver(client, { cars: [yaris] }),
    });
    expect(
      await screen.findByText("We couldn't find this car. It may have been removed."),
    ).toBeVisible();
  });
});

describe("Driving licence (spec 3, 3.3)", () => {
  it("asks for the tick, then confirms the declaration", async () => {
    const app = await openDrive({ cars: [yaris] });
    await fireEvent.press(
      within(row("licence")).getByRole("button", { name: "Confirm your licence" }),
    );
    expect(await screen.findByRole("header", { name: "Your driving licence" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Tick the box to confirm.")).toBeVisible();

    await fireEvent.press(
      screen.getByRole("checkbox", {
        name: "I declare that I hold a valid driving licence for the cars I drive on ShareRide",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Confirmed on 14 November 2026")).toBeVisible();
    expect(screen).toHavePathname("/drive");
    expect(
      app.client.calls.find((call) => call.path === "/v1/me/driver-licence-declaration")?.input,
    ).toEqual({ body: { declared: true }, accessToken: "sr_at_access-1" });
  });
});
