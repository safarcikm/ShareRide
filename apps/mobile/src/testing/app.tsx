// Renders the whole app in component tests, with a fake API behind it.
// Each test file mocks the API and token store modules with the stand-ins
// below (jest.mock calls must stay in the test file):
//
//   jest.mock("@/auth/api", () => jest.requireActual("@/testing/app").mockApiModule);
//   jest.mock("@/auth/token-store", () => jest.requireActual("@/testing/app").mockTokenStoreModule);
import type { ApiClient } from "@shareride/api-client";
import type { DriverReadiness, Me, PublicProfile } from "@shareride/contracts";
import { peopleColourOf } from "@shareride/domain";
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { createFakeClient, ok, testMe, tokens, type FakeClient } from "./fake-client";
import { memoryTokenStore } from "./memory-token-store";

let currentClient: FakeClient = createFakeClient();
const store = memoryTokenStore();

/** Stands in for `@/auth/api`: the app talks to the current fake client. */
export const mockApiModule = {
  apiBaseUrl: () => "http://localhost:3000",
  createClient: (): ApiClient => ({ call: (route, input) => currentClient.call(route, input) }),
  thisDevice: () => ({ platform: "ios" as const, appVersion: "0.1.0" }),
};

/** Stands in for `@/auth/token-store`. */
export const mockTokenStoreModule = { tokenStore: store };

/**
 * Renders the app at `initialUrl`. Signed in when `me` is given: a refresh
 * token is stored and the API restores the session at start.
 */
export async function renderApp(
  initialUrl: string,
  options: {
    readonly me?: Me;
    /** Changes the fake API's answers before the app starts. */
    readonly setUp?: (client: FakeClient) => void;
  } = {},
) {
  currentClient = createFakeClient();
  store.value = null;
  const { me } = options;
  currentClient.answer("/v1/legal/{type}/current", (input) => {
    const { type } = input["params"] as { type: string };
    return ok(200, legalDocument(type, 1));
  });
  // The operator's settings: the beta is open, unless a test says otherwise.
  currentClient.answer("/v1/config", () =>
    ok(200, {
      beta: false,
      paused: [],
      maxSeats: 8,
      freeCancellationMinutes: 15,
      maxMoveMinutes: 120,
      reliabilityMonths: 12,
      signInProviders: [],
      emailSignIn: true,
    }),
  );
  // The front page's rides leaving soon: none, unless a test says otherwise.
  currentClient.answer("/v1/trips/soonest", () => ok(200, { results: [] }));
  // The meeting points for the map on a wide front page: none, likewise.
  currentClient.answer("/v1/meeting-points", () => ok(200, { meetingPoints: [] }));
  if (me !== undefined) {
    store.value = "sr_rt_stored";
    currentClient.answer("/v1/auth/refresh", () => ok(200, tokens(1)));
    currentClient.answer("/v1/me", () => ok(200, me));
    answerOwnProfile(currentClient, me);
  }
  // Once signed in, unless a test says otherwise: nothing in My rides and
  // Your next ride, a new driver with no car for the Driving rows on
  // Profile and nothing linked for its Sign-in methods row, no chats for
  // the Messages badge, trip reminders and beta news on in Notifications,
  // and no beta news yet. A change answers with the settings changed.
  currentClient.answer("/v1/me/notification-settings", (input) =>
    ok(200, { reminders: true, betaNews: true, ...(input["body"] as object | undefined) }),
  );
  currentClient.answer("/v1/me/announcements", () => ok(200, { announcements: [] }));
  currentClient.answer("/v1/me/bookings", () => ok(200, { bookings: [] }));
  currentClient.answer("/v1/me/trips", () => ok(200, { trips: [] }));
  currentClient.answer("/v1/me/driver-readiness", () => ok(200, newDriver));
  currentClient.answer("/v1/me/vehicles", () => ok(200, { vehicles: [] }));
  currentClient.answer("/v1/me/sign-in-methods", () =>
    ok(200, { methods: [], password: null, passkeys: [] }),
  );
  currentClient.answer("/v1/me/conversations", () => ok(200, { conversations: [], unread: 0 }));
  options.setUp?.(currentClient);
  const result = await renderRouter("./src/app", { initialUrl });
  return { ...result, client: currentClient, store };
}

/**
 * My own profile as others see it, with no reviews yet: Profile reads it
 * for my rating (spec 31, 3.14) and the last posting step for the ticket
 * people will see (3.11). Anyone else's is for the test to answer, as
 * every call is.
 */
function answerOwnProfile(client: FakeClient, me: Me) {
  client.answer("/v1/people/{profileId}", (input) => {
    const { profileId } = input["params"] as { profileId: string };
    if (profileId !== me.profileId) throw new Error("No fake answer for /v1/people/{profileId}");
    return ok(200, ownProfile(me));
  });
}

/** A signed-in person's profile as others see it, before any ride: no reviews, no figure. */
export function ownProfile(me: Me, changes: Partial<PublicProfile> = {}): PublicProfile {
  const none = { kept: 0, counted: 0 };
  return {
    profileId: me.profileId,
    firstName: me.firstName ?? "",
    about: me.about,
    languages: me.languages,
    phoneVerified: me.phoneNumber !== null,
    emailVerified: me.email !== null,
    memberSince: me.memberSince.slice(0, 7),
    colour: peopleColourOf(me.id),
    photo: me.photo === null || me.photo.hidden ? null : me.photo.url,
    rating: { average: null, count: 0 },
    reliability: { ...none, percent: null, byRole: { driver: none, passenger: none } },
    ...changes,
  };
}

/** A driver who has done nothing yet: no photo, car or licence. */
export const newDriver: DriverReadiness = {
  ready: false,
  items: [
    { item: "photo", done: false, blocking: false },
    { item: "car", done: false, blocking: true },
    { item: "licence", done: false, blocking: true },
  ],
  licenceDeclaredAt: null,
};

/** An account that has finished signing up. */
export const completeMe: Me = {
  ...testMe,
  firstName: "Anna",
  about: "I drive between Reykjavík and Akureyri most weekends.",
  languages: ["is", "en"],
  ageConfirmed: true,
  missingSteps: [],
};

const legalTitles: Record<string, string> = {
  terms: "Terms of Service",
  "community-rules": "Community Rules",
  privacy: "Privacy Policy",
};

/** A legal document as the API returns it, in English. */
export function legalDocument(type: string, version: number, body = "Draft text.") {
  return {
    type,
    version,
    material: true,
    publishedAt: "2026-11-13T12:00:00.000Z",
    locale: "en",
    title: legalTitles[type] ?? type,
    summary: "First version.",
    body,
  };
}

/**
 * From step 1 of sign-in, signs in with an email code as a member (spec
 * 26): an account that has finished signing up, unless `me` is given.
 */
export async function signInByEmail(client: FakeClient, me: Me = completeMe): Promise<void> {
  answerOwnProfile(client, me);
  client.answer("/v1/auth/email/start", () => ok(202, { resendAfterSeconds: 30 }));
  client.answer("/v1/auth/email/verify", () =>
    ok(200, { status: "signedIn", ...tokens(1), user: me, isNewUser: false }),
  );
  await fireEvent.changeText(await screen.findByLabelText("Email"), "anna@example.com");
  await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
  await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
}
