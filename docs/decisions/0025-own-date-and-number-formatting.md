# 0025. Our own date and number formatting instead of Intl's locale data

- **Status:** Proposed
- **Date:** 2026-11-15
- **Deciders:** Martin
- **Related:** would supersede the formatting line of
  [ADR 0011](0011-localization.md);
  [conventions](../engineering/conventions.md#internationalisation),
  [spec 3](../specs/2026-11-13-post-a-trip.md) (the first screens with dates)

## Context

[ADR 0011](0011-localization.md) said numbers, dates and currency use `Intl`
with the active locale. `Intl` relies on locale data that the browser or the
phone's JavaScript engine carries. Not all of them carry Icelandic data, and
without it `Intl` quietly falls back: a test browser showed "M11 15, Sun"
for 15 November, and numbers came out with English marks ("2,500" where
Icelandic writes "2.500"). Hermes, the engine in the iOS and Android app,
does not support all of `Intl` either (it has no `Intl.DisplayNames`). A
wrong month name or a wrong thousands mark on a price looks broken to an
Icelandic user, and our tests would not catch it on every device.

The amount of data we need is small: twelve month names and seven weekday
names in two languages, two digit marks, and the 24-hour clock that both
languages use.

## Options considered

1. **Keep `Intl` and accept the fallback.** No code to keep. Icelandic users
   on some browsers and phones see "M11" and English marks, and we cannot
   test every engine.
2. **Bundle full ICU data for Icelandic** (a polyfill such as FormatJS's
   locale data). Correct everywhere, but adds a runtime dependency and data
   to every bundle, and still needs checking on each engine.
3. **Our own names and marks in `packages/i18n`.** A few dozen lines and two
   short lists per language, the same result on every device, and plain unit
   tests. Each new language (Polish in Phase 5) needs its names and marks
   added by hand.

## Decision

We will format dates, numbers, money, distances and driving times shown to
users with our own functions in `packages/i18n` (`formatMoney`,
`formatDate`, `formatDay`, `formatMonth`, `formatWeekdays`, `formatClock`,
`formatDistance`, `formatDuration`), which carry their own month and weekday
names and digit marks, instead of `Intl`'s locale data, because that data is
missing on some browsers and phones and the fallback shows wrong text.
`Intl` stays for working out the time in Iceland, which needs only the time
zone, and for sorting. The rest of ADR 0011 stands.

## Consequences

- Dates and prices read the same on iOS, Android and every browser, and unit
  tests cover them.
- Screens never call `Intl` or `toLocaleString` to format dates or numbers;
  they use these functions.
- We keep the month and weekday names ourselves. They change rarely, but a
  native speaker checks them with the other Icelandic texts.
- Adding Polish means adding its names, marks and grammar for dates by hand.
- Sorting still uses `Intl.Collator` with Icelandic rules (ADR 0011). It has
  the same data risk; check it when the meeting point list grows.
- Once accepted, ADR 0011's status notes that its formatting line is
  superseded by this ADR.

## Revisit when

- Hermes and the browsers we support all ship full Icelandic locale data.
- We add a language whose date grammar our functions cannot express simply.
