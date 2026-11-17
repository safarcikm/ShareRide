import {
  adminCloseReportRoute,
  adminMeRoute,
  adminReportConversationRoute,
  adminReportRoute,
  adminReportsRoute,
  adminSuspendRoute,
  adminWarnRoute,
  type AdminConversationMessage,
  type AdminMe,
  type AdminModerationAction,
  type AdminPerson,
  type AdminReport,
  type AdminReportListItem,
} from "@shareride/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleApp } from "../../app.tsx";
import { createFakeApi, createFakePasskeys } from "../../testing/fake-api.ts";

// Made-up people and records: Bára reported a message Dóra sent her.

const anna: AdminMe = {
  userId: "0196f000-0000-7000-8000-000000000001",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2099-11-16T23:00:00.000Z",
};

const dora: AdminPerson = {
  userId: "0196f000-0000-7000-8000-0000000000c1",
  firstName: "Dóra",
  status: "active",
  suspendedUntil: null,
  locale: "is",
};

const bara: AdminPerson = {
  userId: "0196f000-0000-7000-8000-0000000000c2",
  firstName: "Bára",
  status: "active",
  suspendedUntil: null,
  locale: "en",
};

const reportId = "0196f000-0000-7000-8000-0000000000d1";
const tripId = "0196f000-0000-7000-8000-0000000000a1";
const messageId = "0196f000-0000-7000-8000-0000000000e1";
const borgarnes = { is: "N1 Borgarnesi", en: "N1 Borgarnes" };
const akureyri = { is: "Hof, Akureyri", en: "Hof, Akureyri" };

const listed: AdminReportListItem = {
  id: reportId,
  subject: "message",
  category: "harassment",
  urgent: false,
  status: "open",
  outcome: null,
  filedAt: "2099-11-15T10:20:00.000Z",
  dueAt: "2099-11-16T10:20:00.000Z",
  closedAt: null,
  reporter: bara,
  reported: dora,
};

const urgent: AdminReportListItem = {
  ...listed,
  id: "0196f000-0000-7000-8000-0000000000d2",
  subject: "trip",
  category: "safety",
  urgent: true,
  filedAt: "2026-11-14T08:00:00.000Z",
  dueAt: "2026-11-15T08:00:00.000Z",
};

const report: AdminReport = {
  ...listed,
  description: "She was rude to me.",
  trip: {
    id: tripId,
    status: "published",
    from: { name: borgarnes, plannedAt: "2099-11-20T10:00:00.000Z" },
    to: { name: akureyri, plannedAt: "2099-11-20T13:30:00.000Z" },
    note: "No dogs, please.",
    noteHidden: false,
  },
  booking: { id: "0196f000-0000-7000-8000-0000000000b1", status: "confirmed", seats: 1 },
  message: { id: messageId, sentAt: "2099-11-15T09:50:00.000Z", removed: false },
  about: null,
  conversation: true,
  actions: [],
  reporterSide: {
    person: bara,
    reportsBy: [],
    reportsAbout: [],
    recentTrips: [
      {
        tripId,
        role: "passenger",
        status: "published",
        from: { name: borgarnes, plannedAt: "2099-11-20T10:00:00.000Z" },
        to: { name: akureyri, plannedAt: "2099-11-20T13:30:00.000Z" },
      },
    ],
    actions: [],
  },
  reportedSide: {
    person: dora,
    reportsBy: [],
    reportsAbout: [{ ...urgent, reporter: bara, reported: dora }],
    recentTrips: [
      {
        tripId,
        role: "driver",
        status: "published",
        from: { name: borgarnes, plannedAt: "2099-11-20T10:00:00.000Z" },
        to: { name: akureyri, plannedAt: "2099-11-20T13:30:00.000Z" },
      },
    ],
    actions: [],
  },
};

const warning: AdminModerationAction = {
  id: "0196f000-0000-7000-8000-0000000000f1",
  kind: "warning",
  person: dora,
  reportId,
  rule: "harassment",
  reason: "Please keep messages kind.",
  content: null,
  until: null,
  at: "2099-11-15T11:00:00.000Z",
  appeal: null,
};

const conversation: AdminConversationMessage[] = [
  {
    id: messageId,
    from: "driver",
    kind: "text",
    text: "Something unkind",
    quick: null,
    system: null,
    sentAt: "2099-11-15T09:50:00.000Z",
    removed: false,
  },
  {
    id: "0196f000-0000-7000-8000-0000000000e2",
    from: "passenger",
    kind: "text",
    text: "Please don't.",
    quick: null,
    system: null,
    sentAt: "2099-11-15T09:51:00.000Z",
    removed: true,
  },
];

function start(path: string, shown: AdminReport | null = report) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminReportsRoute, { status: 200, data: { reports: [urgent, listed] } });
  api.on(
    adminReportRoute,
    shown === null ? { status: 404, error: { code: "not_found" } } : { status: 200, data: shown },
  );
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return api;
}

const detailPath = `/admin/reports/${reportId}`;

describe("the reports queue (spec 9, 3.4.1)", () => {
  it("is in the menu after the disputes, with the appeals", async () => {
    start("/admin");
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    const links = within(menu)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links.slice(2, 5)).toEqual(["Disputes", "Reports", "Appeals"]);
  });

  it("lists the open reports, safety first, with who and when they are due", async () => {
    const api = start("/admin/reports");
    const list = await screen.findByRole("list", { name: "Open reports" });
    const [first, second] = within(list).getAllByRole("listitem");
    if (first === undefined || second === undefined) throw new Error("Two reports expected.");
    expect(first.textContent).toContain("Safety");
    expect(first.textContent).toContain("Overdue");
    expect(
      within(second)
        .getByRole("link", { name: "A message: Harassment or unwanted contact" })
        .getAttribute("href"),
    ).toBe(detailPath);
    expect(second.textContent).toContain("Reported by Bára · About Dóra");
    expect(second.textContent).toContain("Answer by");
    expect(second.textContent).not.toContain("Overdue");
    expect(api.called(adminReportsRoute)[0]?.input["query"]).toEqual({ state: "open" });
  });

  it("shows the closed ones, with their outcome", async () => {
    const api = start("/admin/reports?state=closed");
    api.on(adminReportsRoute, {
      status: 200,
      data: {
        reports: [
          {
            ...listed,
            status: "closed",
            outcome: "no_breach",
            closedAt: "2099-11-15T12:00:00.000Z",
          },
        ],
      },
    });
    const list = await screen.findByRole("list", { name: "Closed reports" });
    expect(list.textContent).toContain("No breach");
    expect(list.textContent).toContain("Closed");
    expect(api.called(adminReportsRoute).at(-1)?.input["query"]).toEqual({ state: "closed" });
  });
});

describe("a report's page (spec 9, 3.4.2)", () => {
  it("shows the report and its records, without the message's words until asked", async () => {
    const api = start(detailPath);
    expect(
      await screen.findByRole("heading", {
        name: "A message: Harassment or unwanted contact",
        level: 1,
      }),
    ).toBeTruthy();
    const shown = screen.getByRole("region", { name: "The report" });
    expect(shown.textContent).toContain("She was rude to me.");
    const records = screen.getByRole("region", { name: "What it is about" });
    expect(records.textContent).toContain("N1 Borgarnes – Hof, Akureyri");
    expect(records.textContent).toContain("No dogs, please.");
    expect(records.textContent).toContain("Confirmed, 1 seat");
    expect(document.body.textContent).not.toContain("Something unkind");
    const reported = screen.getByRole("region", { name: "The person reported: Dóra" });
    expect(reported.textContent).toContain("Icelandic");
    expect(reported.textContent).toContain("Drove N1 Borgarnes – Hof, Akureyri");
    expect(api.called(adminReportConversationRoute)).toEqual([]);
  });

  it("opens the conversation when asked, marking the message reported and one removed", async () => {
    const api = start(detailPath);
    api.on(adminReportConversationRoute, { status: 200, data: { messages: conversation } });
    fireEvent.click(await screen.findByRole("button", { name: "Show the conversation" }));
    const list = await screen.findByRole("list", { name: "The conversation" });
    const [reportedLine, removedLine] = within(list).getAllByRole("listitem");
    expect(reportedLine?.textContent).toContain("The driver");
    expect(reportedLine?.textContent).toContain("Reported");
    expect(reportedLine?.textContent).toContain("Something unkind");
    expect(removedLine?.textContent).toContain("Removed by ShareRide");
    expect(api.called(adminReportConversationRoute)).toHaveLength(1);
  });

  it("says when the report does not exist", async () => {
    start(detailPath, null);
    expect((await screen.findByRole("alert")).textContent).toBe("This report could not be found.");
  });
});

describe("acting on a report (spec 9, 3.4.3)", () => {
  it("asks for an action, a rule and a reason", async () => {
    const api = start(detailPath);
    const act = await screen.findByRole("region", { name: "Act on it" });
    fireEvent.click(within(act).getByRole("button", { name: "Review the notice" }));
    expect(act.textContent).toContain("Choose an action.");
    expect(act.textContent).toContain("Choose the rule it concerns.");
    expect(act.textContent).toContain("Write the reason.");
    expect(api.called(adminWarnRoute)).toEqual([]);
  });

  it("shows the warning as Dóra reads it, in Icelandic, then sends it", async () => {
    const api = start(detailPath);
    api.on(adminWarnRoute, { status: 201, data: { action: warning } });
    const act = await screen.findByRole("region", { name: "Act on it" });
    fireEvent.click(within(act).getByRole("radio", { name: "Warn Dóra" }));
    fireEvent.change(within(act).getByRole("combobox", { name: "Community rule" }), {
      target: { value: "harassment" },
    });
    fireEvent.change(within(act).getByRole("textbox", { name: "Reason, written for Dóra" }), {
      target: { value: "  Please keep messages kind.  " },
    });
    fireEvent.click(within(act).getByRole("button", { name: "Review the notice" }));

    const preview = within(act).getByRole("group", { name: "What Dóra reads, in Icelandic" });
    expect(preview.textContent).toContain("Viðvörun frá ShareRide");
    expect(preview.textContent).toContain("Regla: Áreitni");
    expect(preview.textContent).toContain("Ástæða: Please keep messages kind.");
    expect(api.called(adminWarnRoute)).toEqual([]);

    api.on(adminReportRoute, { status: 200, data: { ...report, actions: [warning] } });
    fireEvent.click(within(preview).getByRole("button", { name: "Send" }));
    expect((await within(act).findByRole("status")).textContent).toBe("Done. Dóra is told why.");
    expect(api.called(adminWarnRoute)[0]?.input).toEqual({
      params: { id: dora.userId },
      body: { rule: "harassment", reason: "Please keep messages kind.", reportId },
    });
    const taken = screen.getByRole("region", { name: "Actions on this report" });
    await waitFor(() => {
      expect(taken.textContent).toContain("Reason: Please keep messages kind.");
    });
  });

  it("offers hiding the message and the trip's note, and cancelling the trip Dóra drives", async () => {
    start(detailPath);
    const act = await screen.findByRole("region", { name: "Act on it" });
    const choices = within(act)
      .getAllByRole("radio")
      .map((radio) => radio.closest("label")?.textContent);
    expect(choices).toEqual([
      "Warn Dóra",
      "Hide the message reported",
      "Hide the trip's note",
      "Suspend Dóra",
      "Cancel the trip as ShareRide",
    ]);
  });

  it("suspends with no end date, and says what it cancelled", async () => {
    const api = start(detailPath);
    api.on(adminSuspendRoute, {
      status: 201,
      data: {
        action: { ...warning, kind: "suspension" },
        tripsCancelled: 1,
        bookingsCancelled: 0,
      },
    });
    const act = await screen.findByRole("region", { name: "Act on it" });
    fireEvent.click(within(act).getByRole("radio", { name: "Suspend Dóra" }));
    fireEvent.change(within(act).getByRole("combobox", { name: "Community rule" }), {
      target: { value: "safety" },
    });
    fireEvent.change(within(act).getByRole("textbox", { name: "Reason, written for Dóra" }), {
      target: { value: "Threats to a passenger." },
    });
    fireEvent.click(within(act).getByRole("button", { name: "Review the notice" }));
    expect(act.textContent).toContain("Choose the day it ends, or no end date.");
    fireEvent.click(within(act).getByRole("checkbox", { name: "No end date" }));
    fireEvent.click(within(act).getByRole("button", { name: "Review the notice" }));
    const preview = within(act).getByRole("group", { name: "What Dóra reads, in Icelandic" });
    expect(preview.textContent).toContain("Aðganginum þínum hefur verið lokað ótímabundið");
    fireEvent.click(within(preview).getByRole("button", { name: "Send" }));
    expect((await within(act).findByRole("status")).textContent).toBe(
      "Suspended. 1 trip and no bookings cancelled. Dóra is told why.",
    );
    expect(api.called(adminSuspendRoute)[0]?.input["body"]).toEqual({
      rule: "safety",
      reason: "Threats to a passenger.",
      reportId,
      until: null,
    });
  });

  it("says when the person is suspended already", async () => {
    const api = start(detailPath);
    api.on(adminWarnRoute, { status: 404, error: { code: "not_found" } });
    const act = await screen.findByRole("region", { name: "Act on it" });
    fireEvent.click(within(act).getByRole("radio", { name: "Warn Dóra" }));
    fireEvent.change(within(act).getByRole("combobox", { name: "Community rule" }), {
      target: { value: "other" },
    });
    fireEvent.change(within(act).getByRole("textbox", { name: "Reason, written for Dóra" }), {
      target: { value: "Something." },
    });
    fireEvent.click(within(act).getByRole("button", { name: "Review the notice" }));
    fireEvent.click(within(act).getByRole("button", { name: "Send" }));
    expect((await within(act).findByRole("alert")).textContent).toBe(
      "It no longer exists. Reload the report.",
    );
  });
});

describe("closing a report (spec 9, 3.1.6)", () => {
  it("asks once more, then closes it and says the reporter is told", async () => {
    const api = start(detailPath);
    api.on(adminCloseReportRoute, {
      status: 200,
      data: {
        ...report,
        status: "closed",
        outcome: "no_breach",
        closedAt: "2099-11-15T12:00:00.000Z",
      },
    });
    const close = await screen.findByRole("region", { name: "Close the report" });
    fireEvent.click(within(close).getByRole("button", { name: "Close the report" }));
    expect(within(close).getByRole("alert").textContent).toBe("Choose the outcome.");
    fireEvent.click(within(close).getByRole("radio", { name: "No breach" }));
    fireEvent.click(within(close).getByRole("button", { name: "Close the report" }));
    expect(close.textContent).toContain("Close it as “No breach”? The reporter is told at once.");
    expect(api.called(adminCloseReportRoute)).toEqual([]);
    fireEvent.click(within(close).getByRole("button", { name: "Yes, close it" }));
    expect((await within(close).findByRole("status")).textContent).toBe(
      "Closed. The reporter is told.",
    );
    expect(api.called(adminCloseReportRoute)[0]?.input).toEqual({
      params: { id: reportId },
      body: { outcome: "no_breach" },
    });
    expect(close.textContent).toContain("No breach");
    // Back to the open ones, where the next report waits.
    expect(screen.getByRole("link", { name: "All reports" }).getAttribute("href")).toBe(
      "/admin/reports",
    );
  });
});
