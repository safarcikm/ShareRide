import { Redirect } from "expo-router";

/**
 * Settings is gone (spec 31, 3.14 item 3): its rows are on Profile, and
 * the language and the notifications have a page each. Its address leads
 * to Profile, for links and bookmarks made before.
 */
export default function SettingsScreen() {
  return <Redirect href="/profile" />;
}
