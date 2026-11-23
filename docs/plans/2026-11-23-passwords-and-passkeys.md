# Passwords and Face ID or fingerprint: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** members can set a password and sign in with it, and on the
website set up and sign in with Face ID or fingerprint (a passkey kept on
the device), both optional on top of the email code and Google.

**Architecture:** rules in `packages/domain/src/auth` (password rules,
the proof rule, limits, device names); two services beside the sign-in
module in `apps/api/src/modules/auth` (`passwords.ts`, `member-passkeys.ts`)
that open sessions with the existing `openSession`; routes beside
`provider-routes.ts`; the app's sign-in screen, Settings, Sign-in methods,
and one step after sign-up.

**Tech stack:** Node's `crypto.scrypt`; `@simplewebauthn/server` 14.1.0 (in
the API already) and `@simplewebauthn/browser` 14.0.0 (added to the member
app, web only); Drizzle; Hono; Expo Router; Playwright's CDP virtual
authenticator.

**Spec:** [spec 27](../specs/2026-11-23-passwords-and-passkeys.md);
[ADR 0047](../decisions/0047-member-passwords-hashed-with-scrypt.md),
[ADR 0048](../decisions/0048-member-passkeys-on-the-device-only.md).

## Global constraints

- Password: 10 to 128 characters (code points, after NFC), not on the
  NCSC 100 000 list (any case; `apps/api/assets/common-passwords.txt`, the
  9 183 entries of 10 characters or more), not the account's email (any
  case). R27.2.
- scrypt N = 2^15, r = 8, p = 3, salt 16 bytes, key 32 bytes, `maxmem`
  64 MiB; stored `scrypt$15$8$3$<salt base64url>$<hash base64url>`.
- Wrong passwords: 10 an hour per email (keyed hash), 30 an hour per network
  address (IPv6 by /64, as `emailCodeSendLimits`). R27.4.
- Proof (R27.5): the request's session started (`sessions.created_at`) in
  the last 10 minutes, or a confirm code (`withConfirmCode`).
- Passkeys: `authenticatorAttachment: "platform"`, `residentKey:
  "required"`, `userVerification: "required"`, `attestationType: "none"`,
  algorithms -7 and -257, RP ID the host of `WEB_APP_URL`, expected origin
  `WEB_APP_URL`; challenges 5 minutes, single use; 10 per account; user
  handle random 32 bytes per account, never the account ID.
- No password, hash, email, challenge or key in a log line.
- Every user-facing text in `en.ts` and `is.ts`.
- Next free migration: `0063`.

## Review focus

1. A password typed with leading or trailing spaces, or composed Unicode
   (é as one or two code points): kept as typed, normalised to NFC, counted
   in characters. Test in the domain rules and at sign-in.
2. Two password sign-ins at once with wrong passwords at the 10th try: the
   limit holds (store the event under the same advisory lock as codes).
3. The console's passkey offered at member sign-in on the same domain: a
   clear refusal, never a 500. Test with a credential ID not in
   `member_passkeys`.
4. A session older than 10 minutes setting a password without a code: 403
   `confirm_required`, and the confirm code then works once.
5. An account erased or waiting to be deleted signing in with a password or
   a passkey: the same answers as the email code (`account_unavailable`,
   "Keep my account").

---

### Task 1: Domain rules

**Files:** create `packages/domain/src/auth/passwords.ts` and its test,
`packages/domain/src/auth/passkeys.ts` and its test; export from
`index.ts`. The list stays out of the domain package (it would grow the
app's bundle): `apps/api/assets/common-passwords.txt`, with its source and
licence in `#` lines, read once by the API and passed in as `isCommon`.

**Produces:**

- `checkNewPassword(password: string, email: string | null, isCommon: (lowered: string) => boolean): Result<string, PasswordProblem>`
  where `PasswordProblem = "too_short" | "too_long" | "too_common" | "is_email"`
  and the value is the NFC form.
- `passwordSignInLimits = { perEmail: [{10, 3600}], perIpAddress: [{30, 3600}] }`.
- `scryptSettings = { logN: 15, r: 8, p: 3, saltBytes: 16, keyBytes: 32 }`.
- `freshSignInSeconds = 600`; `needsProof(sessionStartedAt: Date, now: Date): boolean`.
- `memberPasskeyRules = { perAccount: 10, challengeSeconds: 300 }`.
- `deviceName(userAgent: string): { browser, system } | null` (Safari and
  iPhone, Chrome and Windows, Edge, Firefox, Samsung Internet; null when it
  cannot tell). Stored in two columns; the app and the emails word them
  ("Safari on iPhone", "Safari á iPhone"; "A browser" for null).

- [ ] Tests first: each problem and its boundary (9, 10, 128, 129
  characters, an emoji counts as one); the common list; the email in other
  case; `needsProof` at 599 and 600 seconds; `deviceName` for each pair.
- [ ] Implement; `pnpm --filter @shareride/domain test` passes.
- [ ] Commit.

### Task 2: Data

**Files:** `packages/db/src/schema/auth.ts`; migration `0063` with
`pnpm --filter @shareride/db generate`; retention rules in
`apps/api/src/modules/privacy/retention.ts`.

- `member_passwords` (`user_id` primary key, cascade; `hash` text;
  timestamps).
- `member_passkeys` (id; `user_id` cascade, indexed; `credential_id` text
  unique; `public_key` bytea; `counter` bigint; `transports` text[];
  `backed_up` boolean; `user_handle` text; `browser` and `system` text,
  null when unknown; `last_used_at`;
  timestamps).
- `member_passkey_challenges` (id; `challenge_hash` text unique;
  `purpose` check `sign_in` or `register`; `user_id` null for `sign_in`;
  `expires_at`; timestamps).
- The clean-up deletes challenges an hour after they expire.

- [ ] Clean-up integration test first; then schema, migration, prettier on
  the migration's metadata; commit.

### Task 3: Passwords in the API

**Files:** `apps/api/src/modules/auth/passwords.ts`,
`password-routes.ts`, contracts in `packages/contracts/src/auth.ts` and
`sign-in-methods.ts`, emails in `auth/emails.ts`, Download my data in the
privacy export, `password.integration.test.ts`.

**Consumes:** `openSession`, `withConfirmCode`, `checkRateLimits`, the
storeCode lock pattern (`pg_advisory_xact_lock` per limit key), `hasher`.

**Produces:** `POST /v1/auth/password`, `PUT /v1/me/password`,
`DELETE /v1/me/password`; `GET /v1/me/sign-in-methods` gains `password:
{ setAt } | null`.

- [ ] Tests first: set without proof after 10 minutes (403), with code,
  within 10 minutes; each `password_invalid` reason; `email_required`;
  sign-in right; wrong password, unknown email and no password give the
  same 400 `credentials_invalid`; the 11th wrong try an hour is 429 with
  `retryAfterSeconds` while the email code still works; a hash with older
  settings is made again at sign-in; the change emails to the verified
  email; removal; the hash's format; logs hold no email or password;
  Download my data says only `passwordSetAt`.
- [ ] Implement; integration tests pass; commit.

### Task 4: Passwords in the app

**Files:** `apps/mobile/src/app/sign-in/index.tsx`, a new
`apps/mobile/src/app/settings/password.tsx`, `settings/sign-in-methods.tsx`,
`apps/mobile/src/app/onboarding/faster.tsx` (the step after sign-up),
i18n `en.ts`/`is.ts`, screen tests.

- [ ] Screen tests first: the button reads "Send code" then "Sign in";
  "Forgot your password?" sends the code and lands on "Choose a password";
  the password screen's messages; Sign-in methods' line; the step after
  sign-up shown once.
- [ ] Implement; `pnpm --filter @shareride/mobile test` passes; commit.

### Task 5: Passkeys in the API

**Files:** `apps/api/src/modules/auth/member-passkeys.ts`,
`passkey-routes.ts`, contracts, emails, privacy export,
`member-passkeys.integration.test.ts` (with the console's
`testing-authenticator.ts`).

**Produces:** `POST /v1/auth/passkey/options`, `POST /v1/auth/passkey`,
`POST /v1/me/passkeys/options`, `POST /v1/me/passkeys`,
`DELETE /v1/me/passkeys/{id}`; `GET /v1/config` gains `passkeySignIn`.

- [ ] Tests first: register with and without proof; options name the
  platform attachment and exclude the account's passkeys; the 11th refused;
  sign in; counter and `last_used_at` stored; an unknown credential (a
  console passkey) refused with `passkey_invalid`; a challenge used twice or
  after 5 minutes refused; options limited per network address; removal;
  the email on setup; Download my data lists devices.
- [ ] Implement; tests pass; commit.

### Task 6: Passkeys in the app (web)

**Files:** `apps/mobile/src/sign-in/passkey.web.ts` (with
`@simplewebauthn/browser`) and `passkey.ts` (native: not available), the
sign-in screen's button, Sign-in methods' devices, the step after sign-up,
i18n, screen tests; `npx expo install` is not needed (a plain web package).

- [ ] Screen tests first with the passkey module mocked: the button only
  where available and `passkeySignIn`; a cancelled sheet changes nothing;
  `passkey_invalid` shows its line; set up, "already set up", too many,
  remove.
- [ ] Implement; tests pass; commit.

### Task 7: Journeys, docs, release

**Files:** `apps/mobile/e2e/password.spec.ts`, `passkey.spec.ts` (CDP
`WebAuthn.enable` and `addVirtualAuthenticator` with `protocol: "ctap2"`,
`transport: "internal"`, `hasResidentKey`, `hasUserVerification`,
`isUserVerified`); `docs/engineering/security.md`,
`docs/compliance/privacy-gdpr.md` (three tables), `CHANGELOG.md`,
`docs/plans/README.md`, spec 26's R26.5 note pointing to R27.5.

- [ ] Journeys pass locally (phone and desktop); docs lint; PR; CI green;
  merge; Release to production; check `GET /v1/config` on staging and
  production shows `passkeySignIn: true`.
