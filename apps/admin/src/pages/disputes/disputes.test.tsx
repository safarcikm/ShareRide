import {
  adminDecideDisputeRoute,
  adminDisputeConversationRoute,
  adminDisputeRoute,
  adminDisputesRoute,
  adminMeRoute,
  type AdminConversationMessage,
  type AdminDispute,
  type AdminDisputeListItem,
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

const disputeId = "0196f000-0000-7000-8000-0000000000d1";
const borgarnes = { is: "N1 Borgarnesi", en: "N1 Borgarnes" };
const akureyri = { is: "Hof, Akureyri", en: "Hof, Akureyri" };

/** Dóra marked Bára as a no-show at Borgarnes; Bára says that's not right. Made up. */
const waiting: AdminDisputeListItem = {
  id: disputeId,
  kind: "no_show",
  raisedAt: "2026-11-15T10:20:00.000Z",
  answeredAt: "2026-11-15T11:05:00.000Z",
  outcome: null,
  decidedAt: null,
  driver: { userId: "0196f000-0000-7000-8000-0000000000c1", firstName: "Dóra" },
  passenger: { userId: "0196f000-0000-7000-8000-0000000000c2", firstName: "Bára" },
  from: { name: borgarnes, plannedAt: "2026-11-15T10:00:00.000Z" },
  to: { name: akureyri, plannedAt: "2026-11-15T13:30:00.000Z" },
};

const report: AdminDispute = {
  ...waiting,
  bookingId: "0196f000-0000-7000-8000-0000000000b1",
  tripId: "0196f000-0000-7000-8000-0000000000a1",
  seats: 1,
  note: "Waited ten minutes at the shop's entrance.",
  answer: "contested",
  answerNote: "I was by the pumps and the car drove off.",
  answerBy: "2026-11-16T15:30:00.000Z",
  decidedBy: null,
  decisionNote: "",
  passengerHereAt: "2026-11-15T09:58:00.000Z",
  stops: [
    {
      name: { is: "BSÍ", en: "BSÍ bus terminal" },
      plannedAt: "2026-11-15T09:00:00.000Z",
      driverHereAt: "2026-11-15T08:57:00.000Z",
      boards: false,
      alights: false,
    },
    {
      name: borgarnes,
      plannedAt: "2026-11-15T10:00:00.000Z",
      driverHereAt: "2026-11-15T10:01:00.000Z",
      boards: true,
      alights: false,
    },
    {
      name: akureyri,
      plannedAt: "2026-11-15T13:30:00.000Z",
      driverHereAt: null,
      boards: false,
      alights: true,
    },
  ],
  outcomes: ["stands", "rode", "left_behind"],
};

const leftBehind: AdminDispute = {
  ...report,
  outcome: "left_behind",
  decidedAt: "2026-11-16T09:12:00.000Z",
  decidedBy: "operator",
  decisionNote: "Her “I'm here” came before his.",
  outcomes: [],
};

const message = (
  changes: Partial<AdminConversationMessage> & Pick<AdminConversationMessage, "id" | "from">,
): AdminConversationMessage => ({
  kind: "text",
  text: null,
  quick: null,
  system: null,
  sentAt: "2026-11-15T09:50:00.000Z",
  ...changes,
});

const conversation: AdminConversationMessage[] = [
  message({
    id: "0196f000-0000-7000-8000-0000000000e1",
    from: "driver",
    kind: "quick",
    quick: { key: "onMyWay" },
  }),
  message({
    id: "0196f000-0000-7000-8000-0000000000e2",
    from: "passenger",
    text: "By the pumps, in a red coat.",
    sentAt: "2026-11-15T09:59:00.000Z",
  }),
  message({
    id: "0196f000-0000-7000-8000-0000000000e3",
    from: "system",
    kind: "system",
    system: { key: "checked_in", by: "me" },
    sentAt: "2026-11-15T10:01:00.000Z",
  }),
  message({
    id: "0196f000-0000-7000-8000-0000000000e4",
    from: "system",
    kind: "system",
    system: { key: "checked_in", by: "them" },
    sentAt: "2026-11-15T09:58:00.000Z",
  }),
  message({
    id: "0196f000-0000-7000-8000-0000000000e5",
    from: "passenger",
    kind: "erased",
    sentAt: "2026-11-15T10:05:00.000Z",
  }),
];

/** The console at `path`; `shown` is the report the API gives, or none (404). */
function start(path: string, shown: AdminDispute | null = report) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminDisputesRoute, { status: 200, data: { disputes: [waiting] } });
  api.on(
    adminDisputeRoute,
    shown === null ? { status: 404, error: { code: "not_found" } } : { status: 200, data: shown },
  );
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return api;
}

const detailPath = `/admin/disputes/${disputeId}`;

describe("the disputes list (spec 8, 3.5)", () => {
  it("is in the menu after the meeting points", async () => {
    start("/admin");
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    const links = within(menu)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links.slice(0, 3)).toEqual(["Home", "Meeting points", "Disputes"]);
    fireEvent.click(within(menu).getByRole("link", { name: "Disputes" }));
    expect(await screen.findByRole("heading", { name: "Disputes", level: 1 })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/disputes");
  });

  it("lists the reports waiting, oldest first, with the people, the ride and when", async () => {
    const api = start("/admin/disputes");
    const list = await screen.findByRole("list", { name: "Waiting for a decision" });
    const [card] = within(list).getAllByRole("listitem");
    if (card === undefined) throw new Error("One report expected.");
    expect(
      within(card)
        .getByRole("link", { name: "No-show: N1 Borgarnes – Hof, Akureyri" })
        .getAttribute("href"),
    ).toBe(detailPath);
    expect(card.textContent).toContain("Driver: Dóra · Passenger: Bára");
    expect(card.textContent).toContain("Planned 15 November at 10:00");
    expect(card.textContent).toContain("Reported 15 November at 10:20");
    expect(screen.getByText("1 report waits, oldest first")).toBeTruthy();
    expect(api.called(adminDisputesRoute)[0]?.input["query"]).toEqual({ state: "waiting" });
    const views = screen.getByRole("navigation", { name: "Reports to show" });
    expect(within(views).getByRole("link", { name: "Waiting" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("shows the last ones decided, with their outcome", async () => {
    const api = start("/admin/disputes");
    await screen.findByRole("list", { name: "Waiting for a decision" });
    api.on(adminDisputesRoute, {
      status: 200,
      data: {
        disputes: [{ ...waiting, outcome: "left_behind", decidedAt: "2026-11-16T09:12:00.000Z" }],
      },
    });
    const views = screen.getByRole("navigation", { name: "Reports to show" });
    fireEvent.click(within(views).getByRole("link", { name: "Decided" }));
    const list = await screen.findByRole("list", { name: "Decided by an operator" });
    expect(window.location.search).toBe("?state=decided");
    expect(api.called(adminDisputesRoute).at(-1)?.input["query"]).toEqual({ state: "decided" });
    expect(list.textContent).toContain("The driver left without the passenger");
    expect(list.textContent).toContain("Decided 16 November at 09:12");
    expect(
      within(screen.getByRole("navigation", { name: "Reports to show" }))
        .getByRole("link", { name: "Decided" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("names someone who left ShareRide as a former member", async () => {
    const api = start("/admin/disputes");
    api.on(adminDisputesRoute, {
      status: 200,
      data: { disputes: [{ ...waiting, passenger: { ...waiting.passenger, firstName: null } }] },
    });
    const list = await screen.findByRole("list", { name: "Waiting for a decision" });
    expect(list.textContent).toContain("Driver: Dóra · Passenger: A former member");
  });

  it("says when none wait, and when they could not be loaded", async () => {
    const api = createFakeApi();
    window.history.replaceState(null, "", "/admin/disputes");
    api.on(adminMeRoute, { status: 200, data: anna });
    api.on(adminDisputesRoute, { status: 500, error: { code: "internal_error" } });
    render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
    expect((await screen.findByRole("alert")).textContent).toBe("The reports could not be loaded.");
    api.on(adminDisputesRoute, { status: 200, data: { disputes: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No report is waiting for a decision.")).toBeTruthy();
  });
});

describe("a report (spec 8, 3.5)", () => {
  it("shows what each side said, the stops' times and the passenger's “I'm here”", async () => {
    start(detailPath);
    expect(await screen.findByRole("heading", { name: "No-show", level: 1 })).toBeTruthy();
    const booking = screen.getByRole("region", { name: "The booking" });
    expect(booking.textContent).toContain("DriverDóra");
    expect(booking.textContent).toContain("PassengerBára");
    expect(booking.textContent).toContain("Seats1");
    expect(booking.textContent).toContain("RideN1 Borgarnes – Hof, Akureyri");
    expect(booking.textContent).toContain("StatusWaiting for a decision");

    const said = screen.getByRole("region", { name: "What each side said" });
    const reported = within(said).getByRole("group", { name: "The driver's report" });
    expect(reported.textContent).toContain("When15 November at 10:20");
    expect(reported.textContent).toContain("NoteWaited ten minutes at the shop's entrance.");
    const answered = within(said).getByRole("group", { name: "The passenger's answer" });
    expect(answered.textContent).toContain("AnswerThat's not right");
    expect(answered.textContent).toContain("When15 November at 11:05");
    expect(answered.textContent).toContain("NoteI was by the pumps and the car drove off.");

    const table = screen.getByRole("table", { name: "Stops and times" });
    const rows = within(table).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "StopPlannedDriver's “I'm here”",
      "BSÍ bus terminal09:0008:57",
      "N1 BorgarnesPassenger gets in10:0010:01",
      "Hof, AkureyriPassenger gets out13:30Not said",
    ]);
    expect(screen.getByText("The passenger said “I'm here” at 09:58.")).toBeTruthy();
  });

  it("says when the other side never answered, and that it isn't the operator's", async () => {
    start(detailPath, {
      ...report,
      answer: null,
      answeredAt: null,
      answerNote: "",
      note: "",
      passengerHereAt: null,
      outcomes: [],
    });
    const said = await screen.findByRole("region", { name: "What each side said" });
    expect(within(said).getByRole("group", { name: "The driver's report" }).textContent).toContain(
      "NoteNone",
    );
    expect(said.textContent).toContain("No answer. They could answer until 16 November at 15:30.");
    expect(screen.getByText("The passenger never said “I'm here”.")).toBeTruthy();
    expect(
      screen.getByText("Nobody contested this report, so it isn't for an operator to decide."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Decide" })).toBeNull();
  });

  it("shows the decision once made: the outcome, by whom, when and why", async () => {
    start(detailPath, leftBehind);
    const decision = await screen.findByRole("region", { name: "Decision" });
    expect(decision.textContent).toContain("OutcomeThe driver left without the passenger");
    expect(decision.textContent).toContain("Decided byAn operator");
    expect(decision.textContent).toContain("When16 November at 09:12");
    expect(decision.textContent).toContain("ReasonsHer “I'm here” came before his.");
    expect(screen.queryByRole("button", { name: "Decide" })).toBeNull();
  });

  it("says when the report is not there", async () => {
    start(detailPath, null);
    expect((await screen.findByRole("alert")).textContent).toBe("This report could not be found.");
    expect(screen.getByRole("link", { name: "All disputes" }).getAttribute("href")).toBe(
      "/admin/disputes",
    );
  });
});

describe("deciding a report (spec 8, 3.5; decisions 4 and 5)", () => {
  const choose = (name: string) => {
    fireEvent.click(screen.getByRole("radio", { name }));
  };

  it("offers the kind's outcomes, each with what it does", async () => {
    start(detailPath);
    const group = await screen.findByRole("radiogroup", { name: "What happened" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual([
      "stands",
      "rode",
      "left_behind",
    ]);
    const left = screen.getByRole("radio", { name: "The driver left without the passenger" });
    const effect = document.getElementById(left.getAttribute("aria-describedby") ?? "");
    expect(effect?.textContent).toBe(
      "The booking is cancelled with a full refund, the driver isn't paid, and it counts on the driver.",
    );
  });

  it("asks once more, then decides, says so and shows the decision", async () => {
    const api = start(detailPath);
    api.on(adminDecideDisputeRoute, { status: 200, data: leftBehind });
    await screen.findByRole("radiogroup", { name: "What happened" });
    choose("The driver left without the passenger");
    fireEvent.change(screen.getByLabelText("Your reasons (optional)"), {
      target: { value: "  Her “I'm here” came before his.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Decide" }));
    const confirm = screen.getByRole("group", {
      name: "Decide “The driver left without the passenger”? Both sides are told, and it can't be changed in the app.",
    });
    const yes = within(confirm).getByRole("button", { name: "Yes, decide" });
    expect(document.activeElement).toBe(yes);
    expect(api.called(adminDecideDisputeRoute)).toHaveLength(0);
    fireEvent.click(yes);
    const done = await screen.findByRole("status");
    expect(done.textContent).toBe(
      "Decided: The driver left without the passenger. Both sides are told.",
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(done);
    });
    expect(api.called(adminDecideDisputeRoute)[0]?.input).toEqual({
      params: { id: disputeId },
      body: { outcome: "left_behind", note: "Her “I'm here” came before his." },
    });
    expect(screen.getByRole("region", { name: "Decision" }).textContent).toContain(
      "Decided byAn operator",
    );
    expect(screen.queryByRole("button", { name: "Decide" })).toBeNull();
  });

  it("goes back to the form without deciding", async () => {
    const api = start(detailPath);
    await screen.findByRole("radiogroup", { name: "What happened" });
    choose("The passenger rode");
    fireEvent.click(screen.getByRole("button", { name: "Decide" }));
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Decide" }));
    expect(api.called(adminDecideDisputeRoute)).toHaveLength(0);
  });

  it("asks what happened first", async () => {
    const api = start(detailPath);
    await screen.findByRole("radiogroup", { name: "What happened" });
    fireEvent.click(screen.getByRole("button", { name: "Decide" }));
    const problem = screen.getByRole("alert");
    expect(problem.textContent).toBe("Choose what happened.");
    await waitFor(() => {
      expect(document.activeElement).toBe(problem);
    });
    expect(screen.queryByRole("button", { name: "Yes, decide" })).toBeNull();
    expect(api.called(adminDecideDisputeRoute)).toHaveLength(0);
  });

  it("says when the reasons are too long, before asking", async () => {
    const api = start(detailPath);
    await screen.findByRole("radiogroup", { name: "What happened" });
    choose("The passenger rode");
    fireEvent.change(screen.getByLabelText("Your reasons (optional)"), {
      target: { value: "ð".repeat(501) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Decide" }));
    const problem = screen.getByRole("alert");
    expect(problem.textContent).toBe("Keep the reasons to 500 characters or fewer.");
    await waitFor(() => {
      expect(document.activeElement).toBe(problem);
    });
    expect(screen.queryByRole("button", { name: "Yes, decide" })).toBeNull();
    expect(api.called(adminDecideDisputeRoute)).toHaveLength(0);
  });

  it("says when the API finds the reasons too long", async () => {
    const api = start(detailPath);
    api.on(adminDecideDisputeRoute, {
      status: 400,
      error: { code: "validation_failed", details: [{ path: "note", issue: "too_long" }] },
    });
    await screen.findByRole("radiogroup", { name: "What happened" });
    choose("The passenger rode");
    fireEvent.click(screen.getByRole("button", { name: "Decide" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, decide" }));
    const reasons = screen.getByLabelText("Your reasons (optional)");
    await waitFor(() => {
      expect(reasons.getAttribute("aria-invalid")).toBe("true");
    });
    const describedBy = reasons.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toContain(
      "Keep the reasons to 500 characters or fewer.",
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Keep the reasons to 500 characters or fewer.",
    );
  });

  it("says when someone decided it meanwhile, and shows it again", async () => {
    const api = start(detailPath);
    api.on(adminDecideDisputeRoute, { status: 409, error: { code: "already_decided" } });
    await screen.findByRole("radiogroup", { name: "What happened" });
    choose("The passenger rode");
    fireEvent.click(screen.getByRole("button", { name: "Decide" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, decide" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This report was decided meanwhile, perhaps by another operator.",
    );
    api.on(adminDisputeRoute, { status: 200, data: leftBehind });
    fireEvent.click(screen.getByRole("button", { name: "Reload the report" }));
    expect((await screen.findByRole("region", { name: "Decision" })).textContent).toContain(
      "OutcomeThe driver left without the passenger",
    );
    expect(api.called(adminDisputeRoute)).toHaveLength(2);
  });

  it("says when it no longer waits, or the decision failed", async () => {
    const api = start(detailPath);
    api.on(adminDecideDisputeRoute, { status: 409, error: { code: "not_contested" } });
    await screen.findByRole("radiogroup", { name: "What happened" });
    choose("The passenger rode");
    fireEvent.click(screen.getByRole("button", { name: "Decide" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, decide" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This report no longer waits for a decision.",
    );
    api.on(adminDecideDisputeRoute, { status: 500, error: { code: "internal_error" } });
    fireEvent.click(screen.getByRole("button", { name: "Decide" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, decide" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "The decision could not be saved. Try again.",
      );
    });
  });
});

describe("the booking's conversation (R7.3, R9.6)", () => {
  it("opens only when asked, with who said what, oldest first", async () => {
    const api = start(detailPath);
    api.on(adminDisputeConversationRoute, { status: 200, data: { messages: conversation } });
    const section = await screen.findByRole("region", { name: "The conversation" });
    expect(section.textContent).toContain("Each opening is recorded in the audit log.");
    expect(api.called(adminDisputeConversationRoute)).toHaveLength(0);
    fireEvent.click(within(section).getByRole("button", { name: "Show the conversation" }));
    const list = await within(section).findByRole("list");
    expect(api.called(adminDisputeConversationRoute)[0]?.input).toEqual({
      params: { id: disputeId },
    });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Dóra, the driver15 November at 09:50I'm on my way",
      "Bára, the passenger15 November at 09:59By the pumps, in a red coat.",
      "ShareRide15 November at 10:01Dóra is at the meeting point",
      "ShareRide15 November at 09:58Bára is at the meeting point",
      "Bára, the passenger15 November at 10:05Message deleted",
    ]);
    expect(within(section).getByText("5 messages, oldest first")).toBeTruthy();
    expect(within(section).queryByRole("button", { name: "Show the conversation" })).toBeNull();
  });

  it("says when there are no messages, or it stays closed", async () => {
    const api = start(detailPath);
    api.on(adminDisputeConversationRoute, { status: 200, data: { messages: [] } });
    const section = await screen.findByRole("region", { name: "The conversation" });
    fireEvent.click(within(section).getByRole("button", { name: "Show the conversation" }));
    expect(
      await within(section).findByText(
        "No messages. Either they didn't write, or the conversation was deleted 12 months after the trip.",
      ),
    ).toBeTruthy();

    api.on(adminDisputeConversationRoute, { status: 409, error: { code: "not_contested" } });
    fireEvent.click(screen.getByRole("link", { name: "All disputes" }));
    fireEvent.click(await screen.findByRole("link", { name: /^No-show:/ }));
    const again = await screen.findByRole("region", { name: "The conversation" });
    fireEvent.click(within(again).getByRole("button", { name: "Show the conversation" }));
    expect((await within(again).findByRole("alert")).textContent).toBe(
      "Nobody contested this report, so its conversation stays closed.",
    );
  });
});
