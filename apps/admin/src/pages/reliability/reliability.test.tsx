import {
  adminChangeCountingRoute,
  adminExcusedCancellationsRoute,
  adminMeRoute,
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
  overruleNote: "",
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
  overruleNote: "",
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
const why = "Clear skies on Holtavörðuheiði all day.";
const overruled: AdminExcusedCancellation = { ...jonsTrip, overruledAt, overruleNote: why };

/** The page, with what the API gives; null for a list that fails to load. */
function start(
  cancellations: readonly AdminExcusedCancellation[] | null = [jonsTrip, gunnasBooking],
  people: readonly AdminWatchedPerson[] | null = [dora],
  path = "/admin/reliability",
) {
  window.history.replaceState(null, "", path);
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

const excused = "Cancelled for the weather or a closed road";
const below = "Below the watch level";

async function cards(name: string) {
  return within(await screen.findByRole("list", { name })).getAllByRole("listitem");
}

async function card(name: string, index: number) {
  const found = (await cards(name))[index];
  if (found === undefined) throw new Error(`No card ${String(index)} in ${name}.`);
  return found;
}

describe("the Reliability page (spec 8, 3.8)", () => {
  it("is in the menu after Disputes", async () => {
    start(undefined, undefined, "/admin");
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
    const [trip, booking] = await cards(excused);
    if (trip === undefined || booking === undefined) throw new Error("Two cards expected.");
    expect(
      within(trip).getByRole("heading", { name: "N1 Borgarnes – Hof, Akureyri" }),
    ).toBeTruthy();
    expect(trip.textContent).toContain("Jón, the driver, cancelled the whole trip");
    expect(trip.textContent).toContain("Reason: Weather");
    expect(trip.textContent).toContain("Their note: “A storm warning for Holtavörðuheiði.”");
    expect(trip.textContent).toContain("Leaving 15 November at 10:00");
    expect(trip.textContent).toContain("Cancelled 15 November at 08:10");
    expect(booking.textContent).toContain("Gunna, the passenger, cancelled their booking");
    expect(booking.textContent).toContain("Reason: Road closed");
    expect(booking.textContent).not.toContain("Their note");
    expect(screen.getByText("2 cancellations in the last 12 months, newest first")).toBeTruthy();
  });

  it("names a driver who cancelled one booking", async () => {
    start([{ ...gunnasBooking, role: "driver", person: jonsTrip.person }]);
    expect((await card(excused, 0)).textContent).toContain(
      "Jón, the driver, cancelled one passenger's booking",
    );
  });

  it("overrules one with a note, so that it counts", async () => {
    const api = start();
    api.on(adminChangeCountingRoute, { status: 200, data: overruled });
    const trip = await card(excused, 0);
    fireEvent.click(
      within(trip).getByRole("button", { name: "Overrule: Jón, N1 Borgarnes – Hof, Akureyri" }),
    );
    const note = within(trip).getByRole("textbox", { name: "Why it counts" });
    await waitFor(() => {
      expect(document.activeElement).toBe(note);
    });
    fireEvent.change(note, { target: { value: `  ${why}  ` } });
    fireEvent.click(within(trip).getByRole("button", { name: "Make it count" }));

    const said = await screen.findByText("Jón: the cancellation now counts on their reliability.");
    expect(said.getAttribute("role")).toBe("status");
    await waitFor(() => {
      expect(document.activeElement).toBe(said);
    });
    expect(api.called(adminChangeCountingRoute)[0]?.input).toMatchObject({
      params: { kind: "trip", id: jonsTrip.id },
      body: { counts: true, note: why },
    });
    const after = await card(excused, 0);
    expect(after.textContent).toContain("Overruled 16 November at 09:12: it counts");
    expect(after.textContent).toContain(`Operator's note: ${why}`);
    expect(within(after).queryByRole("textbox")).toBeNull();
    expect(
      within(after).getByRole("button", {
        name: "Undo the overrule: Jón, N1 Borgarnes – Hof, Akureyri",
      }),
    ).toBeTruthy();
  });

  it("asks for the note before anything is sent", async () => {
    const api = start();
    const trip = await card(excused, 0);
    fireEvent.click(within(trip).getByRole("button", { name: /^Overrule: Jón/ }));
    const note = within(trip).getByRole("textbox", { name: "Why it counts" });
    fireEvent.click(within(trip).getByRole("button", { name: "Make it count" }));
    expect(within(trip).getByText("Say why in a note.")).toBeTruthy();
    expect(note.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(note, { target: { value: "x".repeat(501) } });
    expect(note.getAttribute("aria-invalid")).toBe("false");
    fireEvent.click(within(trip).getByRole("button", { name: "Make it count" }));
    expect(within(trip).getByText("Keep the note to 500 characters or fewer.")).toBeTruthy();
    expect(api.called(adminChangeCountingRoute)).toHaveLength(0);
  });

  it("undoes an overrule with a note", async () => {
    const api = start([overruled]);
    api.on(adminChangeCountingRoute, {
      status: 200,
      data: { ...jonsTrip, overruleNote: "Pressed by mistake." },
    });
    const trip = await card(excused, 0);
    expect(trip.textContent).toContain(`Operator's note: ${why}`);
    fireEvent.click(within(trip).getByRole("button", { name: /^Undo the overrule: Jón/ }));
    fireEvent.change(within(trip).getByRole("textbox", { name: "Why it no longer counts" }), {
      target: { value: "Pressed by mistake." },
    });
    fireEvent.click(within(trip).getByRole("button", { name: "Stop it counting" }));
    expect(
      await screen.findByText("Jón: the cancellation no longer counts on their reliability."),
    ).toBeTruthy();
    expect(api.called(adminChangeCountingRoute)[0]?.input).toMatchObject({
      body: { counts: false, note: "Pressed by mistake." },
    });
    const after = await card(excused, 0);
    expect(after.textContent).not.toContain("Overruled");
    expect(after.textContent).toContain("Operator's note: Pressed by mistake.");
    expect(within(after).getByRole("button", { name: /^Overrule: Jón/ })).toBeTruthy();
  });

  it("goes back without a change, to the same button", async () => {
    const api = start();
    const booking = await card(excused, 1);
    fireEvent.click(
      within(booking).getByRole("button", { name: "Overrule: Gunna, Hlemmur – Vík" }),
    );
    fireEvent.click(within(booking).getByRole("button", { name: "Go back" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(booking).getByRole("button", { name: "Overrule: Gunna, Hlemmur – Vík" }),
      );
    });
    expect(within(booking).queryByRole("textbox")).toBeNull();
    expect(api.called(adminChangeCountingRoute)).toHaveLength(0);
  });

  it("shows the list as it is now when another operator changed it meanwhile", async () => {
    const api = start();
    api.on(adminChangeCountingRoute, { status: 409, error: { code: "unchanged" } });
    const trip = await card(excused, 0);
    fireEvent.click(within(trip).getByRole("button", { name: /^Overrule: Jón/ }));
    fireEvent.change(within(trip).getByRole("textbox"), { target: { value: why } });
    api.on(adminExcusedCancellationsRoute, {
      status: 200,
      data: { cancellations: [overruled, gunnasBooking] },
    });
    fireEvent.click(within(trip).getByRole("button", { name: "Make it count" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Another operator changed it meanwhile. The list shows it as it is now.",
    );
    await waitFor(async () => {
      expect((await card(excused, 0)).textContent).toContain("Overruled 16 November at 09:12");
    });
    expect(api.called(adminExcusedCancellationsRoute)).toHaveLength(2);
  });

  it("says when it can no longer be changed, or could not be saved", async () => {
    const api = start();
    api.on(adminChangeCountingRoute, { status: 500, error: { code: "internal" } });
    const trip = await card(excused, 0);
    fireEvent.click(within(trip).getByRole("button", { name: /^Overrule: Jón/ }));
    fireEvent.change(within(trip).getByRole("textbox"), { target: { value: why } });
    fireEvent.click(within(trip).getByRole("button", { name: "Make it count" }));
    expect((await within(trip).findByRole("alert")).textContent).toBe(
      "It could not be saved. Try again.",
    );
    // The note stays, to send again.
    expect(within(trip).getByRole<HTMLTextAreaElement>("textbox").value).toBe(why);

    api.on(adminChangeCountingRoute, { status: 404, error: { code: "not_found" } });
    api.on(adminExcusedCancellationsRoute, { status: 200, data: { cancellations: [] } });
    fireEvent.click(within(trip).getByRole("button", { name: "Make it count" }));
    expect(
      await screen.findByText(
        "This cancellation can no longer be changed. The list shows it as it is now.",
      ),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "Nobody cancelled for the weather or a closed road in the last 12 months.",
      ),
    ).toBeTruthy();
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
    api.on(adminExcusedCancellationsRoute, { status: 200, data: { cancellations: [jonsTrip] } });
    fireEvent.click(screen.getByRole("button", { name: "Load the cancellations again" }));
    expect(await cards(excused)).toHaveLength(1);
  });
});

describe("the people below the watch level (spec 8, 3.8.4)", () => {
  it("lists them lowest first, with their counts by role", async () => {
    start();
    const person = await card(below, 0);
    expect(within(person).getByRole("heading", { name: "Dóra: 60%" })).toBeTruthy();
    expect(person.textContent).toContain("Kept 3 of 5 trips and bookings");
    expect(person.textContent).toContain("As a driver: 1 of 2 · As a passenger: 2 of 3");
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
    expect(
      await screen.findByText("The people below the watch level could not be loaded."),
    ).toBeTruthy();
    api.on(adminReliabilityWatchRoute, {
      status: 200,
      data: { watchPercent: 80, people: [dora] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load the people again" }));
    expect(await cards(below)).toHaveLength(1);
  });
});
