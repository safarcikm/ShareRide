/**
 * English texts, in ICU MessageFormat. Keys are namespaced by feature. Every
 * key must exist in is.ts too; the type checker and a unit test enforce it.
 */
export const en = {
  "app.name": "ShareRide",
  "common.back": "Back",
  "language.switch": "Íslenska",
  "language.switchLabel": "Change the language to Icelandic",
  "welcome.title": "Share the ride across Iceland",
  "welcome.tagline":
    "Find a seat with someone already going your way, or share the empty seats in your car.",
  "welcome.browseTrips": "Browse trips",
  "comingSoon.title": "Coming soon",
  "comingSoon.body": "Finding and booking trips opens with the beta. Thank you for your patience.",
  "search.tripCount": "{count, plural, =0 {No trips} one {# trip} other {# trips}}",
  "format.money": "{amount} ISK",
} as const satisfies Record<string, string>;

export type MessageKey = keyof typeof en;
