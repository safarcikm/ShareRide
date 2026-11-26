# CI/CD and releases

**Owner:** Martin · **Last reviewed:** 2026-11-13

## Continuous integration

Runs on GitHub Actions for every pull request and every push to `main`.

| Check | Now (Phase 1) | From Phase 2 |
| ----- | ------------- | ------------ |
| Markdown lint and internal link check | Yes (`docs.yml`) | Yes |
| Install with a frozen lockfile | | Yes |
| Lint and format check | | Yes |
| Type check | | Yes |
| Unit tests (domain, components) | | Yes |
| Integration tests with PostgreSQL and PostGIS | | Yes |
| Translation completeness | | Yes |
| Build API image and app bundles; start the image and smoke-test it | | Yes |
| End-to-end (Playwright web; Maestro mobile) | | Yes, for app changes |
| Dependency review and CodeQL | | Needs a paid GitHub security plan on a private repository; `pnpm audit` for high and critical advisories runs instead |
| Secret scanning | GitHub setting | GitHub setting |

The code checks run in `.github/workflows/ci.yml`, first added job by job
in milestone 1 ([plan](../plans/2026-11-13-milestone-1-phone-sign-in.md)).
Turborepo runs the lint, type check and unit tests of every package; CI
keeps no Turborepo cache between runs. Third-party actions are pinned to a
full commit SHA, with the version in a comment, and kept current by
Dependabot.

### When CI skips the code jobs

GitHub's Linux machines cost nothing for this public repository, but a full
run takes about 34 machine minutes on three machines, half of it the web
tests. So CI does not repeat work it has done. Its first job, "What changed"
(`.github/scripts/ci-changes.sh`, whose rules `ci-changes.test.sh` checks in
the same job), skips the bundles, the unit, integration and web tests and
the API image when:

- The change touches only files that no app, API, console or test reads:
  `docs/`, `marketing/`, `.claude/`, the Markdown files at the root,
  `.markdownlint-cli2.jsonc`, the docs, release and road file workflows,
  Dependabot's settings, CODEOWNERS and the issue and pull request
  templates. Markdown inside `apps/` and `packages/` is code: the API serves
  the legal texts. A pull request is compared with the `main` it merges
  into, so a docs pull request does not test `main`'s code again; `main`'s
  own runs do. A push to `main` is compared with the newest `main` commit
  whose CI passed, so code that came before a docs commit never goes
  untested.
- A push to `main` has exactly the files (the same git tree) that a pull
  request's run into `main` tested with every job passing. Each such run
  keeps the tree it tests as a small artifact, `main-tree-<tree>`, for 7
  days; runs from forks do not count. When another pull request merged in
  between, the trees differ and everything runs: that run is what catches
  two pull requests that clash.

The format check and the dependency audit always run. A skipped job counts
as passed for branch protection, for Render's deploy after CI and for
"Release to production". When the script cannot tell (an API error, missing
history), or the job itself fails, everything runs. A new folder that no
code reads goes in the list in `ci-changes.sh`, with a test.

## Branch protection for `main`

To set in GitHub (Settings, then Branches) once CI exists:

- Require a pull request before merging, with at least one approval
- Require status checks to pass
- Require linear history (squash merge only)
- Block force pushes and deletions
- Require conversation resolution

## Environments

| Environment | Purpose | Data | Deploys |
| ----------- | ------- | ---- | ------- |
| Local | Development | Seed data in Docker | On demand |
| Preview (later) | Review a PR's API and web app | Seed data | Per PR, optional |
| Staging | Integration and beta-like testing | Generated data only | On every merge to `main` |
| Production | Real users | Real data | Manual promotion of a staging build |

Each environment has its own database, secrets and provider accounts. Secrets
live in GitHub Environments and the hosting provider's secret store, never in
the repository.

## API and worker releases

1. CI builds the API image (which includes the exported web app) and starts
   it against a test database with `infra/docker/smoke-test.sh`.
2. Once a commit on `main` passes CI, Render builds the same Dockerfile and
   deploys it to staging: migrations run as the pre-deploy command, and
   traffic moves to the new version only when `/v1/health/ready` answers 200
   ([staging runbook](../operations/staging.md)).
3. Production arrives before the beta, also on Render (ADR 0018).
   Promotion stays a manual step that deploys a commit staging has run.
4. Rollback: redeploy the previous build from Render's dashboard. Migrations
   are backward compatible (expand then contract), so rollback does not need
   a database restore. From the closed beta on, code that reads a new kind
   of data ships a deploy before the code that saves it
   ([conventions](conventions.md#database)), so the previous build also
   understands what the newer one stored.

## App releases (Expo and EAS)

| Channel | Who | How |
| ------- | --- | --- |
| Development builds | Developers | EAS Build `development` profile |
| Preview | Owner and testers | EAS Build `preview` profile; TestFlight (iPhone, [runbook](../operations/app-builds.md)) and Google Play internal testing |
| Production | Everyone | EAS Build `production` profile, EAS Submit to App Store and Google Play |
| Over-the-air updates | Users on a matching runtime version | EAS Update to the `preview` or `production` channel |

- Versioning: semantic version for the app (`1.4.0`), automatic build numbers.
- Over-the-air updates are for JavaScript-only fixes and small changes; native
  changes always go through the stores.
- Each store release gets release notes in Icelandic and English and an entry
  in `CHANGELOG.md`.
- Staged rollouts in both stores for production releases.

## Database operations

- Daily automated backups with point-in-time recovery; a restore is rehearsed
  before the beta and then quarterly.
- Migrations run in CI against a copy of the schema before they reach staging.

## Observability and incidents

- Error tracking for app and API, with releases and source maps uploaded on
  every build.
- Uptime checks on the API health endpoint and the web app.
- Alerts go to the operator's phone for: API down, error spike, failed jobs
  piling up, database storage near its limit.
- After any incident affecting users, write a short post-incident note in
  `docs/operations/incidents/` (created when the first one is needed).
