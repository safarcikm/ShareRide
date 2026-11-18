import {
  adminMeetingPointIssuesRoute,
  adminMeetingPointsRoute,
  adminMeRoute,
  adminResolveMeetingPointIssueRoute,
  type AdminMe,
  type AdminMeetingPointIssue,
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

/** Made-up reports about a made-up point. */
const unsafe: AdminMeetingPointIssue = {
  id: "0196f000-0000-7000-8000-0000000000e1",
  meetingPoint: {
    id: pointId,
    nameIs: "Áningarstaður við Laxá",
    status: "active",
    lastCheckedOn: null,
  },
  reason: "unsafe",
  note: "No light after dark.",
  sentAt: "2026-11-16T22:10:00.000Z",
};

const other: AdminMeetingPointIssue = {
  ...unsafe,
  id: "0196f000-0000-7000-8000-0000000000e2",
  meetingPoint: { ...unsafe.meetingPoint, status: "paused" },
  reason: "other",
  note: "",
};

function start(path = "/admin/meeting-points/problems", issues = [unsafe, other]) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  let open = issues;
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminMeetingPointsRoute, { status: 200, data: { meetingPoints: [] } });
  api.on(adminMeetingPointIssuesRoute, () => ({ status: 200, data: { issues: open } }));
  api.on(adminResolveMeetingPointIssueRoute, (input) => {
    const { id } = input["params"] as { id: string };
    open = open.filter((issue) => issue.id !== id);
    return { status: 204 };
  });
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return api;
}

const page = () => screen.findByRole("heading", { name: "Problem reports", level: 1 });

describe("problem reports about meeting points (spec 2, 3.5)", () => {
  it("is linked from the list of meeting points", async () => {
    start("/admin/meeting-points");
    fireEvent.click(await screen.findByRole("link", { name: "Problem reports" }));
    expect(await page()).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/meeting-points/problems");
  });

  it("shows each open report with its point, what is wrong and the note", async () => {
    start();
    await page();
    const reports = await screen.findAllByRole("article");
    const first = reports[0] as HTMLElement;
    expect(
      within(first).getByRole("link", { name: "Áningarstaður við Laxá" }).getAttribute("href"),
    ).toBe(`/admin/meeting-points/${pointId}`);
    expect(first.textContent).toContain("It's not safe to wait here");
    expect(first.textContent).toContain("No light after dark.");
    expect(first.textContent).toContain("Sent 16 November 2026 at 22:10");
    const second = reports[1] as HTMLElement;
    expect(second.textContent).toContain("Something else");
    expect(second.textContent).toContain("No note.");
    expect(second.textContent).toContain("Paused");
  });

  it("resolves a report with a note and Last checked, then takes it off the list", async () => {
    const api = start();
    await page();
    const first = (await screen.findAllByRole("article"))[0] as HTMLElement;

    // A note is needed first.
    fireEvent.click(within(first).getByRole("button", { name: "Resolve" }));
    const field = within(first).getByLabelText("What did you do?");
    await waitFor(() => {
      expect(document.activeElement).toBe(field);
    });
    expect(within(first).getByText("Say what you did.")).toBeTruthy();
    expect(api.called(adminResolveMeetingPointIssueRoute)).toEqual([]);

    fireEvent.change(field, { target: { value: "Put up a light." } });
    fireEvent.click(within(first).getByRole("checkbox", { name: /I checked the point today/ }));
    fireEvent.click(within(first).getByRole("button", { name: "Resolve" }));

    const done = await screen.findByRole("status");
    expect(done.textContent).toBe("Resolved: Áningarstaður við Laxá.");
    expect(api.called(adminResolveMeetingPointIssueRoute)[0]?.input).toEqual({
      params: { id: unsafe.id },
      body: { note: "Put up a light.", checkedToday: true },
    });
    await waitFor(() => {
      expect(screen.getAllByRole("article")).toHaveLength(1);
    });
  });

  it("shows what the server finds wrong with the note by the field", async () => {
    const api = start();
    api.on(adminResolveMeetingPointIssueRoute, {
      status: 400,
      error: { code: "validation_failed", details: [{ path: "note", issue: "too_long" }] },
    });
    await page();
    const first = (await screen.findAllByRole("article"))[0] as HTMLElement;
    fireEvent.change(within(first).getByLabelText("What did you do?"), {
      target: { value: "Put up a light." },
    });
    fireEvent.click(within(first).getByRole("button", { name: "Resolve" }));
    expect(await within(first).findByText("Shorten it to 1000 characters or fewer.")).toBeTruthy();
    expect(within(first).getByLabelText("What did you do?").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("takes a report someone resolved meanwhile off the list, and says so", async () => {
    const api = start();
    let open = [unsafe, other];
    api.on(adminMeetingPointIssuesRoute, () => ({ status: 200, data: { issues: open } }));
    api.on(adminResolveMeetingPointIssueRoute, () => {
      open = [other];
      return { status: 409, error: { code: "issue_resolved" } };
    });
    await page();
    const first = (await screen.findAllByRole("article"))[0] as HTMLElement;
    fireEvent.change(within(first).getByLabelText("What did you do?"), {
      target: { value: "Put up a light." },
    });
    fireEvent.click(within(first).getByRole("button", { name: "Resolve" }));
    const said = await screen.findByRole("status");
    expect(said.textContent).toBe("Someone resolved this report already.");
    await waitFor(() => {
      expect(document.activeElement).toBe(said);
    });
    await waitFor(() => {
      expect(screen.getAllByRole("article")).toHaveLength(1);
    });
  });

  it("leads to pausing a point in use at once", async () => {
    start();
    await page();
    const reports = await screen.findAllByRole("article");
    const first = reports[0] as HTMLElement;
    const second = reports[1] as HTMLElement;
    expect(
      within(first)
        .getByRole("link", { name: "Pause Áningarstaður við Laxá now" })
        .getAttribute("href"),
    ).toBe(`/admin/meeting-points/${pointId}?pause`);
    // Paused already: nothing to pause.
    expect(within(second).queryByRole("link", { name: /^Pause/ })).toBeNull();
  });

  it("says when there are none", async () => {
    start(undefined, []);
    await page();
    expect(await screen.findByText("There are no open reports.")).toBeTruthy();
  });
});
