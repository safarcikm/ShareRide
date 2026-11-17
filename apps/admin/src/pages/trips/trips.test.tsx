import {
  adminMeRoute,
  adminTripRoute,
  adminTripsRoute,
  type AdminMe,
  type AdminPerson,
  type AdminTrip,
  type AdminTripListItem,
} from "@shareride/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleApp } from "../../app.tsx";
import { createFakeApi, createFakePasskeys } from "../../testing/fake-api.ts";

// Made-up people and trips: Dóra drives from Borgarnes to Akureyri; Bára
// booked a seat and Kári's request was declined.

const operator: AdminMe = {
  userId: "0196f000-0000-7000-8000-000000000001",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2099-11-16T23:00:00.000Z",
};

const person = (userId: string, firstName: string): AdminPerson => ({
  userId,
  firstName,
  status: "active",
  suspendedUntil: null,
  locale: "is",
});

const dora = person("0196f000-0000-7000-8000-0000000000c1", "Dóra");
const bara = person("0196f000-0000-7000-8000-0000000000c2", "Bára");
const kari = person("0196f000-0000-7000-8000-0000000000c3", "Kári");

const tripId = "0196f000-0000-7000-8000-0000000000a1";
const borgarnes = {
  name: { is: "N1 Borgarnesi", en: "N1 Borgarnes" },
  plannedAt: "2099-11-20T10:00:00.000Z",
};
const blonduos = {
  name: { is: "Olís Blönduósi", en: "Olís Blönduós" },
  plannedAt: "2099-11-20T12:00:00.000Z",
};
const akureyri = {
  name: { is: "Hof, Akureyri", en: "Hof, Akureyri" },
  plannedAt: "2099-11-20T13:30:00.000Z",
};

const listed: AdminTripListItem = {
  id: tripId,
  driver: dora,
  status: "published",
  from: borgarnes,
  to: akureyri,
  departsAt: borgarnes.plannedAt,
  capacity: 3,
  seatsHeld: 1,
};

const trip: AdminTrip = {
  ...listed,
  stops: [
    { ...borgarnes, removed: false },
    { ...blonduos, removed: true },
    { ...akureyri, removed: false },
  ],
  vehicle: { make: "Skoda", model: "Octavia", colour: "white", registration: "AB123" },
  bookingMode: "approval",
  note: "No dogs, please.",
  noteHidden: true,
  cancelledAt: null,
  cancelledBy: null,
  bookings: [
    {
      id: "0196f000-0000-7000-8000-0000000000b1",
      passenger: bara,
      status: "confirmed",
      seats: 1,
      from: borgarnes,
      to: akureyri,
      totalPrice: { amount: 6500, currency: "ISK" },
      requestedAt: "2099-11-15T10:00:00.000Z",
      declineReason: null,
    },
    {
      id: "0196f000-0000-7000-8000-0000000000b2",
      passenger: kari,
      status: "declined",
      seats: 2,
      from: blonduos,
      to: akureyri,
      totalPrice: { amount: 5000, currency: "ISK" },
      requestedAt: "2099-11-15T11:00:00.000Z",
      declineReason: "luggage",
    },
  ],
};

function start(path: string, shown: AdminTrip | null = trip) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: operator });
  api.on(adminTripsRoute, { status: 200, data: { trips: [listed], more: false } });
  api.on(
    adminTripRoute,
    shown === null ? { status: 404, error: { code: "not_found" } } : { status: 200, data: shown },
  );
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return api;
}

describe("finding trips (spec 9, 3.5.1)", () => {
  it("is in the menu after Users, which follows Appeals", async () => {
    start("/admin");
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    const links = within(menu)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links.slice(4, 7)).toEqual(["Appeals", "Users", "Trips"]);
  });

  it("shows the trips from today on, each linking to its page", async () => {
    const api = start("/admin/trips");

    const list = await screen.findByRole("list", { name: "Trips from today on" });

    expect(api.called(adminTripsRoute)[0]?.input["query"]).toEqual({});
    const [card] = within(list).getAllByRole("listitem");
    if (card === undefined) throw new Error("A trip expected.");
    expect(
      within(card).getByRole("link", { name: "N1 Borgarnes – Hof, Akureyri" }).getAttribute("href"),
    ).toBe(`/admin/trips/${tripId}`);
    expect(card.textContent).toContain("Dóra");
    expect(card.textContent).toContain("1 of 3 seats held");
    expect(screen.getByRole("status").textContent).toBe("1 trip, the soonest first");
  });

  it("says when more trips matched than it lists", async () => {
    const api = start("/admin/trips");
    api.on(adminTripsRoute, { status: 200, data: { trips: [listed], more: true } });

    expect(
      await screen.findByText("Only the first 1 show. Narrow the search to see the others."),
    ).toBeTruthy();
  });

  it("finds them by day, stop and ID, and refuses an ID that is not whole", async () => {
    const api = start("/admin/trips");
    await screen.findByRole("list", { name: "Trips from today on" });

    fireEvent.change(screen.getByLabelText("Trip or booking ID"), {
      target: { value: "0196f000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find trips" }));

    expect(await screen.findByText("Enter a whole ID, as the console shows it.")).toBeTruthy();
    expect(screen.getByLabelText("Trip or booking ID")).toBe(document.activeElement);
    expect(api.called(adminTripsRoute)).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Trip or booking ID"), {
      target: { value: ` ${tripId.toUpperCase()} ` },
    });
    fireEvent.change(screen.getByLabelText("Day it leaves"), { target: { value: "2099-11-20" } });
    fireEvent.change(screen.getByLabelText("Stop"), { target: { value: " Borgar " } });
    fireEvent.click(screen.getByRole("button", { name: "Find trips" }));

    await screen.findByRole("list", { name: "Trips found" });
    expect(api.called(adminTripsRoute).at(-1)?.input["query"]).toEqual({
      date: "2099-11-20",
      place: "Borgar",
      id: tripId,
    });
    fireEvent.click(screen.getByRole("button", { name: "Show trips from today on" }));
    await screen.findByRole("list", { name: "Trips from today on" });
    expect(api.called(adminTripsRoute).at(-1)?.input["query"]).toEqual({});
  });
});

describe("finding trips, when answers come late or fail", () => {
  it("shows only the newest search's answer", async () => {
    let answerFirst: () => void = () => undefined;
    window.history.replaceState(null, "", "/admin/trips");
    const api = createFakeApi();
    api.on(adminMeRoute, { status: 200, data: operator });
    const other = { ...listed, id: "0196f000-0000-7000-8000-0000000000a2" };
    api.on(adminTripsRoute, () => {
      // The list from today on answers last, after the search for one ID.
      api.on(adminTripsRoute, { status: 200, data: { trips: [listed], more: false } });
      return new Promise((resolve) => {
        answerFirst = () => {
          resolve({ status: 200, data: { trips: [other], more: false } });
        };
      });
    });
    render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
    fireEvent.change(await screen.findByLabelText("Trip or booking ID"), {
      target: { value: tripId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find trips" }));
    await screen.findByRole("list", { name: "Trips found" });

    answerFirst();

    await waitFor(() => {
      expect(api.called(adminTripsRoute)).toHaveLength(2);
    });
    const cards = within(screen.getByRole("list", { name: "Trips found" })).getAllByRole("link");
    expect(cards.map((card) => card.getAttribute("href"))).toEqual([`/admin/trips/${tripId}`]);
  });

  it("offers to try again when the trips could not be loaded", async () => {
    window.history.replaceState(null, "", "/admin/trips");
    const api = createFakeApi();
    api.on(adminMeRoute, { status: 200, data: operator });
    api.on(adminTripsRoute, { status: 500, error: { code: "internal" } });
    render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);

    expect((await screen.findByRole("alert")).textContent).toBe("The trips could not be loaded.");
    api.on(adminTripsRoute, { status: 200, data: { trips: [listed], more: false } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("list", { name: "Trips from today on" })).toBeTruthy();
  });

  it("lists one driver's trips from their page, until the filter is cleared", async () => {
    const api = start(`/admin/trips?driverId=${dora.userId}`);

    await screen.findByRole("list", { name: "Trips found" });
    expect(api.called(adminTripsRoute)[0]?.input["query"]).toEqual({ driverId: dora.userId });
    expect(screen.getByText("Only the trips one driver drives.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Stop"), { target: { value: "Hof" } });
    fireEvent.click(screen.getByRole("button", { name: "Find trips" }));
    await waitFor(() => {
      expect(api.called(adminTripsRoute).at(-1)?.input["query"]).toEqual({
        driverId: dora.userId,
        place: "Hof",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Show trips from today on" }));
    await screen.findByRole("list", { name: "Trips from today on" });
    expect(window.location.search).toBe("");
    expect(api.called(adminTripsRoute).at(-1)?.input["query"]).toEqual({});
  });

  it("gives the list the focus when the filters are cleared", async () => {
    start("/admin/trips");
    await screen.findByRole("list", { name: "Trips from today on" });
    fireEvent.change(screen.getByLabelText("Stop"), { target: { value: "Hof" } });
    fireEvent.click(screen.getByRole("button", { name: "Find trips" }));
    await screen.findByRole("list", { name: "Trips found" });

    fireEvent.click(screen.getByRole("button", { name: "Show trips from today on" }));

    await screen.findByRole("list", { name: "Trips from today on" });
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Trips from today on" }),
    );
  });
});

describe("a trip's page (spec 9, 3.5.2)", () => {
  it("shows the driver, car, note, stops and every booking, with why one was declined", async () => {
    start(`/admin/trips/${tripId}`);

    expect(
      await screen.findByRole("heading", { level: 1, name: "N1 Borgarnes – Hof, Akureyri" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Dóra" }).getAttribute("href")).toBe(
      `/admin/users/${dora.userId}`,
    );
    const facts = screen.getByRole("region", { name: "The trip" });
    expect(facts.textContent).toContain("White Skoda Octavia · AB123");
    expect(facts.textContent).toContain("No dogs, please.");
    expect(facts.textContent).toContain("Removed by ShareRide");
    expect(facts.textContent).toContain("The driver accepts each request");
    const stops = within(screen.getByRole("list", { name: "Stops" })).getAllByRole("listitem");
    expect(stops.map((stop) => stop.textContent.includes("Removed"))).toEqual([false, true, false]);
    const bookings = within(
      screen.getByRole("list", { name: "Bookings and requests" }),
    ).getAllByRole("listitem");
    expect(bookings[0]?.textContent).toContain("Confirmed · 1 seat · N1 Borgarnes – Hof, Akureyri");
    expect(bookings[1]?.textContent).toContain("The driver's reason: The luggage wouldn't fit");
    expect(
      within(bookings[1] ?? document.body)
        .getByRole("link", { name: "Kári" })
        .getAttribute("href"),
    ).toBe(`/admin/users/${kari.userId}`);
  });

  it("offers to try again when the trip could not be loaded", async () => {
    const api = start(`/admin/trips/${tripId}`);
    api.on(adminTripRoute, { status: 500, error: { code: "internal" } });

    expect((await screen.findByRole("alert")).textContent).toBe("The trip could not be loaded.");
    api.on(adminTripRoute, { status: 200, data: trip });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "N1 Borgarnes – Hof, Akureyri" }),
    ).toBeTruthy();
  });

  it("says when there is no such trip", async () => {
    start(`/admin/trips/${tripId}`, null);

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "There is no such trip.",
    );
    expect(screen.getByRole("link", { name: "All trips" }).getAttribute("href")).toBe(
      "/admin/trips",
    );
  });
});
