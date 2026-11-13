import type { TokenStore } from "@/auth/session-manager";

/** A token store in memory, for tests. */
export function memoryTokenStore(initial: string | null = null): TokenStore & {
  value: string | null;
} {
  const store = {
    value: initial,
    read: () => Promise.resolve(store.value),
    write: (token: string) => {
      store.value = token;
      return Promise.resolve();
    },
    clear: () => {
      store.value = null;
      return Promise.resolve();
    },
  };
  return store;
}
