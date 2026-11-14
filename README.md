# ShareRide

ShareRide is a ride-sharing app for Iceland. Drivers publish trips built from
curated **meeting points**, set a price for each **segment** between consecutive
meeting points, and passengers book the empty seats on any part of the route.

The app targets iOS, Android and the web from one codebase.

> **Status:** Phase 2, Build. Milestone 1 (foundation and phone sign-in) is
> in progress; see the [plan](docs/plans/2026-11-13-milestone-1-phone-sign-in.md)
> and the [roadmap](docs/strategy/roadmap.md).

## Start here

| If you want to…                              | Read                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| Understand the whole plan in one sitting     | [Development strategy](docs/strategy/development-strategy.md)          |
| See what is decided and what is still open   | [Decision log (ADRs)](docs/decisions/README.md) and [open questions](docs/strategy/open-questions.md) |
| Understand the product and its rules         | [Product vision](docs/product/vision.md), [pricing and seats](docs/product/pricing-and-seats.md) |
| Understand the system design                 | [Architecture overview](docs/architecture/overview.md), [domain model](docs/architecture/domain-model.md) |
| Contribute code (human or Claude Code)       | [CONTRIBUTING.md](CONTRIBUTING.md), [CLAUDE.md](CLAUDE.md), [workflow](docs/engineering/workflow.md) |
| Set up Claude Code plugins and skills        | [Claude Code setup](docs/engineering/claude-code-setup.md)             |

The full documentation map is in [docs/README.md](docs/README.md).

## Repository layout

```text
.
├── CLAUDE.md                 # Instructions Claude Code reads in every session
├── CONTRIBUTING.md           # How work flows from idea to merged PR
├── SECURITY.md               # How to report a vulnerability
├── CHANGELOG.md              # Notable changes, newest first
├── .claude/                  # Shared Claude Code settings and project skills
├── .github/                  # PR and issue templates, CI workflows, CODEOWNERS
├── apps/
│   ├── api/                  # The API (Hono), with its Dockerfile
│   └── mobile/               # The app for iOS, Android and the web (Expo)
├── packages/
│   ├── api-client/           # Typed client for the API, used by the app
│   ├── config/               # Shared TypeScript, ESLint and Prettier configuration
│   ├── contracts/            # API schemas and route definitions (Zod)
│   ├── db/                   # Database schema, migrations and connection (Drizzle)
│   ├── domain/               # Pure business rules (money, countries, sign-in rules)
│   └── i18n/                 # Icelandic and English texts and formatting
├── infra/
│   ├── docker/               # Local PostgreSQL with PostGIS; the image smoke test
│   └── render/               # Staging on Render (blueprint)
└── docs/
    ├── strategy/             # Development strategy, roadmap, open questions
    ├── product/              # Vision, features, pricing rules, meeting points
    ├── architecture/         # System overview, domain model, integrations
    ├── engineering/          # Workflow, conventions, testing, CI/CD, tooling
    ├── operations/           # Runbooks (staging)
    ├── compliance/           # Legal, regulatory and privacy (GDPR)
    ├── decisions/            # Architecture Decision Records (ADRs)
    ├── specs/                # Feature design specs (one per feature)
    ├── plans/                # Implementation plans (one per spec)
    └── glossary.md           # Shared vocabulary, English and Icelandic
```

The full code layout (`apps/`, `packages/`, `infra/`) is described in the
[architecture overview](docs/architecture/overview.md#repository-layout); parts
are added as milestone 1 progresses.

## Run it locally

This runs the API and the app on your own computer, and the app on your own
phone with Expo Go. In development no text messages are sent: the sign-in
code appears in the API's terminal.

### One-time setup

1. Install [Git](https://git-scm.com/downloads),
   [Node.js 26](https://nodejs.org/) and
   [Docker Desktop](https://www.docker.com/products/docker-desktop/), then
   pnpm 12: `npm install --global pnpm@12`.
2. Clone the repository, open a terminal in its folder and run:

   ```sh
   pnpm install
   ```

3. Copy the local settings. macOS: `cp .env.example .env`. Windows
   (PowerShell): `Copy-Item .env.example .env`.
4. On your phone, install **Expo Go** from the App Store or Google Play.

### Each time

1. Start Docker Desktop, then start the database:

   ```sh
   docker compose -f infra/docker/compose.yml up -d --wait
   ```

2. In one terminal, start the API (it updates the database first):

   ```sh
   pnpm --filter @shareride/api dev
   ```

   Open <http://localhost:3000/v1/health> to check it, and
   <http://localhost:3000/v1/openapi.json> for its documentation.

3. In a second terminal, start the app:

   ```sh
   pnpm --filter @shareride/mobile dev
   ```

   Press `w` to open it in the browser. On a phone, scan the QR code: with the
   Camera app on an iPhone, or from Expo Go on Android.

### Sign up on your phone

- The phone and the computer must be on the same Wi-Fi network. The app
  finds the API at the computer's address on port 3000.
- The first time, allow Node.js through the firewall when Windows or macOS
  asks (on Windows, for private networks). Otherwise the phone cannot reach
  the API and the app says it cannot reach ShareRide.
- Enter your number and tap **Send code**. The code appears in the API
  terminal, for example `[dev SMS to +354••••••67] 123456 is your ShareRide
  code.` Type it in the app.
- If the phone still cannot reach the API (some office and guest networks
  block it), put `EXPO_PUBLIC_API_URL=http://<your computer's address>:3000`
  in `apps/mobile/.env.local` and restart the app.
- To get the code by real SMS instead, set `SMS_PROVIDER=46elks` and the
  46elks API keys in `.env` (see `.env.example`), then restart the API. Each
  message is charged to the 46elks account.

### On an Android emulator instead of a phone

1. Install [Android Studio](https://developer.android.com/studio). In
   **Device Manager**, add a phone and start it.
2. Start the database, the API and the app as above, then press `a` in the
   app's terminal. Expo installs Expo Go on the emulator and opens the app.
3. If the app cannot reach ShareRide, put
   `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000` in `apps/mobile/.env.local`
   and restart the app (10.0.2.2 is the computer, seen from the emulator).

Expo Go shows its own icon. To see ShareRide's icon and opening screen,
build the app once (several minutes the first time):

```sh
pnpm --filter @shareride/mobile exec expo run:android
```

It creates `apps/mobile/android` (ignored by Git) and rewrites the
`android` and `ios` scripts in `apps/mobile/package.json`; undo that with
`git checkout apps/mobile/package.json`.

### Checks and tests

```sh
pnpm check                                  # lint, types and unit tests
pnpm test:integration                       # API and database tests
pnpm --filter @shareride/mobile e2e:web     # browser journeys (needs the database)
pnpm --filter @shareride/api test:contract  # 46elks dry run (needs its keys; sends nothing)
```

The browser journeys build the web app, start a test API on port 3001 and
use the `shareride_test` database, which they empty first. More commands are
in [CLAUDE.md](CLAUDE.md#commands). Staging and how it deploys are in the
[staging runbook](docs/operations/staging.md).

## Licence

All rights reserved. The code is proprietary and the repository is private
(decided 2026-11-13, see [open questions](docs/strategy/open-questions.md)).
