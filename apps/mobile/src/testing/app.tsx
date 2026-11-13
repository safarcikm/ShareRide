// Renders the whole app in component tests, with a fake API behind it.
// Each test file mocks the API and token store modules with the stand-ins
// below (jest.mock calls must stay in the test file):
//
//   jest.mock("@/auth/api", () => jest.requireActual("@/testing/app").mockApiModule);
//   jest.mock("@/auth/token-store", () => jest.requireActual("@/testing/app").mockTokenStoreModule);
import type { ApiClient } from "@shareride/api-client";
import type { Me } from "@shareride/contracts";
import { renderRouter } from "expo-router/testing-library";
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
  if (me !== undefined) {
    store.value = "sr_rt_stored";
    currentClient.answer("/v1/auth/refresh", () => ok(200, tokens(1)));
    currentClient.answer("/v1/me", () => ok(200, me));
  }
  options.setUp?.(currentClient);
  const result = await renderRouter("./src/app", { initialUrl });
  return { ...result, client: currentClient, store };
}

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
