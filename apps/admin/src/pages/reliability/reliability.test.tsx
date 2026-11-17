import {
  adminExcusedCancellationsRoute,
  adminMeRoute,
  adminOverruleRoute,
  adminReliabilityWatchRoute,
  type AdminExcusedCancellation,
  type AdminMe,
  type AdminWatchedPerson,
} from "@shareride/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleApp } from "../../app.tsx";
import { createFakeApi, createFakePasskeys } from "../../testing/fake-api.ts";

// The console's Reliability page (spec 8, 3.8; R8.10, R8.11; milestone 7,
// PR 7e). Everyone and everything here is made up.

const anna: AdminMe = {
  userId: "0196f000-0000-7000-8000-000000000001",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2026-11-16T23:00:00.000Z",
};

const borgarnes = { is: "N1 Borgarnesi", en: "N1 Borgarnes" };
const akureyri = { is: "Hof, Akureyri", en: "Hof, Akureyri" };
const vik = { is: "Vík í Mýrdal", en: "Vík" };
const hlemmur = { is: "Hlemmur", en: "Hlemmur" };

/** Jón cancelled his whole trip to Akureyri for the weather. */
const jonsTrip: AdminExcusedCancellation = {
  kind: "trip",
  id: "0196f000-0000-7000-8000-0000000000a1",
  person: { userId: "0196f000-0000-7000-8000-0000000000c1", firstName: "Jón" },
  role: "driver",
  reason: "weather",
  note: "A storm warning for Holtavörðuheiði.",
  cancelledAt: "2026-11-15T08:10:00.000Z",
  from: borgarnes,
  to: akureyri,
  departsAt: "2026-11-15T10:00:00.000Z",
  overruledAt: null,
};

/** Gunna cancelled her booking to Vík late, for a closed road. */
const gunnasBooking: AdminExcusedCancellation = {
  kind: "booking",
  id: "0196f000-0000-7000-8000-0000000000b1",
  person: { userId: "0196f000-0000-7000-8000-0000000000c2", firstName: "Gunna" },
  role: "passenger",
  reason: "road_closed",
  note: "",
  cancelledAt: "2026-11-14T18:30:00.000Z",
  from: hlemmur,
  to: vik,
  departsAt: "2026-11-15T07:00:00.000Z",
  overruledAt: null,
};

const dora: AdminWatchedPerson = {
  userId: "0196f000-0000-7000-8000-0000000000c3",
  firstName: "Dóra",
  reliability: {
    kept: 3,
    counted: 5,
    percent: 60,
    byRole: { driver: { kept: 1, counted: 2 }, passenger: { kept: 2, counted: 3 } },
  },
};

const overruledAt = "2026-11-16T09:12:00.000Z";

/** The page, with what the API gives; null for a list that fails to load. */
function start(
  cancellations: readonly AdminExcusedCancellation[] | null = [jonsTrip, gunnasBooking],
  people: readonly AdminWatchedPerson[] | null = [dora],
) {
  window.history.replaceState(null, "", "/admin/reliability");
  const api = createFakeApi();
  const failed = { status: 500, error: { code: "internal" } };
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(
    adminExcusedCancellationsRoute,
    cancellations === null ? failed : { status: 200, data: { cancellations } },
  );
  api.on(
    adminReliabilityWatchRoute,
    people === null ? failed : { status: 200, data: { watchPercent: 80, people } },
  );
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return api;
}

const cardsOf = async (name: string) =>
  within(await screen.findByRole("list", { name })).getAllByRole("listitem");

const excused = "Cancelled for the weather or a closed road";

describe("the Reliability page (spec 8, 3.8)", () => {
  it("is in the menu after Disputes", async () => {
    start();
    window.history.replaceState(null, "", "/admin");
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    const links = within(menu)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links.slice(0, 4)).toEqual(["Home", "Meeting points", "Disputes", "Reliability"]);
    fireEvent.click(within(menu).getByRole("link", { name: "Reliability" }));
    expect(await screen.findByRole("heading", { name: "Reliability", level: 1 })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/reliability");
  });

  it("lists the cancellations excused by their reason, with who, why, the ride and when", async () => {
    start();
    const [trip, booking] = await cardsOf(excused);
    if (trip === undefined || booking === undefined) throw new Error("Two cards expected.");
    expect(within(trip).getByRole("heading", { name: "N1 Borgarnes – Hof, Akureyri" })).toBeTruthy();
    expect(trip.textContent).toContain("Jón, the driver, cancelled the whole trip");
    expect(trip.textContent).toContain("Reason: Weather");
    expect(trip.textContent).toContain("Note to the passengers: “A storm warning for Holtavörðuheiði.”");
    expect(trip.textContent).toContain("Leaving 15 November at 10:00");
    expect(trip.textContent).toContain("Cancelled 15 November at 08:10");
    expect(booking.textContent).toContain("Gunna, the passenger, cancelled their booking");
    expect(booking.textContent).toContain("Reason: Road closed");
    expect(booking.textContent).not.toContain("Note to the passengers");
    expect(screen.getByText("2 cancellations in the last 12 months, newest first")).toBeTruthy();
  });

  it("names a driver who cancelled one booking", async () => {
    start([{ ...gunnasBooking, role: "driver", person: jonsTrip.person }]);
    const [card] = await cardsOf(excused);
    expect(card?.textContent).toContain("Jón, the driver, cancelled one passenger's booking");
  });

  it("overrules one after asking once more, so that it counts", async () => {
    const api = start();
    api.on(adminOverruleRoute, { status: 200, data: { ...jonsTrip, overruledAt } });
    const [trip] = await cardsOf(excused);
    if (trip === undefined) throw new Error("A card expected.");
    fireEvent.click(
      within(trip).getByRole("button", {
        name: "Overrule: Jón, N1 Borgarnes – Hof, Akureyri",
      }),
    );
    expect(api.called(adminOverruleRoute)).toHaveLength(0);
    const question = within(trip).getByRole("group", {
      name: "Make this cancellation count on Jón's reliability? It can't be undone in the console.",
    });
    const yes = within(question).getByRole("button", { name: "Yes, make it count" });
    await waitFor(() => {
      expect(document.activeElement).toBe(yes);
    });
    fireEvent.click(yes);

    const said = await screen.findByText("Jón's cancellation now counts on their reliability.");
    expect(said.getAttribute("role")).toBe("status");
    await waitFor(() => {
      expect(document.activeElement).toBe(said);
    });
    expect(api.called(adminOverruleRoute)[0]?.input).toMatchObject({
      params: { kind: "trip", id: jonsTrip.id },
      body: {},
    });
    const [after] = await cardsOf(excused);
    expect(after?.textContent).toContain("Overruled 16 November at 09:12: it counts");
    expect(within(after as HTMLElement).queryByRole("button", { name: /^Overrule/ })).toBeNull();
  });

  it("goes back without overruling, to the same button", async () => {
    const api = start();
    const [, booking] = await cardsOf(excused);
    if (booking === undefined) throw new Error("A card expected.");
    const overrule = within(booking).getByRole("button", { name: "Overrule: Gunna, Hlemmur – Vík" });
    fireEvent.click(overrule);
    fireEvent.click(within(booking).getByRole("button", { name: "Go back" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(booking).getByRole("button", { name: "Overrule: Gunna, Hlemmur – Vík" }),
      );
    });
    expect(api.called(adminOverruleRoute)).toHaveLength(0);
  });

  it("shows those already overruled as counting", async () => {
    start([{ ...jonsTrip, overruledAt }]);
    const [card] = await cardsOf(excused);
    expect(card?.textContent).toContain("Overruled 16 November at 09:12: it counts");
    expect(within(card as HTMLElement).queryByRole("button")).toBeNull();
  });

  it("reloads the list when another operator overruled it meanwhile", async () => {
    const api = start();
    api.on(adminOverruleRoute, { status: 409, error: { code: "already_overruled" } });
    const [trip] = await cardsOf(excused);
    fireEvent.click(
      within(trip as HTMLElement).getByRole("button", { name: /^Overrule: Jón/ }),
    );
    api.on(adminExcusedCancellationsRoute, {
      status: 200,
      data: { cancellations: [{ ...jonsTrip, overruledAt }, gunnasBooking] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Yes, make it count" }));
    expect(
      (await screen.findByRole("alert")).textContent,
    ).toBe("Another operator overruled it meanwhile. The list shows it as it is now.");
    await waitFor(async () => {
      const [after] = await cardsOf(excused);
      expect(after?.textContent).toContain("Overruled 16 November at 09:12: it counts");
    });
    expect(api.called(adminExcusedCancellationsRoute)).toHaveLength(2);
  });

  it("says when it can no longer be overruled, or could not be", async () => {
    const api = start();
    api.on(adminOverruleRoute, { status: 404, error: { code: "not_found" } });
    const [trip] = await cardsOf(excused);
    fireEvent.click(within(trip as HTMLElement).getByRole("button", { name: /^Overrule: Jón/ }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, make it count" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This cancellation can no longer be overruled. The list shows it as it is now.",
    );

    api.on(adminOverruleRoute, { status: 500, error: { code: "internal" } });
    const [again] = await cardsOf(excused);
    fireEvent.click(within(again as HTMLElement).getByRole("button", { name: /^Overrule: Jón/ }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, make it count" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("It could not be overruled. Try again.");
    });
  });

  it("says when nobody cancelled for these reasons", async () => {
    start([]);
    expect(
      await screen.findByText(
        "Nobody cancelled for the weather or a closed road in the last 12 months.",
      ),
    ).toBeTruthy();
  });

  it("says when the list could not be loaded, and tries again", async () => {
    const api = start(null);
    expect(await screen.findByText("The cancellations could not be loaded.")).toBeTruthy();
    api.on(adminExcusedCancellationsRoute, {
      status: 200,
      data: { cancellations: [jonsTrip] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load the cancellations again" }));
    expect(await cardsOf(excused)).toHaveLength(1);
  });
});

describe("the people below the watch level (spec 8, 3.8.4)", () => {
  const below = "Below the watch level";

  it("lists them lowest first, with their counts by role", async () => {
    start();
    const [card] = await cardsOf(below);
    if (card === undefined) throw new Error("A card expected.");
    expect(within(card).getByRole("heading", { name: "Dóra: 60%" })).toBeTruthy();
    expect(card.textContent).toContain("Kept 3 of 5 trips and bookings");
    expect(card.textContent).toContain("As a driver: 1 of 2 · As a passenger: 2 of 3");
    expect(
      screen.getByText(
        "Whose figure is below 80% over the last 12 months, lowest first. Look at what happened and decide on a warning or a suspension yourself: nothing here suspends anyone.",
      ),
    ).toBeTruthy();
  });

  it("says when nobody is below it", async () => {
    start([], []);
    expect(await screen.findByText("Nobody is below 80%.")).toBeTruthy();
  });

  it("says when the list could not be loaded, and tries again", async () => {
    const api = start([], null);
    expect(await screen.findByText("The people below the watch level could not be loaded.")).toBeTruthy();
    api.on(adminReliabilityWatchRoute, {
      status: 200,
      data: { watchPercent: 80, people: [dora] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load the people again" }));
    expect(await cardsOf(below)).toHaveLength(1);
  });
});
