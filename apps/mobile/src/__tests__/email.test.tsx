import { act, fireEvent, screen } from "expo-router/testing-library";
import { router } from "expo-router";
import type { Me } from "@shareride/contracts";
import { linkToken } from "@/email/link-token";
import { failure, ok } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

// Adding an email (plan 4.6): the screen sends a link, and the link's page
// confirms the address, signed in or not.

async function openEmail(me: Me = completeMe, answer?: () => unknown) {
  const app = await renderApp("/settings/email", {
    me,
    setUp: (client) => {
      client.answer(
        "/v1/me/email",
        answer ??
          ((input) => {
            const { email } = input["body"] as { email: string };
            return ok(200, { ...me, pendingEmail: email.trim().toLowerCase() });
          }),
      );
    },
  });
  expect(await screen.findByRole("header", { name: "Your email" })).toBeVisible();
  return app;
}

const emailCalls = (app: Awaited<ReturnType<typeof openEmail>>) =>
  app.client.calls.filter((call) => call.path === "/v1/me/email");

async function sendLink(address: string) {
  await fireEvent.changeText(screen.getByLabelText("Email"), address);
  await fireEvent.press(screen.getByRole("button", { name: "Send the link" }));
}

describe("Your email (plan 4.6)", () => {
  it("sends a link to the address and says where it went", async () => {
    const app = await openEmail();
    expect(
      screen.getByText(
        "Booking news reaches you by email when a push notification can't. Nobody else sees your email.",
      ),
    ).toBeVisible();
    await sendLink(" Anna@Example.com ");
    expect(
      await screen.findByText(
        "We sent a link to anna@example.com. Open it within 24 hours to add the address.",
      ),
    ).toBeVisible();
    expect(emailCalls(app).map((call) => call.input["body"])).toEqual([
      { email: "anna@example.com" },
    ]);
    expect(screen.getByLabelText("Email")).toHaveDisplayValue("");
  });

  it("checks the address before sending anything", async () => {
    const app = await openEmail();
    await sendLink("anna");
    expect(
      await screen.findByText("Enter an email address, such as anna@example.com."),
    ).toBeVisible();
    expect(emailCalls(app)).toEqual([]);
  });

  it("shows the email in use and the address waiting for its link, which can be sent again", async () => {
    const app = await openEmail({
      ...completeMe,
      email: "anna@example.com",
      pendingEmail: "anna.new@example.com",
    });
    expect(screen.getByText("Your email is anna@example.com.")).toBeVisible();
    expect(
      screen.getByText(
        "We sent a link to anna.new@example.com. Open it within 24 hours to add the address.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Send the link again" }));
    expect(emailCalls(app).map((call) => call.input["body"])).toEqual([
      { email: "anna.new@example.com" },
    ]);
  });

  it("says when a link was asked for just now", async () => {
    await openEmail(completeMe, () => failure(429, "rate_limited", { retryAfterSeconds: 45 }));
    await sendLink("anna@example.com");
    expect(
      await screen.findByText("You asked for a link just now. Try again in 45 seconds."),
    ).toBeVisible();
  });

  it("says how long to wait once the day's links are used", async () => {
    await openEmail(completeMe, () =>
      failure(429, "rate_limited", { retryAfterSeconds: 22 * 3600 + 5 }),
    );
    await sendLink("anna@example.com");
    expect(
      await screen.findByText("You can ask for 5 links a day. Try again in 23 hours."),
    ).toBeVisible();
  });

  it("says when email cannot be added on this server", async () => {
    await openEmail(completeMe, () => failure(503, "email_unavailable"));
    await sendLink("anna@example.com");
    expect(
      await screen.findByText("Adding an email isn't possible yet. Try again later."),
    ).toBeVisible();
  });

  it("is reached from Settings, under Your account", async () => {
    await renderApp("/settings", { me: { ...completeMe, pendingEmail: "anna@example.com" } });
    expect(await screen.findByRole("header", { name: "Your account" })).toBeVisible();
    expect(
      screen.getByText("Waiting for you to open the link sent to anna@example.com."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("link", { name: "Add an email" }));
    expect(await screen.findByRole("header", { name: "Your email" })).toBeVisible();
  });

  it("offers to change an email already added, in Settings", async () => {
    await renderApp("/settings", { me: { ...completeMe, email: "anna@example.com" } });
    expect(await screen.findByText("anna@example.com")).toBeVisible();
    expect(screen.getByRole("link", { name: "Change your email" })).toBeVisible();
  });
});

describe("The link's page (plan 4.6)", () => {
  let links = 0;
  // A new link for each test: the page asks about each link once.
  async function openLink(answer: () => unknown, me?: Me) {
    links += 1;
    const app = await renderApp(`/verify-email?token=sr_ev_test-${String(links)}`, {
      ...(me === undefined ? {} : { me }),
      setUp: (client) => {
        client.answer("/v1/email-verifications", answer);
      },
    });
    return app;
  }

  it("adds the email, signed in, and refreshes the account", async () => {
    const app = await openLink(() => ok(200, { email: "anna@example.com" }), completeMe);
    expect(await screen.findByRole("header", { name: "Your email is added" })).toBeVisible();
    expect(
      screen.getByText("anna@example.com is now the email of your PuffinRide account."),
    ).toBeVisible();
    expect(
      app.client.calls.find((call) => call.path === "/v1/email-verifications")?.input["body"],
    ).toEqual({ token: "sr_ev_test-1" });
    const meCalls = app.client.calls.filter((call) => call.path === "/v1/me").length;
    expect(meCalls).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("link", { name: "Go to Settings" })).toBeVisible();
  });

  it("adds the email when nobody is signed in, and opens the app from there", async () => {
    await openLink(() => ok(200, { email: "anna@example.com" }));
    expect(await screen.findByRole("header", { name: "Your email is added" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open PuffinRide" })).toBeVisible();
  });

  it("says when the link no longer works", async () => {
    await openLink(() => failure(400, "link_invalid"));
    expect(await screen.findByRole("header", { name: "This link no longer works" })).toBeVisible();
    expect(
      screen.getByText(
        "A link works once, for 24 hours, and only the newest one. Ask for a new one in Settings.",
      ),
    ).toBeVisible();
  });

  it("says when another account has the email", async () => {
    await openLink(() => failure(409, "email_taken"));
    expect(
      await screen.findByRole("header", { name: "This email belongs to another account" }),
    ).toBeVisible();
  });

  it("lets the person try again when PuffinRide cannot be reached", async () => {
    let answer: unknown = failure(0, "network_error");
    const app = await openLink(() => answer);
    expect(
      await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again."),
    ).toBeVisible();
    answer = ok(200, { email: "anna@example.com" });
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("header", { name: "Your email is added" })).toBeVisible();
    expect(app.client.calls.filter((call) => call.path === "/v1/email-verifications")).toHaveLength(
      2,
    );
  });

  it("says what went wrong on PuffinRide's side, and lets the person try again", async () => {
    let answer: unknown = failure(500, "internal_error");
    await openLink(() => answer);
    expect(await screen.findByText("Something went wrong on our side. Try again.")).toBeVisible();
    expect(screen.queryByRole("header", { name: "This link no longer works" })).toBeNull();
    answer = ok(200, { email: "anna@example.com" });
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("header", { name: "Your email is added" })).toBeVisible();
  });

  it("asks about a link once, however often the page opens", async () => {
    const app = await openLink(() => ok(200, { email: "anna@example.com" }), completeMe);
    expect(await screen.findByRole("header", { name: "Your email is added" })).toBeVisible();
    await act(() => {
      router.replace("/settings");
    });
    expect(await screen.findByRole("header", { name: "Your account" })).toBeVisible();
    await act(() => {
      router.replace(`/verify-email?token=sr_ev_test-${String(links)}`);
    });
    expect(await screen.findByRole("header", { name: "Your email is added" })).toBeVisible();
    expect(app.client.calls.filter((call) => call.path === "/v1/email-verifications")).toHaveLength(
      1,
    );
  });

  it("asks to open the link from the email when the page has none, such as after a reload", async () => {
    const app = await renderApp("/verify-email");
    expect(
      await screen.findByRole("header", { name: "Open the link from your email" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "This page adds an email when it is opened from the link we sent. If you opened it already, your email is in Settings.",
      ),
    ).toBeVisible();
    expect(app.client.calls.filter((call) => call.path === "/v1/email-verifications")).toEqual([]);
  });

  it("reads the token after the # on the web, or from the address on a phone", () => {
    expect(linkToken("#sr_ev_abc", undefined)).toBe("sr_ev_abc");
    expect(linkToken("", "sr_ev_def")).toBe("sr_ev_def");
    expect(linkToken("", undefined)).toBeNull();
  });
});
