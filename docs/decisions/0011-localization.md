# 0011. Icelandic and English from day one

- **Status:** Accepted (2026-11-13, by Martin once the MVP specs were approved)
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [conventions](../engineering/conventions.md#internationalisation),
  open question Q9

## Context

ShareRide's users include Icelanders, foreign residents and visitors. Polish
speakers are the largest foreign-language group in Iceland. Adding a language
later is cheap only if every string went through translation from the start.

## Options considered

1. **English only at first.** Fastest, but alienates many Icelanders and looks
   foreign in a local market.
2. **Icelandic only.** Local feel, excludes visitors and many residents.
3. **Icelandic and English from day one, more languages later.**

## Decision

- Ship with **Icelandic and English**. Polish is the next language (Phase 5).
- All user-facing text lives in translation files in `packages/i18n`, using
  **ICU MessageFormat** (correct plurals, including Icelandic plural rules).
- Default language follows the device; users can switch in settings.
- Server-side texts (email, SMS, push) are rendered in the recipient's chosen
  language.
- Numbers, dates and currency use `Intl` with the active locale; prices are
  shown as whole krónur ("2.500 kr." in Icelandic, "2,500 ISK" in English).
- Place names are stored in Icelandic with English names where they differ,
  and searchable without accents and special letters (þ→th, ð→d, æ→ae, ö→o).
- Sorting uses Icelandic collation for Icelandic users.
- A missing translation fails CI.

## Consequences

- Every feature needs two sets of texts; a native Icelandic speaker reviews
  them before release.
- Layouts must allow for longer Icelandic words.
- Adding Polish later is mostly translation work.

## Revisit when

User data shows strong demand for another language.
