# Get back into the console with a text code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Lost your passkey?" on the console's sign-in page: a text code to
the operator's own number, then a new passkey, then the console.

**Architecture:** The auth module keeps every text-message code: it gets a
third purpose, `console_recovery`, with its own sending count, and two
methods to send and to use such a code. The admin module decides who may
recover, and on a right code ends the account's console sessions, makes a
setup link exactly as the `operator` command does, audits it and writes a
`ConsoleRecovered` outbox event. The notification worker turns that event
into a text and an email to the operator. The console's new page reuses the
setup page for the passkey step.

**Tech Stack:** TypeScript domain package (Vitest), Hono, zod-openapi and
Drizzle (API), React with Vite and Testing Library (console), Playwright
journeys.

**Spec:** [spec 22](../specs/2026-11-22-console-passkey-recovery.md),
[ADR 0040](../decisions/0040-console-recovery-by-text-code.md) (accepted by
Martin 2026-11-22).

## Global Constraints

- Recovery code: 6 digits, valid 10 minutes, 5 tries (`codeRules`, R1.2).
- Sending, per number, its own scope `console_recovery_phone`: 1 per 30
  seconds, 5 an hour (R22.6). Never the app's `phone`, `ip` or
  `calling_code` scopes.
- The console's per-address limiter (10 a minute, 60 an hour) guards both new
  routes.
- A code goes only to an account where `canUseConsole` holds and the phone
  is verified (R22.1). Any other valid number: the same 200 answer, no text.
- The console's "Text messages" switch does not stop recovery codes; the
  `SMS_PAUSED` sender does (R22.5).
- The setup token travels only in a JSON body, never in an address or a log.
- No phone number or code in a log line, an audit entry or a test name.
  Test numbers are made up, `+35469…`.
- Every text in `en.ts` and `is.ts`, as spec 22, section 8; tokens only on
  the console page.
- Migration `0060` (check `packages/db/migrations` first: other threads add
  migrations too).
- Two deploys (conventions, Database): PR 1 ships every reader (the new code
  purpose, event, notification kind and session end reason); PR 2 the code
  that writes them.

## Review Focus

1. A sign-in or confirm code typed at recovery is refused, and a recovery
   code typed at app sign-in is refused.
2. An operator suspended, stripped of the role or waiting to be deleted
   between step 1 and step 2 is refused at step 2, and the code is not used
   up for nothing (the action's refusal rolls it back).
3. Typing a member's number at recovery leaves that member's app sign-in
   texts untouched (no `phone` scope rows).
4. Two right answers sent at once: only one setup link survives, and the
   second answer finds the code used.
5. A session that was signed in before recovery fails its next request.

---

## PR 1: codes, the notice and the migration

### Task 1: the domain rules

**Files:**

- Modify: `packages/domain/src/auth/sign-in-code.ts`
- Modify: `packages/domain/src/notifications/catalogue.ts`,
  `packages/domain/src/notifications/delivery.ts`
- Modify: `packages/domain/src/admin/passkeys.ts`
- Test: `packages/domain/src/auth/sign-in-code.test.ts`,
  `packages/domain/src/admin/passkeys.test.ts`,
  `packages/domain/src/notifications/catalogue.test.ts`

**Interfaces:**

- Produces: `codePurposes = ["sign_in", "confirm", "console_recovery"]`;
  `recoveryCodeSendLimits: { perNumber: readonly RateLimitRule[] }` =
  `[{ limit: 1, windowSeconds: 30 }, { limit: 5, windowSeconds: 3600 }]` in
  `admin/passkeys.ts`; notification kind `console_recovered` with rule
  `{ push: false, email: "always", sms: true }`, listed in
  `operatorNoticeKinds`; outbox event type `ConsoleRecovered`.

- [x] Tests: `codePurposes` contains `console_recovery`;
      `recoveryCodeSendLimits.perNumber` equals the values above;
      `notificationRules.console_recovered` equals the rule above and
      `isOperatorNotice("console_recovered")` is true;
      `outboxEventTypes` contains `ConsoleRecovered`. Run
      `pnpm --filter @shareride/domain test`, expect FAIL.
- [x] Add the values; run again, expect PASS.

### Task 2: the migration

**Files:**

- Modify: `packages/db/src/schema/admin.ts` (the
  `operator_sessions_end_reason_check` list gets `recovered`)
- Create: `packages/db/migrations/0060_console_recovery.sql` (generated)

- [x] Add `recovered` to the end reasons; `OperatorSessionEndReason` in
      `apps/api/src/modules/admin/sessions.ts` gets `"recovered"`.
- [x] `pnpm --filter @shareride/db generate --name console_recovery`. The
      SQL replaces four check constraints: `verification_codes_purpose_check`,
      `operator_sessions_end_reason_check`, `outbox_events_kind_check`,
      `notifications_kind_check` and `scheduled_notifications_kind_check`
      (the last three from Task 1's lists). Nothing else.
- [x] `pnpm --filter @shareride/db test:integration` passes on a fresh
      database.

### Task 3: sending and using a recovery code

**Files:**

- Modify: `apps/api/src/modules/auth/service.ts`
- Test: `apps/api/src/modules/auth/recovery-code.integration.test.ts`

**Interfaces:**

- Produces, on `AuthService`:
  - `sendRecoveryCode(input: { e164: string; locale: Locale }): Promise<Result<{ resendAfterSeconds: number }, StartError>>`
    sends `sms.consoleRecoveryCode`, counts only the
    `console_recovery_phone` scope with `recoveryCodeSendLimits`, and does
    not ask `smsPaused`.
  - `withRecoveryCode<T, E>(e164: string, code: string, action: (tx) => Promise<Result<T, E>>): Promise<Result<T, ConfirmError | E>>`,
    as `withConfirmCode`, for purpose `console_recovery` under the number's
    hash.
- `sendCode` takes its limits and whether to ask `smsPaused` from the
  purpose; `withConfirmCode` and `withRecoveryCode` share one private
  `withCode(e164, purpose, code, action)`.

- [x] Tests (integration, `createTestApi` style of
      `confirm-code.integration.test.ts`):
  - `sends a recovery code with its own text and count`: the fake SMS gets a
    text matching `/^\d{6} is your ShareRide console code/`; a
    `rate_limit_events` row with scope `console_recovery_phone`; none with
    `phone`, `ip` or `calling_code`.
  - `refuses a second recovery code within 30 seconds, and a sixth in an hour`
    (`rate_limited` with `retryAfterSeconds`).
  - `sends a recovery code while text messages are paused in the console`.
  - `uses a recovery code once` (the action runs; a second call gives
    `code_expired`), `counts a wrong recovery code` (`code_invalid`,
    `attemptsLeft: 4`), `keeps the code when the action refuses`.
  - `does not take a sign-in code for recovery, or a recovery code for sign-in`.
- [x] Run, expect FAIL; implement; run, expect PASS.

### Task 4: the notice

**Files:**

- Modify: `apps/api/src/modules/notifications/worker.ts` (event to
  notification; `operatorFactsOf`), `apps/api/src/modules/notifications/texts.ts`
- Modify: `packages/i18n/src/messages/en.ts`, `is.ts`: `sms.consoleRecoveryCode`,
  `sms.consoleRecovered`, `email.consoleRecovered.subject`,
  `email.consoleRecovered.body` (spec 22, section 8)
- Test: `apps/api/src/modules/notifications/notifications.integration.test.ts`,
  `texts.test.ts`

**Interfaces:**

- Consumes: an outbox event `{ type: "ConsoleRecovered", payload: { userId } }`.
- Produces: one `console_recovered` notification to that user, sent by text
  to the verified phone and by email to the verified address, whether or not
  they still hold the role.

- [x] Tests: `tells the operator by text and email that a recovery code was used`
      (one SMS with `sms.consoleRecovered`'s English text, one email with
      its subject); `sends no email without a verified address`; texts for
      `is` and `en`.
- [x] Run, expect FAIL; implement; run, expect PASS.
- [x] `pnpm check --force`, then commit PR 1 with this plan and open the
      pull request.

## PR 2: the recovery and the console page

### Task 5: the recovery service and its routes

**Files:**

- Create: `apps/api/src/modules/admin/recovery.ts`
- Modify: `apps/api/src/modules/admin/passkeys.ts` (`createSetupLink`
  takes an optional transaction), `auth-routes.ts`, `require-operator.ts`
  (`openAdminRoutes`), `index.ts`, `apps/api/src/app.ts` (pass the auth
  service in)
- Modify: `packages/contracts/src/admin.ts`
- Test: `apps/api/src/modules/admin/recovery.integration.test.ts`,
  `require-operator.test.ts`

**Interfaces:**

- Consumes: Task 3's `sendRecoveryCode`, `withRecoveryCode`.
- Produces: contracts `adminRecoveryCodeRoute` (`POST
/admin/v1/auth/recovery/code`, body `{ phoneNumber: string }`, 200
  `{ resendAfterSeconds: number }`) and `adminRecoveryVerifyRoute` (`POST
/admin/v1/auth/recovery/verify`, body `{ phoneNumber: string; code: string }`,
  200 `{ token: string }`), errors as spec 22, section 6;
  `createRecoveryService(deps): RecoveryService` with
  `sendCode({ phoneNumber }): Promise<Result<{ resendAfterSeconds }, { code: "phone_invalid" } | StartError>>`
  and `verify({ phoneNumber, code, request }): Promise<Result<{ token }, { code: "phone_invalid" } | ConfirmError>>`.
- In `verify`'s action, in one transaction: lock the account (`for share`),
  refuse with `code_expired` unless `canUseConsole`; `sessions.endAllOf(userId,
"recovered", tx)`; `passkeys.createSetupLink(userId, tx)`; `recordAudit`
  with `operator: { userId, sessionId: null }`, action `operator.recovered`,
  subject the user, no `after` fields; insert the `ConsoleRecovered` outbox
  event.

- [x] Tests:
  - `sends a code to an operator's number, typed without the country code`.
  - `answers the same and sends nothing for a member, a suspended operator or one waiting to be deleted`.
  - `refuses a number that is not a phone number` (400 `phone_invalid`).
  - `limits each address` (429 after 10 tries in a minute).
  - `a right code ends the console sessions, makes a setup link, audits and tells the operator`:
    an earlier session's `GET /admin/v1/me` gives 401; the token's
    `/admin/v1/auth/setup/options` gives 200; one `operator.recovered`
    entry; one `ConsoleRecovered` event.
  - `the token saves a passkey and signs in` (with `testing-authenticator.ts`).
  - `refuses a code once the role was removed` (Review Focus 2).
  - `two right answers at once make one setup link` (Review Focus 4).
  - `require-operator.test.ts`: both routes are open, nothing else is.
- [x] Run, expect FAIL; implement; run, expect PASS.

### Task 6: the console page

**Files:**

- Create: `apps/admin/src/pages/recover.tsx`, `recover.test.tsx`
- Modify: `apps/admin/src/pages/setup.tsx` (optional `token` and `bodyKey`
  props; with a token it does not read the address), `sign-in.tsx` (the
  link), `apps/admin/src/app.tsx` (`recoverPath = "/admin/recover"`, open
  without a session), `apps/admin/src/testing/fake-api.ts` if needed
- Modify: `packages/i18n/src/messages/en.ts`, `is.ts`: the `admin.signIn.lost`
  and `admin.recover.*` keys of spec 22, section 8

- [x] Tests: `opens Lost your passkey? from the sign-in page`;
      `sends a code and asks for it` (the `admin.recover.sent` text);
      `says a wrong code and the tries left`; `an expired code asks for a new one`;
      `Send a new code waits 30 seconds` (fake timers); `a right code shows Save your passkey and signs in`;
      `Back to sign-in`; the page in Icelandic.
- [x] Run, expect FAIL; implement; run, expect PASS.

### Task 7: the journey and the docs

**Files:**

- Modify: `apps/api/src/e2e-server.ts` (the operator gets a verified made-up
  phone from `E2E_OPERATOR_PHONE`), `apps/admin/playwright.config.ts`
  (`operatorPhone`), `apps/admin/e2e/console.spec.ts` (a last journey)
- Modify: `docs/engineering/security.md` (threat model row, Operator
  console), `docs/engineering/operator-console.md` (the two open routes, the
  service), `docs/operations/staging.md` (Sign in to the console: Lost your
  passkey? first, then the command), `docs/plans/README.md`, this plan

- [x] Journey `the operator who lost their passkey gets back in with a text code`:
      sign out, a new empty authenticator, Lost your passkey?, the
      operator's number, the code from the SMS outbox, a passkey name, the
      console home; the audit log shows `operator.recovered`.
- [x] `pnpm check --force`, the integration tests of the API, the console's
      journeys, then open the pull request; merge once green.
