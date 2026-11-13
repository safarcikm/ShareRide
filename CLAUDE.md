# CLAUDE.md

Guidance for Claude Code (and any AI assistant) working in this repository.
Keep this file short and current. Details live in `docs/`; link, don't copy.

## What this project is

ShareRide is a ride-sharing marketplace for Iceland. Drivers publish trips made
of curated **meeting points**; each **segment** between two consecutive meeting
points has its own price; passengers book seats on any contiguous part of a
trip. Clients: iOS, Android, web. Vocabulary: [docs/glossary.md](docs/glossary.md).

Current phase: **Phase 1, Design** (docs and decisions only, no app code
yet). See [docs/strategy/roadmap.md](docs/strategy/roadmap.md).

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

No application code yet. Docs checks run in CI (`.github/workflows/docs.yml`).
To run the Markdown linter locally:

```sh
npx --yes markdownlint-cli2@0.24.0
```

This section gets the build, test and run commands when Phase 2 scaffolds the
monorepo.

## Definition of done

A change is done when tests pass in CI, docs and ADRs are updated, user-facing
text is translated (IS and EN), privacy impact is considered, and the PR has
been reviewed by the project owner.
