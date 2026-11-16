import {
  adminAuditLogRoute,
  adminMeRoute,
  type AdminMe,
  type AuditEntry,
} from "@shareride/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleApp } from "../app.tsx";
import { createFakeApi, createFakePasskeys } from "../testing/fake-api.ts";

const anna: AdminMe = {
  userId: "0196f000-0000-7000-8000-000000000001",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2026-11-16T23:00:00.000Z",
};

const entry = (id: string, more: Partial<AuditEntry> = {}): AuditEntry => ({
  id,
  at: "2026-11-16T22:10:00.000Z",
  operator: { userId: anna.userId, firstName: "Anna" },
  byCommand: false,
  action: "meeting_point.renamed",
  subjectType: "meeting_point",
  subjectId: "point-7",
  before: { name: "Old name" },
  after: { name: "New name" },
  ipAddress: "192.0.2.10",
  userAgent: "Test browser",
  ...more,
});

type Page = { entries: AuditEntry[]; hasMore: boolean };

function start(path: string, page: (query: Record<string, string>) => Page | number) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminAuditLogRoute, (input) => {
    const answer = page((input["query"] ?? {}) as Record<string, string>);
    return typeof answer === "number"
      ? { status: answer, error: { code: answer === 400 ? "validation_failed" : "error" } }
      : { status: 200, data: answer };
  });
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  const queries = () =>
    api.called(adminAuditLogRoute).map((call) => call.input["query"] as Record<string, string>);
  return { api, queries };
}

const cards = async () =>
  within(await screen.findByRole("list", { name: "Entries" })).getAllByRole("listitem");

describe("the audit log page", () => {
  it("is in the menu", async () => {
    start("/admin", () => ({ entries: [], hasMore: false }));
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    fireEvent.click(within(menu).getByRole("link", { name: "Audit log" }));
    expect(await screen.findByRole("heading", { name: "Audit log" })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/audit-log");
  });

  it("lists entries with when, who, what, on which record and the changes", async () => {
    start("/admin/audit-log", () => ({
      entries: [
        entry("e2", {
          action: "operator.role_given",
          byCommand: true,
          ipAddress: null,
          userAgent: null,
          before: null,
          after: null,
          subjectType: null,
          subjectId: null,
        }),
        entry("e1"),
      ],
      hasMore: false,
    }));
    const [command, renamed] = await cards();
    expect(command?.textContent).toContain("operator.role_given");
    expect(command?.textContent).toContain("With the operator command");
    expect(command?.textContent).not.toContain("Record:");

    const text = renamed?.textContent ?? "";
    expect(text).toContain("meeting_point.renamed");
    expect(text).toContain("16 November 2026 at 22:10");
    expect(text).toContain("By Anna");
    expect(text).toContain("Record: meeting_point point-7");
    const changes = within(renamed as HTMLElement).getByRole("table", { name: "Changes" });
    expect(within(changes).getByRole("row", { name: "name Old name New name" })).toBeTruthy();
    expect(text).toContain("192.0.2.10");
    expect(text).toContain("Test browser");
  });

  it("reads the filters from the address and fills them in", async () => {
    const { queries } = start(
      "/admin/audit-log?action=operator.&from=2026-11-01&to=2026-11-16&ignored=1",
      () => ({ entries: [], hasMore: false }),
    );
    await screen.findByText("No entries match these filters.");
    expect(queries()).toEqual([{ action: "operator.", from: "2026-11-01", to: "2026-11-16" }]);
    expect(screen.getByLabelText<HTMLInputElement>("Action starts with").value).toBe("operator.");
    expect(screen.getByLabelText<HTMLInputElement>("First day").value).toBe("2026-11-01");
  });

  it("applies the filters and keeps them in the address, and clears them", async () => {
    const { queries } = start("/admin/audit-log", () => ({
      entries: [entry("e1")],
      hasMore: false,
    }));
    await cards();
    fireEvent.change(screen.getByLabelText("Action starts with"), {
      target: { value: " meeting_point. " },
    });
    fireEvent.change(screen.getByLabelText("Record ID"), { target: { value: "point-7" } });
    fireEvent.click(screen.getByRole("button", { name: "Show entries" }));
    await cards();
    expect(queries().at(-1)).toEqual({ action: "meeting_point.", subjectId: "point-7" });
    expect(window.location.search).toBe("?action=meeting_point.&subjectId=point-7");

    fireEvent.click(screen.getByRole("button", { name: "Clear the filters" }));
    await cards();
    expect(queries().at(-1)).toEqual({});
    expect(window.location.search).toBe("");
    expect(screen.getByLabelText<HTMLInputElement>("Record ID").value).toBe("");
  });

  it("asks for a last day on or after the first, in the field", async () => {
    const { queries } = start("/admin/audit-log", () => ({ entries: [], hasMore: false }));
    await screen.findByText("Nothing has been logged yet.");
    fireEvent.change(screen.getByLabelText("First day"), { target: { value: "2026-11-16" } });
    fireEvent.change(screen.getByLabelText("Last day"), { target: { value: "2026-11-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Show entries" }));
    const last = screen.getByLabelText("Last day");
    expect(last.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("The last day cannot be before the first day.")).toBeTruthy();
    expect(document.activeElement).toBe(last);
    expect(queries()).toHaveLength(1);
  });

  it("shows only one record's or one operator's entries from an entry", async () => {
    const { queries } = start("/admin/audit-log", () => ({
      entries: [entry("e1")],
      hasMore: false,
    }));
    const [card] = await cards();
    fireEvent.click(
      within(card as HTMLElement).getByRole("button", {
        name: "Show only entries about meeting_point point-7",
      }),
    );
    await cards();
    expect(queries().at(-1)).toEqual({ subjectType: "meeting_point", subjectId: "point-7" });
    expect(screen.getByLabelText<HTMLInputElement>("Record type").value).toBe("meeting_point");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Entries" }));

    const [again] = await cards();
    fireEvent.click(
      within(again as HTMLElement).getByRole("button", { name: "Show only the actions of Anna" }),
    );
    expect(await screen.findByText("Showing one operator's actions only.")).toBeTruthy();
    expect(queries().at(-1)).toMatchObject({ operatorUserId: anna.userId });
    expect(window.location.search).toContain(`operatorUserId=${anna.userId}`);

    fireEvent.click(screen.getByRole("button", { name: "Show all operators" }));
    await cards();
    expect(queries().at(-1)).not.toHaveProperty("operatorUserId");
    expect(screen.queryByText("Showing one operator's actions only.")).toBeNull();
  });

  it("shows older entries a page at a time", async () => {
    const { queries } = start("/admin/audit-log?action=meeting_point.", (query) =>
      query["before"] === undefined
        ? { entries: [entry("e3"), entry("e2")], hasMore: true }
        : { entries: [entry("e1")], hasMore: false },
    );
    expect(await cards()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Show older entries" }));
    await waitFor(() => {
      expect(screen.getAllByText("meeting_point.renamed")).toHaveLength(3);
    });
    expect(queries().at(-1)).toEqual({ action: "meeting_point.", before: "e2" });
    expect(screen.queryByRole("button", { name: "Show older entries" })).toBeNull();
  });

  it("says when older entries could not be loaded, and keeps the ones shown", async () => {
    start("/admin/audit-log", (query) =>
      query["before"] === undefined ? { entries: [entry("e2")], hasMore: true } : 500,
    );
    await cards();
    fireEvent.click(screen.getByRole("button", { name: "Show older entries" }));
    expect(await screen.findByText("Older entries could not be loaded. Try again.")).toBeTruthy();
    expect(await cards()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Show older entries" })).toBeTruthy();
  });

  it("says when the log could not be loaded, and tries again", async () => {
    let fail = true;
    start("/admin/audit-log", () => (fail ? 500 : { entries: [entry("e1")], hasMore: false }));
    expect(await screen.findByText("The audit log could not be loaded.")).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await cards()).toHaveLength(1);
  });

  it("says when filters from the address cannot be used", async () => {
    start("/admin/audit-log?from=2026-11-16&to=2026-11-01", () => 400);
    expect(
      await screen.findByText("These filters cannot be used. Clear them and try again."),
    ).toBeTruthy();
  });

  it("is in Icelandic too", async () => {
    window.history.replaceState(null, "", "/admin/audit-log");
    const api = createFakeApi();
    api.on(adminMeRoute, { status: 200, data: { ...anna, locale: "is" } });
    api.on(adminAuditLogRoute, { status: 200, data: { entries: [entry("e1")], hasMore: false } });
    render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
    expect(await screen.findByRole("heading", { name: "Aðgerðaskrá" })).toBeTruthy();
    expect(await screen.findByText(/16\. nóvember 2026 kl\. 22:10/)).toBeTruthy();
  });
});
