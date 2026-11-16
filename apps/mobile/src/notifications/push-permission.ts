import {
  AndroidImportance,
  PermissionStatus,
  getDevicePushTokenAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
} from "expo-notifications";
import { Platform } from "react-native";
import { reportError } from "@/lib/error-reporting";
import { projectId } from "./project-id";

/**
 * Whether push reaches this person on this phone (spec 7, 3.6.2): it is
 * on, the phone can still ask, or it is off (told no, or the app has no
 * expo.dev project yet, so no token can be registered). The web version
 * is push-permission.web.ts.
 */
export type PushState = "on" | "askable" | "off";

/** Android's channel for every ShareRide notification, named in the person's language. */
export async function setUpChannel(name: string): Promise<void> {
  if (Platform.OS !== "android") return;
  await setNotificationChannelAsync("default", { name, importance: AndroidImportance.HIGH });
}

export async function pushState(): Promise<PushState> {
  if (projectId() === undefined) return "off";
  const { granted, status, canAskAgain } = await getPermissionsAsync();
  if (granted) return "on";
  // Android may ask a second time after a no; the prompt takes the first no.
  return canAskAgain && status !== PermissionStatus.DENIED ? "askable" : "off";
}

/**
 * Asks the phone's own question; true once allowed. Getting the phone's
 * token then announces it, and PushNotifications registers it. If the
 * phone cannot give one now (no network, say), the next start tries again.
 */
export async function turnOnPush(channelName: string): Promise<boolean> {
  // Android 13 asks only once the app has a channel.
  await setUpChannel(channelName);
  const { granted } = await requestPermissionsAsync();
  if (granted) getDevicePushTokenAsync().catch(reportError);
  return granted;
}
