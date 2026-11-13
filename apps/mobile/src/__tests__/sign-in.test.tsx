import { act, fireEvent, screen } from "expo-router/testing-library";
import { failure, ok, testMe, tokens } from "@/testing/fake-client";
import { renderApp } from "@/testing/app";
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

const signedIn = { ...tokens(1), user: testMe, isNewUser: true };

/** Opens the app signed out, at the phone number screen. */
async function openPhoneScreen() {
  const app = await renderApp("/");
  app.client.answer("/v1/auth/phone/start", () => ok(202, { resendAfterSeconds: 30 }));
  await fireEvent.press(await screen.findByRole("button", { name: "Continue with phone" }));
  expect(await screen.findByRole("header", { name: "What's your phone number?" })).toBeVisible();
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
    expect(await screen.findByRole("header", { name: "Before you start" })).toBeVisible();
    expect(screen).toHavePathname("/onboarding/terms");
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
    expect(await screen.findByRole("header", { name: "What's your phone number?" })).toBeVisible();
  });
});
