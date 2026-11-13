/** Languages the app ships in (ADR 0011). Polish comes later. */
export const locales = ["is", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/**
 * The app opens in the device's language if it is Icelandic or English,
 * otherwise in English (spec 1, section 3.1). `preferred` is the device's
 * list of language tags, most preferred first.
 */
export function pickLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const language = tag.split("-")[0]?.toLowerCase() ?? "";
    if (isLocale(language)) return language;
  }
  return defaultLocale;
}
