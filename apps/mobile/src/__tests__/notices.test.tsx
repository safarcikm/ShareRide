import { fireEvent, screen } from "expo-router/testing-library";
import type { Notice } from "@shareride/contracts";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { callsTo } from "@/testing/chat";
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
// Saturday 14 November 2026, noon in Iceland.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

afterEach(() => {
  jest.restoreAllMocks();
});

const reason = "Repeated messages after being asked to stop.";

const suspension = (changes: Partial<Notice> = {}): Notice => ({
  id: "0190a1d6-0000-7000-8000-0000000000e1",
  kind: "suspension",
  rule: "harassment",
  reason,
  content: null,
  until: "2026-12-13T12:00:00.000Z",
  at: "2026-11-13T12:00:00.000Z",
  appealUntil: "2026-11-27T12:00:00.000Z",
  canAppeal: true,
  appeal: null,
  ...changes,
});

const appealsSent = (client: FakeClient) =>
  callsTo(client, "/v1/me/notices/{id}/appeal", () => true).map(
    (call) => (call.input as { body: unknown }).body,
  );

async function openNotices(notices: () => unknown, setUp?: (client: FakeClient) => void) {
  const app = await renderApp("/profile", {
    me: completeMe,
    setUp: (client) => {
      client.answer("/v1/me/notices", notices, "get");
      setUp?.(client);
    },
  });
  await fireEvent.press(await screen.findByRole("link", { name: "Notices" }));
  return app;
}

describe("Notices from PuffinRide (spec 9, 3.4.4; R9.5)", () => {
  it("says what PuffinRide did and why, and until when it can be appealed", async () => {
    await openNotices(() =>
      ok(200, {
        notices: [
          suspension(),
          suspension({
            id: "0190a1d6-0000-7000-8000-0000000000e2",
            kind: "content_hidden",
            rule: "offensive",
            reason: "Rude words in a message.",
            content: { kind: "message" },
            until: null,
            at: "2026-10-01T09:00:00.000Z",
            appealUntil: "2026-10-15T09:00:00.000Z",
            canAppeal: false,
          }),
        ],
      }),
    );
    expect(
      await screen.findByText("Your account is suspended until Sunday 13 December at 12:00"),
    ).toBeVisible();
    expect(screen.getByText("Sent 13 November 2026")).toBeVisible();
    expect(screen.getByText("Rule: Harassment")).toBeVisible();
    expect(screen.getByText(`Reason: ${reason}`)).toBeVisible();
    expect(
      screen.getByText("If you disagree, you can appeal until Friday 27 November at 12:00."),
    ).toBeVisible();
    expect(screen.getByText("We removed something you posted")).toBeVisible();
    expect(screen.getByText("Concerns: a message you sent")).toBeVisible();
    expect(
      screen.getByText("The time to appeal ended Thursday 15 October at 09:00."),
    ).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Appeal" })).toHaveLength(1);
  });

  it("sends one appeal, and shows it waiting for PuffinRide's answer", async () => {
    const app = await openNotices(
      () => ok(200, { notices: [suspension()] }),
      (client) => {
        client.answer(
          "/v1/me/notices/{id}/appeal",
          (input) =>
            ok(
              200,
              suspension({
                canAppeal: false,
                appeal: {
                  text: (input["body"] as { text: string }).text,
                  sentAt: "2026-11-14T12:00:00.000Z",
                  answer: null,
                  outcome: null,
                  answeredAt: null,
                },
              }),
            ),
          "post",
        );
      },
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Appeal" }));
    // Nothing is sent without a word.
    await fireEvent.press(screen.getByRole("button", { name: "Send appeal" }));
    expect(screen.getByText("Write why you disagree.")).toBeVisible();
    expect(appealsSent(app.client)).toEqual([]);

    await fireEvent.changeText(
      screen.getByLabelText("Why do you disagree?"),
      "  I was not there that day. ",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send appeal" }));
    expect(await screen.findByText("Your appeal, sent 14 November 2026")).toBeVisible();
    expect(appealsSent(app.client)).toEqual([{ text: "I was not there that day." }]);
    expect(screen.getByText("I was not there that day.")).toBeVisible();
    expect(screen.getByText("PuffinRide will look at it and answer here.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Appeal" })).toBeNull();
  });

  it("asks for a shorter appeal over 1 000 characters, and sends nothing", async () => {
    const app = await openNotices(() => ok(200, { notices: [suspension()] }));
    await fireEvent.press(await screen.findByRole("button", { name: "Appeal" }));
    await fireEvent.changeText(screen.getByLabelText("Why do you disagree?"), "x".repeat(1001));
    await fireEvent.press(screen.getByRole("button", { name: "Send appeal" }));
    expect(screen.getByText("Shorten it to 1000 characters or fewer.")).toBeVisible();
    expect(appealsSent(app.client)).toEqual([]);
  });

  it("shows PuffinRide's answer", async () => {
    await openNotices(() =>
      ok(200, {
        notices: [
          suspension({
            canAppeal: false,
            appeal: {
              text: "I was not there that day.",
              sentAt: "2026-11-13T15:00:00.000Z",
              answer: "You were right; sorry.",
              outcome: "reversed",
              answeredAt: "2026-11-14T09:00:00.000Z",
            },
          }),
        ],
      }),
    );
    expect(await screen.findByText("PuffinRide's answer: we changed our decision")).toBeVisible();
    expect(screen.getByText("You were right; sorry.")).toBeVisible();
  });

  it("says when the appeal can no longer be sent, and loads the notices again", async () => {
    let loads = 0;
    const app = await openNotices(
      () => {
        loads += 1;
        return ok(200, { notices: [suspension(loads === 1 ? {} : { canAppeal: false })] });
      },
      (client) => {
        client.answer(
          "/v1/me/notices/{id}/appeal",
          () => failure(409, "appeal_window_closed"),
          "post",
        );
      },
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Appeal" }));
    await fireEvent.changeText(screen.getByLabelText("Why do you disagree?"), "Too late?");
    await fireEvent.press(screen.getByRole("button", { name: "Send appeal" }));
    expect(await screen.findByText("This notice can no longer be appealed.")).toBeVisible();
    expect(appealsSent(app.client)).toHaveLength(1);
    expect(loads).toBe(2);
  });

  it("says when there is nothing, and offers to try again after a failure", async () => {
    let attempts = 0;
    await openNotices(() => {
      attempts += 1;
      return attempts === 1 ? failure(500, "internal_error") : ok(200, { notices: [] });
    });
    expect(await screen.findByText("Your notices could not be loaded.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText(
        "Nothing here. If PuffinRide ever acts on your account, you'll read why here.",
      ),
    ).toBeVisible();
  });
});

describe("A suspended account (spec 9, 3.6.2)", () => {
  const suspendedMe = { ...completeMe, suspension: { until: "2026-12-13T12:00:00.000Z" } };

  it("shows Find as the suspension, with the way to read why and appeal", async () => {
    await renderApp("/", {
      me: suspendedMe,
      setUp: (client) => {
        client.answer("/v1/me/notices", () => ok(200, { notices: [suspension()] }), "get");
      },
    });
    expect(await screen.findByRole("header", { name: "Your account is suspended" })).toBeVisible();
    expect(screen.getByText("Until Sunday 13 December at 12:00.")).toBeVisible();
    expect(await screen.findByText(`Reason: ${reason}`)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Read why and appeal" }));
    expect(await screen.findByText("Rule: Harassment")).toBeVisible();
  });

  it("follows a suspension that started while the app was open", async () => {
    let suspended = false;
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/me", () => ok(200, suspended ? suspendedMe : completeMe), "get");
        client.answer("/v1/me/notices", () => ok(200, { notices: [suspension()] }), "get");
        client.answer("/v1/trips/soonest", () => {
          suspended = true;
          return failure(403, "account_suspended", {
            suspendedUntil: suspendedMe.suspension.until,
          });
        });
      },
    });
    expect(await screen.findByRole("header", { name: "Your account is suspended" })).toBeVisible();
  });

  it("is over once its end has passed, before the app reads the account again", async () => {
    await renderApp("/", {
      me: { ...completeMe, suspension: { until: "2026-11-14T11:00:00.000Z" } },
      setUp: (client) => {
        client.answer("/v1/trips/soonest", () => ok(200, { results: [] }));
      },
    });
    expect(await screen.findByRole("header", { name: "Hi Anna" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Your account is suspended" })).toBeNull();
  });

  it("closes booking a seat, even from a link", async () => {
    await renderApp("/trips/0190a1d6-0000-7000-8000-0000000000f1/book?from=0&to=1", {
      me: suspendedMe,
      setUp: (client) => {
        client.answer("/v1/me/notices", () => ok(200, { notices: [suspension()] }), "get");
      },
    });
    expect(await screen.findByRole("header", { name: "Your account is suspended" })).toBeVisible();
  });

  it("shows Offer as the suspension too, with no end date when there is none", async () => {
    await renderApp("/offer", {
      me: { ...suspendedMe, suspension: { until: null } },
      setUp: (client) => {
        client.answer("/v1/me/notices", () => failure(500, "internal_error"), "get");
      },
    });
    expect(await screen.findByRole("header", { name: "Your account is suspended" })).toBeVisible();
    expect(screen.getByText("With no end date.")).toBeVisible();
  });
});
