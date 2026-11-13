// Web: localStorage. Only for non-secret settings such as the language.

export function readPreference(key: string): Promise<string | null> {
  try {
    return Promise.resolve(globalThis.localStorage.getItem(key));
  } catch {
    return Promise.resolve(null);
  }
}

export function writePreference(key: string, value: string): Promise<void> {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode); the choice applies to this visit only.
  }
  return Promise.resolve();
}
