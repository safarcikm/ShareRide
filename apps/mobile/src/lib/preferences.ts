import * as SecureStore from "expo-secure-store";

// iOS and Android: small values in the device's secure storage. Failures are
// not fatal; the app falls back to defaults. The web version is
// preferences.web.ts.

export async function readPreference(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function writePreference(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Not saved; the choice still applies until the app restarts.
  }
}
