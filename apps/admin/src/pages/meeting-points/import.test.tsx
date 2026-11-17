import {
  adminImportMeetingPointsRoute,
  adminMeetingPointsRoute,
  adminMeRoute,
  type AdminImportRow,
  type AdminMe,
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

const file = [
  "name_is,latitude,longitude,type,region,municipality,season_start,season_end",
  "Söluskálinn við Hraunsá,64.5383,-21.9206,fuel-station,west,Borgarbyggð,5,9",
  ",51.5,-0.12,lorry-park,west,London,,",
].join("\n");

/** A made-up point at Borgarnes, ready to add. */
const ready: AdminImportRow = {
  line: 2,
  nameIs: "Söluskálinn við Hraunsá",
  point: {
    nameEn: "Hraunsá service station",
    aliases: ["Hyrnan", "Hraunsá"],
    position: { latitude: 64.5383, longitude: -21.9206 },
    region: "west",
    municipality: "Borgarbyggð",
    type: "fuel-station",
    amenities: ["toilets", "shop"],
    whereToStandIs: "Við inngang verslunarinnar.",
    whereToStandEn: "By the shop's entrance.",
    season: { startMonth: 5, endMonth: 9 },
  },
  problems: [],
  id: null,
};

const skipped: AdminImportRow = {
  line: 3,
  nameIs: "",
  point: null,
  problems: [
    { column: "name_is", issue: "required" },
    { column: "position", issue: "outside_iceland" },
    { column: "type", issue: "unknown" },
  ],
  id: null,
};

const newId = "0196f000-0000-7000-8000-0000000000c1";

function start() {
  window.history.replaceState(null, "", "/admin/meeting-points/import");
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminMeetingPointsRoute, { status: 200, data: { meetingPoints: [] } });
  api.on(adminImportMeetingPointsRoute, (input) => {
    const { save } = input["body"] as { save: boolean };
    return save
      ? { status: 200, data: { rows: [{ ...ready, id: newId }, skipped], added: 1 } }
      : { status: 200, data: { rows: [ready, skipped], added: 0 } };
  });
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return api;
}

const page = async () => screen.findByRole("heading", { name: "Import meeting points", level: 1 });

function choose(text = file, name = "points.csv") {
  const chosen = new File([text], name, { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [chosen] } });
  return chosen;
}

const checkButton = () => screen.getByRole("button", { name: "Check the file" });

describe("importing meeting points from a file (spec 2, 3.6.9)", () => {
  it("is linked from the list of meeting points", async () => {
    window.history.replaceState(null, "", "/admin/meeting-points");
    const api = createFakeApi();
    api.on(adminMeRoute, { status: 200, data: anna });
    api.on(adminMeetingPointsRoute, { status: 200, data: { meetingPoints: [] } });
    render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
    fireEvent.click(await screen.findByRole("link", { name: "Import from a file" }));
    expect(await page()).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/meeting-points/import");
  });

  it("says what the file holds", async () => {
    start();
    await page();
    const help = screen.getByRole("group", { name: "What the file holds" });
    expect(help.textContent).toContain("name_is, latitude, longitude, type, region, municipality");
    expect(help.textContent).toContain("fuel-station");
    expect(help.textContent).toContain("southern-peninsula");
    expect(help.textContent).toContain("step-free");
    expect(help.textContent).toContain("commas, semicolons or tabs");
  });

  it("shows each row as it will be saved, or why it is skipped, before saving", async () => {
    const api = start();
    await page();
    choose();
    fireEvent.click(checkButton());

    const rowsHeading = await screen.findByRole("heading", { name: "The file's rows" });
    await waitFor(() => {
      expect(document.activeElement).toBe(rowsHeading);
    });
    expect(api.called(adminImportMeetingPointsRoute)[0]?.input).toEqual({
      body: { file, save: false },
    });
    expect(screen.getByText("Rows: 2. Ready to add: 1. Skipped for problems: 1.")).toBeTruthy();

    const rows = within(screen.getByRole("list", { name: "The file's rows" })).getAllByRole(
      "listitem",
    );
    const first = rows[0] as HTMLElement;
    expect(first.textContent).toContain("Söluskálinn við Hraunsá");
    expect(first.textContent).toContain("Line 2");
    expect(first.textContent).toContain("Fuel station · Borgarbyggð, West");
    expect(first.textContent).toContain("In use from May to September");
    expect(first.textContent).toContain("64.5383, -21.9206");
    expect(first.textContent).toContain("Ready to add");
    const fact = (label: string) => within(first).getByText(label).nextElementSibling?.textContent;
    expect(fact("English name, if different")).toBe("Hraunsá service station");
    expect(fact("Other names people search for")).toBe("Hyrnan, Hraunsá");
    expect(fact("Amenities")).toBe("Toilets, Shop");
    expect(fact("Where to stand, in Icelandic")).toBe("Við inngang verslunarinnar.");
    expect(fact("Where to stand, in English")).toBe("By the shop's entrance.");
    const second = rows[1] as HTMLElement;
    expect(second.textContent).toContain("Line 3");
    expect(second.textContent).toContain("No name");
    expect(second.textContent).toContain("Skipped");
    expect(
      within(second)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "name_is: Fill this in.",
      "latitude, longitude: This spot is outside Iceland.",
      "type: Use one of the names under What the file holds.",
    ]);
    expect(api.called(adminImportMeetingPointsRoute)).toHaveLength(1);
  });

  it("adds the rows without problems as drafts, linking each", async () => {
    const api = start();
    await page();
    choose();
    fireEvent.click(checkButton());
    fireEvent.click(await screen.findByRole("button", { name: "Add 1 draft" }));

    const done = await screen.findByRole("status");
    expect(done.textContent).toBe("Added as drafts: 1. Skipped: 1.");
    await waitFor(() => {
      expect(document.activeElement).toBe(done);
    });
    expect(api.called(adminImportMeetingPointsRoute)[1]?.input).toEqual({
      body: { file, save: true },
    });
    expect(screen.getByRole("link", { name: "Söluskálinn við Hraunsá" }).getAttribute("href")).toBe(
      `/admin/meeting-points/${newId}`,
    );
    expect(screen.getByRole("link", { name: "See the drafts" }).getAttribute("href")).toBe(
      "/admin/meeting-points?status=draft",
    );
    expect(screen.queryByRole("button", { name: "Add 1 draft" })).toBeNull();
    expect(screen.getAllByText("Added").length).toBeGreaterThan(0);
  });

  it("says when no row can be added", async () => {
    const api = start();
    api.on(adminImportMeetingPointsRoute, {
      status: 200,
      data: { rows: [skipped], added: 0 },
    });
    await page();
    choose();
    fireEvent.click(checkButton());
    expect(
      await screen.findByText(
        "No row can be added. Fix the problems in the file and check it again.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Add/ })).toBeNull();
  });

  it("says why the file cannot be read", async () => {
    const api = start();
    api.on(adminImportMeetingPointsRoute, {
      status: 400,
      error: {
        code: "validation_failed",
        details: [
          { path: "columns.colour", issue: "unknown_column" },
          { path: "columns.region", issue: "missing_column" },
          { path: "lines.4", issue: "unclosed_quote" },
          { path: "file", issue: "not_utf8" },
          { path: "columns.7", issue: "unnamed_column" },
        ],
      },
    });
    await page();
    choose();
    fireEvent.click(checkButton());
    const problem = await screen.findByRole("alert");
    await waitFor(() => {
      expect(document.activeElement).toBe(problem);
    });
    expect(problem.textContent).toContain("This file cannot be read:");
    expect(
      within(problem)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "There is no column called colour.",
      "The column region is missing.",
      "A quote that starts on line 4 is never closed.",
      "It is not saved as UTF-8. In Excel, save it as CSV UTF-8.",
      "Column 7 has no name in the first row.",
    ]);
    expect(screen.queryByRole("list", { name: "The file's rows" })).toBeNull();
  });

  it("asks for a file, and refuses one over 1 MB before sending it", async () => {
    const api = start();
    await page();
    fireEvent.click(checkButton());
    const field = screen.getByLabelText("CSV file");
    await waitFor(() => {
      expect(document.activeElement).toBe(field);
    });
    expect(screen.getByText("Choose a file.")).toBeTruthy();

    choose("x".repeat(1_000_001));
    fireEvent.click(checkButton());
    expect(
      await screen.findByText("The file is over 1 MB. Split it into smaller files."),
    ).toBeTruthy();
    expect(api.called(adminImportMeetingPointsRoute)).toEqual([]);
  });

  it("forgets the rows checked when another file is chosen", async () => {
    const api = start();
    await page();
    choose();
    fireEvent.click(checkButton());
    await screen.findByRole("button", { name: "Add 1 draft" });
    choose("name_is\n", "other.csv");
    expect(screen.queryByRole("heading", { name: "The file's rows" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Add/ })).toBeNull();
    expect(api.called(adminImportMeetingPointsRoute)).toHaveLength(1);
  });

  it("starts again with another file", async () => {
    start();
    await page();
    choose();
    fireEvent.click(checkButton());
    await screen.findByRole("heading", { name: "The file's rows" });
    fireEvent.click(screen.getByRole("button", { name: "Check another file" }));
    expect(screen.queryByRole("heading", { name: "The file's rows" })).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText("CSV file"));
    });
  });
});
