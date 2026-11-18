import {
  adminAnnouncementReachRoute,
  adminAnnouncementsRoute,
  adminCreateAnnouncementRoute,
  adminMeRoute,
  adminSendAnnouncementRoute,
  adminTestAnnouncementRoute,
  adminUpdateAnnouncementRoute,
  type AdminAnnouncement,
  type AdminMe,
  type AnnouncementBody,
  type RouteDefinition,
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

const corridors = [
  { id: "0196f000-0000-7000-8000-0000000000c1", name: "Reykjavík – Keflavík airport" },
  { id: "0196f000-0000-7000-8000-0000000000c2", name: "Reykjavík – Selfoss" },
];

const draft: AdminAnnouncement = {
  id: "0196f000-0000-7000-8000-0000000000a1",
  audience: "everyone",
  corridor: null,
  titleIs: "Ný útgáfa",
  titleEn: "A new version",
  messageIs: "Við bættum kortið.",
  messageEn: "We improved the map.",
  createdAt: "2026-11-18T09:00:00.000Z",
  testSentAt: null,
  sentAt: null,
  reach: null,
  delivered: null,
};

const sent: AdminAnnouncement = {
  ...draft,
  id: "0196f000-0000-7000-8000-0000000000a2",
  audience: "corridor",
  corridor: corridors[0] ?? null,
  titleIs: "Nýir fundarstaðir",
  titleEn: "New meeting points",
  sentAt: "2026-11-17T14:30:00.000Z",
  reach: 1240,
  delivered: { push: 900, email: 1100 },
};

function start(path = "/admin/announcements", announcements: AdminAnnouncement[] = [draft, sent]) {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  const state = { announcements };
  const one = (id: string) => state.announcements.find((item) => item.id === id) ?? draft;
  const replace = (changed: AdminAnnouncement) => {
    state.announcements = state.announcements.map((item) =>
      item.id === changed.id ? changed : item,
    );
    return changed;
  };
  const stored = (body: AnnouncementBody) => ({
    audience: body.audience,
    corridor: corridors.find((corridor) => corridor.id === body.corridorId) ?? null,
    titleIs: body.titleIs,
    titleEn: body.titleEn,
    messageIs: body.messageIs,
    messageEn: body.messageEn,
  });
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminAnnouncementsRoute, () => ({
    status: 200,
    data: { announcements: state.announcements, corridors },
  }));
  api.on(adminAnnouncementReachRoute, (input) => {
    const { id } = input["params"] as { id: string };
    return one(id).audience === "drivers"
      ? { status: 200, data: { people: 40, push: 30, email: 35 } }
      : { status: 200, data: { people: 1250, push: 900, email: 1100 } };
  });
  api.on(adminCreateAnnouncementRoute, (input) => {
    const made: AdminAnnouncement = {
      ...draft,
      id: "0196f000-0000-7000-8000-0000000000a9",
      ...stored(input["body"] as AnnouncementBody),
    };
    state.announcements = [made, ...state.announcements];
    return { status: 201, data: made };
  });
  api.on(adminUpdateAnnouncementRoute, (input) => {
    const { id } = input["params"] as { id: string };
    return {
      status: 200,
      data: replace({ ...one(id), ...stored(input["body"] as AnnouncementBody) }),
    };
  });
  api.on(adminTestAnnouncementRoute, (input) => {
    const { id } = input["params"] as { id: string };
    return { status: 200, data: replace({ ...one(id), testSentAt: "2026-11-18T10:15:00.000Z" }) };
  });
  api.on(adminSendAnnouncementRoute, (input) => {
    const { id } = input["params"] as { id: string };
    return {
      status: 200,
      data: replace({
        ...one(id),
        sentAt: "2026-11-18T10:20:00.000Z",
        reach: 1250,
        delivered: { push: 0, email: 0 },
      }),
    };
  });
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return { api, state };
}

const card = async (title: string) => {
  const heading = await screen.findByRole("heading", { name: title, level: 3 });
  const item = heading.closest("li");
  if (item === null) throw new Error(`"${title}" is not in a card.`);
  return within(item);
};

const bodies = (api: ReturnType<typeof createFakeApi>, route: RouteDefinition) =>
  api.called(route).map((call) => call.input["body"]);

describe("the Announcements page", () => {
  it("is in the menu", async () => {
    start("/admin");
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    fireEvent.click(within(menu).getByRole("link", { name: "Announcements" }));
    expect(await screen.findByRole("heading", { name: "Announcements", level: 1 })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/announcements");
  });

  it("shows a draft in both languages with who it would reach", async () => {
    start();
    const item = await card("A new version");
    expect(item.getByText("Everyone")).toBeTruthy();
    expect(item.getByText("Ný útgáfa").closest("[lang]")?.getAttribute("lang")).toBe("is");
    expect(item.getByText("We improved the map.").closest("[lang]")?.getAttribute("lang")).toBe(
      "en",
    );
    expect(
      await item.findByText(
        "It would reach 1,250 people now: 900 by notification and 1,100 by email.",
      ),
    ).toBeTruthy();
  });

  it("lists what was sent with its audience, time and delivery counts", async () => {
    start();
    const item = await card("New meeting points");
    expect(
      item.getByText(/Sent on 17 November 2026 at 14:30\. People with a trip or a booking on/),
    ).toBeTruthy();
    expect(item.getByText(/Reykjavík – Keflavík airport/)).toBeTruthy();
    expect(
      item.getByText(
        "Went to 1,240 people. Delivered so far: 900 by notification and 1,100 by email.",
      ),
    ).toBeTruthy();
    // What was sent can be neither changed nor sent again.
    expect(item.queryByRole("button")).toBeNull();
  });

  it("says when the delivery log is gone", async () => {
    start(undefined, [{ ...sent, delivered: null }]);
    const item = await card("New meeting points");
    expect(
      item.getByText("Went to 1,240 people. The delivery log is kept for 90 days."),
    ).toBeTruthy();
    expect(screen.getByText("No drafts.")).toBeTruthy();
  });

  it("needs every text in both languages before it saves a draft", async () => {
    const { api } = start(undefined, []);
    const form = within(await screen.findByRole("form", { name: "New announcement" }));
    fireEvent.change(form.getByLabelText("Title in Icelandic"), { target: { value: "Ný útgáfa" } });
    fireEvent.change(form.getByLabelText("Message in Icelandic"), {
      target: { value: "Við bættum kortið." },
    });
    fireEvent.click(form.getByRole("button", { name: "Save the draft" }));
    // The first field that is wrong takes the focus and says why.
    const english = form.getByLabelText("Title in English");
    expect(document.activeElement).toBe(english);
    expect(english.getAttribute("aria-invalid")).toBe("true");
    expect(form.getAllByText("Write this in both languages.")).toHaveLength(2);
    expect(bodies(api, adminCreateAnnouncementRoute)).toHaveLength(0);

    fireEvent.change(english, { target: { value: " A new version " } });
    fireEvent.change(form.getByLabelText("Message in English"), {
      target: { value: "a".repeat(1001) },
    });
    fireEvent.click(form.getByRole("button", { name: "Save the draft" }));
    expect(form.getByText("Use at most 1,000 characters.")).toBeTruthy();
    fireEvent.change(form.getByLabelText("Message in English"), {
      target: { value: "We improved the map." },
    });
    fireEvent.click(form.getByRole("button", { name: "Save the draft" }));
    expect(
      await screen.findByText("“A new version” was saved as a draft. Nothing was sent."),
    ).toBeTruthy();
    expect(bodies(api, adminCreateAnnouncementRoute).at(-1)).toEqual({
      audience: "everyone",
      corridorId: null,
      titleIs: "Ný útgáfa",
      titleEn: "A new version",
      messageIs: "Við bættum kortið.",
      messageEn: "We improved the map.",
    });
    expect(await card("A new version")).toBeTruthy();
  });

  it("asks for the corridor when the announcement is for one", async () => {
    const { api } = start(undefined, []);
    const form = within(await screen.findByRole("form", { name: "New announcement" }));
    expect(form.queryByLabelText("Corridor")).toBeNull();
    fireEvent.change(form.getByLabelText("Who it is for"), { target: { value: "corridor" } });
    for (const [label, value] of [
      ["Title in Icelandic", "Lokun"],
      ["Message in Icelandic", "Vegurinn er lokaður."],
      ["Title in English", "Road closed"],
      ["Message in English", "The road is closed."],
    ] as const) {
      fireEvent.change(form.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(form.getByRole("button", { name: "Save the draft" }));
    const corridor = form.getByLabelText("Corridor");
    expect(document.activeElement).toBe(corridor);
    expect(form.getByText("Choose the corridor.")).toBeTruthy();
    fireEvent.change(corridor, { target: { value: corridors[1]?.id } });
    fireEvent.click(form.getByRole("button", { name: "Save the draft" }));
    await waitFor(() => {
      expect(bodies(api, adminCreateAnnouncementRoute).at(-1)).toMatchObject({
        audience: "corridor",
        corridorId: corridors[1]?.id,
      });
    });
  });

  it("changes a draft, and counts its reach again", async () => {
    const { api } = start();
    const item = await card("A new version");
    fireEvent.click(item.getByRole("button", { name: "Change “A new version”" }));
    const form = within(await screen.findByRole("form", { name: "Change “A new version”" }));
    expect(form.getByLabelText<HTMLInputElement>("Title in English").value).toBe("A new version");
    fireEvent.change(form.getByLabelText("Who it is for"), { target: { value: "drivers" } });
    fireEvent.click(form.getByRole("button", { name: "Save the changes" }));
    const changed = await card("A new version");
    expect(await changed.findByText("Drivers: everyone who has posted a trip")).toBeTruthy();
    expect(
      await changed.findByText("It would reach 40 people now: 30 by notification and 35 by email."),
    ).toBeTruthy();
    expect(bodies(api, adminUpdateAnnouncementRoute).at(-1)).toMatchObject({
      audience: "drivers",
    });
  });

  it("sends a draft to the operator first", async () => {
    const { api } = start();
    const item = await card("A new version");
    fireEvent.click(item.getByRole("button", { name: "Send “A new version” to me" }));
    expect(
      await screen.findByText("“A new version” is on its way to you, in both languages."),
    ).toBeTruthy();
    expect(
      await (
        await card("A new version")
      ).findByText("Last sent to you on 18 November 2026 at 10:15."),
    ).toBeTruthy();
    expect(api.called(adminTestAnnouncementRoute)).toHaveLength(1);
    // Still a draft.
    expect(api.called(adminSendAnnouncementRoute)).toHaveLength(0);
  });

  it("sends only after a second button, and then lists it as sent", async () => {
    const { api } = start();
    const item = await card("A new version");
    fireEvent.click(item.getByRole("button", { name: "Send “A new version”" }));
    expect(
      item.getByText("It goes out at once and cannot be taken back or changed afterwards."),
    ).toBeTruthy();
    const confirm = item.getByRole("button", { name: "Send “A new version” now" });
    expect(document.activeElement).toBe(confirm);
    const sends = () => api.called(adminSendAnnouncementRoute);
    expect(sends()).toHaveLength(0);
    // Cancel goes back without sending.
    fireEvent.click(item.getByRole("button", { name: "Cancel" }));
    expect(sends()).toHaveLength(0);

    fireEvent.click(item.getByRole("button", { name: "Send “A new version”" }));
    fireEvent.click(item.getByRole("button", { name: "Send “A new version” now" }));
    expect(await screen.findByText("“A new version” was sent.")).toBeTruthy();
    expect(sends()).toHaveLength(1);
    const listed = await card("A new version");
    expect(await listed.findByText(/Sent on 18 November 2026 at 10:20\./)).toBeTruthy();
    expect(listed.queryByRole("button")).toBeNull();
  });

  it("says so when sending fails, and keeps the draft", async () => {
    const { api } = start();
    api.on(adminSendAnnouncementRoute, {
      status: 500,
      error: { code: "internal_error" },
    });
    const item = await card("A new version");
    fireEvent.click(item.getByRole("button", { name: "Send “A new version”" }));
    fireEvent.click(item.getByRole("button", { name: "Send “A new version” now" }));
    expect(await item.findByText("The announcement was not sent. Try again.")).toBeTruthy();
    expect(item.getByRole("button", { name: "Send “A new version” now" })).toBeTruthy();
  });

  it("offers to try again when the list cannot be loaded", async () => {
    const { api } = start();
    api.on(adminAnnouncementsRoute, {
      status: 500,
      error: { code: "internal_error" },
    });
    expect(await screen.findByText("The announcements could not be loaded.")).toBeTruthy();
    api.on(adminAnnouncementsRoute, { status: 200, data: { announcements: [draft], corridors } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await card("A new version")).toBeTruthy();
  });
});
