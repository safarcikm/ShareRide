import { screen, waitFor } from "expo-router/testing-library";
import { ok } from "@/testing/fake-client";
import { renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
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
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn(() => Promise.resolve(null)),
  writeAppData: jest.fn(() => Promise.resolve()),
}));
const mockDevice = {
  available: jest.fn(() => Promise.resolve(true)),
  create: jest.fn(),
  get: jest.fn(),
  autofillAvailable: jest.fn(() => Promise.resolve(false)),
  autofill: jest.fn(),
  cancel: jest.fn(),
  forget: jest.fn(() => Promise.resolve()),
  quietCreateAvailable: jest.fn(() => Promise.resolve(false)),
  createQuietly: jest.fn(),
};
jest.mock("@/sign-in/passkey", () => ({
  ...jest.requireActual<typeof PasskeyTypes>("@/sign-in/passkey-types"),
  devicePasskeys: mockDevice,
}));

// The way used last time first, marked "Last used" (spec 29, 3.5).

beforeEach(() => {
  mockPreferences.clear();
  mockDevice.available.mockReset().mockReturnValue(Promise.resolve(true));
});

/** Step 1 with Google, Apple, Face ID and the email all offered, unless `providers` says less. */
async function openSignIn(providers: readonly ("google" | "apple")[] = ["google", "apple"]) {
  await renderApp("/sign-in", {
    setUp: (client) => {
      client.answer("/v1/config", () =>
        ok(200, {
          beta: false,
          paused: [],
          maxSeats: 8,
          freeCancellationMinutes: 15,
          maxMoveMinutes: 120,
          reliabilityMonths: 12,
          signInProviders: providers,
          emailSignIn: true,
          passkeySignIn: true,
        }),
      );
    },
  });
  expect(await screen.findByRole("header", { name: "Sign in or create an account" })).toBeVisible();
}

const parts =
  /^(Last used|Continue with Google|Continue with Apple|Face ID or fingerprint|Send code|or|or with your email)$/;

/** The ways in, the mark and the dividers, top to bottom. */
function order(): string[] {
  return screen.getAllByText(parts).map((node) => String(node.props.children));
}

async function settled(expected: readonly string[]) {
  await waitFor(() => {
    expect(order()).toEqual(expected);
  });
}

describe("The way used last time first (spec 29, 3.5)", () => {
  it("keeps today's order, with no mark, on a browser that has kept nothing", async () => {
    await openSignIn();
    await settled([
      "Continue with Google",
      "Continue with Apple",
      "Face ID or fingerprint",
      "or with your email",
      "Send code",
    ]);
  });

  it("puts Google first after Google", async () => {
    mockPreferences.set("last-sign-in", "google");
    await openSignIn();
    await settled([
      "Last used",
      "Continue with Google",
      "Continue with Apple",
      "Face ID or fingerprint",
      "or with your email",
      "Send code",
    ]);
  });

  it("puts Apple first after Apple", async () => {
    mockPreferences.set("last-sign-in", "apple");
    await openSignIn();
    await settled([
      "Last used",
      "Continue with Apple",
      "Continue with Google",
      "Face ID or fingerprint",
      "or with your email",
      "Send code",
    ]);
  });

  it("puts Face ID first after Face ID", async () => {
    mockPreferences.set("last-sign-in", "passkey");
    await openSignIn();
    await settled([
      "Last used",
      "Face ID or fingerprint",
      "Continue with Google",
      "Continue with Apple",
      "or with your email",
      "Send code",
    ]);
  });

  it.each(["email", "password"])("puts the email form first after the %s", async (way) => {
    mockPreferences.set("last-sign-in", way);
    await openSignIn();
    await settled([
      "Last used",
      "Send code",
      "or",
      "Continue with Google",
      "Continue with Apple",
      "Face ID or fingerprint",
    ]);
  });

  it("keeps today's order when the kept way is not offered any more", async () => {
    mockPreferences.set("last-sign-in", "google");
    await openSignIn(["apple"]);
    await settled([
      "Continue with Apple",
      "Face ID or fingerprint",
      "or with your email",
      "Send code",
    ]);
  });

  it("keeps today's order after Face ID on a device without its own lock", async () => {
    mockPreferences.set("last-sign-in", "passkey");
    mockDevice.available.mockReturnValue(Promise.resolve(false));
    await openSignIn();
    await settled([
      "Continue with Google",
      "Continue with Apple",
      "or with your email",
      "Send code",
    ]);
  });
});
