# 0005. PostgreSQL with PostGIS as the system of record

- **Status:** Accepted (2026-11-13, stack decision: Expo with our own TypeScript API)
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [ADR 0004](0004-backend-modular-monolith.md),
  [ADR 0007](0007-eea-hosting-and-data-residency.md),
  [domain model](../architecture/domain-model.md)

## Context

The data is relational (users, trips, stops, segments, bookings, reviews),
geographic (meeting points, distances, matching warnings to routes) and
transactional (seat capacity must hold under concurrent bookings). It must
live in the EEA and survive changes of framework and hosting.

## Options considered

1. **PostgreSQL with PostGIS.** Mature, open source, strong transactions and
   constraints, best-in-class geospatial support, available as a managed
   service from many EEA providers.
2. **MySQL or MariaDB.** Capable, but weaker geospatial features and
   constraint support.
3. **A document database (MongoDB, Firestore).** Flexible schemas, but
   relational integrity and multi-row transactions are harder.

## Decision

We will use **PostgreSQL** (a currently supported major version) with the
**PostGIS** extension, on a **managed service in an EEA region** with
point-in-time recovery.

- Access from TypeScript through **Drizzle ORM**, which stays close to SQL,
  gives typed queries and produces readable SQL migrations.
- Migrations are versioned files, reviewed in PRs, applied automatically on
  deploy, and written expand-then-contract so deploys never need downtime.
- Primary keys: UUID v7 (time-ordered, safe to expose).
- Money: integer minor units plus currency code; never floating point.
- Time: `timestamptz` everywhere.
- Text search: `unaccent` and `pg_trgm` extensions with an Icelandic
  transliteration step for place names.
- Job queue and outbox tables in the same database.

## Consequences

- One database to operate, back up and secure.
- Capacity rules can be enforced by the database itself, not only by code.
- Local development and tests use the same PostgreSQL and PostGIS versions in
  Docker, so tests are realistic.
- Some managed hosts restrict extensions; PostGIS, `unaccent` and `pg_trgm`
  support is a hard requirement when choosing a host.

## Revisit when

Data volume or query patterns outgrow a single primary with read replicas.
That is unlikely at Iceland's scale.
