import { fireEvent, screen } from "expo-router/testing-library";
import type { Me } from "@shareride/contracts";
import { failure, ok, tokens, type FakeClient } from "@/testing/fake-client";
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
// The app's own storage, in memory: the screen kept through signing in waits here.
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

// Members' passwords in the app (spec 27, 3.1, 3.2, 3.4, 3.5 and 3.7).

const anna: Me = { ...completeMe, email: "anna@example.com" };
const strong = "puffins fly north in May";
const callsTo = (client: FakeClient, path: string) =>
  client.calls.filter((call) => call.path === path);

/** Opens step 1 of signing in, signed out. */
async function openSignIn(setUp?: (client: FakeClient) => void) {
  const app = await renderApp("/sign-in", {
    setUp: (client) => {
      client.answer("/v1/auth/email/start", () => ok(202, { resendAfterSeconds: 30 }));
      setUp?.(client);
    },
  });
  expect(await screen.findByRole("header", { name: "Sign in or create an account" })).toBeVisible();
  return app;
}

describe("Signing in with a password (spec 27, 3.1 and 3.2)", () => {
  it("reads Send code until a password is typed, then Sign in, and signs in with it", async () => {
    const app = await openSignIn((client) => {
      client.answer("/v1/auth/password", () =>
        ok(200, { status: "signedIn", ...tokens(1), user: anna, isNewUser: false }),
      );
    });
    expect(
      screen.getByText("Only if you've set one. Otherwise we email you a code."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Send code" })).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText("Email"), " Anna@Example.com ");
    await fireEvent.changeText(screen.getByLabelText("Password"), strong);
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("tab", { name: "Find" })).toBeVisible();
    expect(app.store.value).toBe("sr_rt_refresh-1");
    expect(callsTo(app.client, "/v1/auth/password").map((call) => call.input)).toEqual([
      {
        body: {
          email: "anna@example.com",
          password: strong,
          device: { platform: "ios", appVersion: "0.1.0" },
        },
      },
    ]);
    expect(callsTo(app.client, "/v1/auth/email/start")).toHaveLength(0);
  });

  it("hides the password until Show is pressed, and lets the browser fill both fields", async () => {
    await openSignIn();
    const email = screen.getByLabelText("Email");
    expect(email.props.autoComplete).toBe("username");
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText("Password").props.autoComplete).toBe("current-password");
    await fireEvent.press(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
  });

  it("gives one answer for a wrong email or password, and the wait after too many tries", async () => {
    const app = await openSignIn((client) => {
      client.answer("/v1/auth/password", () => failure(400, "credentials_invalid"));
    });
    await fireEvent.changeText(screen.getByLabelText("Email"), "anna@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "not the password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByText(
        "Wrong email or password. Check them, or leave the password empty and we'll email you a code.",
      ),
    ).toBeVisible();

    app.client.answer("/v1/auth/password", () =>
      failure(429, "rate_limited", { retryAfterSeconds: 2501 }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByText("Too many tries. Use the email code, or try again in 42 minutes."),
    ).toBeVisible();
  });

  it("checks the email before sending the password", async () => {
    const app = await openSignIn();
    await fireEvent.changeText(screen.getByLabelText("Email"), "anna at example");
    await fireEvent.changeText(screen.getByLabelText("Password"), strong);
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByText("Enter an email address, such as anna@example.com."),
    ).toBeVisible();
    expect(callsTo(app.client, "/v1/auth/password")).toHaveLength(0);
  });
});

describe("Forgot your password? (spec 27, 3.4)", () => {
  it("asks for the email first", async () => {
    const app = await openSignIn();
    await fireEvent.press(screen.getByRole("button", { name: "Forgot your password?" }));
    expect(await screen.findByText("Type your email, and we'll send you a code.")).toBeVisible();
    expect(callsTo(app.client, "/v1/auth/email/start")).toHaveLength(0);
  });

  it("sends the email code, then opens Choose a password once signed in", async () => {
    const app = await openSignIn((client) => {
      client.answer("/v1/auth/email/verify", () =>
        ok(200, { status: "signedIn", ...tokens(1), user: anna, isNewUser: false }),
      );
      client.answer("/v1/me/sign-in-methods", () => ok(200, { methods: [], password: null }));
    });
    await fireEvent.changeText(screen.getByLabelText("Email"), "anna@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "the one I forgot");
    await fireEvent.press(screen.getByRole("button", { name: "Forgot your password?" }));
    expect(await screen.findByText("We emailed a 6-digit code to anna@example.com.")).toBeVisible();
    expect(callsTo(app.client, "/v1/auth/password")).toHaveLength(0);
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "123456");

    expect(await screen.findByRole("header", { name: "Choose a password" })).toBeVisible();
    // Not now: on to the app.
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(await screen.findByRole("tab", { name: "Find" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Choose a password" })).toBeNull();
  });

  it("keeps nothing until the code is checked, so signing in another way opens no form", async () => {
    await openSignIn((client) => {
      client.answer("/v1/auth/password", () =>
        ok(200, { status: "signedIn", ...tokens(1), user: anna, isNewUser: false }),
      );
    });
    await fireEvent.changeText(screen.getByLabelText("Email"), "anna@example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Forgot your password?" }));
    expect(await screen.findByText("We emailed a 6-digit code to anna@example.com.")).toBeVisible();
    expect(mockStored.get("pending-link") ?? "").toBe("");
    // Remembered after all: back, and in with the password.
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await fireEvent.changeText(await screen.findByLabelText("Password"), strong);
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Choose a password" })).toBeNull();
  });

  it("opens the link from an email first, which was waiting before the code", async () => {
    await openSignIn((client) => {
      client.answer("/v1/auth/email/verify", () =>
        ok(200, { status: "signedIn", ...tokens(1), user: anna, isNewUser: false }),
      );
      client.answer("/v1/me/notices", () => ok(200, { notices: [] }), "get");
    });
    // On the test's clock, which renderApp sets.
    mockStored.set(
      "pending-link",
      JSON.stringify({ path: "/notices", keptAt: new Date().toISOString() }),
    );
    await fireEvent.changeText(screen.getByLabelText("Email"), "anna@example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Forgot your password?" }));
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
    expect(await screen.findByRole("header", { name: "Notices" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Choose a password" })).toBeNull();
  });
});

/** Opens Choose a password, signed in; the password route answers as `answer` says. */
async function openPassword(me: Me = anna, setUp?: (client: FakeClient) => void) {
  const app = await renderApp("/settings/password", {
    me,
    setUp: (client) => {
      client.answer("/v1/me/password", () => ok(200, { setAt: "2026-11-23T12:00:00.000Z" }));
      client.answer("/v1/me/confirm-code", () =>
        ok(202, { resendAfterSeconds: 30, channel: "email", sentTo: "a***@example.com" }),
      );
      setUp?.(client);
    },
  });
  expect(await screen.findByRole("header", { name: "Choose a password" })).toBeVisible();
  return app;
}

async function savePassword(password: string) {
  await fireEvent.changeText(screen.getByLabelText("New password"), password);
  await fireEvent.press(screen.getByRole("button", { name: "Save password" }));
}

describe("Choosing a password (spec 27, 3.5)", () => {
  it("saves one typed once, which the browser may make and keep", async () => {
    const app = await openPassword();
    expect(
      screen.getByText("At least 10 characters. A few words you'll remember work well."),
    ).toBeVisible();
    const field = screen.getByLabelText("New password");
    expect(field.props.autoComplete).toBe("new-password");
    expect(field.props.secureTextEntry).toBe(true);
    await savePassword(strong);
    expect(await screen.findByText("Your password is saved.")).toBeVisible();
    expect(callsTo(app.client, "/v1/me/password").map((call) => call.input["body"])).toEqual([
      { password: strong },
    ]);
    // Not kept on the screen once saved.
    expect(screen.queryByDisplayValue(strong)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("tab", { name: "Find" })).toBeVisible();
  });

  it("checks the length and the email first, and says when the API finds it too common", async () => {
    const app = await openPassword(anna, (client) => {
      client.answer("/v1/me/password", () => failure(400, "password_too_common"));
    });
    await savePassword("too short");
    expect(await screen.findByText("Use at least 10 characters.")).toBeVisible();
    await savePassword("x".repeat(129));
    expect(await screen.findByText("Use at most 128 characters.")).toBeVisible();
    await savePassword("ANNA@example.com");
    expect(await screen.findByText("Don't use your email as the password.")).toBeVisible();
    expect(callsTo(app.client, "/v1/me/password")).toHaveLength(0);
    await savePassword("qwertyuiop");
    expect(await screen.findByText("That password is too common. Add a few words.")).toBeVisible();
  });

  it("says when the account saved many new passwords this hour (R27.4)", async () => {
    await openPassword(anna, (client) => {
      client.answer("/v1/me/password", () =>
        failure(429, "rate_limited", { retryAfterSeconds: 42 * 60 }),
      );
    });
    await savePassword(strong);
    expect(
      await screen.findByText("That's a lot of new passwords. Try again in 42 minutes."),
    ).toBeVisible();
  });

  it("asks for a confirm code when the sign-in is over 10 minutes old (R27.5)", async () => {
    const app = await openPassword(anna, (client) => {
      client.answer("/v1/me/password", (input) =>
        (input["body"] as { code?: string }).code === undefined
          ? failure(403, "confirm_required")
          : ok(200, { setAt: "2026-11-23T12:00:00.000Z" }),
      );
    });
    await savePassword(strong);
    expect(
      await screen.findByText("To save your password, enter the code we send you."),
    ).toBeVisible();
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "654321");
    expect(await screen.findByText("Your password is saved.")).toBeVisible();
    expect(callsTo(app.client, "/v1/me/password").map((call) => call.input["body"])).toEqual([
      { password: strong },
      { password: strong, code: "654321" },
    ]);
  });

  it("asks for an email first, as it is the user name", async () => {
    await renderApp("/settings/password", { me: completeMe });
    expect(await screen.findByText("Add an email first. It's your user name.")).toBeVisible();
    expect(screen.queryByLabelText("New password")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Add an email" }));
    expect(await screen.findByRole("header", { name: "Your email" })).toBeVisible();
  });
});

describe("Sign in faster next time, after sign-up (spec 27, 3.7)", () => {
  const newAccount: Me = { ...anna, firstName: null, missingSteps: ["profile"] };

  async function finishSignUp() {
    const app = await renderApp("/", {
      me: newAccount,
      setUp: (client) => {
        client.answer("/v1/me", (input) => {
          const body = input["body"] as Partial<Me> | undefined;
          return ok(200, body === undefined ? newAccount : { ...anna, ...body });
        });
        client.answer("/v1/me/password", () => ok(200, { setAt: "2026-11-23T12:00:00.000Z" }));
      },
    });
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText("First name"), "Anna");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    return app;
  }

  it("offers a password once, and Not now goes on to Find", async () => {
    await finishSignUp();
    expect(await screen.findByRole("header", { name: "Sign in faster next time" })).toBeVisible();
    expect(screen.getByText("Your email code always works too.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Sign in faster next time" })).toBeNull();
    expect(mockStored.get("pending-link")).toBe("");
  });

  it("adds a password straight away", async () => {
    const app = await finishSignUp();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a password" }));
    expect(await screen.findByRole("header", { name: "Choose a password" })).toBeVisible();
    await savePassword(strong);
    expect(await screen.findByText("Your password is saved.")).toBeVisible();
    expect(callsTo(app.client, "/v1/me/password")).toHaveLength(1);
  });
});
