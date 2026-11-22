import { fireEvent, screen } from "expo-router/testing-library";
import type { SignInMethod } from "@shareride/contracts";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { windowReturnsTo } from "@/testing/web-browser";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/sign-in/return-address", () => ({
  providerReturnUrl: () => "shareride://sign-in/return",
}));

// Settings, Sign-in methods (spec 19, 3.4).

const ticket = `sr_pt_${"t".repeat(43)}`;
const pendingSignIn = `sr_ps_${"p".repeat(43)}`;
const googleMethod: SignInMethod = {
  provider: "google",
  email: "anna@example.com",
  linkedAt: "2026-11-22T12:00:00.000Z",
};

const withProviders = (client: FakeClient) => {
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
};

/** Opens Sign-in methods with these linked; the list answers as it is kept. */
async function openMethods(linked: SignInMethod[], setUp?: (client: FakeClient) => void) {
  const methods = [...linked];
  const app = await renderApp("/settings/sign-in-methods", {
    me: completeMe,
    setUp: (client) => {
      withProviders(client);
      client.answer("/v1/me/sign-in-methods", () => ok(200, { methods: [...methods] }), "get");
      client.answer("/v1/me/sign-in-methods/{provider}", (input) => {
        const { provider } = input["params"] as { provider: string };
        methods.splice(
          methods.findIndex((method) => method.provider === provider),
          1,
        );
        return ok(204);
      });
      client.answer("/v1/me/confirm-code", () => ok(202, { resendAfterSeconds: 30 }));
      setUp?.(client);
    },
  });
  expect(await screen.findByRole("header", { name: "Sign-in methods" })).toBeVisible();
  return { app, methods };
}

const callsTo = (app: { client: FakeClient }, path: string) =>
  app.client.calls.filter((call) => call.path === path);

describe("Sign-in methods in Settings", () => {
  it("opens from Settings, Your account, when Google or Apple is set up", async () => {
    await renderApp("/settings", {
      me: completeMe,
      setUp: (client) => {
        withProviders(client);
        client.answer("/v1/me/sign-in-methods", () => ok(200, { methods: [] }), "get");
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Sign-in methods" }));
    expect(await screen.findByRole("header", { name: "Sign-in methods" })).toBeVisible();
  });

  it("has no row in Settings while neither is set up", async () => {
    await renderApp("/settings", { me: completeMe });
    expect(await screen.findByRole("header", { name: "Settings" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Sign-in methods" })).toBeNull();
  });

  it("lists the phone number, a linked Google account and Apple not linked", async () => {
    await openMethods([googleMethod]);
    expect(await screen.findByText("anna@example.com")).toBeVisible();
    expect(screen.getByText("+354 690 0000")).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Google" })).toBeVisible();
    expect(screen.getByText("Not linked")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Apple" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add Google" })).toBeNull();
  });

  it("says Apple hid the email when it is a relay address", async () => {
    await openMethods([
      {
        provider: "apple",
        email: "abc123@privaterelay.appleid.com",
        linkedAt: "2026-11-22T12:00:00.000Z",
      },
    ]);
    expect(await screen.findByText("Email hidden by Apple")).toBeVisible();
    expect(screen.queryByText("abc123@privaterelay.appleid.com")).toBeNull();
  });

  it("removes Google after asking", async () => {
    const { app } = await openMethods([googleMethod]);
    await fireEvent.press(await screen.findByRole("button", { name: "Remove Google" }));
    expect(
      screen.getByText("Remove Google? You can still sign in with your phone number."),
    ).toBeVisible();
    expect(callsTo(app, "/v1/me/sign-in-methods/{provider}")).toEqual([]);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/You can still sign in/)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Remove Google" }));
    const confirm = screen.getAllByRole("button", { name: "Remove Google" }).at(-1);
    if (confirm === undefined) throw new Error("No confirm button");
    await fireEvent.press(confirm);
    expect(await screen.findByText("Google is no longer linked to your account.")).toBeVisible();
    expect(callsTo(app, "/v1/me/sign-in-methods/{provider}")[0]?.input).toMatchObject({
      params: { provider: "google" },
    });
    expect(await screen.findByRole("button", { name: "Add Google" })).toBeVisible();
  });

  it("adds Apple with the window, then a code to the account's number", async () => {
    const { app, methods } = await openMethods([], (client) => {
      client.answer("/v1/me/sign-in-methods/prepare", () =>
        ok(200, {
          pendingSignIn,
          provider: "apple",
          email: null,
          expiresAt: "2026-11-22T12:30:00.000Z",
        }),
      );
      client.answer(
        "/v1/me/sign-in-methods",
        () => {
          const added = { provider: "apple", email: null, linkedAt: "2026-11-22T12:01:00.000Z" };
          methods.push(added as SignInMethod);
          return ok(201, added);
        },
        "post",
      );
    });
    windowReturnsTo(`shareride://sign-in/return#ticket=${ticket}`);
    const mesBefore = callsTo(app, "/v1/me").length;
    await fireEvent.press(await screen.findByRole("button", { name: "Add Apple" }));

    expect(await screen.findByText("To add Apple, enter the code we text you.")).toBeVisible();
    const prepare = callsTo(app, "/v1/me/sign-in-methods/prepare")[0]?.input["body"] as {
      ticket: string;
      verifier: string;
    };
    expect(prepare.ticket).toBe(ticket);
    expect(prepare.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // No link is made before the code (R19.3).
    expect(
      app.client.calls.filter(
        (call) => call.path === "/v1/me/sign-in-methods" && call.input["body"] !== undefined,
      ),
    ).toEqual([]);

    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
    expect(
      await screen.findByText(
        "Apple is now linked to your account. Next time you can continue with Apple.",
      ),
    ).toBeVisible();
    expect(
      app.client.calls.find(
        (call) => call.path === "/v1/me/sign-in-methods" && call.input["body"] !== undefined,
      )?.input["body"],
    ).toEqual({ pendingSignIn, code: "123456" });
    expect(await screen.findByRole("button", { name: "Remove Apple" })).toBeVisible();
    expect(screen.getByText("Email hidden by Apple")).toBeVisible();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
    // Linking may have given the account its email: the account is read again.
    expect(callsTo(app, "/v1/me").length).toBeGreaterThan(mesBefore);
  });

  it("says when another PuffinRide account has that Google account", async () => {
    const { app } = await openMethods([], (client) => {
      client.answer("/v1/me/sign-in-methods/prepare", () => failure(409, "provider_in_use"));
    });
    windowReturnsTo(`shareride://sign-in/return#ticket=${ticket}`);
    await fireEvent.press(await screen.findByRole("button", { name: "Add Google" }));
    expect(
      await screen.findByText("This Google account is used by another PuffinRide account."),
    ).toBeVisible();
    // No code is sent for an account that cannot be added.
    expect(callsTo(app, "/v1/me/confirm-code")).toEqual([]);
  });

  it("changes nothing when the window is closed", async () => {
    const { app } = await openMethods([]);
    windowReturnsTo(null);
    await fireEvent.press(await screen.findByRole("button", { name: "Add Google" }));
    expect(await screen.findByRole("button", { name: "Add Google" })).toBeVisible();
    expect(callsTo(app, "/v1/me/sign-in-methods/prepare")).toEqual([]);
    expect(screen.queryByTestId("notice")).toBeNull();
  });

  it("asks to add it again when the code came after 30 minutes", async () => {
    await openMethods([], (client) => {
      client.answer("/v1/me/sign-in-methods/prepare", () =>
        ok(200, {
          pendingSignIn,
          provider: "google",
          email: "anna@example.com",
          expiresAt: "2026-11-22T12:30:00.000Z",
        }),
      );
      client.answer("/v1/me/sign-in-methods", () => failure(400, "provider_expired"), "post");
    });
    windowReturnsTo(`shareride://sign-in/return#ticket=${ticket}`);
    await fireEvent.press(await screen.findByRole("button", { name: "Add Google" }));
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
    expect(await screen.findByText("That took too long. Add Google again.")).toBeVisible();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
    expect(screen.getByRole("button", { name: "Add Google" })).toBeVisible();
  });

  /** Google checked and waiting for the code, with `answer` for the code. */
  async function addGoogleWith(answer: () => ReturnType<typeof ok> | ReturnType<typeof failure>) {
    const opened = await openMethods([], (client) => {
      client.answer("/v1/me/sign-in-methods/prepare", () =>
        ok(200, {
          pendingSignIn,
          provider: "google",
          email: "anna@example.com",
          expiresAt: "2026-11-22T12:30:00.000Z",
        }),
      );
      client.answer("/v1/me/sign-in-methods", answer, "post");
    });
    windowReturnsTo(`shareride://sign-in/return#ticket=${ticket}`);
    await fireEvent.press(await screen.findByRole("button", { name: "Add Google" }));
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
    return opened;
  }

  it("keeps the form open when the code is wrong", async () => {
    await addGoogleWith(() => failure(400, "code_invalid"));
    expect(await screen.findByLabelText("6-digit code")).toBeVisible();
    // The form's own button; Google and Apple both stay not linked.
    expect(screen.getByRole("button", { name: "Add Google" })).toBeVisible();
    expect(screen.getAllByText("Not linked")).toHaveLength(2);
  });

  it("closes the form when another account took the Google account meanwhile", async () => {
    await addGoogleWith(() => failure(409, "provider_in_use"));
    expect(
      await screen.findByText("This Google account is used by another PuffinRide account."),
    ).toBeVisible();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });

  it("says so when another device linked it first", async () => {
    await openMethods([], (client) => {
      client.answer("/v1/me/sign-in-methods/prepare", () =>
        failure(409, "provider_already_linked"),
      );
    });
    windowReturnsTo(`shareride://sign-in/return#ticket=${ticket}`);
    await fireEvent.press(await screen.findByRole("button", { name: "Add Google" }));
    expect(await screen.findByText("Google is already linked to your account.")).toBeVisible();
  });

  it("offers only Remove for one linked from before that is no longer set up", async () => {
    await openMethods([googleMethod], (client) => {
      client.answer("/v1/config", () =>
        ok(200, {
          beta: false,
          paused: [],
          maxSeats: 8,
          freeCancellationMinutes: 15,
          maxMoveMinutes: 120,
          reliabilityMonths: 12,
          signInProviders: ["apple"],
        }),
      );
    });
    expect(await screen.findByRole("button", { name: "Remove Google" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add Google" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add Apple" })).toBeVisible();
  });

  it("keeps the list when it cannot be loaded again after a change", async () => {
    let lists = 0;
    await openMethods([googleMethod], (client) => {
      client.answer(
        "/v1/me/sign-in-methods",
        () => {
          lists += 1;
          return lists === 1
            ? ok(200, { methods: [googleMethod] })
            : failure(503, "service_unavailable");
        },
        "get",
      );
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Remove Google" }));
    const confirm = screen.getAllByRole("button", { name: "Remove Google" }).at(-1);
    if (confirm === undefined) throw new Error("No confirm button");
    await fireEvent.press(confirm);
    expect(await screen.findByText("Google is no longer linked to your account.")).toBeVisible();
    expect(await screen.findByRole("button", { name: "Add Google" })).toBeVisible();
    expect(lists).toBe(2);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
