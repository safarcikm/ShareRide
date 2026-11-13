# ShareRide

ShareRide is a ride-sharing app for Iceland. Drivers publish trips built from
curated **meeting points**, set a price for each **segment** between consecutive
meeting points, and passengers book the empty seats on any part of the route.

The app targets iOS, Android and the web from one codebase.

> **Status:** Phase 1, Design. The repository holds the strategy,
> architecture decisions and project conventions. Application code is
> scaffolded at the start of Phase 2 (Build), once the proposed decisions are accepted. See the
> [roadmap](docs/strategy/roadmap.md).

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

The planned code layout (`apps/`, `packages/`, `infra/`) is described in the
[architecture overview](docs/architecture/overview.md#repository-layout) and is
created in Phase 2.

## Licence

All rights reserved. No licence is granted until the owner decides otherwise
(see [open questions](docs/strategy/open-questions.md)).
