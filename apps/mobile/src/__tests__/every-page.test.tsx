import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { screen, waitFor, within } from "expo-router/testing-library";
import type {
  BlockedPerson,
  Booking,
  DataExport,
  DeletionCheck,
  Me,
  Notice,
} from "@shareride/contracts";
import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import { completeMe, ownProfile, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  bookingApi,
  cancellationPreview,
  driverApi,
  northMyTrip,
  paidBooking,
  requestToDrive,
  unpaidBooking,
} from "@/testing/bookings";
import { chatBooking, chatServer, chatServers, openedLine } from "@/testing/chat";
import { inside, type Shown } from "@/testing/buttons";
import { ok, type FakeClient } from "@/testing/fake-client";
import { bsi, details, fitjar, hof, meetingPoints, thorlakshofn } from "@/testing/meeting-points";
import { annaProfile, annaProfileId, profileApi } from "@/testing/people";
import { completedBooking } from "@/testing/reviews";
import { northResult, searchApi, soonRides, soonestApi, tripDetailsApi } from "@/testing/search";
import { dispute, onTheDay, rider } from "@/testing/trip-day";
import { blonduos, borgarnes, plannedDraft, readyDriver, tripsApi, yaris } from "@/testing/trips";
import { sizes } from "@/theme/tokens";

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
/** Saturday 14 November 2026, noon in Iceland; the ride's day is the Sunday, here at 10:20. */
const noon = new Date("2026-11-14T12:00:00Z");
const onTheTripDay = new Date("2026-11-15T10:20:00Z");
let mockNow = noon;
jest.mock("@/lib/clock", () => ({ now: () => mockNow }));

// Two rules every page keeps (spec 31). R31.1: a screen has at most one
// main button, the tall filled one, in the bar at the bottom on a phone;
// on Find and on its search page it is in the search card, and on an empty
// screen with a puffin it stands under the puffin's words. The only other
// filled buttons are those of things that need me. 3.17: the title is at
// the left on a screen where you do something, and centred only where
// 3.17 says.
//
// This walks every address a signed-in member can open, as each is when it
// opens, on a phone. What a page shows after a press is for its own tests.
// Everyone and everything here is made up.

const me: Me = { ...completeMe, email: "anna@example.com" };
const nothingOpen: DeletionCheck = { allowed: true, mustSettle: [], canCancel: [] };
const noFile: DataExport = { state: "none" };
const fileReady: DataExport = {
  state: "ready",
  askedAt: "2026-11-13T22:00:00.000Z",
  readyAt: "2026-11-13T22:05:00.000Z",
  expiresAt: "2026-11-20T22:05:00.000Z",
  byteSize: 12_345,
  nextAllowedAt: "2026-11-14T22:00:00.000Z",
};
const suspended: Notice = {
  id: "0190a1d6-0000-7000-8000-0000000000e1",
  kind: "suspension",
  rule: "harassment",
  reason: "Repeated messages after being asked to stop.",
  content: null,
  until: "2026-12-13T12:00:00.000Z",
  at: "2026-11-13T12:00:00.000Z",
  appealUntil: "2026-11-27T12:00:00.000Z",
  canAppeal: true,
  appeal: null,
};
const blockedAnna: BlockedPerson = {
  id: "0190a1d6-0000-7000-8000-0000000000c1",
  firstName: "Anna",
  colour: 1,
  blockedAt: "2026-11-12T09:00:00.000Z",
};

/** In something that is pressed, whose own words may be centred. */
function pressed(part: Shown): boolean {
  for (let around = part.parent; around !== null; around = around.parent) {
    const role = around.props.accessibilityRole;
    if (role === "button" || role === "tab" || role === "link" || role === "radio") return true;
  }
  return false;
}

/** Beside a puffin, whose words stand centred under it (3.17). */
function underPuffin(text: Shown): boolean {
  if (text.parent === null) return false;
  const beside = within(text.parent as unknown as Parameters<typeof within>[0]);
  return beside.queryAllByTestId(/^puffin-/, { includeHiddenElements: true }).length > 0;
}

/**
 * What else stands centred on a page with its title at the left: words that
 * belong to a control or a drawing, not to the page's column.
 */
const centredToo: readonly {
  readonly what: string;
  /** The pages that have it. */
  readonly on: RegExp;
  readonly words: RegExp;
}[] = [
  {
    what: "the number between a stepper's two buttons",
    on: /^\/(search)?$|^\/trips\/[^/]+\?|\/seats$/,
    words: /^\d+$/,
  },
  {
    what: "the month between a calendar's two arrows",
    on: /\/time$/,
    words: /^November 2026$/,
  },
  {
    what: "what a passenger pays, large over the price step's slider",
    on: /\/price$/,
    words: /^(A passenger for the whole route pays|\d,\d{3} ISK|100%)$/,
  },
  {
    what: "a conversation's day, and what PuffinRide says in it, between the two sides",
    on: /^\/messages\/[^/]+$/,
    words: /^(Saturday 14 November|Booking confirmed\. You can message each other here\.)$/,
  },
];

/** The style a part has; a pressable one's while it is not pressed. */
function styleOf(part: Shown): ViewStyle & TextStyle {
  const { style } = part.props;
  const given: unknown =
    typeof style === "function" ? (style as (state: object) => unknown)({ pressed: false }) : style;
  return StyleSheet.flatten(given as ViewStyle & TextStyle) ?? {};
}

/** Where a page's one filled button stands. */
type Place = "the bar" | "the search card" | "under the puffin" | "the column";

/** The filled buttons on the screen in front, outside the cards of what needs me. */
function filledButtons(): { readonly name: string; readonly tall: boolean; readonly in: Place }[] {
  return (screen.queryAllByTestId("filled-button") as unknown as Shown[])
    .filter((button) => !inside(button, "needs-you-card"))
    .map((button) => ({
      name: String(button.props.accessibilityLabel),
      // A main button is tall; the round one of a conversation's field is the bar's own.
      tall: styleOf(button).minHeight === sizes.mainButtonHeight,
      in: inside(button, "bottom-bar")
        ? "the bar"
        : inside(button, "card")
          ? "the search card"
          : puffins() > 0
            ? "under the puffin"
            : "the column",
    }));
}

/** The puffins drawn on the screen in front, which a screen reader skips. */
const puffins = () => screen.queryAllByTestId(/^puffin-/, { includeHiddenElements: true }).length;

/** A ride of mine as its driver, with Gunna's request, and a draft. */
const draft = plannedDraft();
function driving(client: FakeClient) {
  tripsApi(client, [northMyTrip, draft]);
  driverApi(client, [requestToDrive]);
  profileApi(client, [annaProfile, ownProfile(me)], []);
}

/** A seat of mine as a passenger, as `booking` says. */
const riding = (booking: Booking) => (client: FakeClient) => {
  bookingApi(client, () => booking);
  client.answer("/v1/bookings/{id}/cancellation-preview", () =>
    ok(200, cancellationPreview(booking.total, true, "passenger")),
  );
  chatServer(client, { booking, messages: [openedLine] });
};

/** A conversation of mine, with Anna, in the list of Messages. */
function talking(client: FakeClient) {
  riding(chatBooking)(client);
  chatServers(client, [chatBooking]);
}

/** What the pages Profile opens read: a car, and nothing else yet. */
function mine(client: FakeClient) {
  client.answer("/v1/me/driver-readiness", () => ok(200, readyDriver));
  client.answer("/v1/me/vehicles", () => ok(200, { vehicles: [yaris] }));
  client.answer("/v1/me/notices", () => ok(200, { notices: [] }), "get");
  client.answer("/v1/me/blocks", () => ok(200, { blocked: [] }), "get");
  client.answer("/v1/me/feedback", () => ok(200, { feedback: [] }));
  client.answer("/v1/me/reports", () => ok(200, { reports: [] }), "get");
  client.answer("/v1/me/deletion-check", () => ok(200, nothingOpen));
  client.answer("/v1/me/export", () => ok(200, noFile), "get");
  profileApi(client, [annaProfile, ownProfile(me)]);
}

/** The same, with something in each: no car yet, a notice, a block, a file, a ride in the way. */
function mineWithMore(client: FakeClient) {
  mine(client);
  client.answer("/v1/me/vehicles", () => ok(200, { vehicles: [] }));
  client.answer("/v1/me/notices", () => ok(200, { notices: [suspended] }), "get");
  client.answer("/v1/me/blocks", () => ok(200, { blocked: [blockedAnna] }), "get");
  client.answer("/v1/me/export", () => ok(200, fileReady), "get");
  client.answer("/v1/me/deletion-check", () =>
    ok(200, {
      allowed: false,
      mustSettle: [],
      canCancel: [
        {
          kind: "trip",
          id: northMyTrip.id,
          departsAt: "2026-11-15T09:00:00.000Z",
          places: { from: bsi.name, to: hof.name },
        },
      ],
    } satisfies DeletionCheck),
  );
}

/** Searching, the rides leaving soon, a ride's details, the meeting points and a place. */
function finding(client: FakeClient) {
  searchApi(client);
  soonestApi(client, soonRides(3));
  tripDetailsApi(client);
  client.answer("/v1/meeting-points", () => ok(200, { meetingPoints }));
  client.answer("/v1/meeting-points/{id}", () => ok(200, details(bsi)));
  client.answer("/v1/places/{id}/nearest-meeting-points", () =>
    ok(200, {
      place: thorlakshofn,
      withinReach: true,
      meetingPoints: [{ meetingPoint: fitjar, distanceM: 2440 }],
    }),
  );
}

/** Nothing anywhere: no ride of mine, no conversation, no ride leaving soon. */
const nothing = () => undefined;

const gunna = rider(
  "0190a1d6-0000-7000-8000-0000000000b7",
  "Gunna",
  { board: 1, alight: 2 },
  "not_here",
);
const reported = onTheDay({}, { dispute: dispute({ kind: "no_show" }) });

/** An address, with what the API answers there and what the page is then. */
interface Page {
  readonly path: string;
  /** The page's title, its first heading: it says the page showed what it is. */
  readonly title: string;
  readonly setUp: (client: FakeClient) => void;
  /** A member with no email, where the page asks for one first. */
  readonly me?: Me;
  /** When, where the page depends on it: noon on the Saturday otherwise. */
  readonly at?: Date;
  /** What its one main button says; null where the page has none. */
  readonly main: string | null;
  /** Where that button is: in the bar otherwise. */
  readonly button?: Place;
  /**
   * Words only this state of the page has, where another state of the
   * address has the same title and the same main button.
   */
  readonly shows?: string;
  /** A title 3.17 leaves centred. */
  readonly centred?: true;
  /**
   * A head of the page's own, where `ScreenHead` is not what it has: Find's
   * greeting over the search, the search that heads its results, and the
   * top of a conversation.
   */
  readonly head?: string;
}

const trip = `/drive/trips/${northMyTrip.id}`;
const posting = `/drive/trips/${draft.id}`;
const seat = `/bookings/${paidBooking.id}`;
const results = `/search/results?from=${borgarnes.id}&to=${blonduos.id}&fromName=Borgarnes&toName=Bl%C3%B6ndu%C3%B3s&seats=1`;
const noEmail: Me = { ...completeMe, email: null };

const pages: readonly Page[] = [
  // The five places of the menu.
  {
    path: "/",
    title: "Hi Anna",
    main: "Find a ride",
    setUp: finding,
    button: "the search card",
    head: "title-line",
  },
  { path: "/my-rides", title: "My rides", main: null, setUp: driving },
  {
    path: "/my-rides",
    title: "My rides",
    main: "Find a ride",
    setUp: nothing,
    button: "under the puffin",
  },
  { path: "/offer", title: "Where are you driving?", main: "Choose date and time", setUp: driving },
  {
    path: "/messages",
    title: "Messages",
    main: null,
    setUp: talking,
    shows: "Sunday 15 November · Borgarnes → Blönduós",
  },
  {
    path: "/messages",
    title: "Messages",
    main: null,
    setUp: nothing,
    shows:
      "Chats open once a booking is confirmed. Then you can message your driver or passengers here.",
  },
  { path: "/profile", title: "My profile", main: null, setUp: mine },
  // Finding a ride and booking a seat.
  {
    path: "/search",
    title: "Find a ride",
    main: "Find a ride",
    setUp: finding,
    button: "the search card",
  },
  {
    path: results,
    title: "Sunday 15 November",
    main: null,
    setUp: finding,
    head: "results-heading",
  },
  {
    path: "/rides",
    title: "Rides leaving soon",
    main: null,
    setUp: finding,
    shows: "Sun 15 Nov",
  },
  {
    path: "/rides",
    title: "Rides leaving soon",
    main: null,
    setUp: nothing,
    shows: "No rides are coming up yet.",
  },
  { path: `/places/${thorlakshofn.id}`, title: "Þorlákshöfn", main: null, setUp: finding },
  { path: "/meeting-points", title: "Meeting points", main: null, setUp: finding },
  { path: `/meeting-points/${bsi.id}`, title: "BSÍ bus terminal", main: null, setUp: finding },
  {
    path: `/meeting-points/${bsi.id}/problem`,
    title: "What's wrong here?",
    main: "Send",
    setUp: finding,
  },
  {
    path: `/trips/${northResult.tripId}?from=1&to=2`,
    title: "Borgarnes to Blönduós",
    main: "Send request",
    setUp: finding,
  },
  {
    path: `/trips/${northResult.tripId}/book?from=1&to=2&seats=1`,
    title: "Request this ride",
    main: "Send request",
    setUp: finding,
  },
  // A booked seat.
  { path: seat, title: "Your seat is confirmed", main: null, setUp: riding(paidBooking) },
  {
    path: seat,
    title: "Pay to keep your seat",
    main: "Pay 2,900 ISK",
    setUp: riding(unpaidBooking),
  },
  {
    path: `${seat}/booked`,
    title: "You're booked!",
    main: "See it in My rides",
    setUp: riding(paidBooking),
    centred: true,
  },
  {
    path: `${seat}/cancel`,
    title: "Cancel your booking",
    main: "Cancel booking",
    setUp: riding(paidBooking),
  },
  { path: seat, title: "Trip day", main: "I'm here", setUp: riding(onTheDay()), at: onTheTripDay },
  {
    path: `${seat}/driver-absent`,
    title: "The driver didn't come",
    main: "Tell PuffinRide",
    setUp: riding(onTheDay()),
    at: onTheTripDay,
  },
  {
    path: `/bookings/${gunna.id}/no-show`,
    title: "Mark as no-show: Gunna",
    main: "Mark as no-show",
    setUp: riding(gunna),
    at: onTheTripDay,
  },
  {
    path: `${seat}/answer`,
    title: "Is this right?",
    main: "Send answer",
    setUp: riding(reported),
    at: onTheTripDay,
  },
  {
    path: seat,
    title: "How was your ride?",
    main: "Rate the driver",
    setUp: riding(completedBooking()),
  },
  {
    path: `${seat}/rate`,
    title: "How was your ride?",
    main: "Send review",
    setUp: riding(completedBooking()),
  },
  { path: `${seat}/block`, title: "Block Anna?", main: "Block Anna", setUp: riding(paidBooking) },
  {
    path: `/messages/${chatBooking.id}`,
    title: "Anna",
    main: "Send",
    setUp: riding(chatBooking),
    head: "conversation-head",
  },
  // Offering a ride, and the driver's ride.
  {
    path: "/drive/trips/new",
    title: "Where are you driving?",
    main: "Choose date and time",
    setUp: driving,
  },
  {
    path: `${posting}/route`,
    title: "Where are you driving?",
    main: "Choose date and time",
    setUp: driving,
  },
  { path: `${posting}/time`, title: "When are you leaving?", main: "Choose seats", setUp: driving },
  {
    path: `${posting}/seats`,
    title: "Seats and preferences",
    main: "Set your price",
    setUp: driving,
  },
  { path: `${posting}/price`, title: "Set your price", main: "Check your ride", setUp: driving },
  { path: `${posting}/review`, title: "Check and publish", main: "Publish ride", setUp: driving },
  {
    path: `${trip}/published`,
    title: "Your ride is published",
    main: "See my rides",
    setUp: driving,
    centred: true,
  },
  { path: `${trip}/share`, title: "Share this ride", main: null, setUp: driving },
  { path: trip, title: "Your ride to Hof, Akureyri", main: null, setUp: driving },
  { path: `${trip}/message`, title: "Message all passengers", main: "Send", setUp: driving },
  { path: `${trip}/cancel`, title: "Cancel your ride", main: "Cancel the ride", setUp: driving },
  { path: `${trip}/edit`, title: "Edit the ride", main: null, setUp: driving },
  {
    path: `${trip}/edit/time`,
    title: "Change the departure",
    main: "Check the change",
    setUp: driving,
  },
  {
    path: `${trip}/edit/seats`,
    title: "Change the seats",
    main: "Save the change",
    setUp: driving,
  },
  {
    path: `${trip}/edit/price`,
    title: "Change the price",
    main: "Save the change",
    setUp: driving,
  },
  { path: `${trip}/edit/car`, title: "Change the car", main: "Save the change", setUp: driving },
  {
    path: `${trip}/edit/booking`,
    title: "Change how people book",
    main: "Save the change",
    setUp: driving,
  },
  {
    path: `${trip}/edit/details`,
    title: "Change the preferences and note",
    main: "Save the change",
    setUp: driving,
  },
  { path: `${trip}/edit/stop`, title: "Add a stop", main: null, setUp: driving },
  {
    path: `${trip}/edit/remove-stop`,
    title: "Remove a stop",
    main: "Check the change",
    setUp: driving,
  },
  {
    path: `${trip}/edit/check?departsAt=2026-11-15T09:45:00.000Z`,
    title: "Check the change",
    main: "Save the change",
    setUp: driving,
  },
  // Profile, and the pages it opens.
  { path: `/people/${annaProfileId}`, title: "Profile", main: null, setUp: mine },
  { path: `/people/${annaProfileId}/block`, title: "Block Anna?", main: "Block Anna", setUp: mine },
  {
    path: `/report?kind=profile&id=${annaProfileId}`,
    title: "Report Anna",
    main: "Send report",
    setUp: mine,
  },
  { path: "/profile/edit", title: "Edit profile", main: "Save profile", setUp: mine },
  { path: "/profile/preview", title: "As others see you", main: null, setUp: mine },
  { path: "/drive/cars", title: "My cars", main: null, setUp: mine },
  { path: "/drive/cars", title: "My cars", main: "Add a car", setUp: mineWithMore },
  { path: "/drive/cars/new", title: "Add a car", main: "Save car", setUp: mine },
  { path: `/drive/cars/${yaris.id}`, title: "Edit your car", main: "Save car", setUp: mine },
  { path: "/drive/licence", title: "Your driving licence", main: "Confirm", setUp: mine },
  { path: "/drive/photo", title: "Your profile photo", main: "Add a photo", setUp: mine },
  {
    path: "/notices",
    title: "Notices",
    main: null,
    setUp: mine,
    shows: "Nothing here. If PuffinRide ever acts on your account, you'll read why here.",
  },
  {
    path: "/notices",
    title: "Notices",
    main: null,
    setUp: mineWithMore,
    shows: "Reason: Repeated messages after being asked to stop.",
  },
  { path: "/feedback", title: "Send feedback", main: "Send feedback", setUp: mine },
  { path: "/settings/beta-news", title: "Beta news", main: null, setUp: mine },
  {
    path: "/settings/blocked",
    title: "Blocked people",
    main: null,
    setUp: mine,
    shows: "You haven't blocked anyone.",
  },
  {
    path: "/settings/blocked",
    title: "Blocked people",
    main: null,
    setUp: mineWithMore,
    shows: "Anna",
  },
  { path: "/settings/email", title: "Your email", main: "Send the link", setUp: mine },
  { path: "/settings/feedback", title: "My feedback", main: null, setUp: mine },
  { path: "/settings/language", title: "Language", main: null, setUp: mine },
  { path: "/settings/notifications", title: "Notifications", main: null, setUp: mine },
  { path: "/settings/password", title: "Choose a password", main: "Save password", setUp: mine },
  {
    path: "/settings/password",
    title: "Choose a password",
    main: "Add an email",
    setUp: mine,
    me: noEmail,
  },
  { path: "/settings/reports", title: "My reports", main: null, setUp: mine },
  { path: "/settings/sign-in-methods", title: "Sign-in methods", main: null, setUp: mine },
  { path: "/settings/privacy", title: "Privacy", main: null, setUp: mine },
  { path: "/settings/privacy/ask", title: "Ask about my data", main: "Send", setUp: mine },
  {
    path: "/settings/privacy/ask",
    title: "Ask about my data",
    main: "Add my email",
    setUp: mine,
    me: noEmail,
  },
  {
    path: "/settings/privacy/delete",
    title: "Delete my account",
    main: "Delete my account",
    setUp: mine,
  },
  { path: "/settings/privacy/delete", title: "Delete my account", main: null, setUp: mineWithMore },
  {
    path: "/settings/privacy/download",
    title: "Download my data",
    main: "Make my file",
    setUp: mine,
  },
  {
    path: "/settings/privacy/download",
    title: "Download my data",
    main: "Download the file",
    setUp: mineWithMore,
  },
  // What the website says about itself: centred, as About is.
  { path: "/about", title: "About PuffinRide", main: null, setUp: mine, centred: true },
  { path: "/legal", title: "About PuffinRide", main: null, setUp: mine, centred: true },
  { path: "/legal/terms", title: "Terms of Service", main: null, setUp: mine, centred: true },
  { path: "/cookies", title: "Cookies", main: null, setUp: mine, centred: true },
];

/**
 * The files under `src/app` that are no page a signed-in member opens to
 * do something, each with why: this test walks all the others.
 */
const notWalked: Readonly<Record<string, string>> = {
  "_layout.tsx": "the app's frame",
  "(tabs)/_layout.tsx": "the menu's frame",
  "+native-intent.tsx": "where a link opens, not a page",
  "sign-in/_layout.tsx": "sign-in's frame",
  "sign-in/index.tsx": "sign-in, which is spec 29's",
  "sign-in/code.tsx": "sign-in, which is spec 29's",
  "sign-in/country.tsx": "sign-in, which is spec 29's",
  "sign-in/email-code.tsx": "sign-in, which is spec 29's",
  "sign-in/invite.tsx": "sign-in, which is spec 29's",
  "sign-in/return.tsx": "sign-in, which is spec 29's",
  "onboarding/about-you.tsx": "signing up, which is spec 29's",
  "onboarding/face-id.tsx": "signing up, which is spec 29's",
  "onboarding/faster.tsx": "signing up, which is spec 29's",
  "onboarding/terms.tsx": "signing up, which is spec 29's",
  "invite/[code].tsx": "an invitation, which leads to sign-in",
  "coming-soon.tsx": "shown in place of the app while the beta is closed",
  "carpool-iceland.tsx": "a page for search engines, with the website's own look (spec 23)",
  "account/deletion.tsx": "an account that waits to be deleted: delete-account.test.tsx",
  "verify-email.tsx": "an email's link, which answers and leads on: email.test.tsx",
  "settings.tsx": "leads to Profile",
  "drive/trips/index.tsx": "leads to My rides",
};

/** The places of the menu, whose files are not named as their addresses. */
const menu: Readonly<Record<string, string>> = {
  "/": "(tabs)/index.tsx",
  "/my-rides": "(tabs)/my-rides.tsx",
  "/offer": "(tabs)/offer.tsx",
  "/messages": "(tabs)/messages.tsx",
  "/profile": "(tabs)/profile.tsx",
};

/** What stands in an address for a part of its file's name. */
const named: readonly (readonly [string, string])[] = [
  [`messages/${chatBooking.id}`, "messages/[bookingId]"],
  ["legal/terms", "legal/[type]"],
  [annaProfileId, "[profileId]"],
  ...[northMyTrip.id, draft.id, paidBooking.id, gunna.id, bsi.id, thorlakshofn.id, yaris.id].map(
    (id) => [id, "[id]"] as const,
  ),
];

function filesUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(folder, entry.name)) : [join(folder, entry.name)],
  );
}

/** A page's file for its address: `/trips/…/book?from=1` is `trips/[id]/book.tsx`. */
function fileOf(path: string, files: readonly string[]): string | undefined {
  const address = path.split("?")[0] ?? path;
  const place = menu[address];
  if (place !== undefined) return place;
  const file = named.reduce((name, [part, as]) => name.replace(part, as), address.slice(1));
  return [`${file}.tsx`, `${file}/index.tsx`].find((known) => files.includes(known));
}

async function open(page: Page) {
  mockNow = page.at ?? noon;
  await renderApp(page.path, { me: page.me ?? me, setUp: page.setUp });
  await screen.findByRole("header", { name: page.title });
  if (page.shows !== undefined) await screen.findByText(page.shows);
  await waitFor(() => {
    expect(screen.queryAllByLabelText("Loading")).toEqual([]);
  });
}

beforeEach(() => {
  mockNow = noon;
});

describe("The rules every page keeps (spec 31, R31.1 and 3.17)", () => {
  const app = join(__dirname, "..", "app");
  const files = filesUnder(app).map((file) => relative(app, file).split("\\").join("/"));

  it("walks every page a signed-in member opens to do something", () => {
    const walked = pages.map((page) => fileOf(page.path, files));
    expect(walked).not.toContain(undefined);
    expect(files.filter((file) => !walked.includes(file)).sort()).toEqual(
      Object.keys(notWalked).sort(),
    );
  });

  it.each(pages)(
    "$path, as $title, has its one main button, or none, where it belongs",
    async (page) => {
      await open(page);
      const buttons = filledButtons();
      const place = page.button ?? "the bar";
      // The one the page names, and no other; where it is; and tall, but for
      // the one under a puffin and the round one of a conversation's field.
      expect(buttons.map((button) => button.name)).toEqual(page.main === null ? [] : [page.main]);
      expect(buttons.map((button) => button.in)).toEqual(buttons.map(() => place));
      const round = page.title === "Anna" || page.title === "Message all passengers";
      expect(buttons.map((button) => button.tall)).toEqual(
        buttons.map(() => place !== "under the puffin" && !round),
      );
    },
  );

  it.each(pages)("$path, as $title, has its title at the left", async (page) => {
    await open(page);
    // In a head of the page's own the title is its first words.
    const title = (page.head === undefined
      ? screen.getByRole("header", { name: page.title })
      : within(screen.getByTestId(page.head)).getAllByText(/./)[0]) as unknown as Shown;
    const centred = styleOf(title).textAlign === "center";
    expect(centred ? "centred" : "at the left").toBe(
      page.centred === true ? "centred" : "at the left",
    );
    // At the left it is in the screen's head, or under the road of a
    // step, which stands beside Back in the head.
    if (page.centred === true || page.head !== undefined) return;
    const road = screen.queryAllByTestId("screen-head-road").length > 0;
    expect(road || inside(title, "screen-head")).toBe(true);
  });

  it.each(pages.filter((page) => page.centred !== true))(
    "$path, as $title, has nothing centred under its title but a control's own words",
    async (page) => {
      await open(page);
      expect(
        (screen.getAllByText(/./) as unknown as Shown[])
          .filter((text) => styleOf(text).textAlign === "center")
          .filter((text) => !pressed(text) && !underPuffin(text))
          .map((text) => String(text.props.children))
          .filter(
            (words) => !centredToo.some((own) => own.on.test(page.path) && own.words.test(words)),
          ),
      ).toEqual([]);
    },
  );
});
