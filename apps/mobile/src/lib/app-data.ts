import { File, Paths } from "expo-file-system";

// iOS and Android: small values that belong to this app on this device, as
// files in the app's own documents folder. They go when the app is deleted,
// unlike the secure storage in preferences.ts, which iOS can keep after the
// app is removed. Failures are not fatal; the app goes without the value.
// The web version is app-data.web.ts.

const fileFor = (key: string) => new File(Paths.document, "app-data", `${key}.json`);

export async function readAppData(key: string): Promise<string | null> {
  try {
    const file = fileFor(key);
    return file.exists ? await file.text() : null;
  } catch {
    return null;
  }
}

export async function writeAppData(key: string, value: string): Promise<void> {
  try {
    const file = fileFor(key);
    if (!file.exists) file.create({ intermediates: true });
    await file.write(value);
  } catch {
    // Not saved; the app works without it.
  }
}
