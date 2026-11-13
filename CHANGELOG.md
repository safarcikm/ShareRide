# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Once the apps ship,
releases follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added (Phase 2, build)

- Milestone 1 plan (foundation and phone sign-in) and ADR 0016: our own
  sign-in module instead of an auth library.
- Monorepo with pnpm workspaces, Turborepo and a shared tool catalog; shared
  TypeScript, ESLint and Prettier configuration in `packages/config`.
- `packages/domain` with the first rule: money as integer amounts with a
  currency, and the `Result` type for domain errors. Lint rules keep the
  domain free of I/O, frameworks, clock and randomness.
- CI for code: format, lint, type check, unit tests and a dependency audit
  on every pull request; Dependabot for npm packages.
- API skeleton (Hono): `/v1/health`, `/v1/health/ready` and
  `/v1/openapi.json`, the standard error shape, request IDs, security headers
  and JSON logs that redact personal data; environment checked at start-up.
- `packages/db` (Drizzle, PostgreSQL 18 with PostGIS) with the first
  migration, and `packages/contracts` for the API's schemas and routes.
- Local database with Docker Compose; API container image built in CI; CI
  runs integration tests against PostgreSQL with PostGIS.
- The app (`apps/mobile`, Expo SDK 58 with Expo Router) for iOS, Android and
  the web: welcome screen with a language switch and a "coming soon" page;
  opens in the device's language if Icelandic or English.
- `packages/i18n`: Icelandic and English texts in ICU MessageFormat with
  typed keys, a test that both languages have the same keys and arguments,
  money formatting ("2.500 kr." and "2,500 ISK") and country names.
- CI bundles the app for iOS, Android and the web and runs browser tests at
  phone and desktop sizes.
- Phone sign-in in the API (spec 1, ADR 0016): send and check a 6-digit code,
  sign up or sign in, rotating refresh tokens with reuse detection, sign out
  on one or all devices, my account and profile, legal documents and their
  acceptance with the age confirmation. Codes, numbers in sign-in tables and
  tokens are stored only as hashes; limits per number, IP address and
  country calling code.
- Domain rules for phone numbers, codes, sending limits, token rotation,
  profile fields and the legal gate (rules R1.1 to R1.7).
- `packages/api-client`: a typed client for the API, checked against the
  contracts. A development SMS sender prints codes in the API terminal.
- Draft Terms, Community Rules and Privacy Policy for development
  (`pnpm --filter @shareride/db seed`).

- Visual design system (spec 15) with the first screen designs, and ADR 0017
  (accepted): our own parts on React Native primitives, the fonts Fredoka and
  Nunito, `react-native-svg` drawings and Lucide icons.

### Changed

- MVP feature list rewritten with feature IDs, priorities, questions for the
  owner and the order in which specs are written.

### Added

- Spec 1: sign-in, profile, settings and legal acceptance (approved).
- Spec 2: meeting points, place search and their admin (approved).
- Spec 3: driver setup and posting a trip with prices (approved).
- Spec 4: search and trip details (approved).
- Spec 5: booking and requests (approved).
- Spec 6: changes and cancellations (approved).
- Spec 7: chat, notifications and reminders (approved).
- Spec 8: trip day, reviews and reliability (approved).
- Spec 9: safety and moderation (approved).
- Spec 10: operator settings and metrics (approved).
- Spec 11: privacy self-service (approved).
- Spec 12: beta access and feedback (approved). All MVP specs are approved.
- Spec 13: payments, refunds, payouts and receipts (approved).
- ADR 0012: one price level per trip instead of per-segment price editing
  (supersedes ADR 0006).
- ADR 0013: all payments through the app, from the beta (supersedes ADR
  0008).
- ADR 0014: a passenger service fee from public launch (answers Q5).
- ADRs 0007, 0009, 0010 and 0011 accepted; open questions Q5, Q8, Q9, Q10,
  Q11 and Q13 answered.
- Launch corridors decided (Q6): Selfoss, Keflavík Airport, and Akranes and
  Borgarnes, with Akureyri if the waitlist shows demand.
- Women-only trips in the MVP (Q12): spec 14 (approved) and ADR 0015
  (accepted). All open questions are answered.
- Development strategy, roadmap and open questions.
- Product vision, pricing and seat rules, meeting point strategy.
- Architecture overview, domain model and integrations.
- Architecture Decision Records 0001 to 0011.
- Engineering workflow, conventions, testing, CI/CD, security and Claude Code
  setup guides.
- Legal, regulatory and privacy notes for Iceland.
- Repository conventions: CLAUDE.md, CONTRIBUTING.md, PR and issue templates,
  CODEOWNERS, docs CI, shared Claude Code settings and the `write-adr` skill.
