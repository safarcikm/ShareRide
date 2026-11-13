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
│   ├── config/               # Shared TypeScript, ESLint and Prettier configuration
│   ├── contracts/            # API schemas and route definitions (Zod)
│   ├── db/                   # Database schema, migrations and connection (Drizzle)
│   ├── domain/               # Pure business rules (money, supported countries)
│   └── i18n/                 # Icelandic and English texts and formatting
├── infra/docker/             # Local PostgreSQL with PostGIS (Docker Compose)
└── docs/
    ├── strategy/             # Development strategy, roadmap, open questions
    ├── product/              # Vision, features, pricing rules, meeting points
    ├── architecture/         # System overview, domain model, integrations
    ├── engineering/          # Workflow, conventions, testing, CI/CD, tooling
    ├── compliance/           # Legal, regulatory and privacy (GDPR)
    ├── decisions/            # Architecture Decision Records (ADRs)
    ├── specs/                # Feature design specs (one per feature)
    ├── plans/                # Implementation plans (one per spec)
    └── glossary.md           # Shared vocabulary, English and Icelandic
```

The full code layout (`apps/`, `packages/`, `infra/`) is described in the
[architecture overview](docs/architecture/overview.md#repository-layout); parts
are added as milestone 1 progresses.

## Development

You need Node.js 26 and pnpm 12 (`npm install --global pnpm@12`).

You also need Docker (Docker Desktop on Windows and macOS) for the local
database.

```sh
pnpm install                                              # install everything
cp .env.example .env                                      # local settings
docker compose -f infra/docker/compose.yml up -d --wait   # start the database
pnpm check                                                # lint, types, unit tests
pnpm test:integration                                     # database tests
pnpm --filter @shareride/api dev                          # API on http://localhost:3000
```

Open <http://localhost:3000/v1/health> to check the API, and
<http://localhost:3000/v1/openapi.json> for its documentation.

To run the app:

```sh
pnpm --filter @shareride/mobile dev
```

Press `w` to open it in the browser, or scan the QR code with the Expo Go app
on an iPhone or Android phone (on the same Wi-Fi network as the computer).

More commands are in [CLAUDE.md](CLAUDE.md#commands).

## Licence

All rights reserved. The code is proprietary and the repository is private
(decided 2026-11-13, see [open questions](docs/strategy/open-questions.md)).
