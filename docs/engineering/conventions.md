# Engineering conventions

**Owner:** Martin · **Last reviewed:** 2026-11-13

Rules that apply to all code. Tool-specific settings (lint, format) are added
when the monorepo is scaffolded; this page records the intent.

## Code

- TypeScript strict mode, no `any` without a comment explaining why.
- Names follow the [glossary](../glossary.md): `MeetingPoint`, `Trip`,
  `TripStop`, `Segment`, `Booking`. Don't invent synonyms (no `Ride`,
  `Journey`, `Reservation` in code).
- Files and folders in `kebab-case`; types and components in `PascalCase`;
  functions and variables in `camelCase`; database tables and columns in
  `snake_case`.
- Domain code is pure: no network, database, clock or randomness. Pass time
  and IDs in as arguments so tests are deterministic.
- Errors: domain functions return typed results (`ok` or a named error such as
  `SeatsUnavailable`), not thrown exceptions. The API maps them to HTTP status
  codes and translated messages.
- Comments explain *why*, not *what*.
- No dead code, no commented-out code, no TODO without an issue link.

## Money

- Represent money as `{ amount: number; currency: "ISK" }` where `amount` is
  an integer in the currency's minor unit. ISK uses 0 decimal places
  (ISO 4217), so `amount` is whole krónur.
- Never use floating-point arithmetic for money. Rounding happens once, in the
  domain function that defines the rule.
- Store `amount` as `bigint` or `integer` and `currency` as `char(3)`.

## Time

- Store instants as `timestamptz` (UTC). Never store local times without a
  zone.
- Display in `Atlantic/Reykjavik`, labelled when the device is in another
  zone ("14:30 Iceland time").
- A trip date ("Saturday 14 March") is derived from the first stop's planned
  time in Iceland time.
- Inject a clock in application services; never call `Date.now()` in domain
  code.

## Identifiers

- UUID v7 for primary keys and public IDs.
- Never expose sequential numbers or internal database IDs that reveal volume.

## Internationalisation

- Every user-facing string goes through `packages/i18n` with ICU messages.
  Keys are namespaced by feature: `booking.cancel.confirmTitle`.
- No string concatenation for sentences; use message arguments.
- Format numbers, dates and currency with `Intl` using the active locale.
- Translations for Icelandic and English are required for merge; CI checks for
  missing keys.

## API

- Resource-oriented JSON over HTTPS under `/v1`.
- Request and response bodies are defined once as Zod schemas in
  `packages/contracts`; the OpenAPI document and typed client are generated.
- Use `camelCase` in JSON.
- Pagination with cursors. Filtering by query parameters.
- Errors use one shape: `{ error: { code, message, details? } }`, where `code`
  is stable and machine-readable.
- Every state-changing endpoint accepts an `Idempotency-Key` header.

## Database

- Migrations are forward-only, reviewed, and follow expand then contract.
- Every table has `created_at` and `updated_at`.
- Foreign keys and constraints are mandatory where the data model implies them.
- Soft delete only where retention rules require it; otherwise delete.
- Personal data columns are listed in the record of processing activities.

## Accessibility

- Target WCAG 2.2 AA on every screen.
- All interactive elements have accessible labels and a minimum touch target
  of 44 by 44 points.
- Support dynamic type, screen readers (VoiceOver, TalkBack) and reduced
  motion.
- Colour contrast checked in the design system; never use colour alone to
  convey meaning (seat availability, warnings).

## Logging

- Structured JSON logs with a request ID.
- No personal data in logs: no names, phone numbers, emails, message bodies or
  precise locations. Log IDs instead.
- Log levels: `error` for things that need action, `warn` for degraded
  behaviour, `info` for business events, `debug` off in production.

## Dependencies

- Prefer the platform and existing dependencies.
- New runtime dependencies need a reason in the PR: what it does, why we can't
  do without it, its licence and maintenance status.
- Automated dependency updates run weekly; major upgrades get their own PR.
