import * as SecureStore from "expo-secure-store";
import type { TokenStore } from "./session-manager";

// iOS and Android: the refresh token in the Keychain or Keystore (ADR 0016).
// The web version is token-store.web.ts.
const key = "refreshToken";

export const tokenStore: TokenStore = {
  async read() {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  write: (token) => SecureStore.setItemAsync(key, token),
  clear: () => SecureStore.deleteItemAsync(key),
};
