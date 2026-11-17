import {
  adminCreateMeetingPointRoute,
  adminMeetingPointRoute,
  adminMeetingPointsRoute,
  adminMeRoute,
  adminUpdateMeetingPointRoute,
  type AdminMe,
  type AdminMeetingPoint,
  type AdminMeetingPointListItem,
} from "@shareride/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
};

function start(path: string) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminMeetingPointsRoute, { status: 200, data: { meetingPoints: [bsi, listItem(draft)] } });
  api.on(adminMeetingPointRoute, { status: 200, data: draft });
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
    expect(second.textContent).toContain("Draft");
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
    fireEvent.click(screen.getByRole("button", { name: "Show meeting points" }));
    await waitFor(() => {
      expect(api.called(adminMeetingPointsRoute).at(-1)?.input["query"]).toEqual({
        status: "draft",
        region: "west",
        q: "borgar",
        reviewOverdue: true,
      });
    });
    expect(window.location.search).toBe("?status=draft&region=west&reviewOverdue=true&q=borgar");
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
    expect(document.activeElement).toBe(notice);
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
        "Only a draft's spot is changed here. Moving a meeting point in use is its own step.",
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
