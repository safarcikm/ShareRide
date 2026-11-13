# Architecture Decision Records

An Architecture Decision Record (ADR) captures one significant decision: the
context, the options considered, what was decided and the consequences. ADRs
let anyone, years from now, understand why the system is the way it is.

## When to write one

Write an ADR when a decision:

- is hard or expensive to reverse (framework, database, provider, data model)
- changes a business rule (pricing, capacity, cancellations)
- adds an external service or a new category of dependency
- affects security, privacy or legal compliance
- will make someone ask "why did we do it this way?"

When in doubt, write a short one.

## How

1. Use the `write-adr` Claude Code skill, or copy [template.md](template.md) to
   `NNNN-short-title.md` with the next free number.
2. Set the status to `Proposed` and open a PR.
3. The owner reviews. On approval, set the status to `Accepted` with the date.
4. Never rewrite an accepted decision. To change it, write a new ADR and set
   the old one's status to `Superseded by ADR NNNN`.

Statuses: `Proposed`, `Accepted`, `Rejected`, `Deprecated`, `Superseded by ADR NNNN`.

## Index

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-monorepo-and-typescript.md) | Monorepo and TypeScript everywhere | Accepted |
| [0003](0003-cross-platform-client-expo.md) | Cross-platform client with Expo | Accepted |
| [0004](0004-backend-modular-monolith.md) | Backend as a TypeScript modular monolith | Accepted |
| [0005](0005-postgresql-postgis.md) | PostgreSQL with PostGIS as the system of record | Accepted |
| [0006](0006-meeting-points-and-segment-pricing.md) | Meeting-point network with per-segment prices and seats | Superseded by ADR 0012 |
| [0007](0007-eea-hosting-and-data-residency.md) | EEA hosting and data residency | Accepted |
| [0008](0008-payments-phased.md) | Phased payments behind a provider-agnostic port | Superseded by ADR 0013 |
| [0009](0009-maps-and-routing.md) | Maps with MapLibre and OpenStreetMap; precomputed routing | Accepted |
| [0010](0010-authentication-and-identity.md) | Phone-first authentication and layered identity verification | Accepted |
| [0011](0011-localization.md) | Icelandic and English from day one | Accepted |
| [0012](0012-trip-price-level.md) | One price level per trip instead of per-segment price editing | Accepted |
| [0013](0013-in-app-payments-only.md) | All payments through the app, from the beta | Accepted |
| [0014](0014-passenger-service-fee-from-launch.md) | A passenger service fee from public launch | Accepted |
| [0015](0015-women-only-trips.md) | Women-only trips based on a private self-declaration | Accepted |
| [0016](0016-own-sign-in-module.md) | Our own sign-in module instead of an auth library | Proposed |
