import type { MessageKey } from "./en.ts";

/**
 * Icelandic texts. Drafts until a native speaker has reviewed them before
 * release (ADR 0011).
 */
export const is = {
  "app.name": "ShareRide",
  "common.back": "Til baka",
  "language.switch": "English",
  "language.switchLabel": "Skipta yfir í ensku",
  "welcome.title": "Samferða um allt Ísland",
  "welcome.tagline":
    "Fáðu far með einhverjum sem er þegar á leiðinni, eða deildu lausum sætum í bílnum þínum.",
  "welcome.browseTrips": "Skoða ferðir",
  "comingSoon.title": "Kemur fljótlega",
  "comingSoon.body": "Leit og bókun ferða opnar með prufuútgáfunni. Takk fyrir þolinmæðina.",
  "search.tripCount": "{count, plural, =0 {Engar ferðir} one {# ferð} other {# ferðir}}",
  "format.money": "{amount} kr.",
} as const satisfies Record<MessageKey, string>;
