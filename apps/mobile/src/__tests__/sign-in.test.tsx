import { act, fireEvent, screen } from "expo-router/testing-library";
import { failure, ok, testMe, tokens, type FakeClient } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { northResult, northTrip, tripDetailsApi } from "@/testing/search";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// The app's own storage, in memory: a ride kept while signing up waits here.
const mockStored = new Map<string, string>();
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn((key: string) => Promise.resolve(mockStored.get(key) ?? null)),
  writeAppData: jest.fn((key: string, value: string) => {
    mockStored.set(key, value);
    return Promise.resolve();
  }),
}));

beforeEach(() => {
  mockStored.clear();
});

const signedIn = { ...tokens(1), user: testMe, isNewUser: true };

/** Opens the app signed out, at the phone number screen. */
async function openPhoneScreen() {
  const app = await renderApp("/");
  app.client.answer("/v1/auth/phone/start", () => ok(202, { resendAfterSeconds: 30 }));
  await fireEvent.press(await screen.findByRole("tab", { name: "Profile" }));
  await fireEvent.press(await screen.findByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("header", { name: "Sign in or create an account" })).toBeVisible();
  return app;
}

async function sendCodeTo(phoneNumber: string) {
  await fireEvent.changeText(screen.getByLabelText("Mobile number"), phoneNumber);
  await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
}

async function enterCode(code: string) {
  await fireEvent.changeText(await screen.findByLabelText("6-digit code"), code);
}

describe("Signing in with a phone number", () => {
  it("numbers the steps and says the same code creates an account (spec 16, 3.5)", async () => {
    await openPhoneScreen();
    expect(screen.getByText("Step 1 of 3")).toBeVisible();
    expect(
      screen.getByText(
        "We text you a 6-digit code. New to ShareRide? The same code creates your account.",
      ),
    ).toBeVisible();
    // Nothing kept: no ride card.
    expect(screen.queryByText("You're booking")).toBeNull();
    await sendCodeTo("690 0000");
    expect(await screen.findByText("Step 2 of 3")).toBeVisible();
    expect(screen.getByRole("header", { name: "Enter the code" })).toBeVisible();
  });

  it("sends a code to an Icelandic number and signs up a new account", async () => {
    const app = await openPhoneScreen();
    app.client.answer("/v1/auth/phone/verify", () => ok(200, signedIn));
    await sendCodeTo("690 0000");

    expect(await screen.findByText("We sent it to +354 690 0000.")).toBeVisible();
    expect(app.client.calls.at(-1)).toEqual({
      path: "/v1/auth/phone/start",
      input: { body: { phoneNumber: "+3546900000", locale: "en" } },
    });

    await enterCode("123456");
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(screen).toHavePathname("/onboarding/about-you");
    expect(app.store.value).toBe("sr_rt_refresh-1");
    expect(app.client.calls.find((call) => call.path === "/v1/auth/phone/verify")?.input).toEqual({
      body: {
        phoneNumber: "+3546900000",
        code: "123456",
        locale: "en",
        device: { platform: "ios", appVersion: "0.1.0" },
      },
    });
  });

  it("uses the country chosen in the country picker", async () => {
    const app = await openPhoneScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Country: Iceland, +354. Change the country" }),
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Poland, +48" }));
    expect(
      await screen.findByRole("button", { name: "Country: Poland, +48. Change the country" }),
    ).toBeVisible();
    await sendCodeTo("512 345 678");
    expect(await screen.findByText("We sent it to +48 512 345 678.")).toBeVisible();
    expect(app.client.calls.at(-1)?.input).toEqual({
      body: { phoneNumber: "+48512345678", locale: "en" },
    });
  });

  it("sends one code when Return is pressed twice", async () => {
    const app = await openPhoneScreen();
    let reply: (value: unknown) => void = () => undefined;
    app.client.answer(
      "/v1/auth/phone/start",
      () =>
        new Promise((resolve) => {
          reply = resolve;
        }),
    );
    await fireEvent.changeText(screen.getByLabelText("Mobile number"), "690 0000");
    await fireEvent(screen.getByLabelText("Mobile number"), "submitEditing");
    await fireEvent(screen.getByLabelText("Mobile number"), "submitEditing");
    await act(async () => {
      reply(ok(202, { resendAfterSeconds: 30 }));
      await Promise.resolve();
    });
    expect(await screen.findByText("We sent it to +354 690 0000.")).toBeVisible();
    expect(app.client.calls.filter((call) => call.path === "/v1/auth/phone/start")).toHaveLength(1);
  });

  it("says when a number is not a mobile number, without calling the API", async () => {
    const app = await openPhoneScreen();
    const before = app.client.calls.length;
    await sendCodeTo("123");
    expect(
      await screen.findByText("Enter a mobile number. Landlines can't get texts."),
    ).toBeVisible();
    expect(app.client.calls).toHaveLength(before);
  });

  it("says when the number's country is not supported yet", async () => {
    const app = await openPhoneScreen();
    const before = app.client.calls.length;
    await sendCodeTo("+41 79 123 45 67");
    expect(
      await screen.findByText("We can't send codes to numbers from this country yet."),
    ).toBeVisible();
    expect(app.client.calls).toHaveLength(before);
  });

  it("shows the wait when too many codes were asked for", async () => {
    const app = await openPhoneScreen();
    app.client.answer("/v1/auth/phone/start", () =>
      failure(429, "rate_limited", { retryAfterSeconds: 1740 }),
    );
    await sendCodeTo("690 0000");
    expect(
      await screen.findByText("You've asked for a lot of codes. Try again in 29 minutes."),
    ).toBeVisible();
  });

  it("says when the API cannot be reached", async () => {
    const app = await openPhoneScreen();
    app.client.answer("/v1/auth/phone/start", () => failure(0, "network_error"));
    await sendCodeTo("690 0000");
    expect(
      await screen.findByText("We couldn't reach ShareRide. Check your connection and try again."),
    ).toBeVisible();
  });

  it("shows the tries left after a wrong code", async () => {
    const app = await openPhoneScreen();
    app.client.answer("/v1/auth/phone/verify", () =>
      failure(400, "code_invalid", { attemptsLeft: 3 }),
    );
    await sendCodeTo("690 0000");
    await enterCode("111111");
    expect(await screen.findByText("That code isn't right. 3 tries left.")).toBeVisible();
    expect(screen.getByLabelText("6-digit code")).toHaveDisplayValue("");
  });

  it("says when the code has expired", async () => {
    const app = await openPhoneScreen();
    app.client.answer("/v1/auth/phone/verify", () => failure(400, "code_expired"));
    await sendCodeTo("690 0000");
    await enterCode("123456");
    expect(await screen.findByText("This code has expired. Ask for a new one.")).toBeVisible();
  });

  it("shows the wait after too many wrong codes", async () => {
    const app = await openPhoneScreen();
    app.client.answer("/v1/auth/phone/verify", () =>
      failure(429, "code_attempts_exceeded", { retryAfterSeconds: 90 }),
    );
    await sendCodeTo("690 0000");
    await enterCode("123456");
    expect(
      await screen.findByText("Too many wrong codes. You can ask for a new one in 2 minutes."),
    ).toBeVisible();
  });

  it("lets the person ask for a new code after 30 seconds", async () => {
    jest.useFakeTimers();
    try {
      const app = await openPhoneScreen();
      await sendCodeTo("690 0000");
      expect(await screen.findByText("You can ask for a new code in 30 seconds.")).toBeVisible();
      expect(screen.queryByRole("button", { name: "Send a new code" })).toBeNull();

      await act(() => jest.advanceTimersByTimeAsync(10_000));
      expect(screen.getByText("You can ask for a new code in 20 seconds.")).toBeVisible();

      await act(() => jest.advanceTimersByTimeAsync(20_000));
      await fireEvent.press(screen.getByRole("button", { name: "Send a new code" }));
      expect(await screen.findByText("We sent a new code.")).toBeVisible();
      expect(app.client.calls.filter((call) => call.path === "/v1/auth/phone/start")).toHaveLength(
        2,
      );
      expect(screen.getByText("You can ask for a new code in 30 seconds.")).toBeVisible();
    } finally {
      jest.useRealTimers();
    }
  });

  it("goes back to change the number", async () => {
    await openPhoneScreen();
    await sendCodeTo("690 0000");
    await fireEvent.press(await screen.findByRole("button", { name: "Change the number" }));
    expect(await screen.findByLabelText("Mobile number")).toHaveDisplayValue("690 0000");
  });

  it("starts at the phone number screen when the code screen is opened directly", async () => {
    await renderApp("/sign-in/code");
    expect(
      await screen.findByRole("header", { name: "Sign in or create an account" }),
    ).toBeVisible();
  });
});

describe("Signing in with a ride kept (spec 16, 3.5)", () => {
  /** Two seats from Borgarnes to Blönduós on the north trip, chosen before signing in. */
  function keepBooking() {
    mockStored.set(
      "pending-booking",
      JSON.stringify({
        tripId: northResult.tripId,
        board: 1,
        alight: 2,
        seats: 2,
        keptAt: new Date().toISOString(),
      }),
    );
  }

  async function openSignIn(setUp: (client: FakeClient) => void = tripDetailsApi) {
    const app = await renderApp("/sign-in", {
      setUp: (client) => {
        setUp(client);
        client.answer("/v1/auth/phone/start", () => ok(202, { resendAfterSeconds: 30 }));
      },
    });
    expect(
      await screen.findByRole("header", { name: "Sign in or create an account" }),
    ).toBeVisible();
    return app;
  }

  it("shows the ride on steps 1 and 2, and says it comes back to it", async () => {
    keepBooking();
    await openSignIn();
    const card = await screen.findByTestId("kept-ride");
    // Screen readers hear words, not the dot and the arrow.
    expect(card).toHaveAccessibleName(
      "You're booking, Sunday 15 November, Leaves Borgarnes at 10:00, arrives at Blönduós at 12:05, 2 seats, 5,800 ISK, Driver: Anna, We bring you back here after signing in.",
    );
    expect(screen.getByText("Sunday 15 November · 10:00 Borgarnes → 12:05 Blönduós")).toBeVisible();
    expect(screen.getByText("2 seats · 5,800 ISK · Driver: Anna")).toBeVisible();

    await sendCodeTo("690 0000");
    expect(await screen.findByText("Step 2 of 3")).toBeVisible();
    expect(await screen.findByTestId("kept-ride")).toHaveAccessibleName(
      /^You're booking, Sunday 15 November/,
    );
    expect(screen.getByText("We bring you back here after signing in.")).toBeVisible();
  });

  it("asks the trip for the part and seats kept", async () => {
    keepBooking();
    const app = await openSignIn();
    await screen.findByTestId("kept-ride");
    expect(app.client.calls.find((call) => call.path === "/v1/trips/{id}")?.input).toEqual({
      params: { id: northResult.tripId },
      query: { fromStop: 1, toStop: 2, seats: 2 },
    });
  });

  it.each([
    ["full", "Full on your part of the trip"],
    ["cancelled", "This trip was cancelled."],
  ] as const)("says when the ride kept is %s now", async (state, text) => {
    keepBooking();
    await openSignIn((client) => {
      tripDetailsApi(client, (query) =>
        ok(
          200,
          northTrip(
            { board: Number(query["fromStop"]), alight: Number(query["toStop"]), seats: 2 },
            { part: { state, freeSeats: 0 } },
          ),
        ),
      );
    });
    expect(await screen.findByTestId("kept-ride")).toHaveAccessibleName(
      new RegExp(`^You're booking, .*, Driver: Anna, ${text.replace(".", "\\.")}$`),
    );
    expect(screen.getByText(text)).toBeVisible();
    expect(screen.queryByText("We bring you back here after signing in.")).toBeNull();
  });

  it("says what comes next for an offer to drive", async () => {
    mockStored.set("pending-offer", JSON.stringify({ keptAt: new Date().toISOString() }));
    await openSignIn();
    expect(await screen.findByText("Next: offer a ride")).toBeVisible();
    expect(screen.getByText("We take you there after signing in.")).toBeVisible();
  });

  it("leaves the card out when the trip cannot be loaded", async () => {
    keepBooking();
    const app = await openSignIn((client) => {
      client.answer("/v1/trips/{id}", () => failure(0, "network_error"));
    });
    await screen.findByText("Step 1 of 3");
    expect(app.client.calls.some((call) => call.path === "/v1/trips/{id}")).toBe(true);
    expect(screen.queryByTestId("kept-ride")).toBeNull();
    expect(screen.getByLabelText("Mobile number")).toBeVisible();
  });

  it("takes someone who already has an account back to the ride after the code", async () => {
    keepBooking();
    const app = await openSignIn();
    app.client.answer("/v1/auth/phone/verify", () =>
      ok(200, { ...tokens(1), user: completeMe, isNewUser: false }),
    );
    await sendCodeTo("690 0000");
    await enterCode("123456");
    expect(await screen.findByRole("header", { name: "Request this ride" })).toBeVisible();
    expect(screen).toHavePathname(`/trips/${northResult.tripId}/book`);
    expect(screen).toHaveSearchParams({ id: northResult.tripId, from: "1", to: "2", seats: "2" });
  });
});

describe("Signing up while the beta is closed (spec 12, 3.2.3)", () => {
  const inviteRequired = () => failure(403, "invite_required");
  /** The last check of a code the app sent. */
  const lastVerify = (app: { client: FakeClient }) =>
    app.client.calls.findLast((call) => call.path === "/v1/auth/phone/verify");

  /** A new number, its text-message code right: the API asks for the invite code. */
  async function reachInviteScreen() {
    const app = await openPhoneScreen();
    app.client.answer("/v1/auth/phone/verify", inviteRequired);
    await sendCodeTo("690 0000");
    await enterCode("123456");
    expect(await screen.findByRole("header", { name: "Enter your invite code" })).toBeVisible();
    return app;
  }

  it("asks a new number for the invite code after the code, and sends both", async () => {
    const app = await reachInviteScreen();
    expect(screen.getByText("Step 2 of 3")).toBeVisible();
    expect(
      screen.getByText(
        "ShareRide is in a closed beta. To create an account you need an invite code.",
      ),
    ).toBeVisible();
    expect(screen).toHavePathname("/sign-in/invite");

    app.client.answer("/v1/auth/phone/verify", () => ok(200, signedIn));
    await fireEvent.changeText(screen.getByLabelText("Invite code"), "abcd-2345");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(lastVerify(app)).toMatchObject({
      path: "/v1/auth/phone/verify",
      input: { body: { phoneNumber: "+3546900000", code: "123456", inviteCode: "abcd-2345" } },
    });
  });

  it("asks for a code before sending, and says when one does not work or the beta is full", async () => {
    const app = await reachInviteScreen();
    const calls = app.client.calls.length;
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Enter your invite code.")).toBeVisible();
    expect(app.client.calls).toHaveLength(calls);

    app.client.answer("/v1/auth/phone/verify", () => failure(400, "invite_invalid"));
    await fireEvent.changeText(screen.getByLabelText("Invite code"), "ZZZZ9999");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("This code isn't valid or has expired.")).toBeVisible();
    expect(screen).toHavePathname("/sign-in/invite");

    app.client.answer("/v1/auth/phone/verify", () => failure(409, "beta_full"));
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("The beta is full for now. Try again later.")).toBeVisible();
  });

  it("goes back to step 1 when the text-message code has run out, keeping the invite code", async () => {
    const app = await reachInviteScreen();
    app.client.answer("/v1/auth/phone/verify", () => failure(400, "code_expired"));
    await fireEvent.changeText(screen.getByLabelText("Invite code"), "ABCD2345");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText(
        "The code from the text message no longer works. Send a new one. Your invite code is kept.",
      ),
    ).toBeVisible();
    expect(screen).toHavePathname("/sign-in");

    // The new code goes with the invite code at once: no second question.
    app.client.answer("/v1/auth/phone/verify", () => ok(200, signedIn));
    await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    await enterCode("654321");
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(lastVerify(app)).toMatchObject({
      input: { body: { code: "654321", inviteCode: "ABCD2345" } },
    });
  });

  it("takes the code of an invite link along, and a member's sign-in sends none", async () => {
    const app = await renderApp("/invite/abcd2345");
    app.client.answer("/v1/auth/phone/start", () => ok(202, { resendAfterSeconds: 30 }));
    app.client.answer("/v1/auth/phone/verify", () => ok(200, signedIn));
    expect(
      await screen.findByRole("header", { name: "Sign in or create an account" }),
    ).toBeVisible();
    await sendCodeTo("690 0000");
    await enterCode("123456");
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(lastVerify(app)).toMatchObject({
      input: { body: { code: "123456", inviteCode: "abcd2345" } },
    });
  });

  it("shows where a link's code did not work, with the code to correct", async () => {
    const app = await renderApp("/invite/zzzz9999");
    app.client.answer("/v1/auth/phone/start", () => ok(202, { resendAfterSeconds: 30 }));
    app.client.answer("/v1/auth/phone/verify", () => failure(400, "invite_invalid"));
    await screen.findByRole("header", { name: "Sign in or create an account" });
    await sendCodeTo("690 0000");
    await enterCode("123456");
    expect(await screen.findByRole("header", { name: "Enter your invite code" })).toBeVisible();
    expect(screen.getByText("This code isn't valid or has expired.")).toBeVisible();
    expect(screen.getByLabelText("Invite code")).toHaveProp("value", "zzzz9999");
  });

  it("sends no invite code when none was typed", async () => {
    const app = await openPhoneScreen();
    app.client.answer("/v1/auth/phone/verify", () => ok(200, signedIn));
    await sendCodeTo("690 0000");
    await enterCode("123456");
    await screen.findByRole("header", { name: "Last step: about you" });
    const { body } = lastVerify(app)?.input as { body: Record<string, unknown> };
    expect(body).not.toHaveProperty("inviteCode");
  });
});

describe("The Beta label (spec 12, 3.2.6)", () => {
  it("sits beside the name while the beta is closed, and not otherwise", async () => {
    await renderApp("/");
    expect(await screen.findByText("ShareRide")).toBeVisible();
    expect(screen.queryByText("Beta")).toBeNull();

    await renderApp("/", {
      setUp: (client) => {
        client.answer("/v1/config", () =>
          ok(200, {
            beta: true,
            paused: [],
            maxSeats: 8,
            freeCancellationMinutes: 15,
            maxMoveMinutes: 120,
            reliabilityMonths: 12,
            signInProviders: [],
          }),
        );
      },
    });
    expect(await screen.findByText("Beta")).toBeVisible();
  });
});
