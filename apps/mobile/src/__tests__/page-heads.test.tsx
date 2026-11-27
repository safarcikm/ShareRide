import { fireEvent, screen, waitFor, within } from "expo-router/testing-library";
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
// its title at the left with Back, as Profile has, and the help under the
// title is the head's line. All made up.

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

/** A page Profile opens, opened by its address. */
interface Page {
  readonly path: string;
  readonly title: string;
  /** The line under the title, where the page has one. */
  readonly line?: string;
  /** What the page says once it has read what it reads: here, that it holds nothing yet. */
  readonly says?: string;
  /** Where Back leads when there is nothing to go back to. */
  readonly back: string;
}

const pages: readonly Page[] = [
  { path: "/drive/cars", title: "My cars", back: "/profile" },
  { path: `/drive/cars/${yaris.id}`, title: "Edit your car", back: "/drive/cars" },
  { path: "/drive/cars/new", title: "Add a car", back: "/drive/cars" },
  {
    path: "/drive/licence",
    title: "Your driving licence",
    line: "We don't ask for your licence or check it. Driving without a valid licence breaks the Community Rules.",
    back: "/profile",
  },
  {
    path: "/drive/photo",
    title: "Your profile photo",
    line: "You need one to publish a ride.",
    back: "/profile",
  },
  {
    path: "/notices",
    title: "Notices",
    line: "What PuffinRide did about your account, a ride or something you posted, and why. You can appeal each once, within 14 days.",
    says: "Nothing here. If PuffinRide ever acts on your account, you'll read why here.",
    back: "/profile",
  },
  {
    path: "/feedback",
    title: "Send feedback",
    line: "Tell us what isn't working or what would make PuffinRide better. We read everything.",
    back: "/profile",
  },
  {
    path: "/settings/beta-news",
    title: "Beta news",
    line: "What PuffinRide has told beta testers in the last three months.",
    says: "No news yet.",
    back: "/settings/notifications",
  },
  {
    path: "/settings/blocked",
    title: "Blocked people",
    line: "You don't see each other's rides, and your chats are read-only. They aren't told.",
    says: "You haven't blocked anyone.",
    back: "/profile",
  },
  {
    path: "/settings/email",
    title: "Your email",
    line: "Booking news reaches you by email when a push notification can't. Nobody else sees your email.",
    back: "/profile",
  },
  {
    path: "/settings/feedback",
    title: "My feedback",
    line: "What you sent us and our replies. Only you see this.",
    says: "You haven't sent any feedback yet.",
    back: "/profile",
  },
  { path: "/settings/password", title: "Choose a password", back: "/settings/sign-in-methods" },
  {
    path: "/settings/reports",
    title: "My reports",
    line: "What you reported, and what we found. Only you see this list.",
    says: "You haven't reported anything.",
    back: "/profile",
  },
  {
    path: "/settings/sign-in-methods",
    title: "Sign-in methods",
    line: "You sign in with your email, with a password if you set one, or with Google. Your phone number gets you back in if you lose your email.",
    back: "/profile",
  },
  {
    path: "/settings/privacy",
    title: "Privacy",
    line: "See what PuffinRide keeps about you, and read how it is used.",
    back: "/profile",
  },
  {
    path: "/settings/privacy/ask",
    title: "Ask about my data",
    line: "Object to a use of your data, ask us to limit one, correct something you can't change in the app, or ask a question.",
    back: "/settings/privacy",
  },
  { path: "/settings/privacy/delete", title: "Delete my account", back: "/settings/privacy" },
  {
    path: "/settings/privacy/download",
    title: "Download my data",
    line: "You get a ZIP file with what PuffinRide keeps about you: your account, rides, bookings, payments, messages and notifications. Other people appear by first name only. You can ask for one file a day.",
    back: "/settings/privacy",
  },
];

describe("The pages Profile opens (spec 31, 3.19)", () => {
  it.each(pages)('$path has "$title" at the left, with Back', async (page) => {
    await renderApp(page.path, { me, setUp: answers });
    const head = within(await screen.findByTestId("screen-head"));
    expect(head.getByRole("header", { name: page.title })).not.toHaveStyle({
      textAlign: "center",
    });
    // The help is the head's line, at the left under the title.
    if (page.line !== undefined) {
      expect(head.getByText(page.line)).not.toHaveStyle({ textAlign: "center" });
    }
    // Once the page has read what it reads, and said so where it holds nothing.
    await waitFor(() => {
      expect(screen.queryAllByLabelText("Loading")).toEqual([]);
    });
    if (page.says !== undefined) expect(await screen.findByText(page.says)).toBeVisible();
    // No text of the page stands centred under the head; a button's own words may.
    expect(
      screen
        .getAllByText(/./)
        .filter((text) => centred(text) && !inButton(text))
        .map((text) => String(text.props.children)),
    ).toEqual([]);
    // At most one main button (R31.1).
    expect(filledButtons()).toBeLessThanOrEqual(1);
    // Opened by its address there is nothing to go back to: Back leads up.
    await fireEvent.press(head.getByRole("button", { name: "Back" }));
    await waitFor(() => {
      expect(screen).toHavePathname(page.back);
    });
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
