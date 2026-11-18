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
  locale: AdminMe["locale"] = "en",
) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  const failed = { status: 500, error: { code: "internal" } };
  api.on(adminMeRoute, { status: 200, data: { ...anna, locale } });
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
const overruleJon =
  "Overrule: Jón, N1 Borgarnes – Hof, Akureyri, cancelled 15 November 2026 at 08:10";
const undoJon =
  "Undo the overrule: Jón, N1 Borgarnes – Hof, Akureyri, cancelled 15 November 2026 at 08:10";
const overruleGunna = "Overrule: Gunna, Hlemmur – Vík, cancelled 14 November 2026 at 18:30";

/** The words that describe a field, as a screen reader reads them with it. */
const descriptionOf = (field: HTMLElement) =>
  (field.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

/** Holds the answers to changing a cancellation until `release` is called. */
function holdChanges(api: ReturnType<typeof createFakeApi>) {
  const answer = api.client.call.bind(api.client);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  api.client.call = async (route, input) => {
    if (route.path === adminChangeCountingRoute.path) await held;
    return answer(route, input);
  };
  return () => {
    release();
  };
}

async function cards(name: string) {
  return within(await screen.findByRole("list", { name })).getAllByRole("listitem");
}

async function card(name: string, index: number) {
  const found = (await cards(name))[index];
  if (found === undefined) throw new Error(`No card ${String(index)} in ${name}.`);
  return found;
}

describe("the Reliability page (spec 8, 3.8)", () => {
  it("is in the menu after the safety pages", async () => {
    start(undefined, undefined, "/admin");
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    const links = within(menu)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links.slice(2, 6)).toEqual(["Disputes", "Reports", "Appeals", "Reliability"]);
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
    expect(trip.textContent).toContain("Leaving 15 November 2026 at 10:00");
    expect(trip.textContent).toContain("Cancelled 15 November 2026 at 08:10");
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
    fireEvent.click(within(trip).getByRole("button", { name: overruleJon }));
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
    expect(after.textContent).toContain("Overruled 16 November 2026 at 09:12: it counts");
    expect(after.textContent).toContain(`Operator's note: ${why}`);
    expect(within(after).queryByRole("textbox")).toBeNull();
    expect(within(after).getByRole("button", { name: undoJon })).toBeTruthy();
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

  it("moves to the note once its problem shows, so both are read together", async () => {
    start();
    const trip = await card(excused, 0);
    fireEvent.click(within(trip).getByRole("button", { name: overruleJon }));
    const note = within(trip).getByRole("textbox", { name: "Why it counts" });
    const send = within(trip).getByRole("button", { name: "Make it count" });
    const read: string[] = [];
    note.addEventListener("focus", () => {
      read.push(descriptionOf(note));
    });
    send.focus();
    fireEvent.click(send);
    await waitFor(() => {
      expect(document.activeElement).toBe(note);
    });
    expect(read).toEqual([
      "Only operators see it, for a warning or a complaint later. Up to 500 characters. Say why in a note.",
    ]);
  });

  it("opens no other card's note while a change is sent", async () => {
    const api = start();
    api.on(adminChangeCountingRoute, { status: 200, data: overruled });
    const release = holdChanges(api);
    const trip = await card(excused, 0);
    fireEvent.click(within(trip).getByRole("button", { name: overruleJon }));
    fireEvent.change(within(trip).getByRole("textbox"), { target: { value: why } });
    fireEvent.click(within(trip).getByRole("button", { name: "Make it count" }));
    const booking = await card(excused, 1);
    await waitFor(() => {
      expect(
        within(booking).getByRole<HTMLButtonElement>("button", { name: overruleGunna }).disabled,
      ).toBe(true);
    });
    expect(within(trip).getByRole<HTMLButtonElement>("button", { name: "Go back" }).disabled).toBe(
      true,
    );

    release();
    expect(
      await screen.findByText("Jón: the cancellation now counts on their reliability."),
    ).toBeTruthy();
    expect(
      within(booking).getByRole<HTMLButtonElement>("button", { name: overruleGunna }).disabled,
    ).toBe(false);
    expect(api.called(adminChangeCountingRoute)).toHaveLength(1);
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
    fireEvent.click(within(trip).getByRole("button", { name: "Don't count it" }));
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
    fireEvent.click(within(booking).getByRole("button", { name: overruleGunna }));
    fireEvent.click(within(booking).getByRole("button", { name: "Go back" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(booking).getByRole("button", { name: overruleGunna }),
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
      expect((await card(excused, 0)).textContent).toContain("Overruled 16 November 2026 at 09:12");
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

  it("does not say the list is as it is now when it could not be loaded again", async () => {
    const api = start();
    api.on(adminChangeCountingRoute, { status: 409, error: { code: "unchanged" } });
    const trip = await card(excused, 0);
    fireEvent.click(within(trip).getByRole("button", { name: /^Overrule: Jón/ }));
    fireEvent.change(within(trip).getByRole("textbox"), { target: { value: why } });
    api.on(adminExcusedCancellationsRoute, { status: 500, error: { code: "internal" } });
    fireEvent.click(within(trip).getByRole("button", { name: "Make it count" }));
    expect(await screen.findByText("Another operator changed it meanwhile.")).toBeTruthy();
    expect(screen.getByText("The cancellations could not be loaded.")).toBeTruthy();
    expect(screen.queryByText(/The list shows it as it is now/)).toBeNull();
  });

  it("tells two cancellations of the same ride apart by when they were made", async () => {
    start([
      jonsTrip,
      { ...jonsTrip, id: gunnasBooking.id, cancelledAt: "2025-12-01T08:10:00.000Z" },
    ]);
    const [first, second] = await cards(excused);
    if (first === undefined || second === undefined) throw new Error("Two cards expected.");
    expect(within(first).getByRole("button", { name: overruleJon })).toBeTruthy();
    expect(
      within(second).getByRole("button", {
        name: "Overrule: Jón, N1 Borgarnes – Hof, Akureyri, cancelled 1 December 2025 at 08:10",
      }),
    ).toBeTruthy();
  });

  it("reads right in Icelandic, a trip called off and a booking cancelled", async () => {
    start(undefined, undefined, undefined, "is");
    const name = "Aflýst eða afbókað vegna veðurs eða lokaðs vegar";
    const [trip, booking] = await cards(name);
    if (trip === undefined || booking === undefined) throw new Error("Two cards expected.");
    expect(trip.textContent).toContain("Jón, ökumaðurinn, aflýsti allri ferðinni");
    expect(trip.textContent).toContain("Hætt við 15. nóvember 2026 kl. 08:10");
    expect(booking.textContent).toContain("Gunna, farþeginn, afbókaði sig");
    expect(screen.getByText("2 tilvik síðustu 12 mánuði, nýjust fyrst")).toBeTruthy();
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
        "People whose figure is below 80% over the last 12 months, lowest first. Look at what happened and decide on a warning or a suspension yourself: nothing here suspends anyone.",
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
