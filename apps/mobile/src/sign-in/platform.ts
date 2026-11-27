import type { SignInPlatform } from "@shareride/domain";
import { Platform } from "react-native";

/** Where this app runs, as the sign-in rules tell platforms apart (spec 32, 3.3). */
export const signInPlatform = (): SignInPlatform =>
  Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
