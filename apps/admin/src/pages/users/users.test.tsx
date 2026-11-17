import {
  adminAddNoteRoute,
  adminDeclineRatesRoute,
  adminFindUsersRoute,
  adminMeRoute,
  adminReinstateRoute,
  adminSuspendRoute,
  adminUserRoute,
  type AdminDeclines,
  type AdminMe,
  type AdminModerationAction,
  type AdminPerson,
  type AdminUser,
  type AdminUserListItem,
} from "@shareride/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleApp } from "../../app.tsx";
import { createFakeApi, createFakePasskeys } from "../../testing/fake-api.ts";

// Made-up people: Dóra drives and declined a request; Anna is the operator.

const operator: AdminMe = {
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

const found: AdminUserListItem = {
  person: dora,
  phone: "+3546900001",
  email: "dora@example.com",
  joinedAt: "2099-01-10T12:00:00.000Z",
};

const declines: AdminDeclines = {
  answered: 4,
  declined: 1,
  reasons: { plans_changed: 0, luggage: 1, other: 0, none: 0 },
};

const user: AdminUser = {
  ...found,
  phoneVerifiedAt: "2099-01-10T12:00:00.000Z",
  emailVerifiedAt: null,
  ageConfirmedAt: "2099-01-10T12:00:00.000Z",
  licenceDeclaredAt: "2099-01-11T12:00:00.000Z",
  languages: ["is", "en"],
  about: { text: "I like quiet drives.", hidden: false },
  deleteAfter: null,
  vehicles: [
    {
      id: "0196f000-0000-7000-8000-0000000000e1",
      make: "Skoda",
      model: "Octavia",
      colour: "white",
      registration: "AB123",
      removed: false,
    },
  ],
  trips: [],
  bookings: [],
  reportsBy: [],
  reportsAbout: [],
  actions: [],
  notes: [
    {
      id: "0196f000-0000-7000-8000-0000000000f1",
      text: "Called about a late pickup.",
      by: { ...dora, userId: operator.userId, firstName: "Anna" },
      at: "2099-11-14T09:00:00.000Z",
    },
  ],
  declines,
};

const suspension: AdminModerationAction = {
  id: "0196f000-0000-7000-8000-0000000000a9",
  kind: "suspension",
  person: { ...dora, status: "suspended" },
  reportId: null,
  rule: "safety",
  reason: "Unsafe driving.",
  content: null,
  until: null,
  at: "2099-11-15T11:00:00.000Z",
  appeal: null,
};

function start(path: string, shown: AdminUser | null = user) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: operator });
  api.on(adminFindUsersRoute, { status: 200, data: { users: [found], more: false } });
  api.on(adminDeclineRatesRoute, {
    status: 200,
    data: { drivers: [{ driver: dora, ...declines }] },
  });
  api.on(
    adminUserRoute,
    shown === null ? { status: 404, error: { code: "not_found" } } : { status: 200, data: shown },
  );
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return api;
}

describe("finding people (spec 9, 3.5.1)", () => {
  it("asks for something to look for, then finds people without putting it in the address", async () => {
    const api = start("/admin/users");
    const field = await screen.findByLabelText("Name, phone number, email or ID");

    fireEvent.click(screen.getByRole("button", { name: "Find" }));

    expect(await screen.findByText("Type something to look for.")).toBeTruthy();
    expect(field).toBe(document.activeElement);
    expect(api.called(adminFindUsersRoute)).toEqual([]);

    fireEvent.change(field, { target: { value: " 690 0001 " } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));

    const list = await screen.findByRole("list", { name: "People found" });
    expect(api.called(adminFindUsersRoute)[0]?.input["body"]).toEqual({ q: "690 0001" });
    expect(window.location.search).toBe("");
    const [card] = within(list).getAllByRole("listitem");
    expect(
      within(card ?? document.body)
        .getByRole("link", { name: "Dóra" })
        .getAttribute("href"),
    ).toBe(`/admin/users/${dora.userId}`);
    expect(card?.textContent).toContain("dora@example.com");
    expect(screen.getByRole("status").textContent).toBe("1 person, by first name");
  });

  it("says when more people matched than it lists", async () => {
    const api = start("/admin/users");
    api.on(adminFindUsersRoute, { status: 200, data: { users: [found], more: true } });

    fireEvent.change(await screen.findByLabelText("Name, phone number, email or ID"), {
      target: { value: "a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));

    expect(
      await screen.findByText("Only the first 1 show. Narrow the search to see the others."),
    ).toBeTruthy();
  });

  it("lists each driver's decline rate, with the reasons", async () => {
    start("/admin/users");

    const rates = await screen.findByRole("list", {
      name: "Request decline rate, last 90 days",
    });

    expect(rates.textContent).toContain("Declined 1 of 4 requests answered (25%)");
    expect(rates.textContent).toContain("Luggage: 1");
  });
});

describe("a person's page (spec 9, 3.5.2)", () => {
  it("shows their account, cars and notes, and what can be done", async () => {
    start(`/admin/users/${dora.userId}`);

    expect(await screen.findByRole("heading", { level: 1, name: "Dóra" })).toBeTruthy();
    const account = screen.getByRole("region", { name: "Account" });
    expect(account.textContent).toContain("dora@example.com");
    expect(account.textContent).toContain("I like quiet drives.");
    expect(account.textContent).toContain(dora.userId);
    expect(screen.getByRole("region", { name: "Cars" }).textContent).toContain(
      "White Skoda Octavia · AB123",
    );
    const notes = screen.getByRole("list", { name: "Notes" });
    expect(notes.textContent).toContain("Called about a late pickup.");
    expect(notes.textContent).toContain("Anna");
    expect(
      screen.getAllByRole("radio").map((radio) => radio.parentElement?.textContent ?? ""),
    ).toEqual([
      expect.stringContaining("Warn Dóra"),
      expect.stringContaining("Hide their About you"),
      expect.stringContaining("Suspend Dóra"),
    ]);
  });

  it("adds a note, after asking for one that says something", async () => {
    const api = start(`/admin/users/${dora.userId}`);
    api.on(adminAddNoteRoute, {
      status: 201,
      data: {
        note: {
          id: "0196f000-0000-7000-8000-0000000000f2",
          text: "Refund sent.",
          by: null,
          at: "2099-11-15T09:00:00.000Z",
        },
      },
    });
    const field = await screen.findByLabelText("New note");

    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    expect(await screen.findByText("Write the note first.")).toBeTruthy();
    expect(field).toBe(document.activeElement);
    expect(api.called(adminAddNoteRoute)).toEqual([]);

    fireEvent.change(field, { target: { value: "  Refund sent. " } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() => {
      expect(screen.getByText("Note added.")).toBe(document.activeElement);
    });
    expect(api.called(adminAddNoteRoute)[0]?.input).toMatchObject({
      params: { id: dora.userId },
      body: { text: "Refund sent." },
    });
    const notes = within(screen.getByRole("list", { name: "Notes" })).getAllByRole("listitem");
    expect(notes[0]?.textContent).toContain("Refund sent.");
    expect(notes[0]?.textContent).toContain("An operator");
    expect((field as HTMLTextAreaElement).value).toBe("");
  });

  it("suspends without a report, and offers Reinstate once they are suspended", async () => {
    const api = start(`/admin/users/${dora.userId}`);
    api.on(adminSuspendRoute, () => {
      api.on(adminUserRoute, {
        status: 200,
        data: {
          ...user,
          person: { ...dora, status: "suspended" },
          actions: [suspension],
        },
      });
      return { status: 201, data: { action: suspension, tripsCancelled: 1, bookingsCancelled: 0 } };
    });
    await screen.findByRole("heading", { level: 1, name: "Dóra" });

    const act = screen.getByRole("region", { name: "Act on it" });
    fireEvent.click(within(act).getByRole("radio", { name: "Suspend Dóra" }));
    fireEvent.change(within(act).getByRole("combobox", { name: "Community rule" }), {
      target: { value: "safety" },
    });
    fireEvent.change(within(act).getByRole("textbox", { name: "Reason, written for Dóra" }), {
      target: { value: "Unsafe driving." },
    });
    fireEvent.click(within(act).getByRole("checkbox", { name: "No end date" }));
    fireEvent.click(within(act).getByRole("button", { name: "Review the notice" }));
    fireEvent.click(within(act).getByRole("button", { name: "Send" }));

    await screen.findByRole("radio", { name: "Reinstate Dóra" });
    expect(api.called(adminSuspendRoute)[0]?.input).toMatchObject({
      params: { id: dora.userId },
      body: { rule: "safety", reason: "Unsafe driving.", until: null },
    });
    expect(api.called(adminSuspendRoute)[0]?.input["body"]).not.toHaveProperty("reportId");
    expect(api.called(adminReinstateRoute)).toEqual([]);
  });

  it("says when there is no such person", async () => {
    start(`/admin/users/${dora.userId}`, null);

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "There is no such person.",
    );
  });
});
