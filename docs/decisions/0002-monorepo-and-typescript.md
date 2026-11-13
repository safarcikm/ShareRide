# 0002. Monorepo and TypeScript everywhere

- **Status:** Proposed
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [ADR 0003](0003-cross-platform-client-expo.md),
  [ADR 0004](0004-backend-modular-monolith.md), open question Q1

## Context

ShareRide has a mobile and web app, an API, an admin console and later a
public website. They share business rules (prices, seat availability), API
types and translations. A single owner reviews all of it, often with Claude
Code doing the implementation.

## Options considered

1. **Separate repositories per app.** Clear ownership, but shared rules and
   types are duplicated or published as packages; cross-cutting changes need
   several coordinated PRs.
2. **Monorepo, mixed languages** (for example Dart client and a Go or Python
   backend). Each part uses a "best" language, but rules are written twice and
   the reviewer must know several ecosystems.
3. **Monorepo, TypeScript everywhere.** One language for app, API, domain and
   tooling; one PR can change a rule, the API and the screen together.

## Decision

We will use **one monorepo** with **pnpm workspaces** and **Turborepo** for
task orchestration and caching, and **TypeScript in strict mode** for all code.

- Layout: `apps/*` for deployables, `packages/*` for shared code (see the
  [architecture overview](../architecture/overview.md#repository-layout)).
- Shared configuration (TypeScript, linting, formatting, tests) lives in
  `packages/config`.
- Node.js active LTS for the backend and tooling, pinned in `.nvmrc` and
  `package.json` `engines`.
- Exact tool versions (linter, formatter, test runner) are chosen at
  scaffolding time and recorded in the scaffolding PR.

## Consequences

- A business rule is written once, in `packages/domain`, and used by both API
  and app.
- One CI pipeline, with Turborepo running only what a change affects.
- Claude Code and reviewers see the whole system in one place.
- The repository grows large over time; Turborepo caching and clear package
  boundaries keep it manageable.
- Everyone works in TypeScript; a native module in Swift or Kotlin remains
  possible through Expo modules if ever needed.

## Revisit when

A part of the system needs a runtime TypeScript cannot serve well, or a
separate team takes ownership of one app.
