import {
  adminMeRoute,
  adminRecoveryCodeRoute,
  adminRecoveryVerifyRoute,
  adminSetupOptionsRoute,
  adminSetupRoute,
  adminSignInMethodsRoute,
  type AdminMe,
} from "@shareride/contracts";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleApp } from "../app.tsx";
import { createFakeApi, createFakePasskeys } from "../testing/fake-api.ts";

// "Lost your passkey?" (spec 22): a text code, then a new passkey.

const anna: AdminMe = {
  userId: "0196f000-0000-7000-8000-000000000001",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2026-11-16T23:00:00.000Z",
};
const token = "sr_ol_recovered";

function start(path: string, language: "en" | "is" = "en") {
  window.history.replaceState(null, "", path);
  Object.defineProperty(window.navigator, "language", { value: language, configurable: true });
  const api = createFakeApi();
  const browser = createFakePasskeys();
  api.on(adminMeRoute, { status: 401, error: { code: "operator_unauthenticated" } });
  api.on(adminSignInMethodsRoute, { status: 200, data: { password: false } });
  api.on(adminRecoveryCodeRoute, { status: 200, data: { resendAfterSeconds: 30 } });
  api.on(adminRecoveryVerifyRoute, { status: 200, data: { token } });
  api.on(adminSetupOptionsRoute, { status: 200, data: { options: { challenge: "setup" } } });
  api.on(adminSetupRoute, { status: 200, data: anna });
  render(<ConsoleApp client={api.client} passkeys={browser.passkeys} />);
  return { api, browser };
}

async function sendCode(phoneNumber = "690 0000") {
  fireEvent.change(await screen.findByLabelText("Your phone number"), {
    target: { value: phoneNumber },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send a code" }));
  await screen.findByLabelText("Code");
}

function checkCode(code: string) {
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Check the code" }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Lost your passkey? (spec 22)", () => {
  it("opens Lost your passkey? from the sign-in page", async () => {
    start("/admin/sign-in");
    fireEvent.click(await screen.findByRole("link", { name: "Lost your passkey?" }));
    expect(await screen.findByRole("heading", { name: "Get back into the console" })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/recover");
  });

  it("sends a code and asks for it", async () => {
    const { api } = start("/admin/recover");
    await sendCode();
    expect(api.called(adminRecoveryCodeRoute)[0]?.input).toEqual({
      body: { phoneNumber: "690 0000" },
    });
    expect(screen.getByRole("status").textContent).toBe(
      "If this number belongs to an operator, we sent it a code. It works for 10 minutes.",
    );
    expect(
      screen.getByText("No text? The operator command on the server makes a setup link too."),
    ).toBeTruthy();
  });

  it("says when the number is not a mobile number", async () => {
    const { api } = start("/admin/recover");
    api.on(adminRecoveryCodeRoute, { status: 400, error: { code: "phone_invalid" } });
    fireEvent.change(await screen.findByLabelText("Your phone number"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a code" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Enter a mobile number. Landlines can't get texts.",
    );
  });

  it("points to the operator command when the text could not be sent", async () => {
    const { api } = start("/admin/recover");
    api.on(adminRecoveryCodeRoute, { status: 503, error: { code: "sms_failed" } });
    fireEvent.change(await screen.findByLabelText("Your phone number"), {
      target: { value: "690 0000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a code" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "We couldn't send the text. Try again in a moment.",
    );
    expect(
      screen.getByText("No text? The operator command on the server makes a setup link too."),
    ).toBeTruthy();
  });

  it("says a wrong code and the tries left", async () => {
    const { api } = start("/admin/recover");
    api.on(adminRecoveryVerifyRoute, {
      status: 400,
      error: { code: "code_invalid", attemptsLeft: 4 },
    });
    await sendCode();
    checkCode("123456");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That code isn't right. 4 tries left.",
    );
  });

  it("an expired code asks for a new one", async () => {
    const { api } = start("/admin/recover");
    api.on(adminRecoveryVerifyRoute, { status: 400, error: { code: "code_expired" } });
    await sendCode();
    checkCode("123456");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This code has expired. Ask for a new one.",
    );
  });

  it("Send a new code waits 30 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = start("/admin/recover");
    await sendCode();
    const resend = screen.getByRole("button", { name: "Send a new code" });
    expect(resend.hasAttribute("disabled")).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(resend.hasAttribute("disabled")).toBe(false);
    fireEvent.click(resend);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.called(adminRecoveryCodeRoute)).toHaveLength(2);
  });

  it("a right code shows Save your passkey and signs in", async () => {
    const { api, browser } = start("/admin/recover");
    await sendCode();
    checkCode("123456");
    expect(await screen.findByRole("heading", { name: "Save your passkey" })).toBeTruthy();
    expect(
      screen.getByText(
        "Save a new passkey for the console on this device or your phone. This step works once, for 30 minutes.",
      ),
    ).toBeTruthy();
    // The token never goes in the address.
    expect(window.location.href).not.toContain(token);
    fireEvent.change(screen.getByLabelText("Name of this passkey"), {
      target: { value: "Phone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save the passkey" }));
    expect(await screen.findByRole("heading", { name: "Welcome, Anna" })).toBeTruthy();
    expect(browser.state.prompts).toEqual(["create setup"]);
    expect(api.called(adminSetupRoute)[0]?.input).toMatchObject({
      body: { token, name: "Phone" },
    });
  });

  it("goes back to sign-in", async () => {
    start("/admin/recover");
    fireEvent.click(await screen.findByRole("link", { name: "Back to sign-in" }));
    expect(await screen.findByRole("button", { name: "Sign in with a passkey" })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/sign-in");
  });

  it("speaks Icelandic", async () => {
    start("/admin/recover", "is");
    expect(
      await screen.findByRole("heading", { name: "Komdu aftur inn í stjórnborðið" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Símanúmerið þitt")).toBeTruthy();
  });
});
