import {
  adminAddPasskeyOptionsRoute,
  adminAddPasskeyRoute,
  adminConfirmOptionsRoute,
  adminConfirmRoute,
  adminMeRoute,
  adminPasskeysRoute,
  adminRemovePasskeyRoute,
  adminSetupOptionsRoute,
  adminSetupRoute,
  adminSignInOptionsRoute,
  adminSignInRoute,
  adminSignOutRoute,
  type AdminMe,
  type Passkey,
} from "@shareride/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleApp } from "./app.tsx";
import { createFakeApi, createFakePasskeys } from "./testing/fake-api.ts";

const anna: AdminMe = {
  userId: "0196f000-0000-7000-8000-000000000001",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2026-11-16T23:00:00.000Z",
};

const passkey = (id: string, name: string): Passkey => ({
  id,
  name,
  backedUp: id === "1",
  createdAt: "2026-11-10T12:00:00.000Z",
  lastUsedAt: id === "1" ? "2026-11-16T12:00:00.000Z" : null,
});

function start(path: string) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  const browser = createFakePasskeys();
  api.on(adminMeRoute, { status: 401, error: { code: "operator_unauthenticated" } });
  api.on(adminSignInOptionsRoute, { status: 200, data: { options: { challenge: "sign-in" } } });
  api.on(adminSignInRoute, { status: 200, data: anna });
  api.on(adminSignOutRoute, { status: 204 });
  api.on(adminPasskeysRoute, {
    status: 200,
    data: { passkeys: [passkey("1", "Laptop"), passkey("2", "Phone")] },
  });
  const show = () => render(<ConsoleApp client={api.client} passkeys={browser.passkeys} />);
  return { api, browser, show };
}

describe("signing in", () => {
  it("sends a signed-out operator to sign in, then on to the page asked for", async () => {
    const { api, browser, show } = start("/admin/passkeys");
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with a passkey" }));
    expect(await screen.findByRole("heading", { name: "Passkeys" })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/passkeys");
    expect(browser.state.prompts).toEqual(["get sign-in"]);
    expect(api.called(adminSignInRoute)[0]?.input).toMatchObject({
      body: { credential: { id: "saved-key" } },
    });
  });

  it("opens the home page after signing in on the sign-in page itself", async () => {
    const { show } = start("/admin/sign-in");
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with a passkey" }));
    expect(await screen.findByRole("heading", { name: "Welcome, Anna" })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin");
  });

  it("says when the passkey did not work, or the browser stopped it", async () => {
    const { api, browser, show } = start("/admin");
    api.on(adminSignInRoute, { status: 401, error: { code: "passkey_invalid" } });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with a passkey" }));
    expect((await screen.findByRole("alert")).textContent).toContain("That passkey did not work");
    browser.state.failWith = Object.assign(new Error("stopped"), { name: "NotAllowedError" });
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    expect((await screen.findByRole("alert")).textContent).toContain("cancelled or timed out");
  });

  it("says when the browser has no passkeys", async () => {
    const { browser, show } = start("/admin");
    browser.state.supported = false;
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with a passkey" }));
    expect((await screen.findByRole("alert")).textContent).toContain("cannot use passkeys");
  });

  it("opens the page asked for when already signed in", async () => {
    const { api, show } = start("/admin/passkeys");
    api.on(adminMeRoute, { status: 200, data: anna });
    show();
    expect(await screen.findByRole("heading", { name: "Passkeys" })).toBeTruthy();
  });

  it("shows sign-in again when the session ends, and after signing out", async () => {
    const { api, show } = start("/admin/passkeys");
    api.on(adminMeRoute, { status: 200, data: anna });
    api.on(adminPasskeysRoute, { status: 401, error: { code: "operator_unauthenticated" } });
    show();
    expect(await screen.findByText("Your session ended. Sign in again.")).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/sign-in");

    api.on(adminPasskeysRoute, { status: 200, data: { passkeys: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    expect(await screen.findByRole("heading", { name: "Passkeys" })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/passkeys");
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("You signed out.")).toBeTruthy();
    expect(api.called(adminSignOutRoute)).toHaveLength(1);
  });

  it("stays signed in and says so when signing out fails", async () => {
    const { api, show } = start("/admin");
    api.on(adminMeRoute, { status: 200, data: anna });
    api.on(adminSignOutRoute, { status: 500, error: { code: "internal" } });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
    expect(screen.getByRole("heading", { name: "Welcome, Anna" })).toBeTruthy();

    api.on(adminSignOutRoute, { status: 401, error: { code: "operator_unauthenticated" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("You signed out.")).toBeTruthy();
  });
});

describe("saving the first passkey", () => {
  it("takes the token from the link, removes it from the address and signs in", async () => {
    const { api, browser, show } = start("/admin/setup#sr_ol_token");
    api.on(adminSetupOptionsRoute, { status: 200, data: { options: { challenge: "setup" } } });
    api.on(adminSetupRoute, { status: 200, data: anna });
    show();
    expect(window.location.hash).toBe("");
    fireEvent.click(await screen.findByRole("button", { name: "Save the passkey" }));
    expect(screen.getByText("Give the passkey a name.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Name of this passkey"));
    fireEvent.change(screen.getByLabelText("Name of this passkey"), {
      target: { value: " Laptop " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save the passkey" }));
    expect(await screen.findByRole("heading", { name: "Welcome, Anna" })).toBeTruthy();
    expect(browser.state.prompts).toEqual(["create setup"]);
    expect(api.called(adminSetupRoute)[0]?.input).toMatchObject({
      body: { token: "sr_ol_token", name: "Laptop" },
    });
  });

  it("says when the link was used or expired", async () => {
    const { api, show } = start("/admin/setup#sr_ol_used");
    api.on(adminSetupOptionsRoute, { status: 400, error: { code: "setup_link_invalid" } });
    show();
    fireEvent.change(await screen.findByLabelText("Name of this passkey"), {
      target: { value: "Laptop" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save the passkey" }));
    expect((await screen.findByRole("alert")).textContent).toContain("expired or was used");
  });

  it("asks for the link when the page is opened without one", async () => {
    const { show } = start("/admin/setup");
    show();
    expect((await screen.findByRole("alert")).textContent).toContain("needs the setup link");
  });
});

describe("the frame", () => {
  it("lists the sections and moves between them", async () => {
    const { api, show } = start("/admin");
    api.on(adminMeRoute, { status: 200, data: anna });
    show();
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    expect(within(menu).getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe(
      "page",
    );
    fireEvent.click(within(menu).getByRole("link", { name: "Passkeys" }));
    expect(await screen.findByRole("heading", { name: "Passkeys" })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/passkeys");
    // The new page takes the focus, so a screen reader reads it from the top.
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("follows the operator's language and switches it", async () => {
    const { api, show } = start("/admin");
    api.on(adminMeRoute, { status: 200, data: { ...anna, locale: "is" } });
    show();
    expect(await screen.findByRole("heading", { name: "Velkomin(n), Anna" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("is");
    fireEvent.click(screen.getByRole("button", { name: "Skipta yfir í ensku" }));
    expect(await screen.findByRole("heading", { name: "Welcome, Anna" })).toBeTruthy();
  });
});

describe("the passkeys page", () => {
  function signedIn() {
    const setup = start("/admin/passkeys");
    setup.api.on(adminMeRoute, { status: 200, data: anna });
    return setup;
  }

  it("lists the passkeys with when they were added and used", async () => {
    signedIn().show();
    const laptop = (await screen.findByText("Laptop")).closest("li");
    expect(laptop?.textContent).toContain("Synced");
    expect(laptop?.textContent).toContain("Last used");
    expect((await screen.findByText("Phone")).closest("li")?.textContent).toContain("Not used yet");
  });

  it("confirms with a passkey first when asked, then adds the new one", async () => {
    const { api, browser, show } = signedIn();
    let confirmed = false;
    api.on(adminAddPasskeyOptionsRoute, () =>
      confirmed
        ? { status: 200, data: { options: { challenge: "add" } } }
        : { status: 403, error: { code: "confirmation_required" } },
    );
    api.on(adminConfirmOptionsRoute, { status: 200, data: { options: { challenge: "confirm" } } });
    api.on(adminConfirmRoute, () => {
      confirmed = true;
      return { status: 200, data: { confirmedUntil: "2026-11-16T22:05:00.000Z" } };
    });
    api.on(adminAddPasskeyRoute, { status: 201, data: passkey("3", "Tablet") });
    show();
    fireEvent.change(await screen.findByLabelText("Name of this passkey"), {
      target: { value: "Tablet" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add the passkey" }));
    expect((await screen.findByRole("status")).textContent).toBe("Tablet was added.");
    expect(browser.state.prompts).toEqual(["get confirm", "create add"]);
  });

  it("says so when confirming with a passkey cannot start", async () => {
    const { api, browser, show } = signedIn();
    api.on(adminAddPasskeyOptionsRoute, { status: 403, error: { code: "confirmation_required" } });
    api.on(adminConfirmOptionsRoute, { status: 500, error: { code: "internal" } });
    show();
    fireEvent.change(await screen.findByLabelText("Name of this passkey"), {
      target: { value: "Tablet" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add the passkey" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
    expect(browser.state.prompts).toEqual([]);
  });

  it("asks for a name in the field itself", async () => {
    signedIn().show();
    const field = await screen.findByLabelText("Name of this passkey");
    fireEvent.click(screen.getByRole("button", { name: "Add the passkey" }));
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-invalid")).toBe("true");
  });

  it("offers no Remove for the only passkey, and says why", async () => {
    const { api, show } = signedIn();
    api.on(adminPasskeysRoute, { status: 200, data: { passkeys: [passkey("1", "Laptop")] } });
    show();
    expect(await screen.findByText("Laptop")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Laptop" })).toBeNull();
    expect(screen.getByText("Add another passkey before you remove this one.")).toBeTruthy();
  });

  it("asks before removing a passkey, and keeps the last one", async () => {
    const { api, show } = signedIn();
    api.on(adminRemovePasskeyRoute, { status: 409, error: { code: "last_passkey" } });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Phone" }));
    expect(screen.getByText("Remove Phone? You can no longer sign in with it.")).toBeTruthy();
    // The question's own button takes the focus, and Keep it gives it back.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove Phone" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove Phone" }));
    expect(api.called(adminRemovePasskeyRoute)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Remove Phone" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Phone" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Add another passkey before you remove this one.",
    );
    expect(api.called(adminRemovePasskeyRoute)[0]?.input).toMatchObject({ params: { id: "2" } });
  });
});
