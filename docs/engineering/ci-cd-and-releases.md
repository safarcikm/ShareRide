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
| Build API image and app bundles | | Yes |
| End-to-end (Playwright web; Maestro mobile) | | Yes, for app changes |
| Dependency review and CodeQL | | Yes |
| Secret scanning | GitHub setting | GitHub setting |

Turborepo runs only the tasks affected by a change and caches results.
Third-party actions are pinned to a full commit SHA, with the version in a
comment, and kept current by Dependabot.

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

1. Merge to `main` builds a container image tagged with the commit SHA.
2. The image deploys to staging; migrations run first, then the new version
   starts; smoke tests run.
3. Promotion to production is a manual approval in the GitHub Environment,
   deploying the same image.
4. Rollback: redeploy the previous image. Migrations are backward compatible
   (expand then contract), so rollback does not need a database restore.

## App releases (Expo and EAS)

| Channel | Who | How |
| ------- | --- | --- |
| Development builds | Developers | EAS Build `development` profile |
| Preview | Owner and testers | EAS Build `preview` profile; TestFlight and Google Play internal testing |
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
