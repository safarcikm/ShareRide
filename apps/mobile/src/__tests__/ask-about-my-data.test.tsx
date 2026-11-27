import { fireEvent, screen, within } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import type { Me } from "@shareride/contracts";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { filledButtons } from "@/testing/buttons";
import { failure, ok, type FakeClient } from "@/testing/fake-client";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

// Ask about my data (spec 11, 3.6; plan 4.8 and 4.9, PR 10b): what it is
// about and the text, answered by email within a month.

const withEmail: Me = { ...completeMe, email: "anna@example.test" };

const received = {
  id: "0190a1d6-0000-7000-8000-0000000000a1",
  kind: "question",
  receivedAt: "2026-11-17T10:00:00.000Z",
  dueAt: "2026-12-17T10:00:00.000Z",
};

async function openAsk({
  me = withEmail,
  answer = () => ok(201, received),
}: { readonly me?: Me; readonly answer?: () => unknown } = {}) {
  const app = await renderApp("/settings/privacy/ask", {
    me,
    setUp: (client: FakeClient) => {
      client.answer("/v1/me/privacy-requests", answer, "post");
    },
  });
  expect(await screen.findByRole("header", { name: "Ask about my data" })).toBeVisible();
  return app;
}

const sent = (app: { client: FakeClient }) =>
  app.client.calls.filter((call) => call.path === "/v1/me/privacy-requests");

async function write(text: string) {
  await fireEvent.changeText(screen.getByLabelText("Your message"), text);
}

describe("Ask about my data (spec 11, 3.6)", () => {
  it("is in Privacy", async () => {
    await renderApp("/settings/privacy", { me: withEmail });
    await fireEvent.press(await screen.findByRole("link", { name: "Ask about my data" }));
    expect(await screen.findByRole("header", { name: "Ask about my data" })).toBeVisible();
  });

  it("sends what it is about and the text, then says the answer comes by email", async () => {
    const app = await openAsk();
    expect(screen.getByText("We answer at anna@example.test.")).toBeVisible();

    await fireEvent.press(screen.getByRole("radio", { name: /^Ask a question/ }));
    await write("Why do you keep my old rides?");
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Thank you. We'll answer by email within a month."),
    ).toBeVisible();
    expect(sent(app).map((call) => call.input["body"])).toEqual([
      { kind: "question", text: "Why do you keep my old rides?" },
    ]);
    await fireEvent.press(screen.getByRole("button", { name: "Back to Privacy" }));
    expect(await screen.findByRole("header", { name: "Privacy" })).toBeVisible();
  });

  it("says thanks as the title, at the left and with focus, with the way back as the one main button in the bar (spec 31, 3.19)", async () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    await openAsk();
    await fireEvent.press(screen.getByRole("radio", { name: /^Ask a question/ }));
    await write("Why do you keep my old rides?");
    focus.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    // The outcome is the title; focus takes it, as the button pressed is gone.
    const head = within(await screen.findByTestId("screen-head"));
    const thanks = await head.findByRole("header", {
      name: "Thank you. We'll answer by email within a month.",
    });
    expect(thanks).not.toHaveStyle({ textAlign: "center" });
    expect(screen.queryByRole("header", { name: "Ask about my data" })).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
    expect(head.queryByRole("button", { name: "Back" })).toBeNull();
    // The way back is the one thing left to do: the main button, in the bar.
    const back = within(screen.getByTestId("bottom-bar")).getByRole("button", {
      name: "Back to Privacy",
    });
    expect(back).toHaveStyle({ minHeight: 56 });
    expect(filledButtons()).toBe(1);
    expect(screen.getByTestId("filled-button")).toBe(back);
  });

  it("offers each kind with what it means", async () => {
    await openAsk();
    for (const name of [
      /^Object to a use/,
      /^Limit a use/,
      /^Correct something/,
      /^Ask a question/,
    ]) {
      expect(screen.getByRole("radio", { name })).toBeVisible();
    }
  });

  it("asks what it is about and for a text before sending", async () => {
    const app = await openAsk();

    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Choose what it's about.")).toBeVisible();

    await fireEvent.press(screen.getByRole("radio", { name: /^Correct something/ }));
    await write("   ");
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Write your message, up to 2,000 characters.")).toBeVisible();
    expect(sent(app)).toEqual([]);
  });

  it("asks for an email first when the account has none, since the answer goes by email", async () => {
    await openAsk({ me: { ...completeMe, email: null } });

    expect(screen.getByText("We answer by email, so add your email first.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Add my email" }));
    expect(await screen.findByRole("header", { name: "Your email" })).toBeVisible();
  });

  it("asks for an email when the API finds none, as when it was removed meanwhile", async () => {
    await openAsk({ answer: () => failure(409, "email_required") });

    await fireEvent.press(screen.getByRole("radio", { name: /^Ask a question/ }));
    await write("Why?");
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("We answer by email, so add your email first.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add my email" })).toBeVisible();
  });

  it("says when another can be sent after 5 in a day, and keeps the text", async () => {
    await openAsk({
      answer: () => failure(429, "rate_limited", { retryAfterSeconds: 7200 }),
    });

    await fireEvent.press(screen.getByRole("radio", { name: /^Ask a question/ }));
    await write("Why?");
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("You can send 5 a day. Try again in 2 hours.")).toBeVisible();
    expect(screen.getByLabelText("Your message")).toHaveDisplayValue("Why?");
  });
});
