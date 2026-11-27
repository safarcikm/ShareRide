import { fireEvent, screen, waitFor } from "expo-router/testing-library";
import { getLocales } from "expo-localization";
import type { DeletionCheck } from "@shareride/contracts";
import { Linking } from "react-native";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { ok } from "@/testing/fake-client";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

function deviceLanguage(languageTag: string) {
  (getLocales as jest.Mock).mockReturnValue([{ languageTag }]);
}

let openURL: jest.SpyInstance;

beforeEach(() => {
  deviceLanguage("en-GB");
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

afterEach(() => {
  openURL.mockRestore();
});

// The account deletion page (spec 32, section 5): a public page, in both
// languages, that says how to delete a PuffinRide account in the app or on
// the website, what is erased, what is kept and for how long, as Google
// Play asks of apps with accounts. Delete my account itself is
// delete-account.test.tsx's.

const nothingOpen: DeletionCheck = { allowed: true, mustSettle: [], canCancel: [] };
describe("Delete your PuffinRide account", () => {
  it("says how to delete an account, step by step, with the app's own names", async () => {
    await renderApp("/delete-account");
    expect(
      await screen.findByRole("header", { name: "Delete your PuffinRide account" }),
    ).toBeVisible();
    expect(screen.getByRole("header", { name: "How to delete it" })).toBeVisible();
    expect(
      screen.getByText("1. Sign in to PuffinRide, in the app or at puffinride.is."),
    ).toBeVisible();
    expect(screen.getByText("2. Open Profile, then Privacy and your data.")).toBeVisible();
    expect(screen.getByText(/^3\. Choose Delete my account\./)).toBeVisible();
    expect(screen.getByText(/^4\. Confirm it's you with the code we send you\./)).toBeVisible();
  });

  it("says what is erased, what is kept and for how long", async () => {
    await renderApp("/delete-account");
    await screen.findByRole("header", { name: "Delete your PuffinRide account" });
    for (const heading of [
      "What happens next",
      "What we erase",
      "What we keep, and for how long",
    ]) {
      expect(screen.getByRole("header", { name: heading })).toBeVisible();
    }
    expect(screen.getByText(/We erase your data 7 days later\./)).toBeVisible();
    expect(screen.getByText(/^Your profile: your first name, photo/)).toBeVisible();
    expect(screen.getByText(/^Reviews you wrote, shown as written by/)).toBeVisible();
    expect(screen.getByText(/for 3 years after the report is closed/)).toBeVisible();
  });

  it("offers Sign in to someone signed out, and the address to write to", async () => {
    await renderApp("/delete-account");
    await screen.findByRole("header", { name: "Delete your PuffinRide account" });
    expect(screen.getByRole("header", { name: "Can't sign in?" })).toBeVisible();
    await fireEvent.press(screen.getByRole("link", { name: "admin@puffinride.is" }));
    expect(openURL).toHaveBeenCalledWith("mailto:admin@puffinride.is");
    await fireEvent.press(screen.getByRole("link", { name: "Sign in" }));
    await waitFor(() => {
      expect(screen).toHavePathname("/sign-in");
    });
  });

  it("opens Delete my account for someone signed in", async () => {
    await renderApp("/delete-account", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/me/deletion-check", () => ok(200, nothingOpen));
      },
    });
    await screen.findByRole("header", { name: "Delete your PuffinRide account" });
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    await fireEvent.press(screen.getByRole("link", { name: "Delete my account" }));
    await waitFor(() => {
      expect(screen).toHavePathname("/settings/privacy/delete");
    });
    expect(await screen.findByRole("header", { name: "Delete my account" })).toBeVisible();
  });

  it("links to the Privacy Policy", async () => {
    await renderApp("/delete-account");
    await fireEvent.press(await screen.findByRole("link", { name: "Read the Privacy Policy" }));
    await waitFor(() => {
      expect(screen).toHavePathname("/legal/privacy");
    });
  });

  it("is in Icelandic for an Icelandic device", async () => {
    deviceLanguage("is-IS");
    await renderApp("/delete-account");
    expect(
      await screen.findByRole("header", { name: "Eyddu PuffinRide-aðganginum þínum" }),
    ).toBeVisible();
    expect(
      screen.getByText("2. Opnaðu „Prófíll“ og svo „Persónuvernd og gögnin þín“."),
    ).toBeVisible();
    expect(screen.getByRole("header", { name: "Það sem við geymum, og hve lengi" })).toBeVisible();
  });

  it("opens from About", async () => {
    await renderApp("/about");
    await fireEvent.press(await screen.findByRole("link", { name: "Delete your account" }));
    expect(
      await screen.findByRole("header", { name: "Delete your PuffinRide account" }),
    ).toBeVisible();
    expect(screen).toHavePathname("/delete-account");
  });

  it("goes Back to About when opened on its own", async () => {
    await renderApp("/delete-account");
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => {
      expect(screen).toHavePathname("/about");
    });
  });
});
