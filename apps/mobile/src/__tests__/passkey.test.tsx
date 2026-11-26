import { act, fireEvent, screen, waitFor } from "expo-router/testing-library";
import type { Me, MemberPasskey } from "@shareride/contracts";
import { failure, ok, tokens, type FakeClient } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { memberPasskeyRules } from "@shareride/domain";
import { router } from "expo-router";
import { openAuthSessionAsync } from "@/testing/web-browser";
import type * as PasskeyTypes from "@/sign-in/passkey-types";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
// This browser's own storage (spec 29, section 5).
const mockPreferences = new Map<string, string>();
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn((key: string) => Promise.resolve(mockPreferences.get(key) ?? null)),
  writePreference: jest.fn((key: string, value: string) => {
    mockPreferences.set(key, value);
    return Promise.resolve();
  }),
}));
const mockStored = new Map<string, string>();
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn((key: string) => Promise.resolve(mockStored.get(key) ?? null)),
  writeAppData: jest.fn((key: string, value: string) => {
    mockStored.set(key, value);
    return Promise.resolve();
  }),
}));
// The device's passkey sheet, stood in for: the website's only, in a test.
const mockDevice = {
  available: jest.fn(() => Promise.resolve(true)),
  create: jest.fn(),
  get: jest.fn(),
  autofillAvailable: jest.fn(() => Promise.resolve(false)),
  autofill: jest.fn(),
  cancel: jest.fn(),
  forget: jest.fn(() => Promise.resolve()),
};
jest.mock("@/sign-in/passkey", () => ({
  ...jest.requireActual<typeof PasskeyTypes>("@/sign-in/passkey-types"),
  devicePasskeys: mockDevice,
}));

// Face ID or fingerprint (spec 27, 3.1, 3.3, 3.6 and 3.7).

const anna: Me = { ...completeMe, email: "anna@example.com" };
const options = { challenge: "c".repeat(43), rpId: "puffinride.is" };
const assertion = {
  id: "credential-one",
  rawId: "credential-one",
  type: "public-key",
  response: { clientDataJSON: "data", authenticatorData: "auth", signature: "sig" },
  clientExtensionResults: {},
};
const registration = {
  id: "credential-new",
  rawId: "credential-new",
  type: "public-key",
  response: { clientDataJSON: "data", attestationObject: "attestation" },
  clientExtensionResults: {},
};
const named = (name: string) => Object.assign(new Error(name), { name });

const iPhone: MemberPasskey = {
  id: "0190a1d6-0000-7000-8000-0000000000a1",
  credentialId: "credential-of-the-iphone",
  browser: "Safari",
  system: "iPhone",
  createdAt: "2026-11-21T10:00:00.000Z",
  lastUsedAt: "2026-11-22T08:30:00.000Z",
};
const mac: MemberPasskey = {
  id: "0190a1d6-0000-7000-8000-0000000000a2",
  credentialId: "credential-of-the-mac",
  browser: "Chrome",
  system: "Mac",
  createdAt: "2026-11-23T12:00:00.000Z",
  lastUsedAt: null,
};

const callsTo = (client: FakeClient, path: string) =>
  client.calls.filter((call) => call.path === path);

function withPasskeys(client: FakeClient, passkeySignIn = true) {
  client.answer("/v1/config", () =>
    ok(200, {
      beta: false,
      paused: [],
      maxSeats: 8,
      freeCancellationMinutes: 15,
      maxMoveMinutes: 120,
      reliabilityMonths: 12,
      signInProviders: [],
      emailSignIn: true,
      passkeySignIn,
    }),
  );
}

beforeEach(() => {
  mockStored.clear();
  mockPreferences.clear();
  mockDevice.available.mockReset().mockReturnValue(Promise.resolve(true));
  mockDevice.create.mockReset().mockReturnValue(Promise.resolve(registration));
  mockDevice.get.mockReset().mockReturnValue(Promise.resolve(assertion));
  mockDevice.autofillAvailable.mockReset().mockReturnValue(Promise.resolve(false));
  mockDevice.autofill.mockReset();
  mockDevice.cancel.mockReset();
  mockDevice.forget.mockReset().mockReturnValue(Promise.resolve());
});

async function openSignIn(setUp?: (client: FakeClient) => void, passkeySignIn = true) {
  const app = await renderApp("/sign-in", {
    setUp: (client) => {
      withPasskeys(client, passkeySignIn);
      client.answer("/v1/auth/passkey/options", () => ok(200, { options }));
      setUp?.(client);
    },
  });
  expect(await screen.findByRole("header", { name: "Sign in or create an account" })).toBeVisible();
  return app;
}

describe("Signing in with Face ID or fingerprint (spec 27, 3.1 and 3.3)", () => {
  it("is offered where the server has it and the device has its own lock", async () => {
    await openSignIn();
    expect(await screen.findByRole("button", { name: "Face ID or fingerprint" })).toBeVisible();
    expect(screen.getByText("or with your email")).toBeVisible();
  });

  it("is not offered on a device without its own lock", async () => {
    mockDevice.available.mockReturnValue(Promise.resolve(false));
    await openSignIn();
    expect(screen.queryByRole("button", { name: "Face ID or fingerprint" })).toBeNull();
  });

  it("is not offered by a server without it", async () => {
    await openSignIn(undefined, false);
    expect(screen.queryByRole("button", { name: "Face ID or fingerprint" })).toBeNull();
  });

  it("signs in with the device's answer, with no email typed", async () => {
    const app = await openSignIn((client) => {
      client.answer("/v1/auth/passkey", () =>
        ok(200, { status: "signedIn", ...tokens(1), user: anna, isNewUser: false }),
      );
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Face ID or fingerprint" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(mockDevice.get).toHaveBeenCalledWith(options);
    expect(callsTo(app.client, "/v1/auth/passkey").map((call) => call.input["body"])).toEqual([
      { credential: assertion, device: expect.any(Object) as unknown },
    ]);
  });

  it("changes nothing when the person closes the device's sheet", async () => {
    mockDevice.get.mockReturnValue(Promise.reject(named("NotAllowedError")));
    const app = await openSignIn();
    await fireEvent.press(await screen.findByRole("button", { name: "Face ID or fingerprint" }));
    expect(
      await screen.findByRole("button", { name: "Face ID or fingerprint", disabled: false }),
    ).toBeVisible();
    expect(callsTo(app.client, "/v1/auth/passkey")).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses the same options on the next tap after the sheet was closed", async () => {
    mockDevice.get.mockReturnValueOnce(Promise.reject(named("NotAllowedError")));
    const app = await openSignIn((client) => {
      client.answer("/v1/auth/passkey", () =>
        ok(200, { status: "signedIn", ...tokens(1), user: anna, isNewUser: false }),
      );
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Face ID or fingerprint" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Face ID or fingerprint", disabled: false }),
    );
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(callsTo(app.client, "/v1/auth/passkey/options")).toHaveLength(1);
    expect(mockDevice.get).toHaveBeenCalledTimes(2);
  });

  it("says when the answer came too late", async () => {
    await openSignIn((client) => {
      client.answer("/v1/auth/passkey", () => failure(400, "passkey_expired"));
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Face ID or fingerprint" }));
    expect(await screen.findByText("That took too long. Try again.")).toBeVisible();
  });

  it("says when the device's passkey is not one of a member's", async () => {
    await openSignIn((client) => {
      client.answer("/v1/auth/passkey", () => failure(400, "passkey_invalid"));
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Face ID or fingerprint" }));
    expect(
      await screen.findByText(
        "This device's sign-in isn't set up for your PuffinRide account. Use your email, then set it up again in Settings.",
      ),
    ).toBeVisible();
  });
});

/**
 * The browser's quiet request, stood in for: each waits until a passkey is
 * picked from the email field's suggestions, or until it is cancelled.
 */
function quietRequests() {
  const waiting: { resolve: (answer: typeof assertion) => void; reject: (e: Error) => void }[] = [];
  const abortAll = () => {
    for (const request of waiting.splice(0)) request.reject(named("AbortError"));
  };
  // As the browser does, a new request ends the one before.
  mockDevice.autofill.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        abortAll();
        waiting.push({ resolve, reject });
      }),
  );
  mockDevice.cancel.mockImplementation(abortAll);
  return {
    waiting,
    pick: (answer = assertion) => {
      waiting.shift()?.resolve(answer);
    },
    /** The browser ends it, as when the person cancels Face ID after picking the passkey. */
    end: () => {
      waiting.shift()?.reject(named("NotAllowedError"));
    },
  };
}

const keepOptionsMs = (memberPasskeyRules.challengeSeconds - 30) * 1000;

const signedInAsAnna = (client: FakeClient) => {
  client.answer("/v1/auth/passkey", () =>
    ok(200, { status: "signedIn", ...tokens(1), user: anna, isNewUser: false }),
  );
};
const notSetUp =
  "This device's sign-in isn't set up for your PuffinRide account. Use your email, then set it up again in Settings.";

describe("Face ID in the email field (spec 29, 3.1)", () => {
  beforeEach(() => {
    mockDevice.autofillAvailable.mockReturnValue(Promise.resolve(true));
  });

  it("waits quietly for a passkey from the email field where the browser offers it", async () => {
    const quiet = quietRequests();
    await openSignIn();
    await waitFor(() => {
      expect(quiet.waiting).toHaveLength(1);
    });
    expect(mockDevice.autofill).toHaveBeenCalledWith(options);
    expect(mockDevice.get).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not wait where the browser cannot offer passkeys in the field", async () => {
    mockDevice.autofillAvailable.mockReturnValue(Promise.resolve(false));
    const app = await openSignIn();
    expect(await screen.findByRole("button", { name: "Face ID or fingerprint" })).toBeVisible();
    expect(mockDevice.autofill).not.toHaveBeenCalled();
    expect(callsTo(app.client, "/v1/auth/passkey/options")).toHaveLength(0);
  });

  it("does not wait with a server that has no passkeys", async () => {
    const app = await openSignIn(undefined, false);
    expect(await screen.findByLabelText("Email")).toBeVisible();
    expect(mockDevice.autofill).not.toHaveBeenCalled();
    expect(callsTo(app.client, "/v1/auth/passkey/options")).toHaveLength(0);
  });

  it("signs in with a passkey picked from the email field, with no tap", async () => {
    const quiet = quietRequests();
    const app = await openSignIn(signedInAsAnna);
    await waitFor(() => {
      expect(quiet.waiting).toHaveLength(1);
    });
    await act(() => {
      quiet.pick();
    });
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(callsTo(app.client, "/v1/auth/passkey").map((call) => call.input["body"])).toEqual([
      { credential: assertion, device: expect.any(Object) as unknown },
    ]);
    expect(mockDevice.get).not.toHaveBeenCalled();
  });

  it("stops waiting while the button's sheet is open, and waits again after", async () => {
    const quiet = quietRequests();
    mockDevice.get.mockReturnValue(Promise.reject(named("NotAllowedError")));
    const app = await openSignIn();
    await waitFor(() => {
      expect(quiet.waiting).toHaveLength(1);
    });
    await fireEvent.press(screen.getByRole("button", { name: "Face ID or fingerprint" }));
    expect(
      await screen.findByRole("button", { name: "Face ID or fingerprint", disabled: false }),
    ).toBeVisible();
    expect(mockDevice.get).toHaveBeenCalledTimes(1);
    const [cancelled] = mockDevice.cancel.mock.invocationCallOrder;
    const [sheet] = mockDevice.get.mock.invocationCallOrder;
    expect(cancelled).toBeLessThan(sheet ?? 0);
    await waitFor(() => {
      expect(quiet.waiting).toHaveLength(1);
    });
    expect(mockDevice.autofill).toHaveBeenCalledTimes(2);
    expect(callsTo(app.client, "/v1/auth/passkey")).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("signs in once from the button while the quiet request waits", async () => {
    const quiet = quietRequests();
    const app = await openSignIn(signedInAsAnna);
    await waitFor(() => {
      expect(quiet.waiting).toHaveLength(1);
    });
    await fireEvent.press(screen.getByRole("button", { name: "Face ID or fingerprint" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(mockDevice.get).toHaveBeenCalledTimes(1);
    expect(callsTo(app.client, "/v1/auth/passkey")).toHaveLength(1);
    expect(quiet.waiting).toHaveLength(0);
  });

  it("asks for new options a little before the challenge's 5 minutes are up", async () => {
    jest.useFakeTimers();
    try {
      const quiet = quietRequests();
      const app = await openSignIn(signedInAsAnna);
      await waitFor(() => {
        expect(quiet.waiting).toHaveLength(1);
      });
      // 30 seconds before the challenge's 5 minutes are up.
      await act(() => jest.advanceTimersByTimeAsync(keepOptionsMs));
      await waitFor(() => {
        expect(mockDevice.autofill).toHaveBeenCalledTimes(2);
      });
      expect(callsTo(app.client, "/v1/auth/passkey/options")).toHaveLength(2);
      expect(quiet.waiting).toHaveLength(1);
      await act(() => {
        quiet.pick();
      });
      expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
      // Gone with step 1: no more options.
      await act(() => jest.advanceTimersByTimeAsync(2 * keepOptionsMs));
      expect(callsTo(app.client, "/v1/auth/passkey/options")).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("offers the passkey again with the same options after the person cancels Face ID", async () => {
    jest.useFakeTimers();
    try {
      const quiet = quietRequests();
      const app = await openSignIn();
      await waitFor(() => {
        expect(quiet.waiting).toHaveLength(1);
      });
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      await act(() => {
        quiet.end();
      });
      await waitFor(() => {
        expect(quiet.waiting).toHaveLength(1);
      });
      expect(mockDevice.autofill.mock.calls).toEqual([[options], [options]]);
      expect(callsTo(app.client, "/v1/auth/passkey/options")).toHaveLength(1);
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("waits for new options when the browser refuses the quiet request at once", async () => {
    jest.useFakeTimers();
    try {
      const quiet = quietRequests();
      const app = await openSignIn();
      await waitFor(() => {
        expect(quiet.waiting).toHaveLength(1);
      });
      await act(() => {
        quiet.end();
      });
      await act(() => jest.advanceTimersByTimeAsync(10_000));
      expect(mockDevice.autofill).toHaveBeenCalledTimes(1);
      await act(() => jest.advanceTimersByTimeAsync(keepOptionsMs));
      await waitFor(() => {
        expect(quiet.waiting).toHaveLength(1);
      });
      expect(callsTo(app.client, "/v1/auth/passkey/options")).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("asks again 30 seconds after the options could not be had, and shows nothing", async () => {
    jest.useFakeTimers();
    try {
      const quiet = quietRequests();
      let answers = 0;
      const app = await openSignIn((client) => {
        client.answer("/v1/auth/passkey/options", () => {
          answers += 1;
          return answers === 1 ? failure(0, "network_error") : ok(200, { options });
        });
      });
      await waitFor(() => {
        expect(callsTo(app.client, "/v1/auth/passkey/options")).toHaveLength(1);
      });
      expect(mockDevice.autofill).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
      await act(() => jest.advanceTimersByTimeAsync(30_000));
      await waitFor(() => {
        expect(quiet.waiting).toHaveLength(1);
      });
      expect(callsTo(app.client, "/v1/auth/passkey/options")).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("stops waiting when the email code screen opens, and waits again back on step 1", async () => {
    jest.useFakeTimers();
    try {
      const quiet = quietRequests();
      const app = await openSignIn((client) => {
        client.answer("/v1/auth/email/start", () => ok(202, { resendAfterSeconds: 30 }));
      });
      await waitFor(() => {
        expect(quiet.waiting).toHaveLength(1);
      });
      await fireEvent.changeText(screen.getByLabelText("Email"), "anna@example.com");
      await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
      expect(await screen.findByRole("header", { name: "Enter the code" })).toBeVisible();
      expect(mockDevice.cancel).toHaveBeenCalled();
      expect(quiet.waiting).toHaveLength(0);
      await act(() => jest.advanceTimersByTimeAsync(2 * keepOptionsMs));
      expect(callsTo(app.client, "/v1/auth/passkey/options")).toHaveLength(1);

      await act(() => {
        router.back();
      });
      await waitFor(() => {
        expect(quiet.waiting).toHaveLength(1);
      });
      expect(callsTo(app.client, "/v1/auth/passkey/options")).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("steps aside while Google's window is open, and waits again once it is closed", async () => {
    const quiet = quietRequests();
    await openSignIn((client) => {
      client.answer("/v1/config", () =>
        ok(200, {
          beta: false,
          paused: [],
          maxSeats: 8,
          freeCancellationMinutes: 15,
          maxMoveMinutes: 120,
          reliabilityMonths: 12,
          signInProviders: ["google"],
          emailSignIn: true,
          passkeySignIn: true,
        }),
      );
    });
    await waitFor(() => {
      expect(quiet.waiting).toHaveLength(1);
    });
    openAuthSessionAsync.mockClear();
    // The person closes Google's window.
    await fireEvent.press(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => {
      expect(mockDevice.autofill).toHaveBeenCalledTimes(2);
    });
    const [cancelled] = mockDevice.cancel.mock.invocationCallOrder;
    const [opened] = openAuthSessionAsync.mock.invocationCallOrder;
    expect(cancelled).toBeLessThan(opened ?? 0);
    expect(quiet.waiting).toHaveLength(1);
  });

  it("says a passkey this site no longer has is not set up, and tells the browser (3.4)", async () => {
    const quiet = quietRequests();
    await openSignIn((client) => {
      client.answer("/v1/auth/passkey", () => failure(400, "passkey_unknown"));
    });
    await waitFor(() => {
      expect(quiet.waiting).toHaveLength(1);
    });
    await act(() => {
      quiet.pick();
    });
    expect(await screen.findByText(notSetUp)).toBeVisible();
    expect(mockDevice.forget).toHaveBeenCalledWith("credential-one");
    // The field offers its passkeys again.
    await waitFor(() => {
      expect(quiet.waiting).toHaveLength(1);
    });
  });

  it("tells the browser after the button's passkey is unknown too, and this browser has none", async () => {
    quietRequests();
    // Removed from another device's Settings since this browser signed in with it.
    mockPreferences.set("passkey-here", "credential-one");
    await openSignIn((client) => {
      client.answer("/v1/auth/passkey", () => failure(400, "passkey_unknown"));
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Face ID or fingerprint" }));
    expect(await screen.findByText(notSetUp)).toBeVisible();
    expect(mockDevice.forget).toHaveBeenCalledWith("credential-one");
    // So Face ID can be offered here again (spec 29, 3.2, item 5).
    expect(mockPreferences.get("passkey-here")).toBe("");
  });

  it("keeps the console's passkey with the browser (R29.4)", async () => {
    quietRequests();
    mockPreferences.set("passkey-here", "credential-one");
    await openSignIn((client) => {
      client.answer("/v1/auth/passkey", () => failure(400, "passkey_invalid"));
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Face ID or fingerprint" }));
    expect(await screen.findByText(notSetUp)).toBeVisible();
    expect(mockDevice.forget).not.toHaveBeenCalled();
    expect(mockPreferences.get("passkey-here")).toBe("credential-one");
  });
});

/** Opens Sign-in methods with these devices; the list answers as it is kept. */
async function openMethods(devices: MemberPasskey[], setUp?: (client: FakeClient) => void) {
  const kept = [...devices];
  const app = await renderApp("/settings/sign-in-methods", {
    me: anna,
    setUp: (client) => {
      withPasskeys(client);
      client.answer(
        "/v1/me/sign-in-methods",
        () => ok(200, { methods: [], password: null, passkeys: [...kept] }),
        "get",
      );
      client.answer("/v1/me/passkeys/options", () => ok(200, { options }));
      client.answer("/v1/me/passkeys", () => {
        kept.push(mac);
        return ok(201, mac);
      });
      client.answer("/v1/me/passkeys/{id}", (input) => {
        const { id } = input["params"] as { id: string };
        kept.splice(
          kept.findIndex((passkey) => passkey.id === id),
          1,
        );
        return ok(204);
      });
      client.answer("/v1/me/confirm-code", () =>
        ok(202, { resendAfterSeconds: 30, channel: "email", sentTo: "a***@example.com" }),
      );
      setUp?.(client);
    },
  });
  expect(await screen.findByRole("header", { name: "Sign-in methods" })).toBeVisible();
  return app;
}

describe("Face ID or fingerprint in Settings (spec 27, 3.6)", () => {
  it("lists each device, with when it was added and last used", async () => {
    await openMethods([iPhone]);
    expect(await screen.findByText("Safari on iPhone")).toBeVisible();
    expect(screen.getByText("Added 21 November 2026")).toBeVisible();
    expect(screen.getByText("Last used 22 November 2026")).toBeVisible();
  });

  it("removes a device after asking", async () => {
    const app = await openMethods([iPhone]);
    await fireEvent.press(
      await screen.findByRole("button", {
        name: "Remove Face ID or fingerprint for Safari on iPhone",
      }),
    );
    expect(
      screen.getByText(
        "Remove Face ID or fingerprint for Safari on iPhone? You can still sign in with your email.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
    expect(
      await screen.findByText("Face ID or fingerprint is removed for Safari on iPhone."),
    ).toBeVisible();
    expect(screen.queryByText("Safari on iPhone")).toBeNull();
    expect(screen.getByText("Not set up")).toBeVisible();
    expect(callsTo(app.client, "/v1/me/passkeys/{id}")).toHaveLength(1);
    // This browser stops offering it (spec 29, 3.4).
    expect(mockDevice.forget).toHaveBeenCalledWith("credential-of-the-iphone");
  });

  it("forgets that this browser has a passkey when its own is removed, not another's", async () => {
    mockPreferences.set("passkey-here", mac.credentialId);
    await openMethods([iPhone, mac]);
    await fireEvent.press(
      await screen.findByRole("button", {
        name: "Remove Face ID or fingerprint for Safari on iPhone",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
    expect(
      await screen.findByText("Face ID or fingerprint is removed for Safari on iPhone."),
    ).toBeVisible();
    expect(mockPreferences.get("passkey-here")).toBe(mac.credentialId);
    await fireEvent.press(
      screen.getByRole("button", { name: "Remove Face ID or fingerprint for Chrome on Mac" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
    expect(
      await screen.findByText("Face ID or fingerprint is removed for Chrome on Mac."),
    ).toBeVisible();
    await waitFor(() => {
      expect(mockPreferences.get("passkey-here")).toBe("");
    });
  });

  it("sets up this device with a fresh sign-in", async () => {
    const app = await openMethods([]);
    await fireEvent.press(await screen.findByRole("button", { name: "Set up on this device" }));
    expect(
      await screen.findByText("Face ID or fingerprint is set up on this device."),
    ).toBeVisible();
    expect(screen.getByText("Chrome on Mac")).toBeVisible();
    expect(mockDevice.create).toHaveBeenCalledWith(options);
    expect(callsTo(app.client, "/v1/me/passkeys").map((call) => call.input["body"])).toEqual([
      { credential: registration },
    ]);
  });

  it("asks for a confirm code when the sign-in is over 10 minutes old (R27.5)", async () => {
    const app = await openMethods([], (client) => {
      client.answer("/v1/me/passkeys/options", (input) =>
        (input["body"] as { code?: string }).code === undefined
          ? failure(403, "confirm_required")
          : ok(200, { options }),
      );
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Set up on this device" }));
    expect(
      await screen.findByText("To set up Face ID or fingerprint, enter the code we send you."),
    ).toBeVisible();
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "654321");
    expect(
      await screen.findByText("Face ID or fingerprint is set up on this device."),
    ).toBeVisible();
    expect(
      callsTo(app.client, "/v1/me/passkeys/options").map((call) => call.input["body"]),
    ).toEqual([{}, { code: "654321" }]);
  });

  it("uses the confirmed options again when the sheet was closed, with no new code", async () => {
    mockDevice.create.mockReturnValueOnce(Promise.reject(named("NotAllowedError")));
    const app = await openMethods([], (client) => {
      client.answer("/v1/me/passkeys/options", (input) =>
        (input["body"] as { code?: string }).code === undefined
          ? failure(403, "confirm_required")
          : ok(200, { options }),
      );
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Set up on this device" }));
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "654321");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Set up on this device", disabled: false }),
    );
    expect(
      await screen.findByText("Face ID or fingerprint is set up on this device."),
    ).toBeVisible();
    expect(
      callsTo(app.client, "/v1/me/passkeys/options").map((call) => call.input["body"]),
    ).toEqual([{}, { code: "654321" }]);
    expect(callsTo(app.client, "/v1/me/confirm-code")).toHaveLength(1);
    expect(mockDevice.create).toHaveBeenCalledTimes(2);
  });

  it("says when this device is set up already", async () => {
    mockDevice.create.mockReturnValue(Promise.reject(named("InvalidStateError")));
    const app = await openMethods([iPhone]);
    await fireEvent.press(await screen.findByRole("button", { name: "Set up on this device" }));
    expect(await screen.findByText("This device is set up already.")).toBeVisible();
    expect(callsTo(app.client, "/v1/me/passkeys")).toHaveLength(0);
  });

  it("changes nothing when the person closes the device's sheet", async () => {
    mockDevice.create.mockReturnValue(Promise.reject(named("NotAllowedError")));
    const app = await openMethods([]);
    await fireEvent.press(await screen.findByRole("button", { name: "Set up on this device" }));
    expect(
      await screen.findByRole("button", { name: "Set up on this device", disabled: false }),
    ).toBeVisible();
    expect(callsTo(app.client, "/v1/me/passkeys")).toHaveLength(0);
    expect(screen.getByText("Not set up")).toBeVisible();
  });

  it("asks to remove one when 10 devices are set up (R27.8)", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({
      ...iPhone,
      id: `0190a1d6-0000-7000-8000-0000000001${String(i).padStart(2, "0")}`,
    }));
    await openMethods(ten);
    expect(
      await screen.findByText("You have 10 devices set up. Remove one to add another."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Set up on this device" })).toBeNull();
  });

  it("lists the devices, but offers no set-up, on a device without its own lock", async () => {
    mockDevice.available.mockReturnValue(Promise.resolve(false));
    await openMethods([iPhone]);
    expect(await screen.findByText("Safari on iPhone")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Set up on this device" })).toBeNull();
  });

  it("is left out on a device without its own lock and with no devices", async () => {
    mockDevice.available.mockReturnValue(Promise.resolve(false));
    await openMethods([]);
    expect(await screen.findByText("Add a password")).toBeVisible();
    expect(screen.queryByText("Face ID or fingerprint")).toBeNull();
    expect(screen.queryByText("Not set up")).toBeNull();
  });
});

describe("Face ID offered after another way in (spec 29, 3.2)", () => {
  const offerTitle = "Use Face ID or fingerprint next time?";
  const dayMs = 24 * 60 * 60 * 1000;

  /** Step 1, ready for the email code or a password; the API saves a passkey as the Mac's. */
  async function openSignInForOffer(isNewUser = false, setUp?: (client: FakeClient) => void) {
    return openSignIn((client) => {
      const signedIn = () => ok(200, { status: "signedIn", ...tokens(1), user: anna, isNewUser });
      client.answer("/v1/auth/email/start", () => ok(202, { resendAfterSeconds: 30 }));
      client.answer("/v1/auth/email/verify", signedIn);
      client.answer("/v1/auth/password", signedIn);
      client.answer("/v1/me/passkeys/options", () => ok(200, { options }));
      client.answer("/v1/me/passkeys", () => ok(201, mac));
      setUp?.(client);
    });
  }

  async function signInWithEmailCode() {
    await fireEvent.changeText(screen.getByLabelText("Email"), "anna@example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
  }

  async function signInWithPassword() {
    await fireEvent.changeText(screen.getByLabelText("Email"), "anna@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "puffins fly north in May");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  }

  /** Signed in and on Find, with what follows a sign-in done: this browser keeps the way. */
  async function onFind(way: string) {
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    await waitFor(() => {
      expect(mockPreferences.get("last-sign-in")).toBe(way);
    });
  }

  it("asks a member after the email code, and Not now goes on and is kept on this browser", async () => {
    await openSignInForOffer();
    await signInWithEmailCode();
    expect(await screen.findByRole("header", { name: offerTitle })).toBeVisible();
    expect(
      screen.getByText(
        "Sign in with a glance or a touch on this device. Your email code always works too.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(mockPreferences.get("last-sign-in")).toBe("email");
    expect(Date.parse(mockPreferences.get("passkey-offer-declined") ?? "")).toBeGreaterThan(
      Date.now() - 60_000,
    );
  });

  it("sets it up with the fresh sign-in, and this browser is known to have one", async () => {
    const app = await openSignInForOffer();
    await signInWithEmailCode();
    await fireEvent.press(await screen.findByRole("button", { name: "Set it up" }));
    expect(
      await screen.findByText("Face ID or fingerprint is set up on this device."),
    ).toBeVisible();
    expect(mockDevice.create).toHaveBeenCalledWith(options);
    expect(callsTo(app.client, "/v1/me/passkeys")).toHaveLength(1);
    expect(mockPreferences.get("passkey-here")).toBe(mac.credentialId);
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(mockPreferences.get("passkey-offer-declined")).toBeUndefined();
  });

  it("says a device set up already, then goes on after Done", async () => {
    mockDevice.create.mockReturnValue(Promise.reject(named("InvalidStateError")));
    await openSignInForOffer();
    await signInWithEmailCode();
    await fireEvent.press(await screen.findByRole("button", { name: "Set it up" }));
    expect(await screen.findByText("This device is set up already.")).toBeVisible();
    expect(mockPreferences.get("passkey-here")).toBe("*");
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
  });

  it("is not asked after a passkey, and this browser is then known to have one", async () => {
    await openSignIn(signedInAsAnna);
    await fireEvent.press(await screen.findByRole("button", { name: "Face ID or fingerprint" }));
    await onFind("passkey");
    expect(mockPreferences.get("passkey-here")).toBe("credential-one");
    expect(screen.queryByRole("header", { name: offerTitle })).toBeNull();
  });

  it("is not asked of a new account, which has Sign in faster next time", async () => {
    await openSignInForOffer(true);
    await signInWithEmailCode();
    await onFind("email");
    expect(screen.queryByRole("header", { name: offerTitle })).toBeNull();
  });

  it("is not asked on a browser known to have a passkey", async () => {
    mockPreferences.set("passkey-here", "credential-of-the-iphone");
    await openSignInForOffer();
    await signInWithEmailCode();
    await onFind("email");
    expect(screen.queryByRole("header", { name: offerTitle })).toBeNull();
  });

  it("is not asked within 30 days of Not now, and is asked again after", async () => {
    mockPreferences.set("passkey-offer-declined", new Date(Date.now() - 29 * dayMs).toISOString());
    await openSignInForOffer();
    await signInWithEmailCode();
    await onFind("email");
    expect(screen.queryByRole("header", { name: offerTitle })).toBeNull();
  });

  it("is asked again 30 days after Not now", async () => {
    mockPreferences.set("passkey-offer-declined", new Date(Date.now() - 30 * dayMs).toISOString());
    await openSignInForOffer();
    await signInWithEmailCode();
    expect(await screen.findByRole("header", { name: offerTitle })).toBeVisible();
  });

  it("is not asked on a device without its own lock", async () => {
    mockDevice.available.mockReturnValue(Promise.resolve(false));
    await openSignInForOffer();
    await signInWithEmailCode();
    await onFind("email");
    expect(screen.queryByRole("header", { name: offerTitle })).toBeNull();
  });

  it("lets Offer kept through sign-in open first, with no question that time", async () => {
    mockStored.set("pending-offer", JSON.stringify({ keptAt: new Date().toISOString() }));
    await openSignInForOffer();
    await signInWithEmailCode();
    await waitFor(() => {
      expect(screen).toHavePathname("/offer");
    });
    await waitFor(() => {
      expect(mockPreferences.get("last-sign-in")).toBe("email");
    });
    expect(screen.queryByRole("header", { name: offerTitle })).toBeNull();
  });

  it("asks after a password too", async () => {
    const app = await openSignInForOffer();
    await signInWithPassword();
    expect(await screen.findByRole("header", { name: offerTitle })).toBeVisible();
    expect(callsTo(app.client, "/v1/me/passkeys")).toHaveLength(0);
  });
});

describe("Sign in faster next time, after sign-up (spec 27, 3.7)", () => {
  const newAccount: Me = { ...anna, firstName: null, missingSteps: ["profile"] };

  async function finishSignUp() {
    const app = await renderApp("/", {
      me: newAccount,
      setUp: (client) => {
        withPasskeys(client);
        client.answer("/v1/me", (input) => {
          const body = input["body"] as Partial<Me> | undefined;
          return ok(200, body === undefined ? newAccount : { ...anna, ...body });
        });
        client.answer("/v1/me/passkeys/options", () => ok(200, { options }));
        client.answer("/v1/me/passkeys", () => ok(201, mac));
      },
    });
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText("First name"), "Anna");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("header", { name: "Sign in faster next time" })).toBeVisible();
    return app;
  }

  it("sets up Face ID or fingerprint straight away, then goes on", async () => {
    const app = await finishSignUp();
    await fireEvent.press(screen.getByRole("button", { name: "Use Face ID or fingerprint" }));
    expect(
      await screen.findByText("Face ID or fingerprint is set up on this device."),
    ).toBeVisible();
    expect(callsTo(app.client, "/v1/me/passkeys")).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
  });

  it("holds the other choices while the device's sheet is open", async () => {
    mockDevice.create.mockReturnValue(new Promise(() => {}));
    await finishSignUp();
    await fireEvent.press(screen.getByRole("button", { name: "Use Face ID or fingerprint" }));
    expect(
      await screen.findByRole("button", { name: "Add a password", disabled: true }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Not now", disabled: true })).toBeVisible();
  });

  it("offers only a password on a device without its own lock", async () => {
    mockDevice.available.mockReturnValue(Promise.resolve(false));
    await finishSignUp();
    expect(screen.getByRole("button", { name: "Add a password" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Use Face ID or fingerprint" })).toBeNull();
  });
});
