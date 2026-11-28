# Sign in with Apple in the store apps: build plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** when an Apple link ends (the account is erased, Apple is removed
or replaced on Sign-in methods), Apple revokes PuffinRide's access to that
Apple account, as the App Store asks; and the store kit says the apps offer
Apple and Google.

**Architecture:** The Apple provider returns Apple's refresh token beside
the claims. The callback keeps it on `provider_sign_ins`; finishing or
linking moves it to `identities`. Ending a link moves it, in the same
transaction, to a queue table, `apple_tokens_to_revoke`, with no account
ID. The API runs a job every minute, `apple-revocations`, that sends due
tokens to Apple's revoke endpoint, as `photo-files` deletes photos: taken
under a lease, deleted on Apple's 200, tried again 10 minutes later on a
failure. The hourly clean-up drops a token queued more than 7 days ago. The
cron job holds no Apple keys; the API does.

**Spec:** [spec 37](../specs/2026-11-28-sign-in-with-apple-in-the-stores.md),
with [ADR 0056](../decisions/0056-keep-apples-token-to-end-sign-in-with-apple.md)
(Accepted, Martin's card, 2026-11-28 11:38 UTC).

## Global constraints

- The token never appears in a log line, a response, an error report or
  "Download my data" (R37.3). Log the user ID and counts only.
- Only Apple's refresh token is kept, never Google's (R37.1).
- Without Apple's keys nothing goes to Apple (R37.4): the stand-in
  provider's revoke answers yes without a request.
- Integration tests need `TEST_DATABASE_URL` (a database ending in
  `_test`).

## PR 1: the spec, the decision and the store kit (`docs(apps)`)

- [x] Spec 37, ADR 0056 (Proposed), this plan, the indexes.
- [x] Spec 32, 3.3 and section 10; spec 19, section 10; ADR 0051 and 0034
  status lines.
- [x] Store kit: the App Store notes, the privacy answers, `listing.py`'s
  rule and the README.

## PR 2: keep Apple's token and revoke it when the link ends (`feat(auth)`)

### Task 1: the schema

**Files:** `packages/db/src/schema/auth.ts`, `packages/db/src/personal-data.ts`,
a migration from `pnpm --filter @shareride/db generate`.

- [x] `identities.apple_refresh_token` and
  `provider_sign_ins.apple_refresh_token`: `text`, null.
- [x] `apple_tokens_to_revoke`: `id` (uuid), `token` (text, not null),
  `revoke_after` and `queued_at` (timestamptz, not null), an index on
  `revoke_after`.
- [x] The register: the queue is not about a person (no account ID; gone
  within 7 days). The register test passes.

### Task 2: the provider

**Files:** `apps/api/src/platform/identity-providers.ts` and its test.

- [x] Failing test: Apple's `redeem` gives `refreshToken` from the token
  answer, and none when the answer has none. Google's gives none.
- [x] Failing test: `revoke(token)` posts `client_id`, `client_secret`,
  `token` and `token_type_hint=refresh_token` to
  `https://appleid.apple.com/auth/revoke`; true on 200, false otherwise or
  on a network failure.
- [x] The stand-in Apple gives a made-up refresh token and revokes without
  a request.

### Task 3: keeping it

**Files:** `apps/api/src/modules/auth/provider-sign-in.ts`,
`apps/api/src/modules/auth/identities.ts`, their integration tests.

- [x] Failing tests: the callback keeps the token on the waiting sign-in;
  a sign-in to an existing link replaces the link's token; a new link
  (sign-up or Settings) takes it; "already linked" replaces it.

### Task 4: queuing it when a link ends

**Files:** `apps/api/src/modules/auth/apple-revocations.ts` (new: queue
and job), `provider-sign-in.ts` (`remove`), `identities.ts` (`replace`),
`apps/api/src/modules/privacy/erasure.ts`, integration tests.

- [x] Failing tests: removing Apple, replacing it with another Apple
  account and erasing the account each queue the token and leave none on
  an account; Google queues nothing.

### Task 5: the job and the clean-up

**Files:** `apple-revocations.ts`, `apps/api/src/server.ts`,
`apps/api/src/modules/auth/clean-up.ts`, integration tests.

- [x] Failing tests: the job revokes due tokens and deletes their rows;
  a refusal moves `revoke_after` on by 10 minutes; a token queued more than
  7 days ago is dropped by the clean-up and counted.
- [x] `server.ts` runs `apple-revocations` every minute when Apple is on.

### Task 6: docs

- [x] `docs/compliance/privacy-gdpr.md`: the token and the queue in the
  record of processing.
- [x] `CHANGELOG.md`.

## After PR 2

A production release (Martin's go), then the App Store submission with
build 1.0.0 (4), which needs no change.
