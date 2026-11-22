import { providerReturnPath } from "@shareride/domain";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

/**
 * Where Google's or Apple's window comes back to (ADR 0034): this web app's
 * own sign-in/return on the web; on phones the app's `shareride://` address,
 * or Expo Go's while developing, which only the stand-ins take.
 */
export function providerReturnUrl(): string {
  if (Platform.OS === "web") return `${window.location.origin}/${providerReturnPath}`;
  return Linking.createURL(providerReturnPath);
}
