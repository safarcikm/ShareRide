import {
  adminCorridorsRoute,
  adminCreateCorridorRoute,
  adminMeRoute,
  adminUpdateCorridorRoute,
  type AdminCorridor,
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

const placeId = (number: number) => `0196f000-0000-7000-8000-00000000000${String(number)}`;
const places = [
  { id: placeId(1), name: "Akranes" },
  { id: placeId(2), name: "Hveragerði" },
  { id: placeId(3), name: "Reykjavík" },
  { id: placeId(4), name: "Selfoss" },
];
const named = (id: string) => places.find((place) => place.id === id) ?? { id, name: "" };

const south: AdminCorridor = {
  id: "0196f000-0000-7000-8000-0000000000c1",
  name: "Reykjavík – Selfoss",
  places: [named(placeId(3)), named(placeId(2)), named(placeId(4))],
  active: true,
  updatedAt: "2026-11-18T09:00:00.000Z",
};

function start(path = "/admin/corridors", corridors: AdminCorridor[] = [south]) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  const state = { corridors };
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminCorridorsRoute, () => ({
    status: 200,
    data: { corridors: state.corridors, places },
  }));
  api.on(adminCreateCorridorRoute, (input) => {
    const body = input["body"] as { name: string; placeIds: string[] };
    const made: AdminCorridor = {
      ...south,
      id: "0196f000-0000-7000-8000-0000000000c9",
      name: body.name,
      places: body.placeIds.map(named),
    };
    state.corridors = [...state.corridors, made];
    return { status: 201, data: made };
  });
  api.on(adminUpdateCorridorRoute, (input) => {
    const { id } = input["params"] as { id: string };
    const body = input["body"] as { name?: string; placeIds?: string[]; active?: boolean };
    const was = state.corridors.find((corridor) => corridor.id === id) ?? south;
    const changed: AdminCorridor = {
      ...was,
      name: body.name ?? was.name,
      places: body.placeIds?.map(named) ?? was.places,
      active: body.active ?? was.active,
    };
    state.corridors = state.corridors.map((corridor) => (corridor.id === id ? changed : corridor));
    return { status: 200, data: changed };
  });
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return { api, state };
}

const card = async (name: string) => {
  const heading = await screen.findByRole("heading", { name, level: 3 });
  const item = heading.closest("li");
  if (item === null) throw new Error(`"${name}" is not in a card.`);
  return within(item);
};

describe("the Corridors page", () => {
  it("is in the menu", async () => {
    start("/admin");
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    fireEvent.click(within(menu).getByRole("link", { name: "Corridors" }));
    expect(await screen.findByRole("heading", { name: "Corridors", level: 1 })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/corridors");
  });

  it("shows each corridor with its places in order and whether it is counted", async () => {
    start("/admin/corridors", [
      south,
      { ...south, id: "0196f000-0000-7000-8000-0000000000c2", name: "West", active: false },
    ]);
    const shown = await card("Reykjavík – Selfoss");
    expect(shown.getByText("Reykjavík – Hveragerði – Selfoss")).toBeTruthy();
    expect(shown.getByText("Counted in the weekly figures.")).toBeTruthy();
    expect((await card("West")).getByText("Not counted in the weekly figures.")).toBeTruthy();
  });

  it("says when there are none", async () => {
    start("/admin/corridors", []);
    expect(await screen.findByText("No corridors yet.")).toBeTruthy();
  });

  it("adds a corridor with its places in the order chosen", async () => {
    const { api } = start();
    const form = within(await screen.findByRole("form", { name: "New corridor" }));
    fireEvent.change(form.getByLabelText("Name"), { target: { value: " West " } });
    fireEvent.change(form.getByLabelText("Place 1"), { target: { value: placeId(1) } });
    fireEvent.change(form.getByLabelText("Place 2"), { target: { value: placeId(3) } });
    fireEvent.click(form.getByRole("button", { name: "Move place 2 up" }));
    fireEvent.click(form.getByRole("button", { name: "Add the corridor" }));

    expect((await screen.findByText("West was saved.")).closest('[role="status"]')).not.toBeNull();
    expect(api.called(adminCreateCorridorRoute).at(-1)?.input).toMatchObject({
      body: { name: "West", placeIds: [placeId(3), placeId(1)] },
    });
    expect((await card("West")).getByText("Reykjavík – Akranes")).toBeTruthy();
  });

  it("checks the form before sending: a name, two places, each once", async () => {
    const { api } = start();
    const form = within(await screen.findByRole("form", { name: "New corridor" }));
    fireEvent.click(form.getByRole("button", { name: "Add the corridor" }));
    const name = form.getByLabelText<HTMLInputElement>("Name");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(form.getByText("Give the corridor a name.")).toBeTruthy();
    expect(document.activeElement).toBe(name);

    fireEvent.change(name, { target: { value: "West" } });
    fireEvent.change(form.getByLabelText("Place 1"), { target: { value: placeId(1) } });
    fireEvent.click(form.getByRole("button", { name: "Add the corridor" }));
    expect(form.getByText("Choose at least 2 places.")).toBeTruthy();
    expect(document.activeElement).toBe(form.getByLabelText("Place 1"));

    fireEvent.change(form.getByLabelText("Place 2"), { target: { value: placeId(1) } });
    expect(form.getByText("Choose each place once.")).toBeTruthy();
    fireEvent.click(form.getByRole("button", { name: "Add the corridor" }));
    expect(api.called(adminCreateCorridorRoute)).toHaveLength(0);
  });

  it("adds and removes rows, never below two", async () => {
    start();
    const form = within(await screen.findByRole("form", { name: "New corridor" }));
    expect(form.getByRole<HTMLButtonElement>("button", { name: "Remove place 1" }).disabled).toBe(
      true,
    );
    fireEvent.click(form.getByRole("button", { name: "Add a place" }));
    expect(form.getByLabelText("Place 3")).toBeTruthy();
    fireEvent.click(form.getByRole("button", { name: "Remove place 3" }));
    expect(form.queryByLabelText("Place 3")).toBeNull();
  });

  it("changes a corridor's name and places", async () => {
    const { api } = start();
    const shown = await card("Reykjavík – Selfoss");
    fireEvent.click(shown.getByRole("button", { name: "Change Reykjavík – Selfoss" }));
    const form = within(await screen.findByRole("form", { name: "Change Reykjavík – Selfoss" }));
    expect(form.getByLabelText<HTMLSelectElement>("Place 2").value).toBe(placeId(2));
    fireEvent.change(form.getByLabelText("Name"), { target: { value: "South" } });
    fireEvent.click(form.getByRole("button", { name: "Remove place 2" }));
    fireEvent.click(form.getByRole("button", { name: "Save the changes" }));

    expect(await screen.findByText("South was saved.")).toBeTruthy();
    expect(api.called(adminUpdateCorridorRoute).at(-1)?.input).toMatchObject({
      params: { id: south.id },
      body: { name: "South", placeIds: [placeId(3), placeId(4)] },
    });
    expect((await card("South")).getByText("Reykjavík – Selfoss")).toBeTruthy();
  });

  it("leaves a corridor as it was when changing is cancelled", async () => {
    const { api } = start();
    const shown = await card("Reykjavík – Selfoss");
    fireEvent.click(shown.getByRole("button", { name: "Change Reykjavík – Selfoss" }));
    const form = within(await screen.findByRole("form", { name: "Change Reykjavík – Selfoss" }));
    fireEvent.click(form.getByRole("button", { name: "Cancel" }));
    expect(await card("Reykjavík – Selfoss")).toBeTruthy();
    expect(api.called(adminUpdateCorridorRoute)).toHaveLength(0);
  });

  it("stops counting a corridor and counts it again", async () => {
    const { api } = start();
    const shown = await card("Reykjavík – Selfoss");
    fireEvent.click(shown.getByRole("button", { name: "Stop counting Reykjavík – Selfoss" }));
    await waitFor(async () => {
      expect((await card("Reykjavík – Selfoss")).getByText(/^Not counted/)).toBeTruthy();
    });
    expect(api.called(adminUpdateCorridorRoute).at(-1)?.input).toMatchObject({
      body: { active: false },
    });
    fireEvent.click(
      (await card("Reykjavík – Selfoss")).getByRole("button", {
        name: "Count Reykjavík – Selfoss again",
      }),
    );
    await waitFor(async () => {
      expect((await card("Reykjavík – Selfoss")).getByText(/^Counted/)).toBeTruthy();
    });
  });

  it("names a place that is gone, and says when saving fails", async () => {
    const { api } = start("/admin/corridors", [
      { ...south, places: [named(placeId(3)), { id: placeId(9), name: "" }] },
    ]);
    const shown = await card("Reykjavík – Selfoss");
    expect(shown.getByText("Reykjavík – A place that no longer exists")).toBeTruthy();
    api.on(adminUpdateCorridorRoute, {
      status: 400,
      error: { code: "validation_failed" },
    });
    fireEvent.click(shown.getByRole("button", { name: "Stop counting Reykjavík – Selfoss" }));
    expect(
      (await screen.findByText("The corridor was not saved. Try again.")).closest('[role="alert"]'),
    ).not.toBeNull();
  });

  it("says when the corridors cannot be loaded, and tries again", async () => {
    const { api, state } = start();
    await card("Reykjavík – Selfoss");
    api.on(adminCorridorsRoute, { status: 500, error: { code: "internal" } });
    fireEvent.click(
      (await card("Reykjavík – Selfoss")).getByRole("button", {
        name: "Stop counting Reykjavík – Selfoss",
      }),
    );
    expect(
      (await screen.findByText("The corridors could not be loaded.")).closest('[role="alert"]'),
    ).not.toBeNull();
    api.on(adminCorridorsRoute, () => ({
      status: 200,
      data: { corridors: state.corridors, places },
    }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect((await card("Reykjavík – Selfoss")).getByText(/^Not counted/)).toBeTruthy();
  });
});
