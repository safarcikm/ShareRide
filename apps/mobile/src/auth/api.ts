import { createApiClient, type ApiClient } from "@shareride/api-client";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { Device } from "./session-manager";

export interface ApiAddressSources {
  /** EXPO_PUBLIC_API_URL, inlined at build time. */
  readonly configured: unknown;
  readonly platform: string;
  /** True in the Expo development server, false in an exported build. */
  readonly development: boolean;
  /** The web page's origin, on the web. */
  readonly pageOrigin?: string | undefined;
  /** The Expo server's host and port, with Expo Go on a phone. */
  readonly expoHost?: string | undefined;
}

/**
 * Where the API is. EXPO_PUBLIC_API_URL wins when set at build time. An
 * exported web build is served by the API itself (staging and production),
 * so it uses its own origin. In development the API runs on port 3000 of the
 * same computer as the Expo server.
 */
export function chooseApiBaseUrl(sources: ApiAddressSources): string {
  const { configured } = sources;
  if (typeof configured === "string" && configured !== "") return configured;
  if (sources.platform === "web") {
    if (!sources.development && sources.pageOrigin !== undefined) return sources.pageOrigin;
    return "http://localhost:3000";
  }
  const host = sources.expoHost?.split(":")[0];
  return `http://${host ?? "localhost"}:3000`;
}

export function apiBaseUrl(): string {
  return chooseApiBaseUrl({
    // Expo inlines EXPO_PUBLIC_ variables at build time.
    configured: process.env.EXPO_PUBLIC_API_URL,
    platform: Platform.OS,
    development: __DEV__,
    // React Native has a `window` without `location`, so ask only on the web.
    pageOrigin: Platform.OS === "web" ? window.location.origin : undefined,
    expoHost: Constants.expoConfig?.hostUri,
  });
}

export function createClient(): ApiClient {
  return createApiClient({
    baseUrl: apiBaseUrl(),
    // The browser sends and keeps the refresh cookie only with credentials.
    ...(Platform.OS === "web" ? { credentials: "include" as const } : {}),
  });
}

export function thisDevice(): Device {
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
  const appVersion = Constants.expoConfig?.version;
  return appVersion === undefined ? { platform } : { platform, appVersion };
}
