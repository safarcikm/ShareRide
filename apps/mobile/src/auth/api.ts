import { createApiClient, type ApiClient } from "@shareride/api-client";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { Device } from "./session-manager";

/**
 * Where the API is. EXPO_PUBLIC_API_URL wins when set at build time. In
 * development on a phone with Expo Go, the API runs on the same computer as
 * the Expo server, so its address comes from there.
 */
export function apiBaseUrl(): string {
  // Expo inlines EXPO_PUBLIC_ variables at build time.
  const configured: unknown = process.env.EXPO_PUBLIC_API_URL;
  if (typeof configured === "string" && configured !== "") return configured;
  if (Platform.OS === "web") return "http://localhost:3000";
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host ?? "localhost"}:3000`;
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
