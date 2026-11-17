import {
  adminLegsStatusRoute,
  adminMeetingPointsRoute,
  adminMeRoute,
  adminRecomputeLegsRoute,
  type AdminLegsStatus,
  type AdminMe,
} from "@shareride/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleApp } from "../../app.tsx";
import { createFakeApi, createFakePasskeys } from "../../testing/fake-api.ts";

const anna: AdminMe = {
  userId: "0196f000-0000-7000-8000-000000000001",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2026-11-17T23:00:00.000Z",
};

/** Made-up points. */
const laxa = { id: "0196f000-0000-7000-8000-0000000000a1", nameIs: "Áningarstaður við Laxá" };
const skagi = { id: "0196f000-0000-7000-8000-0000000000a2", nameIs: "Út á skaga" };
const vik = { id: "0196f000-0000-7000-8000-0000000000a3", nameIs: "Vík, við kirkjuna" };

const roadFile = "road file 2026-11-16T21:22:36.000Z";

/** 26 points in service; the one on the headland has no road, so 50 legs are missing. */
const status: AdminLegsStatus = {
  mapData: {
    mapDate: "2026-11-16T21:22:36.000Z",
    attribution: "© OpenStreetMap contributors (ODbL 1.0), Iceland extract by Geofabrik",
  },
  points: 26,
  pairs: 650,
  withLegs: 600,
  lastComputedAt: "2026-11-17T21:14:05.000Z",
  sources: [
    { source: roadFile, mapDate: "2026-11-16T21:22:36.000Z", current: true, legs: 580 },
    { source: "sample road graph", mapDate: null, current: false, legs: 20 },
  ],
  offRoad: [skagi],
  missing: [
    { from: laxa, to: skagi },
    { from: skagi, to: laxa },
    { from: skagi, to: vik },
  ],
};

const recomputed: AdminLegsStatus = {
  ...status,
  lastComputedAt: "2026-11-17T22:30:00.000Z",
  sources: [{ source: roadFile, mapDate: "2026-11-16T21:22:36.000Z", current: true, legs: 600 }],
};

function start(
  options: {
    readonly path?: string;
    readonly legs?: () => { status: number; data?: unknown };
    readonly recompute?: () => { status: number; data?: unknown };
  } = {},
) {
  window.history.replaceState(null, "", options.path ?? "/admin/meeting-points/distances");
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminMeetingPointsRoute, { status: 200, data: { meetingPoints: [] } });
  api.on(adminLegsStatusRoute, options.legs ?? (() => ({ status: 200, data: status })));
  api.on(adminRecomputeLegsRoute, options.recompute ?? (() => ({ status: 200, data: recomputed })));
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return api;
}

const page = () =>
  screen.findByRole("heading", { name: "Distances between meeting points", level: 1 });

/** The value next to a label in the summary. */
function summary(label: string): string {
  const term = screen.getByText(label, { selector: "dt" });
  return term.nextElementSibling?.textContent ?? "";
}

describe("distances between meeting points (spec 2, 3.7.4)", () => {
  it("is linked from the list of meeting points", async () => {
    start({ path: "/admin/meeting-points" });
    fireEvent.click(await screen.findByRole("link", { name: "Distances" }));
    expect(await page()).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/meeting-points/distances");
  });

  it("shows how many legs there are, when they were computed and on which map data", async () => {
    start();
    await page();
    await screen.findByText("Meeting points in service", { selector: "dt" });
    expect(summary("Meeting points in service")).toBe("26");
    expect(summary("Legs")).toBe("600 of 650");
    expect(summary("Last computed")).toBe("17 November 2026 at 21:14");
    expect(summary("Map data")).toBe("16 November 2026");
    expect(
      screen.getByText("© OpenStreetMap contributors (ODbL 1.0), Iceland extract by Geofabrik"),
    ).toBeTruthy();
  });

  it("says how many legs are on older map data", async () => {
    start();
    await page();
    expect((await screen.findByText(/20 legs are on older map data/)).textContent).toContain(
      "Recompute all",
    );
  });

  it("lists the points with no road near and the legs missing", async () => {
    start();
    await page();
    const offRoad = await screen.findByRole("region", { name: "No road within 1 km" });
    expect(within(offRoad).getByRole("link", { name: "Út á skaga" }).getAttribute("href")).toBe(
      `/admin/meeting-points/${skagi.id}`,
    );

    const missing = screen.getByRole("region", { name: "50 legs are missing" });
    const rows = within(missing).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "FromTo",
      "Áningarstaður við LaxáÚt á skaga",
      "Út á skagaÁningarstaður við Laxá",
      "Út á skagaVík, við kirkjuna",
    ]);
    expect(within(missing).getByText("And 47 more.")).toBeTruthy();
  });

  it("says so when every leg is there", async () => {
    start({
      legs: () => ({
        status: 200,
        data: { ...recomputed, points: 25, pairs: 600, offRoad: [], missing: [] },
      }),
    });
    await page();
    expect(
      await screen.findByText("Every leg between meeting points in service is there."),
    ).toBeTruthy();
    expect(screen.queryByText(/older map data/)).toBeNull();
    expect(screen.queryByRole("region", { name: "No road within 1 km" })).toBeNull();
  });

  it("recomputes all on the current map data and says what it did", async () => {
    const api = start();
    await page();
    const button = await screen.findByRole("button", { name: "Recompute all" });
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Recomputing…" })).toHaveProperty("disabled", true);
    const said = await screen.findByText("Recomputed: 600 legs.");
    expect(said.getAttribute("role")).toBe("status");
    expect(document.activeElement).toBe(said);
    expect(summary("Last computed")).toBe("17 November 2026 at 22:30");
    expect(screen.queryByText(/older map data/)).toBeNull();
    expect(api.called(adminRecomputeLegsRoute)).toEqual([
      { route: "POST /admin/v1/legs/recompute", input: { body: {} } },
    ]);
    expect(screen.getByRole("button", { name: "Recompute all" })).toHaveProperty("disabled", false);
  });

  it("says when recomputing failed, and lets the operator try again", async () => {
    start({ recompute: () => ({ status: 500 }) });
    await page();
    fireEvent.click(await screen.findByRole("button", { name: "Recompute all" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The distances could not be recomputed. Try again.",
    );
    expect(screen.getByRole("button", { name: "Recompute all" })).toHaveProperty("disabled", false);
    expect(summary("Last computed")).toBe("17 November 2026 at 21:14");
  });

  it("offers to try again when the status could not be loaded", async () => {
    let fail = true;
    start({ legs: () => (fail ? { status: 500 } : { status: 200, data: status }) });
    await page();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The distances could not be loaded.",
    );
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("600 of 650")).toBeTruthy();
  });
});
