import {
  adminFeedbackListRoute,
  adminFeedbackReplyRoute,
  adminFeedbackStatusRoute,
  adminMeRoute,
  type AdminFeedback,
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

const gunna = "0196f000-0000-7000-8000-0000000000a1";

const feedbackOf = (more: Partial<AdminFeedback> = {}): AdminFeedback => ({
  id: "0196f000-0000-7000-8000-0000000000f1",
  userId: gunna,
  firstName: "Gunna",
  kind: "problem",
  message: "The map does not move.\nI tried twice.",
  appVersion: "1.4.0",
  platform: "ios",
  osVersion: "19.1",
  screen: "/trips/[id]",
  language: "is",
  hasScreenshot: true,
  status: "new",
  reply: null,
  repliedAt: null,
  createdAt: "2026-11-18T09:30:00.000Z",
  ...more,
});

function start(path = "/admin/feedback") {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  const state = {
    feedback: [
      feedbackOf(),
      feedbackOf({
        id: "0196f000-0000-7000-8000-0000000000f2",
        firstName: null,
        kind: "idea",
        message: "Show the weather.",
        platform: "web",
        osVersion: "",
        language: "en",
        hasScreenshot: false,
        status: "done",
        reply: "Good idea, thanks.",
        repliedAt: "2026-11-18T10:15:00.000Z",
      }),
    ],
  };
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminFeedbackListRoute, (input) => {
    const query = (input["query"] ?? {}) as { status?: string; kind?: string };
    return {
      status: 200,
      data: {
        feedback: state.feedback.filter(
          (item) =>
            (query.status === undefined || item.status === query.status) &&
            (query.kind === undefined || item.kind === query.kind),
        ),
        newCount: state.feedback.filter((item) => item.status === "new").length,
      },
    };
  });
  const change = (id: string, changes: Partial<AdminFeedback>) => {
    state.feedback = state.feedback.map((item) =>
      item.id === id ? { ...item, ...changes } : item,
    );
    return { status: 200, data: state.feedback.find((item) => item.id === id) };
  };
  api.on(adminFeedbackStatusRoute, (input) =>
    change((input["params"] as { id: string }).id, input["body"] as { status: "read" }),
  );
  api.on(adminFeedbackReplyRoute, (input) =>
    change((input["params"] as { id: string }).id, {
      ...(input["body"] as { reply: string }),
      repliedAt: "2026-11-18T11:00:00.000Z",
      status: "read",
    }),
  );
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return { api, state };
}

const card = async (name: string) => {
  const heading = await screen.findByRole("heading", { name, level: 2 });
  const item = heading.closest("li");
  if (item === null) throw new Error(`"${name}" is not in a card.`);
  return within(item);
};

const problem = "Something isn't working, from Gunna";
const idea = "An idea, from a tester with no name yet";

describe("the Feedback page", () => {
  it("is in the menu", async () => {
    start("/admin");
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    fireEvent.click(within(menu).getByRole("link", { name: "Feedback" }));
    expect(await screen.findByRole("heading", { name: "Feedback", level: 1 })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/feedback");
  });

  it("shows each feedback with its details, and how many are new", async () => {
    start();
    expect((await screen.findByText("1 new feedback.")).getAttribute("role")).toBe("status");
    const first = await card(problem);
    expect(first.getByText("18 November 2026 at 09:30")).toBeTruthy();
    expect(first.getByText(/The map does not move\./)).toBeTruthy();
    expect(first.getByText("Version 1.4.0, iOS 19.1")).toBeTruthy();
    expect(first.getByText("/trips/[id]")).toBeTruthy();
    expect(first.getByText("Icelandic")).toBeTruthy();
    expect(first.getByRole("link", { name: "Account page: Gunna" }).getAttribute("href")).toBe(
      `/admin/users/${gunna}`,
    );
    expect(first.getByLabelText<HTMLSelectElement>("Status").value).toBe("new");

    const second = await card(idea);
    expect(second.getByText("Version 1.4.0, Web")).toBeTruthy();
    expect(second.getByText("No screenshot.")).toBeTruthy();
    expect(second.getByText("Our reply, 18 November 2026 at 10:15")).toBeTruthy();
    expect(second.getByText("Good idea, thanks.")).toBeTruthy();
    // One reply only: no form once there is one.
    expect(second.queryByLabelText("Reply")).toBeNull();
  });

  it("loads a screenshot only when asked for it", async () => {
    start();
    const first = await card(problem);
    expect(first.queryByRole("img")).toBeNull();
    fireEvent.click(first.getByRole("button", { name: "Show the screenshot from Gunna" }));
    const picture = first.getByRole("img", { name: "Screenshot of the app, sent by Gunna" });
    expect(picture.getAttribute("src")).toBe(
      "/admin/v1/feedback/0196f000-0000-7000-8000-0000000000f1/screenshot",
    );
    fireEvent.error(picture);
    expect(first.getByRole("alert").textContent).toBe("The screenshot could not be loaded.");
  });

  it("filters by status and kind", async () => {
    const { api } = start();
    await card(problem);
    const filters = screen.getAllByLabelText("Status")[0];
    if (filters === undefined) throw new Error("No filter.");
    fireEvent.change(filters, { target: { value: "done" } });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: problem })).toBeNull();
    });
    expect(await card(idea)).toBeTruthy();
    expect(api.called(adminFeedbackListRoute).at(-1)?.input).toMatchObject({
      query: { status: "done" },
    });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "problem" } });
    expect(await screen.findByText("No feedback here.")).toBeTruthy();
    fireEvent.change(filters, { target: { value: "" } });
    expect(await card(problem)).toBeTruthy();
    expect(api.called(adminFeedbackListRoute).at(-1)?.input).toMatchObject({
      query: { kind: "problem" },
    });
  });

  it("sets a status at once", async () => {
    const { api } = start();
    const first = await card(problem);
    fireEvent.change(first.getByLabelText("Status"), { target: { value: "planned" } });
    await waitFor(async () => {
      expect((await card(problem)).getByLabelText<HTMLSelectElement>("Status").value).toBe(
        "planned",
      );
    });
    expect(api.called(adminFeedbackStatusRoute).at(-1)?.input).toMatchObject({
      params: { id: "0196f000-0000-7000-8000-0000000000f1" },
      body: { status: "planned" },
    });
    expect(await screen.findByText("No new feedback.")).toBeTruthy();
  });

  it("checks a reply before sending it, then shows it in place of the form", async () => {
    const { api } = start();
    const first = await card(problem);
    const field = first.getByLabelText("Reply");
    expect(field.getAttribute("lang")).toBe("is");
    fireEvent.click(first.getByRole("button", { name: "Send reply" }));
    expect(first.getByText("Write a reply.")).toBeTruthy();
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(field, { target: { value: "a".repeat(1001) } });
    fireEvent.click(first.getByRole("button", { name: "Send reply" }));
    expect(first.getByText("Write at most 1,000 characters.")).toBeTruthy();
    expect(api.called(adminFeedbackReplyRoute)).toHaveLength(0);

    fireEvent.change(field, { target: { value: " Takk, lagað í næstu útgáfu. " } });
    fireEvent.click(first.getByRole("button", { name: "Send reply" }));
    await waitFor(async () => {
      expect((await card(problem)).getByText("Takk, lagað í næstu útgáfu.")).toBeTruthy();
    });
    expect(api.called(adminFeedbackReplyRoute).at(-1)?.input).toMatchObject({
      body: { reply: "Takk, lagað í næstu útgáfu." },
    });
    const after = await card(problem);
    expect(after.getByText("Our reply, 18 November 2026 at 11:00")).toBeTruthy();
    expect(after.queryByLabelText("Reply")).toBeNull();
  });

  it("says when a reply could not be sent, and keeps what was written", async () => {
    const { api } = start();
    api.on(adminFeedbackReplyRoute, {
      status: 409,
      error: { code: "already_replied" },
    });
    const first = await card(problem);
    const field = first.getByLabelText<HTMLTextAreaElement>("Reply");
    fireEvent.change(field, { target: { value: "Thanks" } });
    fireEvent.click(first.getByRole("button", { name: "Send reply" }));
    expect((await first.findByRole("alert")).textContent).toBe(
      "The reply could not be sent. Try again.",
    );
    expect(field.value).toBe("Thanks");
  });
});
