# Sign in with email or Google; a text only checks the number: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** members sign in with Google or a 6-digit code by email; a text
message goes out only in the phone step of a waiting sign-in, and confirm
codes go by email.

**Architecture:** The email code reuses the sign-in code machinery of the
`auth` module (ADR 0016): `verification_codes` with a new purpose
`email_sign_in`, keyed by the email's keyed hash, under its own limits. A
proven email with no account becomes a waiting sign-in in a new table,
`email_sign_ins` (`sr_pe_…`, 30 minutes), which the phone step takes as it
takes Google's (`sr_ps_…`). The phone step's text then needs a waiting
sign-in and counts against it and against a ceiling for all texts. Confirm
codes keep the number's hash as their key and only change how they are
delivered.

**Tech Stack:** TypeScript domain package (Vitest), Hono, zod-openapi and
Drizzle (API), Expo Router and React Native Testing Library (app),
Playwright (web journeys).

**Spec:** [spec 26](../specs/2026-11-23-sign-in-without-text-messages.md),
[ADR 0046](../decisions/0046-sign-in-by-email-code-and-text-only-to-check-the-number.md).

## Global Constraints

- Email code: R1.2 (6 digits, 10 minutes, 5 attempts, single use); limits
  per address `[{1, 30 s}, {5, 3600 s}]`, per network block `[{20, 3600 s}]`
  (R26.4). Same `202` for any address.
- Texts: at most 3 per waiting sign-in; all sign-in and confirm texts
  together `[{300, 3600 s}, {1000, 86400 s}]` (R26.2, R26.3); reaching the
  ceiling logs at `error`.
- A waiting email sign-in lasts 30 minutes (as `providerSignInRules`).
- A confirm code goes by email to a verified email, else by text (R26.7).
- `PUT /v1/me/email` needs a confirm code unless the account was made less
  than 30 minutes ago (R26.5).
- Logs never carry an email, number or code.
- Every text in `en.ts` and `is.ts`.
- Migration `0062` (check `packages/db/migrations` first).
- Older code ignores everything new (a new code purpose it never looks up,
  a new table, new limit scopes), so one deploy per PR is safe.

## Review Focus

1. An email typed with capitals or spaces at sign-in finds the account that
   stored it in small letters (normaliseEmail on both sides).
2. Two phone steps with one waiting email sign-in at once: one wins, the
   other gets `provider_expired` and sends nothing.
3. An account whose email is waiting for its link (not verified) is not
   found by that email: the person goes through the phone step.
4. A suspended account signs in by email; an account waiting to be deleted
   signs in to keep it; the former member never matches.
5. The confirm code sent by email works with `withConfirmCode` exactly as a
   texted one (same key), and a text sent before still works after.

---

### Task 1: Domain rules

**Files:** `packages/domain/src/auth/sign-in-code.ts`,
`packages/domain/src/auth/email-sign-in.ts` (new), their tests, `index.ts`.

- `codePurposes` gains `"email_sign_in"`.
- `emailCodeSendLimits = { perEmail, perIpAddress }` and
  `textSendLimits = { perPendingSignIn: [{3, 86400}], all: [...] }`.
- `emailSignInRules = { waitingSeconds: 1800 }`,
  `emailChangeWithoutCodeSeconds = 1800`.
- `hideEmail(email): string` (first two letters, `•••`, the domain;
  one-letter names keep one letter).
- `emailAtPhoneStep({ accountEmail, newEmail, takenByOther }):
  "created" | "added" | "replaced" | "already" | "in_use"` where
  `accountEmail === undefined` means no account.
- `confirmChannel(hasVerifiedEmail): "email" | "sms"`.
- Tests pin the values above and each outcome.

### Task 2: Data

**Files:** `packages/db/src/schema/auth.ts`, `packages/db/migrations/0062_*`,
`packages/db/src/personal-data.ts`, `docs/compliance/privacy-gdpr.md`.

- `emailSignIns` table: `id`, `email`, `pendingHash` (unique), `expiresAt`,
  timestamps; index on `expiresAt`.
- The purpose check follows `codePurposes`.
- `pnpm --filter @shareride/db generate`, then the record of processing.

### Task 3: Email sign-in in the API

**Files:** `apps/api/src/modules/auth/email-sign-in.ts` (new),
`routes.ts`, `service.ts` (shared code helpers), `clean-up.ts`,
`packages/contracts/src/auth.ts`, `packages/contracts/src/settings.ts`
(`emailSignIn` in config), tests `email-sign-in.integration.test.ts`.

- `POST /v1/auth/email/start` `{ email, locale }` → `202 { resendAfterSeconds }`;
  `email_invalid` 400, `rate_limited` 429, `email_failed` 502,
  `email_unavailable` 503.
- `POST /v1/auth/email/verify` `{ email, code, locale, device }` →
  `{ status: "signedIn", …signedIn }` or `{ status: "phoneNeeded",
  pendingSignIn: "sr_pe_…", provider: "email", email, firstName: null,
  expiresAt }`.
- Integration tests: unknown and known email, capitals, wrong, expired,
  attempts, limits, suspended, waiting deletion, an unverified waiting email,
  clean-up of expired waiting sign-ins.

### Task 4: The phone step finishes an email sign-in

**Files:** `service.ts`, `identities.ts` or a new `email-at-phone-step.ts`,
`routes.ts`, contracts, `sign-in.integration.test.ts`, `testing.ts`.

- `start` takes `pendingSignIn`; with one, it must be waiting (`sr_ps_` or
  `sr_pe_`), counts against `perPendingSignIn` and `all`.
- `verify` with `sr_pe_` locks the waiting row (`for update`), makes or finds
  the account, applies `emailAtPhoneStep`, deletes the row, and answers
  `emailLink { outcome, email }`. `replaced` sends the R26.6 notice to the
  old address after the transaction.
- In this PR a start without `pendingSignIn` still works (the app of today);
  Task 7 makes it required.
- `testing.ts` `signIn(e164)` goes through email and the phone step and
  leaves the account's email as before (none for a new account), removing
  its own code email from the fake outbox, so other tests see what they saw.

### Task 5: Confirm codes by email; a code to change the email

**Files:** `service.ts` (`sendConfirmCode`), `account/email.ts`,
`account/routes.ts`, contracts `me.ts`, tests.

- `sendConfirmCode` answers `{ resendAfterSeconds, channel, sentTo }`.
- `PUT /v1/me/email` takes `code`; `confirm_required` 403 without one.
- Opening the link of a changed email sends the R26.6 notice.

### Task 6: Docs

`docs/engineering/security.md` (sign-in and SMS sections),
`docs/compliance/privacy-gdpr.md`, `CHANGELOG.md`, plans index.

### Task 7: The app and the journeys (second PR)

**Files:** `apps/mobile/src/app/sign-in/*` (email on step 1, new
`email-code.tsx`, the phone step in `phone.tsx`), `sign-in/flow.tsx`,
`auth/session` (`startEmail`, `verifyEmail`), `privacy/confirm-with-code.tsx`
(the line of 3.6), `app/settings/email.tsx` (code first),
`app/settings/sign-in-methods.tsx` (help line), i18n, screen tests,
`apps/mobile/e2e/support/account.ts` and the journeys; contracts make
`pendingSignIn` required on the phone step.

- Screen tests: sign in with a known email; a newcomer through the phone
  step; the expired waiting sign-in; the confirm line for email and text.
- Journeys: sign up, sign in again by email, a member from before.
