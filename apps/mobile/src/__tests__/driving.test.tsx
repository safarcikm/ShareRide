import { fireEvent, screen, within } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import type { DriverReadiness, Vehicle } from "@shareride/contracts";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { filledButtons, inBar, inPage } from "@/testing/buttons";
import { colors } from "@/theme/tokens";

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

/** My cars, where a driver adds and changes cars (spec 16, 3.4, item 2). */
async function openCars(start: Parameters<typeof driver>[1] = {}) {
  let state: ReturnType<typeof driver> | undefined;
  const app = await renderApp("/drive/cars", {
    me: completeMe,
    setUp: (client) => {
      state = driver(client, start);
    },
  });
  expect(await screen.findByRole("header", { name: "My cars" })).toBeVisible();
  if (state === undefined) throw new Error("The fake driver was not set up.");
  return { ...app, driver: state };
}

/** From My cars: a link, as it opens a page. */
const addCar = async () => {
  await fireEvent.press(screen.getByRole("link", { name: "Add a car" }));
};

describe("Offer (spec 16, 3.6)", () => {
  it("is only for signed-in people", async () => {
    await renderApp("/offer");
    expect(await screen.findByRole("button", { name: "Sign in to offer a ride" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Where are you driving?" })).toBeNull();
  });
});

describe("Add a car (spec 3, 3.2)", () => {
  it("adds a car with a suggested make and a colour, then shows it", async () => {
    const app = await openCars();
    expect(screen.getByText("No cars yet. Add the car you drive.")).toBeVisible();
    await addCar();
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
    expect(screen).toHavePathname("/drive/cars");
    expect(
      app.client.calls.find((call) => call.path === "/v1/me/vehicles" && "body" in call.input)
        ?.input,
    ).toEqual({
      body: { make: "Toyota", model: "Yaris", colour: "blue", registration: "test-0001" },
      accessToken: "sr_at_access-1",
    });
  });

  it("asks for a colour before sending", async () => {
    const app = await openCars();
    await addCar();
    await fireEvent.changeText(await screen.findByLabelText("Make"), "Kia");
    await fireEvent.changeText(screen.getByLabelText("Model"), "Ceed");
    await fireEvent.press(screen.getByRole("button", { name: "Save car" }));
    expect(await inPage().findByText("Choose a colour.")).toBeVisible();
    expect(
      app.client.calls.some((call) => "body" in call.input && call.path === "/v1/me/vehicles"),
    ).toBe(false);
  });

  it("says over Save car what the form itself is missing, until it is mended (spec 31, 3.19)", async () => {
    await openCars();
    await addCar();
    await fireEvent.changeText(await screen.findByLabelText("Make"), "Kia");
    await fireEvent.changeText(screen.getByLabelText("Model"), "Ceed");
    // The field can be out of sight when Save is pressed: it is said by the button too.
    await fireEvent.press(inBar().getByRole("button", { name: "Save car" }));
    expect(await inBar().findByRole("alert")).toHaveTextContent("Choose a colour.");
    expect(inPage().getByText("Choose a colour.")).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Green" }));
    expect(inBar().queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Choose a colour.")).toBeNull();
  });

  it("clears a field's error as soon as it changes", async () => {
    await openCars();
    await addCar();
    await fireEvent.changeText(await screen.findByLabelText("Make"), "Kia");
    await fireEvent.changeText(screen.getByLabelText("Model"), "Ceed");
    await fireEvent.press(screen.getByRole("button", { name: "Save car" }));
    expect(await inPage().findByText("Choose a colour.")).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Green" }));
    expect(screen.queryByText("Choose a colour.")).toBeNull();
  });

  it("shows the field the server finds wrong", async () => {
    const app = await openCars();
    app.client.answer("/v1/me/vehicles", () =>
      failure(400, "vehicle_invalid", { details: [{ path: "registration", issue: "invalid" }] }),
    );
    await addCar();
    await fireEvent.changeText(await screen.findByLabelText("Make"), "Kia");
    await fireEvent.changeText(screen.getByLabelText("Model"), "Ceed");
    await fireEvent.press(screen.getByRole("radio", { name: "Red" }));
    await fireEvent.changeText(screen.getByLabelText("Number plate"), "TEST 0001");
    await fireEvent.press(screen.getByRole("button", { name: "Save car" }));
    expect(
      await inPage().findByText("Use 2 to 8 letters and numbers, or leave it empty for now."),
    ).toBeVisible();
    expect(screen).toHavePathname("/drive/cars/new");
  });
});

describe("My cars (spec 31, 3.19 and R31.1)", () => {
  const hidden = { includeHiddenElements: true };

  it("lists each car as a row with a picture, and Add a car as the last row", async () => {
    await openCars({ cars: [yaris] });
    const rows = within(screen.getByTestId("action-rows"));
    // Each opens a page: links, an `<a href>` on the web.
    const car = rows.getByRole("link", { name: "Toyota Yaris, white, No number plate yet" });
    expect(within(car).getByTestId("row-icon", hidden)).toBeTruthy();
    const add = rows.getByRole("link", { name: "Add a car" });
    expect(within(add).getByTestId("row-icon", hidden)).toBeTruthy();
    expect(rows.getAllByRole("link").at(-1)).toBe(add);
    expect(rows.queryAllByRole("button")).toEqual([]);
    // Rows only: while it lists cars the page has no main button, and no bar.
    expect(filledButtons()).toBe(0);
    expect(screen.queryByTestId("bottom-bar")).toBeNull();
  });

  it("has Add a car as its main button, in the bar, while there is no car", async () => {
    await openCars();
    expect(screen.getByText("No cars yet. Add the car you drive.")).toBeVisible();
    expect(inBar().getByRole("link", { name: "Add a car" })).toHaveStyle({ minHeight: 56 });
    expect(screen.queryByTestId("action-rows")).toBeNull();
  });
});

describe("Opened from a link", () => {
  it("goes on to My cars after adding a car", async () => {
    await renderApp("/drive/cars/new", { me: completeMe, setUp: (client) => driver(client) });
    await fireEvent.changeText(await screen.findByLabelText("Make"), "Kia");
    await fireEvent.changeText(screen.getByLabelText("Model"), "Ceed");
    await fireEvent.press(screen.getByRole("radio", { name: "Red" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save car" }));
    expect(await screen.findByRole("header", { name: "My cars" })).toBeVisible();
    expect(screen.getByText("Kia Ceed, red")).toBeVisible();
  });

  it("goes on to Profile after confirming the licence", async () => {
    await renderApp("/drive/licence", { me: completeMe, setUp: (client) => driver(client) });
    await fireEvent.press(
      await screen.findByRole("checkbox", {
        name: "I declare that I hold a valid driving licence for the cars I drive on PuffinRide",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("link", { name: "Driving licence, Confirmed" })).toBeVisible();
    expect(screen).toHavePathname("/profile");
  });
});

describe("Edit a car", () => {
  it("adds the number plate later", async () => {
    const app = await openCars({ cars: [yaris] });
    expect(screen.getByText("No number plate yet")).toBeVisible();
    await fireEvent.press(screen.getByRole("link", { name: /^Toyota Yaris, white/ }));
    expect(await screen.findByRole("header", { name: "Edit your car" })).toBeVisible();
    expect(screen.getByLabelText("Model")).toHaveDisplayValue("Yaris");
    expect(screen.getByRole("radio", { name: "White" })).toBeChecked();
    await fireEvent.changeText(screen.getByLabelText("Number plate"), "ÞÓRTEST1");
    await fireEvent.press(screen.getByRole("button", { name: "Save car" }));
    expect(await screen.findByText("ÞÓRTEST1")).toBeVisible();
    expect(app.driver.cars()[0]?.registration).toBe("ÞÓRTEST1");
  });

  it("says so when the car was removed elsewhere before saving", async () => {
    const app = await openCars({ cars: [yaris] });
    await fireEvent.press(screen.getByRole("link", { name: /^Toyota Yaris, white/ }));
    await fireEvent.changeText(await screen.findByLabelText("Model"), "Yaris Cross");
    app.client.answer("/v1/me/vehicles/{id}", () => failure(404, "not_found"));
    await fireEvent.press(screen.getByRole("button", { name: "Save car" }));
    expect(
      await screen.findByText("We couldn't find this car. It may have been removed."),
    ).toBeVisible();
    // Why Save did nothing is said over it, in the bar (spec 31, 3.19).
    expect(inBar().getByRole("alert")).toHaveTextContent(
      "We couldn't find this car. It may have been removed.",
    );
    expect(inPage().queryByRole("alert")).toBeNull();
  });

  it("removes a car after naming it", async () => {
    const app = await openCars({ cars: [yaris] });
    await fireEvent.press(screen.getByRole("link", { name: /^Toyota Yaris, white/ }));
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent").mockClear();
    const remove = await screen.findByRole("button", { name: "Remove car" });
    // Opening the page moved no focus (the count starts here: an earlier test moved some).
    expect(focus).not.toHaveBeenCalled();
    await fireEvent.press(remove);
    expect(screen.getByText("Remove Toyota Yaris? It stays on your past rides.")).toBeVisible();
    // The row pressed is gone: focus moves to the question in its place.
    expect(focus).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByText(/It stays on your past rides/)).toBeNull();
    // And back to the row, once the question is gone.
    expect(focus).toHaveBeenCalledTimes(2);
    focus.mockRestore();

    await fireEvent.press(screen.getByRole("button", { name: "Remove car" }));
    await fireEvent.press(screen.getByRole("button", { name: "Remove Toyota Yaris" }));
    expect(await screen.findByText("No cars yet. Add the car you drive.")).toBeVisible();
    expect(app.driver.cars()).toEqual([]);
    expect(screen.queryByText("Toyota Yaris, white")).toBeNull();
  });

  it("has Remove car as a red row, the last thing on the page (spec 31, R31.3)", async () => {
    await openCars({ cars: [yaris] });
    await fireEvent.press(screen.getByRole("link", { name: /^Toyota Yaris, white/ }));
    const rows = within(await screen.findByTestId("action-rows"));
    const remove = rows.getByRole("button", { name: "Remove car" });
    expect(within(remove).getByText("Remove car")).toHaveStyle({ color: colors.light.error });
    const hidden = { includeHiddenElements: true };
    expect(within(remove).getByTestId("row-icon", hidden)).toBeTruthy();
    expect(within(remove).queryByTestId("row-chevron", hidden)).toBeNull();
    // Under it is only the bar, with Save.
    const all = inPage()
      .getAllByText(/./)
      .map((text) => String(text.props.children));
    expect(all.at(-1)).toBe("Remove car");
    expect(inBar().getByRole("button", { name: "Save car" })).toHaveStyle({ minHeight: 56 });
    // Asking first stands where the row stood, with nothing in the middle.
    await fireEvent.press(remove);
    expect(screen.getByText("Remove Toyota Yaris? It stays on your past rides.")).not.toHaveStyle({
      textAlign: "center",
    });
    expect(screen.queryByTestId("action-rows")).toBeNull();
  });

  it("keeps a car that is on a trip that has not ended, and says why", async () => {
    const app = await openCars({ cars: [yaris] });
    await fireEvent.press(screen.getByRole("link", { name: /^Toyota Yaris, white/ }));
    await fireEvent.press(await screen.findByRole("button", { name: "Remove car" }));
    app.client.answer("/v1/me/vehicles/{id}", () => failure(409, "vehicle_in_use"));
    await fireEvent.press(screen.getByRole("button", { name: "Remove Toyota Yaris" }));
    expect(
      await screen.findByText(
        "This car is on a ride that hasn't ended yet. You can remove it after the ride.",
      ),
    ).toBeVisible();
    expect(app.driver.cars()).toEqual([yaris]);
  });

  it("says so when the car is gone", async () => {
    await renderApp(`/drive/cars/0190a1d6-0000-7000-8000-0000000000ff`, {
      me: completeMe,
      setUp: (client) => driver(client, { cars: [yaris] }),
    });
    expect(
      await screen.findByText("We couldn't find this car. It may have been removed."),
    ).toBeVisible();
    // The head stands also then, with the way back to My cars.
    const head = within(screen.getByTestId("screen-head"));
    expect(head.getByRole("header", { name: "Edit your car" })).toBeVisible();
    await fireEvent.press(head.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("header", { name: "My cars" })).toBeVisible();
  });
});

describe("Driving licence (spec 3, 3.3)", () => {
  it("asks for the tick, then confirms the declaration", async () => {
    const app = await renderApp("/profile", {
      me: completeMe,
      setUp: (client) => driver(client, { cars: [yaris] }),
    });
    await fireEvent.press(
      await screen.findByRole("link", { name: "Driving licence, Not confirmed yet" }),
    );
    expect(await screen.findByRole("header", { name: "Your driving licence" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Tick the box to confirm.")).toBeVisible();

    await fireEvent.press(
      screen.getByRole("checkbox", {
        name: "I declare that I hold a valid driving licence for the cars I drive on PuffinRide",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("link", { name: "Driving licence, Confirmed" })).toBeVisible();
    expect(screen).toHavePathname("/profile");
    expect(
      app.client.calls.find((call) => call.path === "/v1/me/driver-licence-declaration")?.input,
    ).toEqual({ body: { declared: true }, accessToken: "sr_at_access-1" });
  });

  it("says over the button, in the bar, why the declaration was not saved (spec 31, 3.19)", async () => {
    const app = await renderApp("/drive/licence", {
      me: completeMe,
      setUp: (client) => driver(client, { cars: [yaris] }),
    });
    await fireEvent.press(await screen.findByRole("checkbox", { name: /^I declare that I hold/ }));
    app.client.answer("/v1/me/driver-licence-declaration", () => failure(500, "internal_error"));
    await fireEvent.press(inBar().getByRole("button", { name: "Confirm" }));
    expect(await inBar().findByRole("alert")).toHaveTextContent(
      "Something went wrong on our side. Try again.",
    );
    expect(inPage().queryByRole("alert")).toBeNull();
  });
});
