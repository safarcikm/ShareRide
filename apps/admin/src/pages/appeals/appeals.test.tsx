import {
  adminAnswerAppealRoute,
  adminAppealsRoute,
  adminMeRoute,
  type AdminMe,
  type AdminModerationAction,
} from "@shareride/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleApp } from "../../app.tsx";
import { createFakeApi, createFakePasskeys } from "../../testing/fake-api.ts";

// Made up: Dóra's message was hidden, and she appealed.

const anna: AdminMe = {
  userId: "0196f000-0000-7000-8000-000000000001",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2099-11-16T23:00:00.000Z",
};

const reportId = "0196f000-0000-7000-8000-0000000000d1";

const appealed: AdminModerationAction = {
  id: "0196f000-0000-7000-8000-0000000000f1",
  kind: "content_hidden",
  person: {
    userId: "0196f000-0000-7000-8000-0000000000c1",
    firstName: "Dóra",
    status: "active",
    suspendedUntil: null,
    locale: "is",
  },
  reportId,
  rule: "offensive",
  reason: "Rude words about another member.",
  content: { kind: "message", id: "0196f000-0000-7000-8000-0000000000e1" },
  until: null,
  at: "2099-11-15T11:00:00.000Z",
  appeal: {
    text: "It was a joke between friends.",
    sentAt: "2099-11-15T12:00:00.000Z",
    answer: null,
    outcome: null,
    answeredAt: null,
  },
};

function start(path = "/admin/appeals") {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminAppealsRoute, { status: 200, data: { appeals: [appealed] } });
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return api;
}

describe("appeals (spec 9, 3.4.4)", () => {
  it("lists those waiting, with the action, its report and the appeal", async () => {
    const api = start();
    const list = await screen.findByRole("list", { name: "Waiting for an answer" });
    const card = within(list).getByRole("group", { name: "Content hidden: Dóra" });
    expect(card.textContent).toContain("Reason: Rude words about another member.");
    expect(card.textContent).toContain("Concerns: a message you sent");
    expect(card.textContent).toContain("It was a joke between friends.");
    expect(within(card).getByRole("link", { name: "Open the report" }).getAttribute("href")).toBe(
      `/admin/reports/${reportId}`,
    );
    expect(api.called(adminAppealsRoute)[0]?.input["query"]).toEqual({ state: "open" });
  });

  it("asks for a decision and an answer, then sends it once confirmed", async () => {
    const api = start();
    api.on(adminAnswerAppealRoute, {
      status: 200,
      data: {
        ...appealed,
        appeal: {
          ...appealed.appeal,
          answer: "We looked again: it shows again.",
          outcome: "reversed",
          answeredAt: "2099-11-15T13:00:00.000Z",
        },
      },
    });
    const card = await screen.findByRole("group", { name: "Content hidden: Dóra" });
    fireEvent.click(within(card).getByRole("button", { name: "Send the answer" }));
    expect(within(card).getByRole("alert").textContent).toBe("Choose your decision.");
    fireEvent.click(within(card).getByRole("radio", { name: "Change the decision" }));
    expect(card.textContent).toContain("It shows again, if it is still the one hidden.");
    fireEvent.click(within(card).getByRole("button", { name: "Send the answer" }));
    expect(card.textContent).toContain("Write the answer.");
    fireEvent.change(within(card).getByRole("textbox", { name: "Answer, written for Dóra" }), {
      target: { value: "We looked again: it shows again." },
    });
    fireEvent.click(within(card).getByRole("button", { name: "Send the answer" }));
    expect(card.textContent).toContain("Send it as “Change the decision”? It is final.");
    expect(api.called(adminAnswerAppealRoute)).toEqual([]);
    fireEvent.click(within(card).getByRole("button", { name: "Yes, send it" }));
    expect((await within(card).findByRole("status")).textContent).toBe(
      "Answered. Dóra reads it under Notices.",
    );
    expect(api.called(adminAnswerAppealRoute)[0]?.input).toEqual({
      params: { id: appealed.id },
      body: { outcome: "reversed", answer: "We looked again: it shows again." },
    });
    expect(card.textContent).toContain("the decision changed");
  });

  it("says when someone answered it meanwhile", async () => {
    const api = start();
    api.on(adminAnswerAppealRoute, { status: 409, error: { code: "already_answered" } });
    const card = await screen.findByRole("group", { name: "Content hidden: Dóra" });
    fireEvent.click(within(card).getByRole("radio", { name: "The decision stands" }));
    fireEvent.change(within(card).getByRole("textbox", { name: "Answer, written for Dóra" }), {
      target: { value: "It stands." },
    });
    fireEvent.click(within(card).getByRole("button", { name: "Send the answer" }));
    fireEvent.click(within(card).getByRole("button", { name: "Yes, send it" }));
    expect((await within(card).findByRole("alert")).textContent).toBe(
      "Someone answered this appeal meanwhile.",
    );
  });

  it("says when none wait", async () => {
    const api = start();
    api.on(adminAppealsRoute, { status: 200, data: { appeals: [] } });
    expect(await screen.findByText("No appeal is waiting.")).toBeTruthy();
  });
});
