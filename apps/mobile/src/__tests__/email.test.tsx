import { act, fireEvent, screen, within } from "expo-router/testing-library";
import { router } from "expo-router";
import { AccessibilityInfo } from "react-native";
import type { Me } from "@shareride/contracts";
import { linkToken } from "@/email/link-token";
import { failure, ok } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { filledButtons, inBar, inPage } from "@/testing/buttons";

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

  it("asks for a confirm code first when the API wants one, then sends the link with it (spec 26, 3.7)", async () => {
    const app = await openEmail(completeMe, () => failure(403, "confirm_required"));
    app.client.answer("/v1/me/confirm-code", () =>
      ok(202, { resendAfterSeconds: 30, channel: "email", sentTo: "an•••@example.com" }),
    );
    await sendLink("new@example.com");
    expect(await screen.findByText("We emailed a code to an•••@example.com.")).toBeVisible();
    // The button that sends with the code has the bar now (spec 31,
    // R31.1), and leaving the code is a row under it.
    expect(inBar().getByRole("button", { name: "Send the link" })).toHaveStyle({ minHeight: 56 });
    expect(filledButtons()).toBe(1);
    expect(
      within(screen.getByTestId("action-rows")).getByRole("button", { name: "Cancel" }),
    ).toBeVisible();

    app.client.answer("/v1/me/email", (input) => {
      const { code } = input["body"] as { code?: string };
      return code === "123456"
        ? ok(200, { ...completeMe, pendingEmail: "new@example.com" })
        : failure(400, "code_invalid", { attemptsLeft: 4 });
    });
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
    expect(
      await screen.findByText(
        "We sent a link to new@example.com. Open it within 24 hours to add the address.",
      ),
    ).toBeVisible();
    expect(emailCalls(app).map((call) => call.input["body"])).toEqual([
      { email: "new@example.com" },
      { email: "new@example.com", code: "123456" },
    ]);
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
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
    // Over the button that did nothing, in the bar (spec 31, 3.19).
    expect(inBar().getByRole("alert")).toHaveTextContent(
      "You asked for a link just now. Try again in 45 seconds.",
    );
    expect(inPage().queryByRole("alert")).toBeNull();
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

  it("is reached from Profile, under Account, which says what it waits for", async () => {
    await renderApp("/profile", { me: { ...completeMe, pendingEmail: "anna@example.com" } });
    expect(await screen.findByRole("header", { name: "Account" })).toBeVisible();
    await fireEvent.press(
      screen.getByRole("link", {
        name: "Email, Waiting for you to open the link sent to anna@example.com.",
      }),
    );
    expect(await screen.findByRole("header", { name: "Your email" })).toBeVisible();
    expect(screen).toHavePathname("/settings/email");
  });

  it("changes an email already added from the same row", async () => {
    await renderApp("/profile", { me: { ...completeMe, email: "anna@example.com" } });
    await fireEvent.press(await screen.findByRole("link", { name: "Email, anna@example.com" }));
    expect(await screen.findByRole("header", { name: "Your email" })).toBeVisible();
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
    expect(screen.getByRole("link", { name: "Go to your profile" })).toBeVisible();
  });

  it("adds the email when nobody is signed in, and opens the app from there", async () => {
    await openLink(() => ok(200, { email: "anna@example.com" }));
    expect(await screen.findByRole("header", { name: "Your email is added" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open PuffinRide" })).toBeVisible();
  });

  it("says what the link did as the title, at the left and with focus, with the way on as the one main button in the bar (spec 31, 3.19 and R31.1)", async () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent").mockClear();
    await openLink(() => ok(200, { email: "anna@example.com" }), completeMe);
    const head = within(await screen.findByTestId("screen-head"));
    expect(await head.findByRole("header", { name: "Your email is added" })).not.toHaveStyle({
      textAlign: "center",
    });
    expect(
      head.getByText("anna@example.com is now the email of your PuffinRide account."),
    ).not.toHaveStyle({ textAlign: "center" });
    // Nothing to go back to: the page was opened from an email.
    expect(head.queryByRole("button", { name: "Back" })).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
    expect(inBar().getByRole("link", { name: "Go to your profile" })).toHaveStyle({
      minHeight: 56,
    });
    expect(filledButtons()).toBe(1);
    expect(inPage().queryByRole("link")).toBeNull();
  });

  it.each([
    ["This link no longer works", () => failure(400, "link_invalid")],
    ["This email belongs to another account", () => failure(409, "email_taken")],
  ])("says %s at the left too, with the way on in the bar", async (title, answer) => {
    await openLink(answer);
    const head = within(await screen.findByTestId("screen-head"));
    expect(await head.findByRole("header", { name: title })).not.toHaveStyle({
      textAlign: "center",
    });
    expect(inBar().getByRole("link", { name: "Open PuffinRide" })).toHaveStyle({ minHeight: 56 });
  });

  it("says when the link no longer works", async () => {
    await openLink(() => failure(400, "link_invalid"));
    expect(await screen.findByRole("header", { name: "This link no longer works" })).toBeVisible();
    expect(
      screen.getByText(
        "A link works once, for 24 hours, and only the newest one. Ask for a new one in Profile, under Email.",
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
      router.replace("/profile");
    });
    expect(await screen.findByRole("header", { name: "Account" })).toBeVisible();
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
        "This page adds an email when it is opened from the link we sent. If you opened it already, your email is in Profile.",
      ),
    ).toBeVisible();
    expect(app.client.calls.filter((call) => call.path === "/v1/email-verifications")).toEqual([]);
    expect(
      within(screen.getByTestId("screen-head")).getByRole("header", {
        name: "Open the link from your email",
      }),
    ).not.toHaveStyle({ textAlign: "center" });
    expect(inBar().getByRole("link", { name: "Open PuffinRide" })).toHaveStyle({ minHeight: 56 });
  });

  it("reads the token after the # on the web, or from the address on a phone", () => {
    expect(linkToken("#sr_ev_abc", undefined)).toBe("sr_ev_abc");
    expect(linkToken("", "sr_ev_def")).toBe("sr_ev_def");
    expect(linkToken("", undefined)).toBeNull();
  });
});
