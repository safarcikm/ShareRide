import {
  adminMeRoute,
  adminOwnEmailsRoute,
  adminSetOwnEmailsRoute,
  type AdminMe,
  type AdminOwnEmails,
} from "@shareride/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleApp } from "../app.tsx";
import { createFakeApi, createFakePasskeys } from "../testing/fake-api.ts";

const anna: AdminMe = {
  userId: "0196f000-0000-7000-8000-000000000001",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2026-11-23T23:00:00.000Z",
};

function start(stored: AdminOwnEmails, { path = "/admin/emails", saveStatus = 200 } = {}) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  let now = stored;
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminOwnEmailsRoute, () => ({ status: 200, data: now }));
  api.on(adminSetOwnEmailsRoute, (input) => {
    if (saveStatus !== 200) return { status: saveStatus, error: { code: "error" } };
    const body = input["body"] as { newMembers: boolean };
    now = { ...now, newMembers: body.newMembers };
    return { status: 200, data: now };
  });
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return api;
}

const box = () => screen.findByRole("checkbox", { name: "Email me when new members join" });

describe("the Emails to you page (spec 25)", () => {
  it("is in the menu, above Passkeys", async () => {
    start({ newMembers: false, address: "anna@example.com" }, { path: "/admin" });
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    const names = within(menu)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(names.indexOf("Emails to you")).toBe(names.indexOf("Passkeys") - 1);
    fireEvent.click(within(menu).getByRole("link", { name: "Emails to you" }));
    expect(await screen.findByRole("heading", { name: "Emails to you" })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/emails");
  });

  it("shows the choice as stored, how often it comes, and where it goes", async () => {
    start({ newMembers: false, address: "anna@example.com" });
    const choice = await box();
    expect((choice as HTMLInputElement).checked).toBe(false);
    expect(
      screen.getByText(
        "Soon after someone finishes signing up. Anyone who joins in the hour after that comes in the next email, so at most one an hour. How many, never who.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Emails go to anna@example.com.")).toBeTruthy();
  });

  it("saves at once when ticked and unticked", async () => {
    const api = start({ newMembers: false, address: "anna@example.com" });
    fireEvent.click(await box());
    expect((await screen.findByRole("status")).textContent).toBe("Saved.");
    expect(((await box()) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(await box());
    await waitFor(() => {
      expect(api.called(adminSetOwnEmailsRoute)).toHaveLength(2);
    });
    expect(api.called(adminSetOwnEmailsRoute).map((call) => call.input["body"])).toEqual([
      { newMembers: true },
      { newMembers: false },
    ]);
    await waitFor(async () => {
      expect(((await box()) as HTMLInputElement).checked).toBe(false);
    });
  });

  it("warns when the account has no confirmed email address", async () => {
    start({ newMembers: true, address: null });
    expect(((await box()) as HTMLInputElement).checked).toBe(true);
    expect(
      screen.getByText(
        "Your account has no confirmed email address, so nothing can be sent. Add one in PuffinRide, in Profile under Email.",
      ),
    ).toBeTruthy();
  });

  it("says when a save fails, and shows what is stored", async () => {
    start({ newMembers: false, address: "anna@example.com" }, { saveStatus: 500 });
    fireEvent.click(await box());
    expect((await screen.findByRole("alert")).textContent).toBe("That didn't save. Try again.");
    expect(((await box()) as HTMLInputElement).checked).toBe(false);
  });

  it("says when the choices could not be loaded, and loads them again", async () => {
    window.history.replaceState(null, "", "/admin/emails");
    const api = createFakeApi();
    let fail = true;
    api.on(adminMeRoute, { status: 200, data: anna });
    api.on(adminOwnEmailsRoute, () =>
      fail
        ? { status: 500, error: { code: "error" } }
        : { status: 200, data: { newMembers: false, address: null } },
    );
    render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Your email choices could not be loaded.",
    );
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await box()).toBeTruthy();
  });
});
