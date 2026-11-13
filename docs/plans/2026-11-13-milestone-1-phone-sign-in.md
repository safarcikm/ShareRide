# Milestone 1 plan: foundation and phone sign-in

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved by Martin
(2026-11-13, PR #4); in progress

Implements the first half of the Phase 2 walking skeleton
([roadmap](../strategy/roadmap.md#phase-2-build)) and the phone sign-in parts of
[spec 1](../specs/2026-11-13-sign-in-and-profile.md). Builds on ADRs
[0002](../decisions/0002-monorepo-and-typescript.md),
[0003](../decisions/0003-cross-platform-client-expo.md),
[0004](../decisions/0004-backend-modular-monolith.md),
[0005](../decisions/0005-postgresql-postgis.md),
[0010](../decisions/0010-authentication-and-identity.md),
[0011](../decisions/0011-localization.md) and
[0016](../decisions/0016-own-sign-in-module.md) (own sign-in module, accepted
2026-11-13).

## 1. Goal

When this milestone is done:

- On a fresh clone, `pnpm install` and `pnpm dev` start the database, the API
  and the app.
- A person can sign up and sign in with a phone number on iOS, Android and the
  web, in Icelandic or English, confirm their age, accept the terms, set a
  first name, edit their profile and sign out on one or all devices.
- CI proves this on every pull request: lint, types, unit and integration
  tests, translation completeness, app bundles for all three platforms, and
  browser tests of the sign-up journey.

## 2. Scope

| In milestone 1 | Moved to milestone 2 or later |
| -------------- | ----------------------------- |
| Monorepo, shared config, CI, Dependabot for npm | Staging in an EEA region (hosting provider ADR) |
| Local development with Docker Compose (PostgreSQL 18 with PostGIS) | A real SMS provider (provider ADR); locally a development SMS sender shows the code in the API terminal |
| API with health checks, structured logs, OpenAPI document, container image built in CI | Error tracking (provider ADR) and uptime checks |
| Expo app on iOS, Android (Expo Go) and web | Development builds with EAS, Maestro tests on iOS and Android |
| Icelandic and English with a CI check for missing keys | Meeting points on a map and in a list (map tiles provider) |
| Phone sign-in, terms and age, first-name profile, sessions, sign out | Apple and Google sign-in, profile photo, public profile, device list screen, change phone number |
| Placeholder legal texts, marked as drafts | The real Terms and Community Rules (legal track) |

Milestone 2 gets its own plan once this one is merged. It needs four
provider choices from Martin (hosting, SMS, error tracking, map tiles), each
raised as a short ADR with a recommendation.

## 3. Choices made at scaffolding

ADR 0002 leaves exact tools to scaffolding. These are the versions current on
2026-11-13; the lockfile pins them and Dependabot keeps them current.

| Area | Choice | Why |
| ---- | ------ | --- |
| Runtime | Node.js 26 (active LTS) in `.nvmrc` and `engines` | Current LTS; supported by Expo SDK 58 |
| Package manager | pnpm 12, set in `packageManager` | ADR 0002 |
| Task runner | Turborepo 2 | ADR 0002; local cache only, no remote cache service |
| Language | TypeScript 6.0, strict | Expo SDK 58 ships with 6.0 and typescript-eslint supports up to 6.0; move to TypeScript 7 when both do |
| App | Expo SDK 58, Expo Router, React Native 0.88 | ADR 0003 |
| API | Hono 4 with `@hono/zod-openapi`, Zod 4 | ADR 0004 confirms Hono at scaffolding |
| Database | PostgreSQL 18 with PostGIS 3.7 (`postgis/postgis:18-3.7`), Drizzle ORM and drizzle-kit | ADR 0005 |
| Unit and API tests | Vitest 5 | Testing strategy |
| App component tests | jest-expo with React Native Testing Library | Testing strategy |
| Browser tests | Playwright | Testing strategy |
| Lint and format | ESLint 10 (flat config) with typescript-eslint and `eslint-config-expo`, Prettier | Mainstream, works with Expo, and can enforce module boundaries (ADR 0004) |
| Translations | FormatJS (`intl-messageformat`, `react-intl`) | The reference ICU MessageFormat library (ADR 0011); handles Icelandic plurals |
| Phone numbers | `libphonenumber-js` | Correct E.164 parsing for every country; pure code, allowed in the domain package |
| Logs | pino, JSON, with redaction of phone numbers and tokens | Conventions: no personal data in logs |
| IDs | UUID v7 generated in the API (`uuid` package) | ADR 0005; works on any PostgreSQL host |
| Typed API client | Inferred from the route definitions in `packages/contracts`, using `fetch`; no code generation step | One source for the API shape; the OpenAPI document is generated from the same definitions |

Not added yet, with the reason:

- **CodeQL and GitHub dependency review** need a paid GitHub security plan on
  a private repository. CI runs `pnpm audit` for high and critical advisories
  instead. Revisit before the beta.
- **`Idempotency-Key` handling** arrives with the first booking or payment
  endpoint. The milestone 1 endpoints are safe to retry, and a stored reply
  would contain tokens, which must not be kept.
- **A job queue and outbox** arrive in milestone 2 with the real SMS provider.
  In milestone 1 the API sends the code directly, with a timeout.

## 4. Design notes

### 4.1 Repository layout (milestone 1 part)

```text
apps/
  api/            # Hono API: modules auth, users, legal; platform code (db, logger, sms)
  mobile/         # Expo app (iOS, Android, web)
packages/
  config/         # tsconfig bases, ESLint and Prettier config, Vitest preset
  domain/         # Pure rules: money, phone numbers, codes, sessions, legal gates
  contracts/      # Zod schemas and route definitions for /v1
  api-client/     # Typed fetch client inferred from contracts
  db/             # Drizzle schema, SQL migrations, seed (placeholder legal texts)
  i18n/           # en and is messages, country names, formatting helpers, key check
infra/
  docker/         # compose.yml for local PostgreSQL with PostGIS
```

Module boundaries are enforced by ESLint: `packages/domain` may not import
anything with I/O or a framework; an API module may not import another
module's internals.

### 4.2 Sign-in flow

1. `POST /v1/auth/phone/start` with a phone number. The API normalises it to
   E.164, checks the country is supported (Iceland, the EEA, the UK, the US and
   Canada), applies the limits, stores a hashed 6-digit code and sends it. The
   reply is the same whether or not an account exists:
   `202 { resendAfterSeconds: 30 }`.
2. `POST /v1/auth/phone/verify` with the number, the code and device details.
   Wrong code: `400 code_invalid` with attempts left. On success the code is
   used up, the user is found or created, a session starts, and the reply has
   the tokens and what is still needed (`legal`, `profile`).
3. `POST /v1/auth/refresh` rotates both tokens. Reuse of a rotated refresh
   token ends the session (with the 30-second retry grace in ADR 0016).
4. `POST /v1/auth/sign-out` ends this session, or all sessions with
   `{ all: true }`.

Limits (rules R1.2 and R1.3): one code per 30 seconds and 5 per hour per
number; 10 per hour per IP address; per country calling code, 500 per hour
for +354 and 50 per hour for each other prefix. The last two are starting
values, kept in configuration and tuned with real traffic. Passing a prefix
limit logs a warning event without the number; in milestone 2 error tracking
turns it into an alert on Martin's phone.

### 4.3 Data (first migrations)

| Table | Main columns |
| ----- | ------------ |
| `users` | `id`, `phone_e164` (unique), `phone_verified_at`, `first_name`, `about`, `languages`, `locale`, `email`, `email_verified_at`, `age_confirmed_at`, `roles`, `status`, `created_at`, `updated_at` |
| `verification_codes` | `id`, `phone_e164`, `code_hash`, `expires_at`, `attempts`, `used_at`, `created_at` |
| `sessions` | `id`, `user_id`, `device_name`, `platform`, `app_version`, `created_at`, `last_active_at`, `ended_at`, `end_reason` |
| `session_tokens` | `id`, `session_id`, `kind` (access or refresh), `token_hash`, `expires_at`, `rotated_at`, `created_at` |
| `legal_documents` | `id`, `type`, `version`, `material`, `texts` (per language), `published_at` |
| `legal_acceptances` | `id`, `user_id`, `document_id`, `version`, `locale`, `accepted_at` |
| `rate_limit_events` | `id`, `scope`, `key_hash`, `created_at` |

The first migration also enables the `postgis`, `unaccent` and `pg_trgm`
extensions, so a host without them fails early. Rate-limit keys are hashed,
so the table holds no phone numbers or IP addresses. Clean-up of old codes,
ended sessions and rate-limit events (spec 1, section 7) runs as a scheduled
job once the worker exists in milestone 2; until then nothing reaches
production.

### 4.4 Endpoints in milestone 1

`GET /v1/health`, `GET /v1/health/ready` (checks the database),
`GET /v1/openapi.json`, the four `auth` endpoints above, `GET /v1/me`,
`PATCH /v1/me` (first name, about, languages, app language, age
confirmation), `GET /v1/me/sessions`, `DELETE /v1/me/sessions/{id}`,
`GET /v1/legal/{type}/current`, `POST /v1/me/legal-acceptances`.

Errors use the shape `{ error: { code, message, details? } }` from the
[conventions](../engineering/conventions.md#api); the app translates `code`.

Rule R1.6 (a verified phone and current terms before booking, posting or
chatting) is a domain function and an API guard, tested now and switched on
for those endpoints when they are built.

### 4.5 Screens in milestone 1

Welcome (language switch, "Continue with phone", "Browse trips" leading to a
"coming soon" page), phone number with country picker, code with resend
timer, terms and age, create profile (first name, about, languages), my
profile with edit, and settings (language, legal documents, sign out, sign out
on all devices). The Apple and Google buttons appear in milestone 2, not as
dead buttons now. Every screen works on a phone and in a centred column on a
wide screen, with screen reader labels and 44-point touch targets.

### 4.6 Seeing it on a phone

Martin can run it on his own computer: Docker Desktop for the database, then
`pnpm dev`, and open the app on an iPhone or Android phone with the Expo Go
app by scanning the QR code. The README gets step-by-step instructions for
Windows and macOS. A hosted staging API, so the phone works without the
computer, comes in milestone 2.

## 5. Pull requests and tasks

Each PR is small enough to review in one sitting. Tests come first in every
task. Tick tasks as they merge, so a new session can resume here.

### PR 1: `docs(plans)`: this plan and ADR 0016

- [x] Plan, ADR 0016 (accepted), answered question A37, roadmap split into
      milestones 1 and 2

### PR 2: `chore(repo)`: monorepo scaffold and CI

- [x] Root `package.json` (`packageManager`, `engines`), `pnpm-workspace.yaml`,
      `turbo.json`, `.nvmrc` (pnpm settings and the version catalog live in
      `pnpm-workspace.yaml`)
- [x] `packages/config`: `tsconfig.base.json`, ESLint flat config with
      boundary rules (no I/O, clock or randomness in the domain), Prettier
      config
- [x] `packages/domain` with the first rule, money, and the `Result` type.
      Test first: `createMoney`, `addMoney` and `multiplyMoney` reject
      non-integer amounts and mixed currencies (`money.test.ts`)
- [x] `.github/workflows/ci.yml`, job `checks`: frozen install, format check,
      lint, type check, unit tests, `pnpm audit --audit-level high`; actions
      pinned to commit SHAs
- [x] Dependabot: npm ecosystem, weekly, grouped minor and patch updates
- [x] Docs: `CLAUDE.md` commands section, README, CHANGELOG, engineering
      conventions (tool list), CI/CD guide
- [ ] Enable the `typescript-lsp` plugin in `.claude/settings.json` (Martin:
      Claude sessions may not change their own settings)
- Verify: `pnpm install --frozen-lockfile && pnpm check`

### PR 3: `feat(api)`: API skeleton, database and local development

- [x] `infra/docker/compose.yml` with `postgis/postgis:18-3.7`, a health
      check and a named volume; `.env.example`
- [x] `apps/api/src/config.ts`: environment validated with Zod at start-up.
      Test first: missing or invalid variables stop the start with a clear
      message
- [x] `packages/db`: Drizzle setup, first migration (extensions), `migrate`
      script. Test: migrations apply to an empty database twice without error
- [x] Logger with request IDs and redaction. Test: a phone number or token
      in a log field is replaced with `[redacted]`
- [x] `GET /v1/health` and `GET /v1/health/ready`; error handler with the
      standard error shape; OpenAPI document. Tests: health is 200, ready is
      503 when the database is down, unknown route gives the error shape
- [x] `apps/api/Dockerfile` (multi-stage, non-root user)
- [x] CI job `api`: PostgreSQL service container, migrations, integration
      tests, Docker image build (not pushed)
- Verify: `docker compose -f infra/docker/compose.yml up -d --wait && pnpm test:integration`

### PR 4: `feat(mobile)`: Expo app and translations

- [x] `packages/i18n`: `messages/en.ts` and `is.ts` with ICU messages, a
      typed `t()`, and `formatMoney` with `Intl` (date formatting comes with
      the first screen that shows a date). Tests: Icelandic plurals (1, 21 and
      11 items), "2.500 kr." and "2,500 ISK"
- [x] Message check: same keys and arguments in both languages and valid
      ICU syntax, run as a unit test in the `checks` job (the typed catalogs
      also fail type checking). Test: a missing key fails
- [x] Country names in Icelandic and English generated once from CLDR data
      with Node's `Intl.DisplayNames`
- [x] `apps/mobile`: Expo Router app, theme tokens, language provider (device
      language if Icelandic or English, otherwise English; choice saved on the
      device), welcome screen and "coming soon" page. Component tests: the
      language switch changes the texts; buttons have labels
- [x] Hermes on current React Native includes `Intl.PluralRules` and basic
      `Intl.NumberFormat` (FormatJS guide), so no polyfills for now; checked on
      real phones with Expo Go in PR 6. Hermes has no `Intl.DisplayNames`,
      hence the generated country names
- [x] CI job `app`: `expo export` for iOS, Android and web (component tests
      run in the `checks` job)
- [x] Playwright smoke test on the web build: the welcome screen opens in
      English and switches to Icelandic
- Verify: `pnpm --filter @shareride/mobile test && pnpm --filter @shareride/mobile export && pnpm --filter @shareride/mobile e2e:web`

### PR 5: `feat(auth)`: phone sign-in in the API

- [ ] Domain, tests first: phone normalisation and supported countries
      (R1.1, R1.5); code rules (R1.2: 6 digits, 10 minutes, 5 attempts, single
      use); resend timing (R1.3); token rotation decisions (rotate, retry
      grace, reuse means end the session); legal gate (R1.6, R1.7)
- [ ] `packages/contracts`: schemas and route definitions for the
      milestone 1 endpoints; `packages/api-client` with a typed `call()`
- [ ] Migrations for the tables in 4.3; seed placeholder Terms and Community
      Rules marked "draft"
- [ ] `SmsSender` port with a development adapter that prints the code in the
      API terminal and keeps the last messages for tests; the API refuses to
      start with it when `NODE_ENV=production`
- [ ] Endpoints in 4.4, with integration tests: sign up and sign in; the same
      reply for known and unknown numbers; each limit; code expiry and
      attempts; refresh rotation, retry grace and reuse; sign out of one and
      all sessions; another user's session cannot be ended; acceptance of the
      current terms; profile validation (first name 1 to 30 letters, about up
      to 300 characters)
- [ ] Security review (`/security-review`) before the PR is opened
- [ ] Docs: security guide (token handling),
      record of personal data for the new tables
- Verify: `pnpm --filter api test` against the local database

### PR 6: `feat(auth)`: sign-in screens, profile and settings

- [ ] Session store: tokens in `expo-secure-store` on iOS and Android, refresh
      cookie on the web, a single refresh in flight at a time
- [ ] Screens in 4.5, each with component tests for errors (wrong code with
      attempts left, expired code, too many attempts with the wait time,
      unsupported country)
- [ ] Texts in both languages, using spec 1, section 8 as the start
- [ ] Playwright journeys on the web build against the API with a test
      database: sign up in English; sign up in Icelandic; sign out on all
      devices
- [ ] Manual check on iOS and Android with Expo Go; screenshots in the PR
- [ ] Docs: README "Run it locally" (Windows and macOS), CHANGELOG, roadmap
      ticks, this plan's status
- Verify: `pnpm turbo test && pnpm --filter mobile e2e:web`

## 6. Definition of done

All six PRs merged with green CI; the journeys above pass in CI; Martin has
signed up on his own phone with Expo Go; docs, roadmap and CHANGELOG are
updated; the milestone 2 plan is drafted.
