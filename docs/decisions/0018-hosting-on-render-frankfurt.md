# 0018. Host the API, worker and database on Render in Frankfurt

- **Status:** Accepted (2026-11-13, by Martin, with the milestone 2 plan)
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [ADR 0007](0007-eea-hosting-and-data-residency.md),
  [ADR 0005](0005-postgresql-postgis.md),
  [ADR 0004](0004-backend-modular-monolith.md),
  [milestone 2 plan](../plans/2026-11-13-milestone-2-hosted-and-connected.md)

## Context

ADR 0007 asks for a managed container platform in an EEA region, chosen at
scaffolding against a checklist: EEA region, managed PostgreSQL with PostGIS,
point-in-time recovery, private networking, secrets management, staging
environments and predictable pricing. One person runs the service, so
operations work must stay small. Our schema uses `uuidv7()`, which needs
PostgreSQL 18.

## Options considered

1. **Render, Frankfurt.** Containers, background workers and managed
   PostgreSQL 18 with PostGIS in one region, point-in-time recovery, a private
   network, a secret store and a blueprint file (`render.yaml`) that describes
   everything in the repository. A United States company, so it relies on a
   data processing agreement. Fewer regions and knobs than a big cloud.
2. **Fly.io, Stockholm.** Closer to Iceland and container-based, but its
   managed PostgreSQL offered versions 16 and 17 only when checked, so we
   would drop `uuidv7()` or run the database ourselves.
3. **Scaleway, Paris or Amsterdam.** A European company with containers and
   managed PostgreSQL, but PostgreSQL 18 was not offered when checked.
4. **AWS, Stockholm.** Every service we could need, but much more
   configuration and cost management for one person.

## Decision

We will run staging (and, unless this ADR is revisited before the beta,
production) on **Render in the Frankfurt region**: the API as a container,
scheduled tasks as cron jobs and, once needed, the worker from the same
image, and managed PostgreSQL 18 with PostGIS reachable only on the private
network. The web app is served by the API
container on the same origin, so the sign-in cookie stays first-party on an
`onrender.com` address. Infrastructure lives in `infra/render/render.yaml`.

## Consequences

- One provider and one bill for compute and the database; little to operate.
- Staging costs about $15 a month on the smallest paid instances.
- Point-in-time recovery covers 3 days on the free workspace plan, 7 days on
  Pro. Production should be on Pro.
- The images are standard containers, so moving to another provider means
  rewriting the blueprint, not the application.
- Render is a United States company; we sign its data processing agreement
  and record it in the privacy inventory.

## Revisit when

Render's prices or terms change significantly, a Nordic region becomes
available elsewhere with PostgreSQL 18 and PostGIS, or we need a service
Render does not offer.
