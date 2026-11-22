import { createHash } from "node:crypto";
import type * as NodeCrypto from "node:crypto";
import { fireEvent, screen } from "expo-router/testing-library";
import { failure, ok, testMe, tokens, type FakeClient } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { openAuthSessionAsync, windowReturnsTo } from "@/testing/web-browser";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn(() => Promise.resolve(null)),
  writeAppData: jest.fn(() => Promise.resolve()),
}));
// The app's own address, as a build from the store has it.
jest.mock("@/sign-in/return-address", () => ({
  providerReturnUrl: () => "shareride://sign-in/return",
}));
// Jest has no SHA-256 of its own behind expo-crypto: Node's stands in, so
// the challenge sent to the start is the real one of the verifier.
jest.mock("expo-crypto", () => {
  const { createHash: hash } = jest.requireActual<typeof NodeCrypto>("node:crypto");
  return {
    ...jest.requireActual<object>("expo-crypto"),
    digestStringAsync: jest.fn((_algorithm: string, data: string) =>
      Promise.resolve(hash("sha256").update(data).digest("base64")),
    ),
  };
});
const digest = jest.requireMock<{ digestStringAsync: jest.Mock }>("expo-crypto").digestStringAsync;

const ticket = `sr_pt_${"t".repeat(43)}`;
const pendingSignIn = `sr_ps_${"p".repeat(43)}`;
const back = (fragment: string) => `shareride://sign-in/return#${fragment}`;

const phoneNeeded = (provider: "google" | "apple", email: string | null) => ({
  status: "phoneNeeded",
  pendingSignIn,
  provider,
  email,
  firstName: "Anna",
  expiresAt: "2026-11-22T12:30:00.000Z",
});

/** Opens the sign-in screen with Google and Apple set up on the API. */
async function openSignIn(setUp?: (client: FakeClient) => void) {
  const app = await renderApp("/sign-in", {
    setUp: (client) => {
      client.answer("/v1/config", () =>
        ok(200, {
          beta: false,
          paused: [],
          maxSeats: 8,
          freeCancellationMinutes: 15,
          maxMoveMinutes: 120,
          reliabilityMonths: 12,
          signInProviders: ["google", "apple"],
        }),
      );
      client.answer("/v1/auth/phone/start", () => ok(202, { resendAfterSeconds: 30 }));
      setUp?.(client);
    },
  });
  expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeVisible();
  return app;
}

const continueWith = async (name: "Google" | "Apple") => {
  await fireEvent.press(screen.getByRole("button", { name: `Continue with ${name}` }));
};

/** Gives the phone number and the code at the phone step. */
async function addPhoneNumber(code = "123456") {
  await fireEvent.changeText(screen.getByLabelText("Mobile number"), "690 0000");
  await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
  await fireEvent.changeText(await screen.findByLabelText("6-digit code"), code);
}

const inUseRetry =
  "This Google account is used by another PuffinRide account. Try again to go on with your phone number alone.";

const verifyBodies = (app: { client: FakeClient }) =>
  app.client.calls
    .filter((call) => call.path === "/v1/auth/phone/verify")
    .map((call) => call.input["body"] as Record<string, unknown>);

describe("Continue with Google or Apple (spec 19)", () => {
  it("shows the buttons the API has set up, above the phone number", async () => {
    await openSignIn();
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeVisible();
    expect(screen.getByText("or with your phone number")).toBeVisible();
    expect(screen.getByLabelText("Mobile number")).toBeVisible();
  });

  it("shows no buttons while none is set up", async () => {
    await renderApp("/sign-in");
    expect(
      await screen.findByRole("header", { name: "Sign in or create an account" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByText("or with your phone number")).toBeNull();
  });

  it("signs a member in with no code, with the secret the start was made from", async () => {
    const app = await openSignIn((client) => {
      client.answer("/v1/auth/oauth/finish", () =>
        ok(200, { status: "signedIn", ...tokens(1), user: completeMe, isNewUser: false }),
      );
      client.answer("/v1/me", () => ok(200, completeMe));
    });
    windowReturnsTo(back(`ticket=${ticket}`));
    await continueWith("Google");

    expect(await screen.findByRole("tab", { name: "Find" })).toBeVisible();
    expect(app.store.value).toBe("sr_rt_refresh-1");
    const startUrl = new URL(openAuthSessionAsync.mock.lastCall?.[0] ?? "");
    expect(startUrl.origin + startUrl.pathname).toBe(
      "http://localhost:3000/v1/auth/oauth/google/start",
    );
    expect(startUrl.searchParams.get("returnUrl")).toBe("shareride://sign-in/return");
    expect(openAuthSessionAsync.mock.lastCall?.[1]).toBe("shareride://sign-in/return");
    const finish = app.client.calls.find((call) => call.path === "/v1/auth/oauth/finish");
    const body = finish?.input["body"] as { ticket: string; verifier: string; device: unknown };
    expect(body.ticket).toBe(ticket);
    expect(body.device).toEqual({ platform: "ios", appVersion: "0.1.0" });
    expect(startUrl.searchParams.get("challenge")).toBe(
      createHash("sha256").update(body.verifier).digest("base64url"),
    );
  });

  it("asks a newcomer for a phone number, then fills in the first name", async () => {
    const app = await openSignIn((client) => {
      client.answer("/v1/auth/oauth/finish", () =>
        ok(200, phoneNeeded("google", "anna@example.com")),
      );
      client.answer("/v1/auth/phone/verify", () =>
        ok(200, {
          ...tokens(1),
          user: testMe,
          isNewUser: true,
          providerLink: { provider: "google", outcome: "created", email: "anna@example.com" },
          suggestedFirstName: "Anna",
        }),
      );
    });
    windowReturnsTo(back(`ticket=${ticket}`));
    await continueWith("Google");

    expect(await screen.findByRole("header", { name: "Add your phone number" })).toBeVisible();
    expect(
      screen.getByText(
        "You signed in with Google as anna@example.com. We text you a code once, so the people you ride with can reach you. Next time Google is enough.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Step 1 of 3")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();

    await addPhoneNumber();
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(verifyBodies(app)[0]).toMatchObject({ code: "123456", pendingSignIn });
    expect(screen.getByLabelText("First name")).toHaveDisplayValue("Anna");
    // A new account is news enough: no notice about the link.
    expect(screen.queryByText(/is now linked/)).toBeNull();
  });

  it("says Apple confirmed it's you when Apple hid the email", async () => {
    await openSignIn((client) => {
      client.answer("/v1/auth/oauth/finish", () => ok(200, phoneNeeded("apple", null)));
    });
    windowReturnsTo(back(`ticket=${ticket}`));
    await continueWith("Apple");
    expect(
      await screen.findByText(
        "Apple confirmed it's you. We text you a code once, so the people you ride with can reach you. Next time Apple is enough.",
      ),
    ).toBeVisible();
  });

  it("tells a member the phone step linked Google, until they close it", async () => {
    await openSignIn((client) => {
      client.answer("/v1/auth/oauth/finish", () =>
        ok(200, phoneNeeded("google", "anna@example.com")),
      );
      client.answer("/v1/auth/phone/verify", () =>
        ok(200, {
          ...tokens(1),
          user: completeMe,
          isNewUser: false,
          providerLink: { provider: "google", outcome: "linked", email: "anna@example.com" },
        }),
      );
      client.answer("/v1/me", () => ok(200, completeMe));
    });
    windowReturnsTo(back(`ticket=${ticket}`));
    await continueWith("Google");
    await screen.findByRole("header", { name: "Add your phone number" });
    await addPhoneNumber();

    const linked = "Google is now linked to your account. Next time you can continue with Google.";
    expect(await screen.findByText(linked)).toBeVisible();
    expect(await screen.findByRole("tab", { name: "Find" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Close the message" }));
    expect(screen.queryByText(linked)).toBeNull();
  });

  it("says when another Google account took the old one's place", async () => {
    await openSignIn((client) => {
      client.answer("/v1/auth/oauth/finish", () =>
        ok(200, phoneNeeded("google", "ana@example.com")),
      );
      client.answer("/v1/auth/phone/verify", () =>
        ok(200, {
          ...tokens(1),
          user: completeMe,
          isNewUser: false,
          providerLink: { provider: "google", outcome: "replaced", email: "ana@example.com" },
        }),
      );
      client.answer("/v1/me", () => ok(200, completeMe));
    });
    windowReturnsTo(back(`ticket=${ticket}`));
    await continueWith("Google");
    await screen.findByRole("header", { name: "Add your phone number" });
    await addPhoneNumber();
    expect(
      await screen.findByText("Your Google account on PuffinRide is now ana@example.com."),
    ).toBeVisible();
  });

  it("changes nothing when the person closes the window", async () => {
    const app = await openSignIn();
    windowReturnsTo(null);
    await continueWith("Google");
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeVisible();
    expect(screen.queryByTestId("notice")).toBeNull();
    expect(app.client.calls.some((call) => call.path === "/v1/auth/oauth/finish")).toBe(false);
    windowReturnsTo(back("error=cancelled"));
    await continueWith("Apple");
    expect(screen.queryByTestId("notice")).toBeNull();
  });

  it("says when the sign-in didn't work, or took too long", async () => {
    await openSignIn((client) => {
      client.answer("/v1/auth/oauth/finish", () => failure(400, "ticket_invalid"));
    });
    windowReturnsTo(back("error=failed"));
    await continueWith("Google");
    expect(
      await screen.findByText("Google sign-in didn't work. Try again, or use your phone number."),
    ).toBeVisible();

    windowReturnsTo(back("error=expired"));
    await continueWith("Apple");
    expect(await screen.findByText("That took too long. Continue with Apple again.")).toBeVisible();

    // A ticket the API no longer takes reads the same as a failed window.
    windowReturnsTo(back(`ticket=${ticket}`));
    await continueWith("Google");
    expect(
      await screen.findByText("Google sign-in didn't work. Try again, or use your phone number."),
    ).toBeVisible();
  });

  it("makes a new secret for each try", async () => {
    const app = await openSignIn((client) => {
      client.answer("/v1/auth/oauth/finish", () => failure(400, "ticket_invalid"));
    });
    windowReturnsTo(back(`ticket=${ticket}`));
    await continueWith("Google");
    await screen.findByText("Google sign-in didn't work. Try again, or use your phone number.");
    await continueWith("Google");
    await screen.findByText("Google sign-in didn't work. Try again, or use your phone number.");
    const verifiers = app.client.calls
      .filter((call) => call.path === "/v1/auth/oauth/finish")
      .map((call) => (call.input["body"] as { verifier: string }).verifier);
    expect(verifiers).toHaveLength(2);
    expect(verifiers[0]).not.toBe(verifiers[1]);
  });

  it("goes back to step 1 when the waiting sign-in took longer than 30 minutes", async () => {
    await openSignIn((client) => {
      client.answer("/v1/auth/oauth/finish", () =>
        ok(200, phoneNeeded("google", "anna@example.com")),
      );
      client.answer("/v1/auth/phone/verify", () => failure(400, "provider_expired"));
    });
    windowReturnsTo(back(`ticket=${ticket}`));
    await continueWith("Google");
    await screen.findByRole("header", { name: "Add your phone number" });
    await addPhoneNumber();

    expect(
      await screen.findByText("That took too long. Continue with Google again."),
    ).toBeVisible();
    expect(screen.getByRole("header", { name: "Sign in or create an account" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  });

  it("makes the account with the number alone when another account has the Google one", async () => {
    const app = await openSignIn((client) => {
      client.answer("/v1/auth/oauth/finish", () =>
        ok(200, phoneNeeded("google", "anna@example.com")),
      );
      client.answer("/v1/auth/phone/verify", (input) =>
        (input["body"] as { pendingSignIn?: string }).pendingSignIn === undefined
          ? ok(200, { ...tokens(1), user: testMe, isNewUser: true })
          : failure(409, "provider_in_use"),
      );
    });
    windowReturnsTo(back(`ticket=${ticket}`));
    await continueWith("Google");
    await screen.findByRole("header", { name: "Add your phone number" });
    await addPhoneNumber();

    expect(await screen.findByText(inUseRetry)).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "123456");
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(verifyBodies(app).map((body) => body["pendingSignIn"])).toEqual([
      pendingSignIn,
      undefined,
    ]);
  });

  it("goes back to the choice from the phone step", async () => {
    await openSignIn((client) => {
      client.answer("/v1/auth/oauth/finish", () =>
        ok(200, phoneNeeded("google", "anna@example.com")),
      );
    });
    windowReturnsTo(back(`ticket=${ticket}`));
    await continueWith("Google");
    await screen.findByRole("header", { name: "Add your phone number" });
    await fireEvent.press(screen.getByRole("button", { name: "Sign in another way" }));
    expect(
      await screen.findByRole("header", { name: "Sign in or create an account" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeVisible();
  });

  it("sends no code from the keyboard while the window is open", async () => {
    const app = await openSignIn();
    openAuthSessionAsync.mockImplementationOnce(() => new Promise(() => undefined));
    await continueWith("Google");
    await fireEvent.changeText(screen.getByLabelText("Mobile number"), "690 0000");
    await fireEvent(screen.getByLabelText("Mobile number"), "submitEditing");
    expect(app.client.calls.filter((call) => call.path === "/v1/auth/phone/start")).toEqual([]);
  });

  it("says sign-in didn't work when no secret can be made", async () => {
    digest.mockRejectedValueOnce(new Error("No secure random numbers here"));
    await openSignIn();
    const opened = openAuthSessionAsync.mock.calls.length;
    await continueWith("Google");
    expect(
      await screen.findByText("Google sign-in didn't work. Try again, or use your phone number."),
    ).toBeVisible();
    expect(openAuthSessionAsync.mock.calls).toHaveLength(opened);
  });

  describe("at the invite step", () => {
    /** Asks for an invite code first; then answers with the Google account as `refusal`. */
    async function reachInviteStep(refusal: string) {
      const app = await openSignIn((client) => {
        client.answer("/v1/auth/oauth/finish", () =>
          ok(200, phoneNeeded("google", "anna@example.com")),
        );
        client.answer("/v1/auth/phone/verify", (input) => {
          const body = input["body"] as { pendingSignIn?: string; inviteCode?: string };
          if (body.inviteCode === undefined) return failure(403, "invite_required");
          if (body.pendingSignIn !== undefined) {
            return failure(refusal === "provider_in_use" ? 409 : 400, refusal);
          }
          return ok(200, { ...tokens(1), user: testMe, isNewUser: true });
        });
      });
      windowReturnsTo(back(`ticket=${ticket}`));
      await continueWith("Google");
      await screen.findByRole("header", { name: "Add your phone number" });
      await addPhoneNumber();
      expect(await screen.findByRole("header", { name: "Enter your invite code" })).toBeVisible();
      await fireEvent.changeText(screen.getByLabelText("Invite code"), "abcd-2345");
      await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
      return app;
    }

    it("drops the Google account another account has, then makes the account", async () => {
      const app = await reachInviteStep("provider_in_use");
      expect(await screen.findByText(inUseRetry)).toBeVisible();
      await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
      expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
      expect(verifyBodies(app).map((body) => body["pendingSignIn"])).toEqual([
        pendingSignIn,
        pendingSignIn,
        undefined,
      ]);
    });

    it("goes back to step 1 when it came too late for the Google account", async () => {
      await reachInviteStep("provider_expired");
      expect(
        await screen.findByText("That took too long. Continue with Google again."),
      ).toBeVisible();
      expect(screen.getByRole("header", { name: "Sign in or create an account" })).toBeVisible();
    });
  });

  it("closes the return page on a phone, back to signing in", async () => {
    await renderApp("/sign-in/return");
    expect(
      await screen.findByRole("header", { name: "Sign in or create an account" }),
    ).toBeVisible();
  });
});
