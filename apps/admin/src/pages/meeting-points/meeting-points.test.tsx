import {
  adminActivateMeetingPointRoute,
  adminActivationChecklistRoute,
  adminCreateMeetingPointRoute,
  adminDescribeMeetingPointPhotoRoute,
  adminMeetingPointPhotosRoute,
  adminMeetingPointRoute,
  adminMeetingPointsRoute,
  adminMeRoute,
  adminMoveMeetingPointRoute,
  adminPauseMeetingPointRoute,
  adminResumeMeetingPointRoute,
  adminRetireMeetingPointRoute,
  adminUpdateMeetingPointRoute,
  type AdminActivationChecklist,
  type AdminMe,
  type AdminMeetingPoint,
  type AdminMeetingPointListItem,
  type AdminMeetingPointPhoto,
} from "@shareride/contracts";
import {
  activationItemRequired,
  activationItems,
  icelandDate,
  type ActivationItem,
} from "@shareride/domain";
import { formatDate } from "@shareride/i18n";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleApp } from "../../app.tsx";
import { createFakeApi, createFakePasskeys } from "../../testing/fake-api.ts";

const anna: AdminMe = {
  userId: "0196f000-0000-7000-8000-000000000001",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2026-11-16T23:00:00.000Z",
};

const pointId = "0196f000-0000-7000-8000-0000000000a1";

/** A made-up draft at Borgarnes. */
const draft: AdminMeetingPoint = {
  id: pointId,
  nameIs: "N1 Borgarnesi",
  nameEn: "N1 Borgarnes",
  aliases: ["Hyrnan"],
  position: { latitude: 64.5383, longitude: -21.9206 },
  region: "west",
  municipality: "Borgarbyggð",
  type: "fuel-station",
  amenities: ["toilets"],
  whereToStandIs: "Við inngang verslunarinnar.",
  whereToStandEn: "By the shop's entrance.",
  shelterHours: null,
  shelterNoteIs: null,
  shelterNoteEn: null,
  season: null,
  status: "draft",
  pauseReason: null,
  pausedUntil: null,
  lastCheckedOn: null,
  reviewDueOn: null,
  amenitiesReviewedOn: null,
  seasonReviewedOn: null,
  sample: false,
  futureTrips: 0,
  createdAt: "2026-11-16T10:00:00.000Z",
  updatedAt: "2026-11-16T10:00:00.000Z",
};

const listItem = (point: AdminMeetingPoint): AdminMeetingPointListItem => ({
  id: point.id,
  nameIs: point.nameIs,
  nameEn: point.nameEn,
  position: point.position,
  region: point.region,
  municipality: point.municipality,
  type: point.type,
  season: point.season,
  status: point.status,
  reviewDueOn: point.reviewDueOn,
  sample: point.sample,
  updatedAt: point.updatedAt,
  openIssues: 0,
});

const bsi: AdminMeetingPointListItem = {
  ...listItem(draft),
  id: "0196f000-0000-7000-8000-0000000000b2",
  nameIs: "BSÍ",
  nameEn: "BSÍ bus terminal",
  position: { latitude: 64.1371, longitude: -21.9337 },
  region: "capital",
  municipality: "Reykjavíkurborg",
  type: "bus-hub",
  status: "active",
  reviewDueOn: "2026-11-01",
  sample: true,
  openIssues: 2,
};

/** A checklist with these items still to do. */
const checklistWith = (...toDo: readonly ActivationItem[]): AdminActivationChecklist => ({
  items: activationItems.map((item) => ({
    item,
    done: !toDo.includes(item),
    required: activationItemRequired(item),
  })),
  ready: toDo.every((item) => !activationItemRequired(item)),
});

function start(path: string) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminMeetingPointsRoute, { status: 200, data: { meetingPoints: [bsi, listItem(draft)] } });
  api.on(adminMeetingPointRoute, { status: 200, data: draft });
  api.on(adminMeetingPointPhotosRoute, { status: 200, data: { photos: [] } });
  api.on(adminActivationChecklistRoute, {
    status: 200,
    data: checklistWith("photos", "amenities", "season", "confirmed"),
  });
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return api;
}

const field = (name: string) => screen.getByLabelText<HTMLInputElement>(name);
const type = (name: string, value: string) => {
  fireEvent.change(field(name), { target: { value } });
};

describe("the meeting points list (spec 2, 3.6.1)", () => {
  it("is in the menu after the home page", async () => {
    start("/admin");
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    const links = within(menu)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links.slice(0, 2)).toEqual(["Home", "Meeting points"]);
    fireEvent.click(within(menu).getByRole("link", { name: "Meeting points" }));
    expect(await screen.findByRole("heading", { name: "Meeting points", level: 1 })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/meeting-points");
  });

  it("lists every point with its status, type, place and review, beside the map", async () => {
    start("/admin/meeting-points");
    const list = await screen.findByRole("list", { name: "The meeting points" });
    const [first, second] = within(list).getAllByRole("listitem");
    if (first === undefined || second === undefined) throw new Error("Two points expected.");
    expect(within(first).getByRole("link", { name: "BSÍ" }).getAttribute("href")).toBe(
      `/admin/meeting-points/${bsi.id}`,
    );
    expect(first.textContent).toContain("Active");
    expect(first.textContent).toContain("Sample");
    expect(first.textContent).toContain("Bus hub · Reykjavíkurborg, Capital area");
    expect(first.textContent).toContain("Review overdue");
    expect(first.textContent).toContain("2 open problem reports");
    expect(second.textContent).toContain("Draft");
    expect(second.textContent).not.toContain("open problem report");
    expect(second.textContent).toContain("In use all year");
    expect(screen.getByText("2 meeting points")).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "Map of Iceland with 2 meeting points. The list shows the same points.",
      }),
    ).toBeTruthy();
  });

  it("filters, and keeps the filters in the address", async () => {
    const api = start("/admin/meeting-points");
    await screen.findByRole("list", { name: "The meeting points" });
    fireEvent.change(field("Status"), { target: { value: "draft" } });
    fireEvent.change(field("Region"), { target: { value: "west" } });
    type("Name", "borgar");
    fireEvent.click(screen.getByLabelText("Only points with their review overdue"));
    fireEvent.click(screen.getByLabelText("Only points with an open problem report"));
    fireEvent.click(screen.getByRole("button", { name: "Show meeting points" }));
    await waitFor(() => {
      expect(api.called(adminMeetingPointsRoute).at(-1)?.input["query"]).toEqual({
        status: "draft",
        region: "west",
        q: "borgar",
        reviewOverdue: true,
        openIssues: true,
      });
    });
    expect(window.location.search).toBe(
      "?status=draft&region=west&reviewOverdue=true&openIssues=true&q=borgar",
    );
  });

  it("starts from the filters in the address, and clears them", async () => {
    const api = start("/admin/meeting-points?season=out-of-season&type=parking");
    await screen.findByRole("list", { name: "The meeting points" });
    expect(api.called(adminMeetingPointsRoute)[0]?.input["query"]).toEqual({
      season: "out-of-season",
      type: "parking",
    });
    expect(field("Season").value).toBe("out-of-season");
    fireEvent.click(screen.getByRole("button", { name: "Clear the filters" }));
    await waitFor(() => {
      expect(api.called(adminMeetingPointsRoute).at(-1)?.input["query"]).toEqual({});
    });
    expect(window.location.search).toBe("");
  });

  it("says when there are none, none match, or they could not be loaded", async () => {
    const api = start("/admin/meeting-points");
    api.on(adminMeetingPointsRoute, { status: 200, data: { meetingPoints: [] } });
    expect(
      await screen.findByText("There are no meeting points yet. Add the first one."),
    ).toBeTruthy();
    type("Name", "zzz");
    fireEvent.click(screen.getByRole("button", { name: "Show meeting points" }));
    expect(await screen.findByText("No meeting points match these filters.")).toBeTruthy();
    api.on(adminMeetingPointsRoute, { status: 500, error: { code: "internal_error" } });
    fireEvent.click(screen.getByRole("button", { name: "Show meeting points" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The meeting points could not be loaded.",
    );
  });

  it("opens a new point's form, and a point's own", async () => {
    start("/admin/meeting-points");
    fireEvent.click(await screen.findByRole("link", { name: "Add a meeting point" }));
    expect(
      await screen.findByRole("heading", { name: "New meeting point", level: 1 }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/meeting-points/new");
    fireEvent.click(screen.getByRole("link", { name: "All meeting points" }));
    fireEvent.click(await screen.findByRole("link", { name: "N1 Borgarnesi" }));
    expect(await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 })).toBeTruthy();
  });
});

describe("activating several drafts at once (spec 21, 3.5)", () => {
  const hella: AdminMeetingPointListItem = {
    ...listItem(draft),
    id: "0196f000-0000-7000-8000-0000000000a2",
    nameIs: "N1 Hellu",
    updatedAt: "2026-11-16T10:05:00.000Z",
  };
  const blonduos: AdminMeetingPointListItem = {
    ...listItem(draft),
    id: "0196f000-0000-7000-8000-0000000000a3",
    nameIs: "Olís Blönduósi",
  };
  const panel = () => screen.getByRole("region", { name: "Activate several drafts" });

  function open() {
    const api = start("/admin/meeting-points?status=draft");
    api.on(adminMeetingPointsRoute, {
      status: 200,
      data: { meetingPoints: [bsi, listItem(draft), hella, blonduos] },
    });
    return api;
  }

  it("activates the ticked drafts one after another, confirmed today, and says how it went", async () => {
    const api = open();
    let answerFirst = () => {};
    const firstAnswered = new Promise<void>((resolve) => {
      answerFirst = resolve;
    });
    api.on(adminActivateMeetingPointRoute, async (input) => {
      if ((input["params"] as { id: string }).id === hella.id) {
        return {
          status: 409,
          error: {
            code: "activation_not_ready",
            details: [{ path: "whereToStand", issue: "not_done" }],
          },
        };
      }
      await firstAnswered;
      return { status: 200, data: { ...draft, status: "active" } };
    });
    const list = await screen.findByRole("list", { name: "The meeting points" });
    // Only drafts can be ticked.
    expect(within(list).queryByRole("checkbox", { name: "Select BSÍ" })).toBeNull();
    expect(panel().textContent).toContain(
      "Tick the drafts you have checked: the spot, where to stand, the amenities and the season. Activating them confirms each one today.",
    );
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select N1 Borgarnesi" }));
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select N1 Hellu" }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Confirm and activate 2 points" }));

    // One at a time: the second waits for the first, and the list waits too.
    expect((await within(panel()).findByText("Activating 1 of 2…")).getAttribute("role")).toBe(
      "status",
    );
    expect(api.called(adminActivateMeetingPointRoute)).toHaveLength(1);
    expect(
      within(list).getByRole<HTMLInputElement>("checkbox", { name: "Select N1 Hellu" }).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Show meeting points" }));
    expect(api.called(adminMeetingPointsRoute)).toHaveLength(1);
    answerFirst();

    const said = await within(panel()).findByText("1 point activated.");
    await waitFor(() => {
      expect(document.activeElement).toBe(said);
    });
    expect(
      api
        .called(adminActivateMeetingPointRoute)
        .map((call) => [call.input["params"], call.input["body"]]),
    ).toEqual([
      [{ id: pointId }, { updatedAt: draft.updatedAt, confirmToday: true }],
      [{ id: hella.id }, { updatedAt: hella.updatedAt, confirmToday: true }],
    ]);
    expect(within(panel()).getByRole("list", { name: "Not activated" }).textContent).toBe(
      "N1 Hellu: still to do: Where to stand, in Icelandic and English",
    );
    // The list is loaded again, with their new status.
    await waitFor(() => {
      expect(api.called(adminMeetingPointsRoute)).toHaveLength(2);
    });
  });

  it("selects every draft shown, and asks for one first", async () => {
    const api = open();
    const list = await screen.findByRole("list", { name: "The meeting points" });
    fireEvent.click(within(panel()).getByRole("button", { name: "Confirm and activate 0 points" }));
    expect((await within(panel()).findByRole("alert")).textContent).toBe(
      "Tick the drafts you have checked first.",
    );
    expect(api.called(adminActivateMeetingPointRoute)).toHaveLength(0);
    fireEvent.click(within(panel()).getByRole("button", { name: "Select every draft shown" }));
    expect(
      within(list)
        .getAllByRole("checkbox")
        .map((box) => (box as HTMLInputElement).checked),
    ).toEqual([true, true, true]);
    expect(within(panel()).queryByRole("alert")).toBeNull();
    expect(
      within(panel()).getByRole("button", { name: "Confirm and activate 3 points" }),
    ).toBeTruthy();
    fireEvent.click(within(panel()).getByRole("button", { name: "Clear the selection" }));
    expect(
      within(list)
        .getAllByRole("checkbox")
        .some((box) => (box as HTMLInputElement).checked),
    ).toBe(false);
  });

  it("stops when the API cannot be reached, and says which were not activated", async () => {
    const api = open();
    api.on(adminActivateMeetingPointRoute, { status: 503, error: { code: "network_error" } });
    const list = await screen.findByRole("list", { name: "The meeting points" });
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select N1 Borgarnesi" }));
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select N1 Hellu" }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Confirm and activate 2 points" }));
    await within(panel()).findByText("0 points activated.");
    expect(api.called(adminActivateMeetingPointRoute)).toHaveLength(1);
    expect(
      within(within(panel()).getByRole("list", { name: "Not activated" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "N1 Borgarnesi: could not be activated. Try again.",
      "N1 Hellu: could not be activated. Try again.",
    ]);
  });

  it("starts again with other filters", async () => {
    open();
    await screen.findByRole("list", { name: "The meeting points" });
    fireEvent.click(within(panel()).getByRole("button", { name: "Select every draft shown" }));
    fireEvent.click(screen.getByRole("button", { name: "Show meeting points" }));
    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: "The meeting points" }))
          .getAllByRole("checkbox")
          .some((box) => (box as HTMLInputElement).checked),
      ).toBe(false);
    });
    expect(
      within(panel()).getByRole("button", { name: "Confirm and activate 0 points" }),
    ).toBeTruthy();
  });

  it("keeps saying how it went when no draft is left", async () => {
    const api = start("/admin/meeting-points?status=draft");
    let loads = 0;
    api.on(adminMeetingPointsRoute, () => ({
      status: 200,
      data: { meetingPoints: loads++ === 0 ? [hella] : [] },
    }));
    api.on(adminActivateMeetingPointRoute, {
      status: 200,
      data: { ...draft, id: hella.id, status: "active" },
    });
    const list = await screen.findByRole("list", { name: "The meeting points" });
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select N1 Hellu" }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Confirm and activate 1 point" }));
    await waitFor(() => {
      expect(api.called(adminMeetingPointsRoute)).toHaveLength(2);
    });
    expect(within(panel()).getByText("1 point activated.")).toBeTruthy();
    // Nothing left to tick, so nothing to press.
    expect(within(panel()).queryByRole("button")).toBeNull();
  });

  it("is not offered when no draft is shown", async () => {
    const api = start("/admin/meeting-points");
    api.on(adminMeetingPointsRoute, { status: 200, data: { meetingPoints: [bsi] } });
    await screen.findByRole("list", { name: "The meeting points" });
    expect(screen.queryByRole("region", { name: "Activate several drafts" })).toBeNull();
  });
});

describe("the meeting point form (spec 2, 3.6.2)", () => {
  async function fillNew() {
    await screen.findByRole("heading", { name: "New meeting point", level: 1 });
    type("Icelandic name", "Olís Hveragerði");
    type(
      "Coordinates or a map link",
      "https://www.google.com/maps/place/Ol%C3%ADs/@64.0,-21.2,17z/data=!3d63.99938!4d-21.18525",
    );
    fireEvent.change(field("Region"), { target: { value: "south" } });
    type("Municipality", "Hveragerðisbær");
    fireEvent.change(field("Type"), { target: { value: "fuel-station" } });
  }

  it("reads a pasted map link, shows the spot and saves a draft", async () => {
    const api = start("/admin/meeting-points/new");
    let sent: Record<string, unknown> = {};
    api.on(adminCreateMeetingPointRoute, (input) => {
      sent = input["body"] as Record<string, unknown>;
      return {
        status: 201,
        data: { ...draft, id: pointId, nameIs: "Olís Hveragerði", nameEn: null, aliases: [] },
      };
    });
    await fillNew();
    expect(screen.getByText("Reads as 63.99938, -21.18525")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Olís Hveragerði on a map of Iceland" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Check it on OpenStreetMap" }).getAttribute("href"),
    ).toContain("mlat=63.99938&mlon=-21.18525");
    type("Other names people search for", "Olis\nHveragerdi\n");
    fireEvent.click(screen.getByLabelText("Toilets"));
    fireEvent.click(screen.getByLabelText("I have checked the amenities"));
    fireEvent.click(screen.getByRole("button", { name: "Save the draft" }));

    expect(await screen.findByText("Olís Hveragerði is saved as a draft.")).toBeTruthy();
    expect(sent).toEqual({
      nameIs: "Olís Hveragerði",
      nameEn: null,
      aliases: ["Olis", "Hveragerdi"],
      position: { latitude: 63.99938, longitude: -21.18525 },
      region: "south",
      municipality: "Hveragerðisbær",
      type: "fuel-station",
      amenities: ["toilets"],
      whereToStandIs: null,
      whereToStandEn: null,
      shelterHours: null,
      shelterNoteIs: null,
      shelterNoteEn: null,
      season: null,
      lastCheckedOn: null,
      amenitiesReviewed: true,
      seasonReviewed: false,
    });
    expect(window.location.pathname).toBe(`/admin/meeting-points/${pointId}`);
    expect(screen.getByRole("button", { name: "Save the changes" })).toBeTruthy();
  });

  it("keeps the new draft and what is typed after it, when the console shows it again", async () => {
    const api = start("/admin/meeting-points/new");
    api.on(adminCreateMeetingPointRoute, { status: 201, data: draft });
    let sent: Record<string, unknown> = {};
    api.on(adminUpdateMeetingPointRoute, (input) => {
      sent = { id: (input["params"] as { id: string }).id };
      return { status: 200, data: draft };
    });
    await fillNew();
    fireEvent.click(screen.getByRole("button", { name: "Save the draft" }));
    await screen.findByText("N1 Borgarnesi is saved as a draft.");
    type("Where to stand, in English", "By the pumps.");
    // Another language shows the page again, from the address it now has.
    fireEvent.click(screen.getByRole("button", { name: "Change the language to Icelandic" }));
    await screen.findByRole("button", { name: "Skipta yfir í ensku" });
    expect(screen.getByDisplayValue("By the pumps.")).toBeTruthy();
    expect(api.called(adminMeetingPointRoute)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Skipta yfir í ensku" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the changes" }));
    await waitFor(() => {
      expect(sent["id"]).toBe(pointId);
    });
  });

  it("names every problem before sending, with links to the fields", async () => {
    const api = start("/admin/meeting-points/new");
    await screen.findByRole("heading", { name: "New meeting point", level: 1 });
    type("Coordinates or a map link", "62.0107, -6.7741");
    fireEvent.click(screen.getByRole("button", { name: "Save the draft" }));

    const summary = await screen.findByRole("alert");
    expect(within(summary).getByText("Fix 5 fields to save:")).toBeTruthy();
    expect(
      within(summary)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Icelandic name: Fill this in.",
      "Coordinates or a map link: This spot is outside Iceland.",
      "Region: Fill this in.",
      "Municipality: Fill this in.",
      "Type: Fill this in.",
    ]);
    expect(document.activeElement).toBe(summary);
    expect(field("Icelandic name").getAttribute("aria-invalid")).toBe("true");
    expect(api.called(adminCreateMeetingPointRoute)).toEqual([]);
  });

  it("takes a field's error away once the field is changed, and checks again on saving", async () => {
    start("/admin/meeting-points/new");
    await screen.findByRole("heading", { name: "New meeting point", level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Save the draft" }));
    const summary = await screen.findByRole("alert");
    expect(field("Municipality").getAttribute("aria-invalid")).toBe("true");
    expect(field("Region").getAttribute("aria-invalid")).toBe("true");

    field("Municipality").focus();
    type("Municipality", "Hveragerðisbær");
    field("Region").focus();
    fireEvent.change(field("Region"), { target: { value: "south" } });
    expect(field("Municipality").getAttribute("aria-invalid")).toBe("false");
    expect(field("Municipality").getAttribute("aria-describedby") ?? "").not.toContain("error");
    expect(field("Region").getAttribute("aria-invalid")).toBe("false");
    expect(field("Icelandic name").getAttribute("aria-invalid")).toBe("true");
    // The list stays as it was until the next save, and keeps the focus where it is.
    expect(within(summary).getAllByRole("link")).toHaveLength(5);
    expect(document.activeElement).toBe(field("Region"));

    fireEvent.click(screen.getByRole("button", { name: "Save the draft" }));
    expect(within(await screen.findByRole("alert")).getAllByRole("link")).toHaveLength(3);
  });

  it("says when the pasted text has no coordinates", async () => {
    start("/admin/meeting-points/new");
    await screen.findByRole("heading", { name: "New meeting point", level: 1 });
    type("Coordinates or a map link", "BSÍ");
    expect(
      screen.getByText(
        "Coordinates could not be read from this. Paste them as 64.1371, -21.9337 or a map link.",
      ),
    ).toBeTruthy();
  });

  it("shows the API's problems by their fields", async () => {
    const api = start("/admin/meeting-points/new");
    api.on(adminCreateMeetingPointRoute, {
      status: 400,
      error: { code: "validation_failed", details: [{ path: "municipality", issue: "too_long" }] },
    });
    await fillNew();
    fireEvent.click(screen.getByRole("button", { name: "Save the draft" }));
    const summary = await screen.findByRole("alert");
    expect(within(summary).getByRole("link").textContent).toBe("Municipality: This is too long.");
    expect(field("Municipality").getAttribute("aria-invalid")).toBe("true");
  });

  it("gives a shelter's opening hours, a day at a time", async () => {
    const api = start("/admin/meeting-points/new");
    let sent: Record<string, unknown> = {};
    api.on(adminCreateMeetingPointRoute, (input) => {
      sent = input["body"] as Record<string, unknown>;
      return { status: 201, data: draft };
    });
    await fillNew();
    expect(
      screen.getByText("Tick Shelter under the amenities to give its opening hours."),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Shelter"));
    fireEvent.click(screen.getByLabelText("Give the shelter's opening hours"));
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
      type(`Opens on ${day}`, "07:00");
      type(`Closes on ${day}`, "23:30");
    }
    fireEvent.click(screen.getByLabelText("Closed on Sunday"));
    expect(field("Opens on Sunday").disabled).toBe(true);
    type("Note on the opening hours, in English", "Closed on Christmas Day.");
    fireEvent.click(screen.getByRole("button", { name: "Save the draft" }));
    await waitFor(() => {
      expect(sent["shelterHours"]).toEqual([
        ...Array.from({ length: 6 }, () => ({ opens: "07:00", closes: "23:30" })),
        null,
      ]);
    });
    expect(sent["amenities"]).toEqual(["shelter"]);
    expect(sent["shelterNoteEn"]).toBe("Closed on Christmas Day.");
  });

  it("asks for each day's times, or Closed", async () => {
    start("/admin/meeting-points/new");
    await fillNew();
    fireEvent.click(screen.getByLabelText("Shelter"));
    fireEvent.click(screen.getByLabelText("Give the shelter's opening hours"));
    fireEvent.click(screen.getByRole("button", { name: "Save the draft" }));
    const summary = await screen.findByRole("alert");
    expect(within(summary).getByText("Fix 7 fields to save:")).toBeTruthy();
    expect(within(summary).getAllByRole("link")[0]?.textContent).toBe(
      "Monday: Give an opening and a closing time, or tick Closed.",
    );
    // Each day says it under its name; the box for the hours as a whole has no error.
    expect(screen.queryByText("Choose one of the options.")).toBeNull();
    expect(field("Give the shelter's opening hours").getAttribute("aria-invalid")).not.toBe("true");
    const error = field("Opens on Monday").getAttribute("aria-describedby");
    expect(error).toBeTruthy();
    expect(field("Closes on Monday").getAttribute("aria-describedby")).toBe(error);
  });

  it("takes a closing time of 00:00 as midnight, so a shelter can be open all day", async () => {
    const api = start("/admin/meeting-points/new");
    let sent: Record<string, unknown> = {};
    api.on(adminCreateMeetingPointRoute, (input) => {
      sent = input["body"] as Record<string, unknown>;
      return { status: 201, data: draft };
    });
    await fillNew();
    fireEvent.click(screen.getByLabelText("Shelter"));
    fireEvent.click(screen.getByLabelText("Give the shelter's opening hours"));
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
      type(`Opens on ${day}`, "00:00");
      type(`Closes on ${day}`, "00:00");
    }
    type("Opens on Sunday", "10:00");
    type("Closes on Sunday", "00:00");
    fireEvent.click(screen.getByRole("button", { name: "Save the draft" }));
    await waitFor(() => {
      expect(sent["shelterHours"]).toEqual([
        ...Array.from({ length: 6 }, () => ({ opens: "00:00", closes: "24:00" })),
        { opens: "10:00", closes: "24:00" },
      ]);
    });
  });

  it("names a name that is too long among the other names, and its link goes there", async () => {
    start("/admin/meeting-points/new");
    await fillNew();
    type("Other names people search for", `Olís\n${"Hveragerði ".repeat(5)}`);
    fireEvent.click(screen.getByRole("button", { name: "Save the draft" }));
    const link = within(await screen.findByRole("alert")).getByRole("link");
    expect(link.textContent).toBe("Other names people search for: This is too long.");
    fireEvent.click(link);
    expect(document.activeElement).toBe(field("Other names people search for"));
    expect(link.getAttribute("href")).toBe(`#${field("Other names people search for").id}`);
  });

  it("gives a season of whole months", async () => {
    const api = start("/admin/meeting-points/new");
    let sent: Record<string, unknown> = {};
    api.on(adminCreateMeetingPointRoute, (input) => {
      sent = input["body"] as Record<string, unknown>;
      return { status: 201, data: draft };
    });
    await fillNew();
    fireEvent.click(screen.getByLabelText("Only some months"));
    fireEvent.change(field("From"), { target: { value: "11" } });
    fireEvent.change(field("To"), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("I have checked the season"));
    fireEvent.click(screen.getByRole("button", { name: "Save the draft" }));
    await waitFor(() => {
      expect(sent["season"]).toEqual({ startMonth: 11, endMonth: 3 });
    });
    expect(sent["seasonReviewed"]).toBe(true);
  });

  it("opens a point with its fields, and saves the changes with the copy it loaded", async () => {
    const api = start(`/admin/meeting-points/${pointId}`);
    let sent: Record<string, unknown> = {};
    api.on(adminUpdateMeetingPointRoute, (input) => {
      sent = input["body"] as Record<string, unknown>;
      return {
        status: 200,
        data: { ...draft, whereToStandEn: "By the pumps.", updatedAt: "2026-11-16T11:00:00.000Z" },
      };
    });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    expect(screen.getByText("Status: Draft")).toBeTruthy();
    expect(field("Icelandic name").value).toBe("N1 Borgarnesi");
    expect(field("Other names people search for").value).toBe("Hyrnan");
    expect(field("Coordinates or a map link").value).toBe("64.5383, -21.9206");
    expect(screen.getByLabelText<HTMLInputElement>("Toilets").checked).toBe(true);
    type("Where to stand, in English", "By the pumps.");
    fireEvent.click(screen.getByRole("button", { name: "Save the changes" }));

    expect(await screen.findByText("The changes are saved.")).toBeTruthy();
    expect(sent).toMatchObject({
      whereToStandEn: "By the pumps.",
      updatedAt: "2026-11-16T10:00:00.000Z",
    });
    // The next save goes with the copy just saved.
    fireEvent.click(screen.getByRole("button", { name: "Save the changes" }));
    await waitFor(() => {
      expect(sent["updatedAt"]).toBe("2026-11-16T11:00:00.000Z");
    });
  });

  it("says when the point was saved elsewhere since, and loads the newest copy", async () => {
    const api = start(`/admin/meeting-points/${pointId}`);
    api.on(adminUpdateMeetingPointRoute, { status: 409, error: { code: "meeting_point_changed" } });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    type("Where to stand, in English", "Mine.");
    fireEvent.click(screen.getByRole("button", { name: "Save the changes" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This meeting point was saved somewhere else after you opened it.",
    );
    api.on(adminMeetingPointRoute, {
      status: 200,
      data: { ...draft, whereToStandEn: "Theirs.", updatedAt: "2026-11-16T12:00:00.000Z" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load the newest copy" }));
    const notice = await screen.findByText(
      "This is the newest copy. Make your change again, then save.",
    );
    // The notice takes the focus in an effect after it is shown, which can come later.
    await waitFor(() => {
      expect(document.activeElement).toBe(notice);
    });
    expect(field("Where to stand, in English").value).toBe("Theirs.");
    // The next save goes with the newest copy.
    api.on(adminUpdateMeetingPointRoute, { status: 200, data: draft });
    fireEvent.click(screen.getByRole("button", { name: "Save the changes" }));
    await screen.findByText("The changes are saved.");
    expect(api.called(adminUpdateMeetingPointRoute).at(-1)?.input["body"]).toMatchObject({
      updatedAt: "2026-11-16T12:00:00.000Z",
    });
  });

  it("says when the point was retired elsewhere since", async () => {
    const api = start(`/admin/meeting-points/${pointId}`);
    api.on(adminUpdateMeetingPointRoute, { status: 409, error: { code: "meeting_point_retired" } });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    type("Where to stand, in English", "Mine.");
    fireEvent.click(screen.getByRole("button", { name: "Save the changes" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This meeting point was saved somewhere else after you opened it.",
    );
    api.on(adminMeetingPointRoute, { status: 200, data: { ...draft, status: "retired" } });
    fireEvent.click(screen.getByRole("button", { name: "Load the newest copy" }));
    expect(await screen.findByText("Status: Retired")).toBeTruthy();
  });

  it("keeps the spot of a point in use, which moves with its own step", async () => {
    const api = start(`/admin/meeting-points/${pointId}`);
    api.on(adminMeetingPointRoute, { status: 200, data: { ...draft, status: "active" } });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    expect(field("Coordinates or a map link").readOnly).toBe(true);
    expect(
      screen.getByText(
        "Only a draft's spot is changed here. To move a point in use, choose Move under In use.",
      ),
    ).toBeTruthy();
  });

  it("shows a retired point as it is, without saving", async () => {
    const api = start(`/admin/meeting-points/${pointId}`);
    api.on(adminMeetingPointRoute, { status: 200, data: { ...draft, status: "retired" } });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    expect(
      screen.getByText(
        "This meeting point is retired. It stays as it was, for the trips that used it.",
      ),
    ).toBeTruthy();
    expect(field("Icelandic name").matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Save the changes" })).toBeNull();
  });

  it("says when there is no such point", async () => {
    const api = start(`/admin/meeting-points/${pointId}`);
    api.on(adminMeetingPointRoute, { status: 404, error: { code: "not_found" } });
    expect(await screen.findByText("This meeting point could not be found.")).toBeTruthy();
  });
});

describe("pausing, bringing back and retiring a point (spec 2, 3.6.4 and 3.6.5)", () => {
  const active: AdminMeetingPoint = { ...draft, status: "active", futureTrips: 2 };
  const inAWeek = icelandDate(new Date(Date.now() + 7 * 24 * 3600_000));
  const paused: AdminMeetingPoint = {
    ...active,
    status: "paused",
    pauseReason: { is: "Vegavinna við innganginn.", en: "Road works by the entrance." },
    pausedUntil: inAWeek,
    updatedAt: "2026-11-16T11:00:00.000Z",
  };

  function open(point: AdminMeetingPoint) {
    const api = start(`/admin/meeting-points/${pointId}`);
    api.on(adminMeetingPointRoute, { status: 200, data: point });
    return api;
  }

  const panel = () => screen.getByRole("region", { name: "In use" });

  it("opens the pause at once when a problem report leads here", async () => {
    const api = start(`/admin/meeting-points/${pointId}?pause`);
    api.on(adminMeetingPointRoute, { status: 200, data: active });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    await waitFor(() => {
      expect(document.activeElement).toBe(field("Reason, in Icelandic"));
    });
    // Reloading the page later does not open it again.
    expect(window.location.search).toBe("");
  });

  it("pauses an active point with a reason in both languages and an end date", async () => {
    const api = open(active);
    let sent: Record<string, unknown> = {};
    api.on(adminPauseMeetingPointRoute, (input) => {
      sent = input["body"] as Record<string, unknown>;
      return { status: 200, data: paused };
    });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    // Typed before the pause, and not saved yet.
    type("Where to stand, in English", "By the pumps.");
    expect(panel().textContent).toContain("2 upcoming trips stop here.");
    fireEvent.click(within(panel()).getByRole("button", { name: "Pause" }));
    expect(document.activeElement).toBe(field("Reason, in Icelandic"));
    expect(panel().textContent).toContain(
      "Their drivers, and the passengers who get in or out here, are told at once. Drivers are asked to choose another stop.",
    );
    type("Reason, in Icelandic", " Vegavinna við innganginn. ");
    type("Reason, in English", "Road works by the entrance.");
    type("Back in use on (optional)", inAWeek);
    // The button is read with what a pause does.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Pause N1 Borgarnesi",
        description: /are told at once/,
      }),
    );

    const notice = await screen.findByText("N1 Borgarnesi is paused.");
    await waitFor(() => {
      expect(document.activeElement).toBe(notice);
    });
    expect(sent).toEqual({
      reasonIs: "Vegavinna við innganginn.",
      reasonEn: "Road works by the entrance.",
      until: inAWeek,
      updatedAt: active.updatedAt,
    });
    expect(screen.getByText("Status: Paused")).toBeTruthy();
    expect(panel().textContent).toContain("Road works by the entrance.");
    expect(panel().textContent).toContain(`Back in use on ${formatDate(inAWeek, "en")}.`);
    // The form keeps what was typed, and saves it with the copy the pause returned.
    expect(field("Where to stand, in English").value).toBe("By the pumps.");
    api.on(adminUpdateMeetingPointRoute, { status: 200, data: paused });
    fireEvent.click(screen.getByRole("button", { name: "Save the changes" }));
    await waitFor(() => {
      expect(api.called(adminUpdateMeetingPointRoute).at(-1)?.input["body"]).toMatchObject({
        whereToStandEn: "By the pumps.",
        updatedAt: paused.updatedAt,
      });
    });
  });

  it("checks the pause before sending it, and can be put away", async () => {
    const api = open(active);
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    fireEvent.click(within(panel()).getByRole("button", { name: "Pause" }));
    type("Reason, in English", "x".repeat(201));
    type("Back in use on (optional)", icelandDate(new Date()));
    fireEvent.click(screen.getByRole("button", { name: "Pause N1 Borgarnesi" }));

    expect(await screen.findByText("Fill this in.")).toBeTruthy();
    expect(screen.getByText("This is too long.")).toBeTruthy();
    expect(screen.getByText("Give a day after today.")).toBeTruthy();
    expect(field("Reason, in Icelandic").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("Reason, in Icelandic"));
    expect(api.called(adminPauseMeetingPointRoute)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Keep it in use" }));
    expect(screen.queryByLabelText("Reason, in Icelandic")).toBeNull();
    expect(document.activeElement).toBe(within(panel()).getByRole("button", { name: "Pause" }));
  });

  it("shows a paused point's reason, and brings it back into use", async () => {
    const api = open({ ...paused, pausedUntil: null });
    let sent: Record<string, unknown> = {};
    api.on(adminResumeMeetingPointRoute, (input) => {
      sent = input["body"] as Record<string, unknown>;
      return { status: 200, data: { ...active, updatedAt: "2026-11-16T12:00:00.000Z" } };
    });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    expect(panel().textContent).toContain("Vegavinna við innganginn.");
    expect(panel().textContent).toContain("Road works by the entrance.");
    expect(panel().textContent).toContain("Paused until you bring it back.");
    fireEvent.click(within(panel()).getByRole("button", { name: "Bring it back into use" }));

    expect(await screen.findByText("N1 Borgarnesi is back in use.")).toBeTruthy();
    expect(sent).toEqual({ updatedAt: paused.updatedAt });
    expect(screen.getByText("Status: Active")).toBeTruthy();
    expect(within(panel()).getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("retires a point with trips to come after the last one, saying so first", async () => {
    const api = open(active);
    let sent: Record<string, unknown> = {};
    api.on(adminRetireMeetingPointRoute, (input) => {
      sent = input["body"] as Record<string, unknown>;
      return { status: 200, data: { ...active, status: "retiring" } };
    });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    fireEvent.click(within(panel()).getByRole("button", { name: "Retire" }));
    const confirm = screen.getByRole("button", {
      name: "Retire N1 Borgarnesi",
      description: /retires after the last of them\. Retiring is for good\./,
    });
    expect(document.activeElement).toBe(confirm);
    expect(panel().textContent).toContain(
      "New trips cannot use it from now. 2 upcoming trips stop here, so it retires after the last of them. Retiring is for good.",
    );
    fireEvent.click(confirm);

    expect(await screen.findByText("N1 Borgarnesi retires after its last trip.")).toBeTruthy();
    expect(sent).toEqual({ updatedAt: active.updatedAt });
    expect(screen.getByText("Status: Retiring")).toBeTruthy();
    // Its trips still stop there, so it can still be moved, and nothing else.
    expect(
      within(panel())
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Move"]);
  });

  it("retires a point without trips to come at once, or keeps it", async () => {
    const api = open(draft);
    api.on(adminRetireMeetingPointRoute, { status: 200, data: { ...draft, status: "retired" } });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    expect(within(panel()).queryByRole("button", { name: "Pause" })).toBeNull();
    fireEvent.click(within(panel()).getByRole("button", { name: "Retire" }));
    expect(panel().textContent).toContain("It is retired at once. Retiring is for good.");
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(document.activeElement).toBe(within(panel()).getByRole("button", { name: "Retire" }));

    fireEvent.click(within(panel()).getByRole("button", { name: "Retire" }));
    fireEvent.click(screen.getByRole("button", { name: "Retire N1 Borgarnesi" }));
    expect(await screen.findByText("N1 Borgarnesi is retired.")).toBeTruthy();
    expect(screen.getByText("Status: Retired")).toBeTruthy();
    expect(field("Icelandic name").matches(":disabled")).toBe(true);
    expect(screen.queryByRole("region", { name: "In use" })).toBeNull();
  });

  it("says when the point changed elsewhere, and loads the newest copy", async () => {
    const api = open(active);
    api.on(adminRetireMeetingPointRoute, {
      status: 409,
      error: { code: "status_change_not_allowed" },
    });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    fireEvent.click(within(panel()).getByRole("button", { name: "Retire" }));
    fireEvent.click(screen.getByRole("button", { name: "Retire N1 Borgarnesi" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This meeting point was saved somewhere else after you opened it.",
    );
    api.on(adminMeetingPointRoute, { status: 200, data: paused });
    fireEvent.click(screen.getByRole("button", { name: "Load the newest copy" }));
    expect(await screen.findByText("Status: Paused")).toBeTruthy();
    // Nothing to save again: the status is what to check.
    expect(
      screen.getByText("This is the newest copy. Check its status, then try again."),
    ).toBeTruthy();
  });

  it("says when a pause finds the point saved elsewhere since", async () => {
    const api = open(active);
    api.on(adminPauseMeetingPointRoute, { status: 409, error: { code: "meeting_point_changed" } });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    fireEvent.click(within(panel()).getByRole("button", { name: "Pause" }));
    type("Reason, in Icelandic", "Lokað.");
    type("Reason, in English", "Closed.");
    fireEvent.click(screen.getByRole("button", { name: "Pause N1 Borgarnesi" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This meeting point was saved somewhere else after you opened it.",
    );
    expect(screen.queryByLabelText("Reason, in Icelandic")).toBeNull();
  });

  it("shows the API's problems with a pause under their fields", async () => {
    const api = open(active);
    api.on(adminPauseMeetingPointRoute, {
      status: 400,
      error: {
        code: "validation_failed",
        details: [{ path: "until", issue: "not_after_today" }],
      },
    });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    fireEvent.click(within(panel()).getByRole("button", { name: "Pause" }));
    type("Reason, in Icelandic", "Lokað.");
    type("Reason, in English", "Closed.");
    type("Back in use on (optional)", inAWeek);
    fireEvent.click(screen.getByRole("button", { name: "Pause N1 Borgarnesi" }));
    expect(await screen.findByText("Give a day after today.")).toBeTruthy();
    expect(field("Back in use on (optional)").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("Back in use on (optional)"));
  });

  it("says when a change could not be made", async () => {
    const api = open(paused);
    api.on(adminResumeMeetingPointRoute, { status: 500, error: { code: "internal" } });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    fireEvent.click(within(panel()).getByRole("button", { name: "Bring it back into use" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("The status could not be changed. Try again.");
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
    expect(screen.getByText("Status: Paused")).toBeTruthy();
  });
});

describe("moving a point in use (spec 2, 3.6.6)", () => {
  const active: AdminMeetingPoint = { ...draft, status: "active", futureTrips: 2 };
  // 300 m north of the point.
  const farSpot = { latitude: 64.541, longitude: -21.9206 };
  const panel = () => screen.getByRole("region", { name: "In use" });
  const newSpot = "New spot: coordinates or a map link";

  function open(point: AdminMeetingPoint) {
    const api = start(`/admin/meeting-points/${pointId}`);
    api.on(adminMeetingPointRoute, { status: 200, data: point });
    return api;
  }

  it("moves an active point to a pasted spot, saying how far it is and who is told", async () => {
    const api = open(active);
    const moved: AdminMeetingPoint = {
      ...active,
      position: farSpot,
      updatedAt: "2026-11-16T12:00:00.000Z",
    };
    let sent: Record<string, unknown> = {};
    api.on(adminMoveMeetingPointRoute, (input) => {
      sent = input["body"] as Record<string, unknown>;
      return { status: 200, data: { meetingPoint: moved, metres: 300, tripsTold: 2 } };
    });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    // Typed before the move, and not saved yet.
    type("Where to stand, in English", "By the pumps.");
    fireEvent.click(within(panel()).getByRole("button", { name: "Move" }));
    expect(document.activeElement).toBe(field(newSpot));
    expect(panel().textContent).toContain(
      "If it moves more than 50 m, the drivers of its upcoming trips, and the passengers who get in or out here, are told.",
    );
    type(newSpot, "https://www.google.com/maps/@64.541,-21.9206,17z");
    expect(panel().textContent).toContain(
      "300 m from where it is now, so those on 2 upcoming trips are told.",
    );
    expect(
      within(panel()).getByRole("link", { name: "Check it on OpenStreetMap" }).getAttribute("href"),
    ).toBe("https://www.openstreetmap.org/?mlat=64.541&mlon=-21.9206#map=17/64.541/-21.9206");
    // The button is read with what the move does.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Move N1 Borgarnesi",
        description: "300 m from where it is now, so those on 2 upcoming trips are told.",
      }),
    );

    const notice = await screen.findByText(
      "N1 Borgarnesi is moved 300 m, and its distances are computed again. The drivers of 2 trips, and their passengers who get in or out here, are told.",
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(notice);
    });
    expect(sent).toEqual({ position: farSpot, updatedAt: active.updatedAt });
    expect(screen.queryByLabelText(newSpot)).toBeNull();
    // The form shows the new spot and keeps what was typed, to save with the moved copy.
    expect(field("Coordinates or a map link").value).toBe("64.541, -21.9206");
    expect(field("Where to stand, in English").value).toBe("By the pumps.");
    api.on(adminUpdateMeetingPointRoute, { status: 200, data: moved });
    fireEvent.click(screen.getByRole("button", { name: "Save the changes" }));
    await waitFor(() => {
      expect(api.called(adminUpdateMeetingPointRoute).at(-1)?.input["body"]).toMatchObject({
        position: farSpot,
        whereToStandEn: "By the pumps.",
        updatedAt: moved.updatedAt,
      });
    });
  });

  it("says nobody is told within 50 m, or when no trip stops there", async () => {
    open(active);
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    fireEvent.click(within(panel()).getByRole("button", { name: "Move" }));
    type(newSpot, "64.5385, -21.9206");
    expect(panel().textContent).toContain(
      "22 m from where it is now: within 50 m, so nobody is told.",
    );
    cleanup();

    open({ ...active, status: "paused", futureTrips: 0 });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    fireEvent.click(within(panel()).getByRole("button", { name: "Move" }));
    type(newSpot, "64.541, -21.9206");
    expect(panel().textContent).toContain(
      "300 m from where it is now. No upcoming trip stops here, so nobody is told.",
    );
  });

  it("checks the spot before sending it, and can be put away", async () => {
    const api = open(active);
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    fireEvent.click(within(panel()).getByRole("button", { name: "Move" }));
    const checks: [string, string][] = [
      ["", "Fill this in."],
      [
        "by the old church",
        "Coordinates could not be read from this. Paste them as 64.1371, -21.9337 or a map link.",
      ],
      ["60.0, -21.9", "This spot is outside Iceland."],
      ["64.5383, -21.9206", "The point is here already."],
    ];
    for (const [typed, said] of checks) {
      type(newSpot, typed);
      fireEvent.click(screen.getByRole("button", { name: "Move N1 Borgarnesi" }));
      expect(await screen.findByText(said)).toBeTruthy();
      expect(field(newSpot).getAttribute("aria-invalid")).toBe("true");
      expect(document.activeElement).toBe(field(newSpot));
    }
    expect(api.called(adminMoveMeetingPointRoute)).toHaveLength(0);
    // Typing takes the error away until the next try.
    type(newSpot, "64.541");
    expect(screen.queryByText("The point is here already.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Keep it where it is" }));
    expect(screen.queryByLabelText(newSpot)).toBeNull();
    expect(document.activeElement).toBe(within(panel()).getByRole("button", { name: "Move" }));
  });

  it("shows the API's problem with the spot under the field", async () => {
    const api = open(active);
    api.on(adminMoveMeetingPointRoute, {
      status: 400,
      error: { code: "validation_failed", details: [{ path: "position", issue: "no_road" }] },
    });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    fireEvent.click(within(panel()).getByRole("button", { name: "Move" }));
    type(newSpot, "64.541, -21.9206");
    fireEvent.click(screen.getByRole("button", { name: "Move N1 Borgarnesi" }));
    expect(
      await screen.findByText("No road within 1 km of this spot reaches the points in use."),
    ).toBeTruthy();
    expect(field(newSpot).getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field(newSpot));
  });

  it("says when the point changed elsewhere, and loads the newest copy", async () => {
    const api = open(active);
    api.on(adminMoveMeetingPointRoute, { status: 409, error: { code: "move_not_allowed" } });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    fireEvent.click(within(panel()).getByRole("button", { name: "Move" }));
    type(newSpot, "64.541, -21.9206");
    fireEvent.click(screen.getByRole("button", { name: "Move N1 Borgarnesi" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This meeting point was saved somewhere else after you opened it.",
    );
    expect(screen.queryByLabelText(newSpot)).toBeNull();
    api.on(adminMeetingPointRoute, { status: 200, data: { ...active, status: "retired" } });
    fireEvent.click(screen.getByRole("button", { name: "Load the newest copy" }));
    expect(await screen.findByText("Status: Retired")).toBeTruthy();
  });

  it("says when the move could not be made, keeping the spot typed", async () => {
    const api = open(active);
    api.on(adminMoveMeetingPointRoute, { status: 500, error: { code: "internal" } });
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    fireEvent.click(within(panel()).getByRole("button", { name: "Move" }));
    type(newSpot, "64.541, -21.9206");
    fireEvent.click(screen.getByRole("button", { name: "Move N1 Borgarnesi" }));
    const alert = await within(panel()).findByRole("alert");
    expect(alert.textContent).toBe("The point could not be moved. Try again.");
    expect(field(newSpot).value).toBe("64.541, -21.9206");
    expect(screen.getByText("Status: Active")).toBeTruthy();
  });

  it("offers no move for a draft, whose spot is edited in its form", async () => {
    start(`/admin/meeting-points/${pointId}`);
    await screen.findByRole("heading", { name: "N1 Borgarnesi", level: 1 });
    await screen.findByRole("list", { name: "Activation checklist" });
    expect(within(panel()).queryByRole("button", { name: "Move" })).toBeNull();
  });
});

describe("activating a draft (spec 2, 3.6.3)", () => {
  const panel = () => screen.getByRole("region", { name: "In use" });
  const checklist = () => screen.findByRole("list", { name: "Activation checklist" });
  const row = (list: HTMLElement, text: string) =>
    within(list)
      .getAllByRole("listitem")
      .find((item) => item.textContent.startsWith(text));
  const activateButton = () =>
    within(panel()).getByRole("button", { name: "Activate N1 Borgarnesi" });

  function open(list: AdminActivationChecklist) {
    const api = start(`/admin/meeting-points/${pointId}`);
    api.on(adminActivationChecklistRoute, { status: 200, data: list });
    return api;
  }

  it("shows what a draft still needs, and what the API found on Activate", async () => {
    const api = open(checklistWith("photos", "season", "confirmed"));
    api.on(adminActivateMeetingPointRoute, {
      status: 409,
      error: {
        code: "activation_not_ready",
        details: [
          { path: "season", issue: "not_done" },
          { path: "confirmed", issue: "not_done" },
        ],
      },
    });
    const list = await checklist();
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Name, place, type, region and municipality Done",
      "Where to stand, in Icelandic and English Done",
      "A photo described in both languages Recommended",
      "The amenities checked Done",
      "The season checked To do",
      "The day you last confirmed the point To do",
      "A road within 1 km that reaches the points in use Done",
    ]);
    expect(panel().textContent).toContain(
      "The checklist is of what is saved. Save your changes first.",
    );
    fireEvent.click(activateButton());

    // The photo is recommended (ADR 0036): not counted, and still shown as such.
    const alert = await within(panel()).findByRole("alert");
    expect(alert.textContent).toBe(
      "2 things are still to do before N1 Borgarnesi can be activated.",
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
    expect(row(list, "A photo")?.textContent).toContain("Recommended");
    // The list is loaded again, for the recommended items the API does not name.
    await waitFor(() => {
      expect(api.called(adminActivationChecklistRoute)).toHaveLength(2);
    });
    // The API checks again, as the list shown can be older than what is saved.
    expect(api.called(adminActivateMeetingPointRoute)[0]?.input["body"]).toEqual({
      updatedAt: draft.updatedAt,
    });
  });

  it("activates a draft whose checklist is done, which computes its distances", async () => {
    // With no photo yet, which is recommended, not required (ADR 0036).
    const api = open(checklistWith("photos"));
    const active: AdminMeetingPoint = {
      ...draft,
      status: "active",
      lastCheckedOn: "2026-11-16",
      reviewDueOn: "2027-11-16",
      updatedAt: "2026-11-16T12:00:00.000Z",
    };
    let sent: Record<string, unknown> = {};
    api.on(adminActivateMeetingPointRoute, (input) => {
      sent = input["body"] as Record<string, unknown>;
      return { status: 200, data: active };
    });
    await checklist();
    // The button is read with what activating does.
    fireEvent.click(
      within(panel()).getByRole("button", {
        name: "Activate N1 Borgarnesi",
        description:
          "Drivers can choose it for new trips within 5 minutes. Its distances to every point in use are computed now, which can take a few seconds.",
      }),
    );

    const notice = await screen.findByText(
      "N1 Borgarnesi is active. Drivers can choose it for new trips.",
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(notice);
    });
    expect(sent).toEqual({ updatedAt: draft.updatedAt });
    expect(api.called(adminActivateMeetingPointRoute)).toHaveLength(1);
    expect(screen.getByText("Status: Active")).toBeTruthy();
    expect(within(panel()).queryByRole("list", { name: "Activation checklist" })).toBeNull();
    expect(within(panel()).getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("checks again once the point or a photo is saved", async () => {
    const api = open(checklistWith("whereToStand", "photos"));
    const photo: AdminMeetingPointPhoto = {
      id: "0196f000-0000-7000-8000-000000000101",
      url: "https://photos.test/meeting-points/0196f000-0000-7000-8000-000000000201.jpg",
      descriptionIs: "Inngangurinn.",
      descriptionEn: "",
      width: 1600,
      height: 1200,
      updatedAt: "2026-11-16T11:00:00.000Z",
    };
    api.on(adminMeetingPointPhotosRoute, { status: 200, data: { photos: [photo] } });
    await checklist();

    api.on(adminActivationChecklistRoute, { status: 200, data: checklistWith("photos") });
    api.on(adminUpdateMeetingPointRoute, {
      status: 200,
      data: { ...draft, updatedAt: "2026-11-16T12:00:00.000Z" },
    });
    type("Where to stand, in English", "By the pumps.");
    fireEvent.click(screen.getByRole("button", { name: "Save the changes" }));
    await waitFor(async () => {
      expect(row(await checklist(), "Where to stand")?.textContent).toContain("Done");
    });

    api.on(adminActivationChecklistRoute, { status: 200, data: checklistWith() });
    api.on(adminDescribeMeetingPointPhotoRoute, {
      status: 200,
      data: { photos: [{ ...photo, descriptionEn: "The entrance." }] },
    });
    const first = within(screen.getByRole("region", { name: "Photos" })).getByRole("listitem", {
      name: "Photo 1",
    });
    fireEvent.change(within(first).getByLabelText("Description for screen readers, in English"), {
      target: { value: "The entrance." },
    });
    fireEvent.click(within(first).getByRole("button", { name: "Save descriptions" }));
    await waitFor(async () => {
      expect(row(await checklist(), "A photo")?.textContent).toContain("Done");
    });
    expect(api.called(adminActivationChecklistRoute)).toHaveLength(3);
  });

  it("shows what the API found still to do", async () => {
    const api = open(checklistWith());
    api.on(adminActivateMeetingPointRoute, {
      status: 409,
      error: {
        code: "activation_not_ready",
        details: [{ path: "legs", issue: "not_done" }],
      },
    });
    await checklist();
    // What is saved changed since the list was loaded: no road reaches the points in use now.
    api.on(adminActivationChecklistRoute, { status: 200, data: checklistWith("legs") });
    fireEvent.click(activateButton());
    const alert = await within(panel()).findByRole("alert");
    expect(alert.textContent).toBe("1 thing is still to do before N1 Borgarnesi can be activated.");
    expect(row(await checklist(), "A road")?.textContent).toContain("To do");
    expect(screen.getByText("Status: Draft")).toBeTruthy();
  });

  it("says when the point changed elsewhere", async () => {
    const api = open(checklistWith());
    api.on(adminActivateMeetingPointRoute, {
      status: 409,
      error: { code: "meeting_point_changed" },
    });
    await checklist();
    fireEvent.click(activateButton());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This meeting point was saved somewhere else after you opened it.",
    );
  });

  it("says when the checklist could not be loaded, and loads it again", async () => {
    const api = open(checklistWith());
    api.on(adminActivationChecklistRoute, { status: 500, error: { code: "internal" } });
    expect(await screen.findByText("The checklist could not be loaded.")).toBeTruthy();
    api.on(adminActivationChecklistRoute, { status: 200, data: checklistWith() });
    fireEvent.click(within(panel()).getByRole("button", { name: "Try again" }));
    expect(await checklist()).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(panel()).getByRole("heading", { name: "Activation checklist" }),
      );
    });
  });

  it("checks again when a photo was changed elsewhere", async () => {
    const api = open(checklistWith("photos"));
    const photo: AdminMeetingPointPhoto = {
      id: "0196f000-0000-7000-8000-000000000101",
      url: "https://photos.test/meeting-points/0196f000-0000-7000-8000-000000000201.jpg",
      descriptionIs: "Inngangurinn.",
      descriptionEn: "",
      width: 1600,
      height: 1200,
      updatedAt: "2026-11-16T11:00:00.000Z",
    };
    api.on(adminMeetingPointPhotosRoute, { status: 200, data: { photos: [photo] } });
    api.on(adminDescribeMeetingPointPhotoRoute, { status: 409, error: { code: "photo_changed" } });
    await checklist();
    const first = within(screen.getByRole("region", { name: "Photos" })).getByRole("listitem", {
      name: "Photo 1",
    });
    fireEvent.change(within(first).getByLabelText("Description for screen readers, in English"), {
      target: { value: "The entrance." },
    });
    api.on(adminActivationChecklistRoute, { status: 200, data: checklistWith() });
    fireEvent.click(within(first).getByRole("button", { name: "Save descriptions" }));
    await waitFor(async () => {
      expect(row(await checklist(), "A photo")?.textContent).toContain("Done");
    });
  });
});
