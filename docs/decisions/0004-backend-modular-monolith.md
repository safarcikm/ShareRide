# 0004. Backend as a TypeScript modular monolith

- **Status:** Proposed
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [ADR 0002](0002-monorepo-and-typescript.md),
  [ADR 0005](0005-postgresql-postgis.md),
  [architecture overview](../architecture/overview.md), open question Q1

## Context

The backend enforces the rules that matter most: seat capacity under
concurrent bookings, price caps, cancellations and, later, money. It must be
easy to test, easy to review, cheap to run for one operator, and portable
between hosting providers.

## Options considered

1. **Own TypeScript API (modular monolith) on PostgreSQL.** All business logic
   in reviewed, unit-tested TypeScript; one deployable; any host that runs a
   container. More initial setup (auth, realtime, file storage come from
   libraries or small services).
2. **Backend-as-a-service (Supabase).** Managed PostgreSQL, auth, storage,
   realtime and functions out of the box; fastest to a first demo. Business
   rules spread across SQL functions, row-level security policies and edge
   functions, which are harder to test and review together; moderate vendor
   coupling (open source and self-hostable, which limits the risk).
3. **Firebase.** Fast start, but a document database fits relational trips,
   segments and bookings poorly, and transactional capacity checks are awkward.
4. **Microservices.** Independent scaling we don't need, at a large operational
   cost for one operator.

## Decision

We will build **one TypeScript API service, organised as a modular monolith**,
with a **framework-free domain package** and **ports and adapters** for every
external service.

- HTTP framework: **Hono** with Zod-based OpenAPI generation (runs on Node.js
  and other runtimes, small surface, typed routes). Final confirmation at
  scaffolding; because the domain is framework-free, the framework is a
  replaceable detail.
- API style: JSON over HTTPS, resource-oriented, versioned under `/v1`.
  The OpenAPI document is generated from Zod schemas in `packages/contracts`,
  and the app uses a generated typed client.
- Background work runs in the same codebase in worker mode, with a
  PostgreSQL-backed job queue (no Redis to operate).
- Realtime (chat, booking updates) over WebSocket or server-sent events from
  the API.

If the owner prefers option 2 (Supabase), this ADR is superseded and the
domain package still holds the rules, called from Supabase functions.

## Consequences

- The most important rules live in plain TypeScript with fast unit tests.
- We own sign-in, sessions, file uploads and realtime wiring; mature libraries
  cover each (see [ADR 0010](0010-authentication-and-identity.md)).
- One service to deploy, monitor and back up.
- Module boundaries must be kept deliberately (lint rules forbid importing
  another module's internals).

## Revisit when

A module needs independent scaling or release cadence, or a second team joins.
