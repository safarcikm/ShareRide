import { screen, within } from "expo-router/testing-library";
import type { DataExport, DeletionCheck, Me } from "@shareride/contracts";
import { StyleSheet, type TextStyle } from "react-native";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { filledButtons } from "@/testing/buttons";
import { ok, type FakeClient } from "@/testing/fake-client";
import { findPersonCard } from "@/testing/people";
import { readyDriver, yaris } from "@/testing/trips";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

// The pages Profile opens, and the ones they open (spec 31, 3.19): each has
// its title at the left with Back, as Profile has, and the help that stood
// centred under the title is the head's line. All made up.

const me: Me = { ...completeMe, email: "anna@example.com" };
const nothingOpen: DeletionCheck = { allowed: true, mustSettle: [], canCancel: [] };
const noFile: DataExport = { state: "none" };

/** A part on a screen under test, with the part that holds it. */
interface Shown {
  readonly props: { readonly style?: unknown; readonly accessibilityRole?: unknown };
  readonly parent: Shown | null;
}

const centred = (text: Shown) =>
  (StyleSheet.flatten(text.props.style as TextStyle) as TextStyle | undefined)?.textAlign ===
  "center";

function inButton(part: Shown): boolean {
  for (let around = part.parent; around !== null; around = around.parent) {
    if (around.props.accessibilityRole === "button") return true;
  }
  return false;
}

/** What the pages read, each with nothing in it yet. */
function answers(client: FakeClient) {
  client.answer("/v1/me/driver-readiness", () => ok(200, readyDriver));
  client.answer("/v1/me/vehicles", () => ok(200, { vehicles: [yaris] }));
  client.answer("/v1/me/notices", () => ok(200, { notices: [] }), "get");
  client.answer("/v1/me/announcements", () => ok(200, { announcements: [] }));
  client.answer("/v1/me/blocks", () => ok(200, { blocked: [] }), "get");
  client.answer("/v1/me/feedback", () => ok(200, { feedback: [] }));
  client.answer("/v1/me/reports", () => ok(200, { reports: [] }), "get");
  client.answer("/v1/me/deletion-check", () => ok(200, nothingOpen));
  client.answer("/v1/me/export", () => ok(200, noFile), "get");
}

/** The page's address, its title, and the line under the title when it has one. */
const pages: readonly (readonly [string, string, string | null])[] = [
  ["/drive/cars", "My cars", null],
  [`/drive/cars/${yaris.id}`, "Edit your car", null],
  ["/drive/cars/new", "Add a car", null],
  [
    "/drive/licence",
    "Your driving licence",
    "We don't ask for your licence or check it. Driving without a valid licence breaks the Community Rules.",
  ],
  ["/drive/photo", "Your profile photo", "You need one to publish a ride."],
  [
    "/notices",
    "Notices",
    "What PuffinRide did about your account, a ride or something you posted, and why. You can appeal each once, within 14 days.",
  ],
  [
    "/feedback",
    "Send feedback",
    "Tell us what isn't working or what would make PuffinRide better. We read everything.",
  ],
  [
    "/settings/beta-news",
    "Beta news",
    "What PuffinRide has told beta testers in the last three months.",
  ],
  [
    "/settings/blocked",
    "Blocked people",
    "You don't see each other's rides, and your chats are read-only. They aren't told.",
  ],
  [
    "/settings/email",
    "Your email",
    "Booking news reaches you by email when a push notification can't. Nobody else sees your email.",
  ],
  ["/settings/feedback", "My feedback", "What you sent us and our replies. Only you see this."],
  ["/settings/password", "Choose a password", null],
  [
    "/settings/reports",
    "My reports",
    "What you reported, and what we found. Only you see this list.",
  ],
  [
    "/settings/sign-in-methods",
    "Sign-in methods",
    "You sign in with your email, with a password if you set one, or with Google. Your phone number gets you back in if you lose your email.",
  ],
  ["/settings/privacy", "Privacy", "See what PuffinRide keeps about you, and read how it is used."],
  [
    "/settings/privacy/ask",
    "Ask about my data",
    "Object to a use of your data, ask us to limit one, correct something you can't change in the app, or ask a question.",
  ],
  ["/settings/privacy/delete", "Delete my account", null],
  [
    "/settings/privacy/download",
    "Download my data",
    "You get a ZIP file with what PuffinRide keeps about you: your account, rides, bookings, payments, messages and notifications. Other people appear by first name only. You can ask for one file a day.",
  ],
];

describe("The pages Profile opens (spec 31, 3.19)", () => {
  it.each(pages)('%s has "%s" at the left, with Back', async (path, title, line) => {
    await renderApp(path, { me, setUp: answers });
    const head = within(await screen.findByTestId("screen-head"));
    expect(head.getByRole("header", { name: title })).not.toHaveStyle({ textAlign: "center" });
    expect(head.getByRole("button", { name: "Back" })).toBeVisible();
    // The help is the head's line, at the left under the title.
    if (line !== null) expect(head.getByText(line)).not.toHaveStyle({ textAlign: "center" });
    // No text of the page stands centred under it; a button's own words may.
    expect(
      screen
        .getAllByText(/./)
        .filter((text) => centred(text) && !inButton(text))
        .map((text) => String(text.props.children)),
    ).toEqual([]);
    // At most one main button (R31.1).
    expect(filledButtons()).toBeLessThanOrEqual(1);
  });

  it("shows me in the person's card on the photo's page, over its one main button", async () => {
    await renderApp("/drive/photo", { me, setUp: answers });
    const card = within(await findPersonCard("Anna"));
    expect(card.getByText("Member since November 2026")).toBeVisible();
    // The card only shows who the photo is of: its controls are under it.
    expect(card.queryAllByRole("button")).toEqual([]);
    expect(screen.getByRole("button", { name: "Add a photo" })).toBeVisible();
    expect(filledButtons()).toBe(1);
  });
});
