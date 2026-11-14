# CLAUDE.md

Guidance for Claude Code (and any AI assistant) working in this repository.
Keep this file short and current. Details live in `docs/`; link, don't copy.

## What this project is

ShareRide is a ride-sharing marketplace for Iceland. Drivers publish trips made
of curated **meeting points**; each **segment** between two consecutive meeting
points has its own price; passengers book seats on any contiguous part of a
trip. Clients: iOS, Android, web. Vocabulary: [docs/glossary.md](docs/glossary.md).

Current phase: **Phase 2, Build**, milestone 2 (hosted and connected,
[plan](docs/plans/2026-11-13-milestone-2-hosted-and-connected.md)). See
[docs/strategy/roadmap.md](docs/strategy/roadmap.md). Staging:
[runbook](docs/operations/staging.md).

## Before you change anything

1. Read the ADRs that touch the area you are changing:
   [docs/decisions/README.md](docs/decisions/README.md). An ADR with status
   `Proposed` is the working assumption, not a final decision.
2. Check [docs/strategy/open-questions.md](docs/strategy/open-questions.md).
   Do not silently decide an open question; raise it.
3. For business rules (pricing, seat capacity, cancellations), the source of
   truth is [docs/product/pricing-and-seats.md](docs/product/pricing-and-seats.md)
   and [docs/architecture/domain-model.md](docs/architecture/domain-model.md).

## How we work

We use the Superpowers workflow (see
[docs/engineering/workflow.md](docs/engineering/workflow.md)):

- **Brainstorm** before building anything non-trivial. Ask questions one at a time.
- Write the agreed design to `docs/specs/YYYY-MM-DD-<topic>.md` (not
  `docs/superpowers/...`).
- Write the implementation plan to `docs/plans/YYYY-MM-DD-<topic>.md`.
- Implement with **test-driven development**: failing test first, then code.
- Request a code review before opening the PR; verify before claiming done.
- Small fixes (typos, one-line bugs) can skip the spec and plan.

## Rules

- **Decisions:** any change to architecture, a new dependency category, a new
  external service, or a change to a business rule needs an ADR. Use the
  `write-adr` project skill. Never edit the decision of an `Accepted` ADR;
  supersede it with a new one.
- **Docs travel with code:** update the relevant doc in the same PR as the code.
- **Domain logic** lives in the domain package (planned: `packages/domain`),
  free of I/O and framework imports. UI and API layers call it; they do not
  re-implement it.
- **Money** is an integer amount in the currency's minor unit plus an ISO 4217
  code. ISK has no minor unit, so `{ amount: 2500, currency: "ISK" }` is
  2 500 kr. Never use floating point for money.
- **Time** is stored as UTC (`timestamptz`) and shown in `Atlantic/Reykjavik`.
- **Text shown to users** goes through i18n. Icelandic and English from day one.
- **Look:** screens follow the [visual design system](docs/specs/2026-11-13-visual-design-system.md)
  and use its tokens, never raw colours or sizes.
- **Personal data:** follow [docs/compliance/privacy-gdpr.md](docs/compliance/privacy-gdpr.md).
  No real personal data in fixtures, tests, logs or screenshots.
- **Secrets** never enter the repository. Use environment variables and the
  secret store of the environment.
- **Dependencies:** justify every new runtime dependency in the PR description.

## Git and pull requests

- Never push to `main`. Branch, then open a PR. Squash-merge only.
- Branch names: `feat/…`, `fix/…`, `docs/…`, `chore/…`, `refactor/…`, `test/…`.
- Commits and PR titles follow Conventional Commits, e.g. `feat(booking): …`.
- Fill in the PR template, including the privacy and docs checkboxes.

## Commands

Node.js 26 (`.nvmrc`) and pnpm 12. Shared tool versions live in the `catalog`
in `pnpm-workspace.yaml`; packages refer to them with `catalog:`.

```sh
pnpm install                 # install the workspace
cp .env.example .env         # local settings (never commit .env)
docker compose -f infra/docker/compose.yml up -d --wait   # PostgreSQL 18 + PostGIS
pnpm check                   # lint, type check and unit tests (Turborepo)
pnpm test:integration        # tests against the database (one package at a time)
pnpm format                  # format with Prettier (pnpm format:check in CI)
pnpm --filter @shareride/api dev       # migrate, seed, run the API on port 3000 (SMS codes print here)
pnpm --filter @shareride/mobile dev    # the app: Expo dev server (w = web, QR = Expo Go)
pnpm --filter @shareride/mobile export # bundles for iOS, Android and web (dist/)
pnpm --filter @shareride/mobile e2e:web  # build the web app; Playwright journeys against a test API
pnpm --filter @shareride/api clean-up  # delete sign-in records past retention (hourly on servers)
pnpm --filter @shareride/api test:contract  # 46elks dry run, needs its keys; not in CI
pnpm --filter @shareride/db generate   # SQL migration from schema changes
infra/docker/smoke-test.sh <image>     # start the API image and check it (needs DATABASE_URL)
pnpm --filter @shareride/domain test   # one package
npx --yes markdownlint-cli2@0.24.0     # lint the docs
```

Tests named `*.integration.test.ts` need `TEST_DATABASE_URL`, a database
whose name ends in `_test`; they wipe it. App texts live in
`packages/i18n/src/messages/en.ts` and `is.ts`; add every key to both. In the
app, add Expo packages with `npx expo install`, and await RNTL 14's `render`
and `fireEvent`; screen tests render the whole app with `renderApp` from
`apps/mobile/src/testing/app.tsx` against a fake API.

Workspace packages export TypeScript source directly (`"exports":
"./src/index.ts"`); Node.js runs it with built-in type stripping, so use
`.ts` in relative imports, `import type` for types, and no enums or
namespaces (`erasableSyntaxOnly`). CI: `.github/workflows/ci.yml` (code) and
`docs.yml` (Markdown).

## Definition of done

A change is done when tests pass in CI, docs and ADRs are updated, user-facing
text is translated (IS and EN), privacy impact is considered, and the PR has
been reviewed by the project owner.
