# Testing strategy

**Owner:** Martin · **Last reviewed:** 2026-11-13

Tests are how we know the rules hold. They are also the best documentation of
behaviour, so they are written first (test-driven development) and read during
review.

## Test levels

| Level | What | Tools (proposed) | Runs |
| ----- | ---- | ---------------- | ---- |
| Domain unit | Pricing, seat capacity, booking transitions, trip edit rules | Vitest; fast-check for property-based tests | Every commit, in milliseconds |
| Application and API | Use cases and HTTP endpoints against a real database | Vitest; PostgreSQL with PostGIS in Docker (Testcontainers or a CI service container) | Every PR |
| Contract | API matches the OpenAPI document; adapters match provider sandboxes | Schema checks in CI; provider sandbox tests on a schedule | Every PR; nightly for sandboxes |
| Component | Screens and components render and behave correctly | React Native Testing Library with jest-expo | Every PR |
| End-to-end, mobile | Critical journeys on iOS and Android | Maestro, on simulators locally and in EAS Workflows or CI | Every PR to `main` touching the app; nightly full run |
| End-to-end, web | Critical journeys on the web build | Playwright | Every PR touching the app |
| Accessibility | Labels, contrast, focus order | Automated checks (axe on web), manual screen-reader passes before releases | Every PR (automated); each release (manual) |
| Load | Search and booking under concurrent use | k6 against staging | Before beta and launch; after major changes |
| Security | Dependencies, secrets, static analysis | Dependabot, GitHub secret scanning, CodeQL | Every PR and weekly |

Exact versions are chosen at scaffolding.

## What must be tested

The domain package carries the most risk and gets the strictest tests.

### Properties that must always hold

Property-based tests generate thousands of random trips and booking sequences
and check that:

1. Occupancy never exceeds capacity on any segment, whatever the order of
   requests, cancellations and expiries.
2. A booking's price always equals seats times the sum of its segment prices.
3. Accepting then cancelling a booking restores the previous occupancy exactly.
4. Availability for a range never exceeds availability of any sub-range.
5. Suggested prices are always multiples of the price step and never exceed
   the cap.

### Example-based tests

Every rule in [pricing and seats](../product/pricing-and-seats.md) has at least
one test named after it, for example `rule S4: rejects booking after cut-off`.
The worked examples in that document are tests too.

### Concurrency

An API test fires many simultaneous booking requests for the last seat and
checks that exactly one succeeds.

### Critical end-to-end journeys

1. Sign up with a phone number
2. Driver posts a trip with three stops
3. Passenger searches a partial route, books, and sees the right price
4. Driver accepts the request; both see the booking
5. Passenger cancels; seats become available again
6. Driver cancels the trip; the passenger is notified
7. Both leave a review after the trip
8. A user exports and deletes their data

## Coverage

Coverage is a signal, not a target. Guidelines: domain package close to full
line and branch coverage; application services high; UI covered by component
tests for logic and E2E tests for journeys. CI reports coverage on each PR.

## Test data

- Seed data uses real meeting points and fake people.
- No production data in tests or staging, ever. If staging needs realistic
  volume, generate it.
- Fixed clocks and seeded random generators make tests deterministic.

## Flaky tests

A flaky test is a bug. Fix it or quarantine it with an issue within a day;
never retry until it passes and move on.
