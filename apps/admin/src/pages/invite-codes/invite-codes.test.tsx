import {
  adminCreateInviteCodeRoute,
  adminEndInviteCodeRoute,
  adminInviteCodesRoute,
  adminMeRoute,
  type AdminInviteCode,
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
  sessionEndsAt: "2026-11-18T23:00:00.000Z",
};

const codeOf = (more: Partial<AdminInviteCode> = {}): AdminInviteCode => ({
  id: "0196f000-0000-7000-8000-0000000000c1",
  code: "ABCD2345",
  kind: "group",
  name: "Carpool at work",
  usesAllowed: 20,
  uses: 3,
  expiresAt: "2026-12-18T23:59:59.000Z",
  endedAt: null,
  works: true,
  createdAt: "2026-11-18T09:00:00.000Z",
  ...more,
});

function start(path = "/admin/invite-codes", required = true) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  const state = {
    codes: [
      codeOf(),
      codeOf({
        id: "0196f000-0000-7000-8000-0000000000c2",
        code: "WXYZ6789",
        name: "Club",
        uses: 5,
        usesAllowed: 5,
        works: false,
      }),
      codeOf({
        id: "0196f000-0000-7000-8000-0000000000c3",
        code: "QRST4567",
        name: "Old",
        expiresAt: "2026-11-01T23:59:59.000Z",
        works: false,
      }),
    ],
  };
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminInviteCodesRoute, () => ({
    status: 200,
    data: { required, testers: 12, maxTesters: 150, placesLeft: 138, codes: state.codes },
  }));
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return { api, state };
}

const card = async (name: string) => {
  const heading = await screen.findByRole("heading", { name, level: 3 });
  const item = heading.closest("li");
  if (item === null) throw new Error(`"${name}" is not in a card.`);
  return within(item);
};

describe("the Invite codes page", () => {
  it("is in the menu", async () => {
    start("/admin");
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    fireEvent.click(within(menu).getByRole("link", { name: "Invite codes" }));
    expect(await screen.findByRole("heading", { name: "Invite codes", level: 1 })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/invite-codes");
  });

  it("shows the places left and each code with its uses and state", async () => {
    start();
    expect(
      await screen.findByText(
        "12 of 150 testers have joined. Places left: 138. Change the most testers in Settings.",
      ),
    ).toBeTruthy();
    const work = await card("Carpool at work");
    expect(work.getByText("ABCD2345")).toBeTruthy();
    expect(work.getByText("3 of 20 used. Works through 18 December 2026.")).toBeTruthy();
    expect((await card("Club")).getByText("5 of 5 used. Used up.")).toBeTruthy();
    expect((await card("Old")).getByText("3 of 20 used. Ran out on 1 November 2026.")).toBeTruthy();
  });

  it("says when no code is needed", async () => {
    start("/admin/invite-codes", false);
    expect(await screen.findByText(/No invite code is needed just now/)).toBeTruthy();
  });

  it("makes a group code that works through the chosen day, and says its code", async () => {
    const { api, state } = start();
    api.on(adminCreateInviteCodeRoute, (input) => {
      const body = input["body"] as { name: string; uses: number; expiresAt: string };
      const made = codeOf({
        id: "0196f000-0000-7000-8000-0000000000c9",
        code: "NEWC2345",
        name: body.name,
        usesAllowed: body.uses,
        uses: 0,
        expiresAt: body.expiresAt,
      });
      state.codes = [made, ...state.codes];
      return { status: 201, data: made };
    });
    const form = within(await screen.findByRole("form", { name: "New group code" }));
    fireEvent.change(form.getByLabelText("Who it is for"), {
      target: { value: " Climbing club " },
    });
    fireEvent.change(form.getByLabelText("Accounts it can make"), { target: { value: "8" } });
    const ends = form.getByLabelText<HTMLInputElement>("Works through");
    const day = ends.min;
    fireEvent.change(ends, { target: { value: day } });
    fireEvent.click(form.getByRole("button", { name: "Make the code" }));

    expect(
      (await screen.findByText("Code NEWC2345 was made for Climbing club.")).closest(
        '[role="status"]',
      ),
    ).not.toBeNull();
    expect(api.called(adminCreateInviteCodeRoute).at(-1)?.input).toMatchObject({
      body: { name: "Climbing club", uses: 8, expiresAt: `${day}T23:59:59.000Z` },
    });
    expect(await card("Climbing club")).toBeTruthy();
  });

  it("checks the form before sending, in the fields themselves", async () => {
    const { api } = start();
    const form = within(await screen.findByRole("form", { name: "New group code" }));
    const name = form.getByLabelText("Who it is for");
    fireEvent.click(form.getByRole("button", { name: "Make the code" }));
    expect(form.getByText("Say who the code is for.")).toBeTruthy();
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(name, { target: { value: "Club" } });
    const uses = form.getByLabelText("Accounts it can make");
    fireEvent.change(uses, { target: { value: "501" } });
    fireEvent.click(form.getByRole("button", { name: "Make the code" }));
    expect(form.getByText("Enter a whole number from 1 to 500.")).toBeTruthy();
    expect(document.activeElement).toBe(uses);
    expect(api.called(adminCreateInviteCodeRoute)).toHaveLength(0);
  });

  it("ends a code only after asking, and keeps it when told to", async () => {
    const { api, state } = start();
    api.on(adminEndInviteCodeRoute, (input) => {
      const { id } = input["params"] as { id: string };
      state.codes = state.codes.map((code) =>
        code.id === id ? { ...code, endedAt: "2026-11-18T10:00:00.000Z", works: false } : code,
      );
      return { status: 200, data: state.codes.find((code) => code.id === id) };
    });
    const work = await card("Carpool at work");
    fireEvent.click(work.getByRole("button", { name: "End the code for Carpool at work" }));
    expect(work.getByText(/Nobody can join with this code once it has ended/)).toBeTruthy();
    fireEvent.click(work.getByRole("button", { name: "Keep it" }));
    expect(api.called(adminEndInviteCodeRoute)).toHaveLength(0);

    fireEvent.click(work.getByRole("button", { name: "End the code for Carpool at work" }));
    const confirm = work.getByRole("button", { name: "End the code for Carpool at work" });
    expect(document.activeElement).toBe(confirm);
    fireEvent.click(confirm);
    await waitFor(async () => {
      expect((await card("Carpool at work")).getByText(/Ended on 18 November 2026\./)).toBeTruthy();
    });
    expect((await card("Carpool at work")).queryByRole("button")).toBeNull();
  });
});
