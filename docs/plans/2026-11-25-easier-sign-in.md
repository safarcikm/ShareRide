# Easier sign-in, with Face ID first: implementation plan

> For agentic workers: use superpowers:executing-plans to carry this out
> task by task. Steps use checkboxes (`- [ ]`) for tracking.

**Goal:** a returning member gets back in with a glance or a touch, or with
the way they used last time on top ([spec 29](../specs/2026-11-25-easier-sign-in.md)).

**Architecture:** no migration and no new dependency. The API learns one
error (`passkey_unknown`), shows each passkey's `credentialId`, and allows
more sign-in options. The app's device layer (`apps/mobile/src/sign-in/passkey*.ts`)
gains the browser's quiet requests (conditional get and create, through
`@simplewebauthn/browser` 14, which has both) and the Signal API; step 1
runs the quiet request; a hook in the menu layout decides, after each
sign-in, what opens next. Rules with a number (30 days, 60 options) live
in `packages/domain`.

**Tech stack:** `@simplewebauthn/browser` 14.0.0 (`useBrowserAutofill`,
`useAutoRegister`, `WebAuthnAbortService`), `@simplewebauthn/server`
14.1.0, Expo Router, Playwright with Chromium's virtual authenticator.

**Spec:** [spec 29](../specs/2026-11-25-easier-sign-in.md); research and
approval in the [plan doc](https://claude.ai/artifact/A41X4xdkpNGaFc47ryXzYA).

**Date:** 2026-11-25 · **Status:** In progress

## Global constraints

- Three PRs, each `feat(sign-in)`, in this order; each releases on its own.
- Every text in `packages/i18n/src/messages/en.ts` and `is.ts`.
- Nothing new is sent to the API about the device; the three device values
  of spec 29, section 5, go through `@/lib/preferences` only.
- Quiet requests never show an error: any failure leaves the screen as it
  was (spec 29, 3.1, item 3; 3.3, item 2).
- The button "Face ID or fingerprint" keeps working while the quiet request
  runs: it pauses the quiet request first, and resumes it after.
- An operator's passkey is never reported to the browser (R29.4).
- No passkey work on iOS and Android: the native `passkey.ts` answers
  "not available" to every new method.

## Review focus

1. Pressing the button while the quiet request waits: one sheet, one
   sign-in, no "Too many tries" (Task 3 test).
2. Step 1 left open over 5 minutes: the suggestion still signs in (renewal,
   Task 3 test with fake timers).
3. A booking kept through sign-in: it opens, and the offer does not (Task 7
   test).
4. A passkey removed on another device, then offered by this browser:
   `passkey_unknown`, the usual message, and the browser told once (Task 3).
5. A console passkey picked on step 1: `passkey_invalid`, never reported
   (Task 1 integration test).

---

## PR 1: Face ID in the email field

### Task 1: API

**Files:** `packages/domain/src/auth/passkeys.ts` (+ test),
`apps/api/src/modules/auth/member-passkeys.ts`, `passkey-routes.ts`,
`member-passkeys.integration.test.ts`, `packages/contracts/src/auth.ts`,
`packages/contracts/src/sign-in-methods.ts`.

**Produces:** `memberPasskeyRules.signInOptionsLimits` =
`[{ limit: 60, windowSeconds: 600 }]`; `PasskeySignInError` gains
`{ code: "passkey_unknown" }`, answered 400 by `POST /v1/auth/passkey`;
`MemberPasskey.credentialId: string`.

- [x] Failing tests: domain, the limit is 60 per 600 s; integration,
  "a passkey in neither table is passkey_unknown", "an operator's passkey is
  passkey_invalid" (insert an `operatorPasskeys` row with that credential
  ID), "Sign-in methods lists each passkey's credentialId".
- [x] In `signIn`, when no member passkey has the credential, look up
  `schema.operatorPasskeys` by `credentialId`: found → `passkey_invalid`,
  else → `passkey_unknown`. `toMemberPasskey` adds `credentialId`.
- [x] Contracts: describe `passkey_unknown` on the route; add
  `credentialId` to `memberPasskeySchema`.
- [x] Run `pnpm --filter @shareride/domain test` and the API's integration
  file; commit.

### Task 2: The device layer

**Files:** `apps/mobile/src/sign-in/passkey-types.ts`, `passkey.web.ts`,
`passkey.ts`.

**Produces** on `DevicePasskeys`:
`autofillAvailable(): Promise<boolean>` (built-in authenticator and
`browserSupportsWebAuthnAutofill()`); `autofill(options): Promise<PasskeyAssertion>`
(`startAuthentication({ optionsJSON, useBrowserAutofill: true })`);
`cancel(): void` (`WebAuthnAbortService.cancelCeremony()`);
`forget(credentialId: string): Promise<void>` (`PublicKeyCredential.signalUnknownCredential`
with `rpId` = `location.hostname`, which is `WEB_APP_URL`'s host, when the
browser has it; never throws). Native: `false`, rejected, no-op, no-op.

- [x] Types and both modules; `pnpm --filter @shareride/mobile typecheck`.

### Task 3: Step 1 and Settings

**Files:** `apps/mobile/src/sign-in/use-passkey-autofill.ts` (new),
`apps/mobile/src/app/sign-in/index.tsx`, `apps/mobile/src/components/text-field.tsx`
(web-only `autoComplete` of `"username webauthn"`),
`apps/mobile/src/sign-in/passkey-devices.tsx`, `apps/mobile/src/auth/errors.ts`
or the screen's `passkeyErrorText`, `apps/mobile/src/__tests__/passkey.test.tsx`.

**Produces:** `usePasskeyAutofill({ enabled, onAnswer }): { pause(): void; resume(): void }`:
asks `session.passkeyOptions()`, then `devicePasskeys.autofill`, hands the
answer and its options to `onAnswer`, renews every `keepPasskeyOptionsMs`,
cancels on unmount and on `pause`, starts again on `resume`; ignores every
failure.

- [x] Failing tests in `passkey.test.tsx` ("Face ID in the email field
  (spec 29, 3.1)"): starts where `autofillAvailable` and `passkeySignIn`;
  not otherwise; an answer signs in with no tap; the button pauses it (one
  `get`, `cancel` called) and it resumes after; renews after
  `keepPasskeyOptionsMs` with fake timers; `passkey_unknown` shows
  `passkey.unknown` and calls `forget(credential.id)`; removing a device in
  Settings calls `forget(passkey.credentialId)`.
- [x] Build the hook, use it in `ChooseHowScreen` (one `finishPasskey`
  shared by the button and the hook), focus the email field on a wide
  screen, map `passkey_unknown` like `passkey_invalid`.
- [x] `pnpm --filter @shareride/mobile test -- passkey`; commit.

### Task 4: Journey and docs

**Files:** `apps/mobile/e2e/passkey.spec.ts`; `docs/engineering/security.md`
(passkeys: limit 60, `passkey_unknown`, the quiet request, the Signal API);
spec 27 (a line pointing to spec 29 under 3.1, 3.3 and 3.6);
`docs/specs/README.md`, `docs/plans/README.md`.

- [x] Add "picks the passkey from the email field" where Chromium's
  virtual authenticator answers a conditional request; if it cannot, say so
  in the PR and rely on Task 3's tests. (It can, and it takes the Signal
  API: the journey adds a passkey no member has and sees it forgotten.)
- [x] Run the passkey and sign-in journeys on the desktop project;
  `npx --yes markdownlint-cli2@0.24.0`; `pnpm check`; open PR 1.

## PR 2: Face ID offered after another way in

### Task 5: The offer rule

**Files:** `packages/domain/src/auth/passkeys.ts` (+ test).

**Produces:** `passkeyOfferRules = { askAgainAfterDays: 30 }` and
`passkeyOfferDue(input: { isNewUser: boolean; way: SignInWay; deviceHasLock: boolean; serverHasPasskeys: boolean; passkeyHere: boolean; declinedAt: Date | null; keptChoice: boolean; now: Date }): boolean`,
with `SignInWay = "google" | "apple" | "passkey" | "password" | "email"`.

- [ ] Tests: true for an email sign-in on a capable browser; false for
  each condition of R29.2 alone; declined 29 days ago false, 30 days ago
  true. Implement; commit.

### Task 6: What the last sign-in was

**Files:** `apps/mobile/src/auth/session-manager.ts` (+ its test).

**Produces:** `SessionManager.takeJustSignedIn(): JustSignedIn | null`,
`JustSignedIn = { way: SignInWay; isNewUser: boolean; credentialId: string | null }`,
set before the state turns signed in; `finishProviderSignIn(ticket, verifier, provider)`
and `verify(..., pendingSignIn, startedWith)` take the way.

- [ ] Tests per sign-in method; implement; update the callers; commit.

### Task 7: The offer, and the quiet passkey after a password

**Files:** `apps/mobile/src/sign-in/this-browser.ts` (new: `lastWay`,
`rememberWay`, `passkeyHere`, `markPasskeyHere(credentialId)`,
`forgetPasskeyHere(credentialId)`, `offerDeclinedAt`, `declineOffer(at)`,
preference keys `last-sign-in`, `passkey-here`, `passkey-offer-declined`),
`apps/mobile/src/sign-in/after-sign-in.ts` (new: `useAfterSignIn`, used by
`(tabs)/_layout.tsx` in place of `useKeptChoice`),
`apps/mobile/src/app/onboarding/face-id.tsx` (new screen, in
`member-screens.ts`), `DevicePasskeys.createQuietly(options)` and
`quietCreateAvailable()`, texts, `docs/compliance/privacy-gdpr.md`
(device-storage row), `apps/mobile/src/__tests__/passkey.test.tsx`.

- [ ] Failing tests: offered after an email code; not after a passkey; not
  for a new account (which gets "Sign in faster next time"); not within 30
  days of "Not now"; not with a kept booking (the booking opens); "Set it
  up" saves and marks this browser; after a password, a quiet passkey saved
  means no offer, a refused one means the offer; removing the marked
  credential in Settings forgets the mark.
- [ ] Implement; `pnpm --filter @shareride/mobile test`; commit.

### Task 8: Journey

- [ ] `passkey.spec.ts`: an existing member signs in with the email code,
  is offered Face ID, sets it up, signs out and back in with the button.
  Run; open PR 2.

## PR 3: The way you used last time first, and a calmer screen

### Task 9: Last used first

**Files:** `apps/mobile/src/sign-in/last-used.ts` (+ test:
`firstWay(lastWay, offered: { providers: SignInProvider[]; passkey: boolean; email: boolean }): SignInWay | null`),
`apps/mobile/src/app/sign-in/index.tsx`, texts.

- [ ] Tests: each kept way that is offered comes first with "Last used";
  one not offered, or none kept, keeps today's order with no mark; email
  and password put the form first. Implement; commit.

### Task 10: A calmer screen

**Files:** `apps/mobile/src/sign-in/sign-up-progress.tsx` and step 1,
`apps/mobile/src/analytics/consent-bar.tsx` (waits on `/sign-in/*` and
`/onboarding/*`), texts (`auth.passwordHelp`; `auth.email.help` leaves
step 1), affected app tests and journeys.

- [ ] Failing tests: no "Step 1 of 3" on step 1, "Step 2 of 3" on the
  phone step; the cookie question waits on sign-in screens and shows after.
- [ ] Implement; `pnpm check`; the sign-in, welcome and analytics journeys;
  spec 16 and spec 27 pointers; open PR 3; release; Martin's manual check.
