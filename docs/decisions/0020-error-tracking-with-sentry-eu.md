# 0020. Error tracking and uptime checks with Sentry in its EU region

- **Status:** Proposed
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [ADR 0007](0007-eea-hosting-and-data-residency.md),
  [CI/CD and releases](../engineering/ci-cd-and-releases.md#observability-and-incidents),
  [milestone 2 plan](../plans/2026-11-13-milestone-2-hosted-and-connected.md)

## Context

The app runs on iOS, Android and the web, and the API and worker run on
staging and later production. The operator must learn about crashes and
outages without watching logs, and an alert must reach his phone. Error
reports can carry personal data (phone numbers, tokens, request bodies), so
they need scrubbing and an EEA region (ADR 0007).

## Options considered

1. **Sentry, EU data region (Frankfurt).** Mature SDKs for Expo, React Native
   and Node.js, source maps, release tracking, hooks to scrub events, uptime
   monitoring with one monitor included, and a free plan for one user. A
   United States company with EU storage.
2. **GlitchTip.** Open source and Sentry-compatible, hosted in the EU or run
   by us; fewer features and a smaller team behind it.
3. **Better Stack.** A European company strong on uptime and logs; error
   tracking for React Native is less mature.

## Decision

We will use **Sentry with its EU data region** for errors in the app, the
API and the worker, and its uptime monitor on `/v1/health/ready`. Personal
data is never sent: default personal data off, a tested `beforeSend` that
removes phone numbers, codes, tokens and authentication headers, and no
session replay.

## Consequences

- Crashes arrive with readable stack traces, tagged by release (commit SHA).
- The region is fixed when the Sentry organisation is created; it must be
  created in the EU region.
- CI needs a Sentry token to upload source maps.
- The free plan's limits are enough for staging and the beta; the cost grows
  with users.

## Revisit when

Sentry's EU region or pricing changes, or we need logs and errors in one
European tool.
