# Email alerts and open beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web members get the hour-before reminder, new requests and "How
was your trip?" by email, every email link opens its screen even before
signing in, the web asks for an email at sign-up, and anyone can create an
account.

**Architecture:** Two rules change in the domain's notification catalogue
(email as fallback) and one default in the settings catalogue (invite code
off). The worker, the email builder and the invite gate already read those
tables, so the API changes only the rating link and the config's `beta`.
The app keeps a link opened before signing in as a fourth kept choice
(`navigation/kept-choice.ts`), and step 3 of sign-up sends the existing
email link on the web.

**Tech Stack:** TypeScript domain package (Vitest), Hono and Drizzle
(API, integration tests against PostgreSQL), Expo Router and React Native
(app, Jest with RNTL 14), Playwright web journeys.

**Spec:** [spec 20](../specs/2026-11-22-email-alerts-and-open-beta.md),
[ADR 0035](../decisions/0035-open-web-beta-reached-by-email.md) (Proposed).

## Global Constraints

- No migration, no new endpoint, no new dependency.
- Every text in `en.ts` and `is.ts`; tokens only on screens (spec 15).
- An email says only what its push says (R7.9).
- The kept link is a path from the app's own member screens, never a full
  address, and kept for one hour.
- Sign-up must not get stuck on a server that sends no email.

## Review Focus

1. A member with push gets no new email (fallback). Task 1.2 tests it.
2. Trip reminders off stops both the hour email and the review emails.
   Task 1.2 tests it.
3. The invite gate's tests still cover "on" (they store the setting).
   Task 1.3.
4. A kept link can never lead outside the app or to a public screen that
   sends to sign-in again. Task 2.1 tests it.
5. The web sign-up sends the email link once, even when saving the
   profile fails and is tried again. Task 3.1 tests it.

---

## PR 1: spec, plan and ADR

- [ ] Spec 20, this plan, ADR 0035 (Proposed), the indexes, open
      questions A53 and A54, the roadmap's milestone 12 and Phase 3.

## PR 2: by email, and the beta open

### Task 1.1: the catalogue

**Files:** `packages/domain/src/notifications/catalogue.ts`, its test.

- [ ] Test first: `channelsFor` for `reminder_hour`, `reminder_hour_driver`,
      `rate_trip`, `rate_trip_driver` gives email (sent) without a push
      device and with a verified email, and email skipped `has_push` with one.
- [ ] Change the four rules to `email: "fallback"`, with the comments.

### Task 1.2: the worker and the texts

**Files:** `apps/api/src/modules/notifications/texts.ts`, `texts.test.ts`,
`notifications.integration.test.ts`, `packages/i18n` (`review.ratePassengers`).

- [ ] Test first: the passenger's `rate_trip` text has the path
      `/bookings/<id>/rate` and the link words "Rate the driver"; the
      driver's has "Rate your passengers".
- [ ] Integration: a passenger without push and with a verified email gets
      the hour reminder by email; the review prompt by email at completion
      and after 3 days; none with push; none with Trip reminders off.
- [ ] Change the path and link words in `bookingText`.

### Task 1.3: the invite code off by default

**Files:** `packages/domain/src/settings/catalogue.ts`, `values.test.ts`,
`apps/api/src/testing.ts`, `apps/api/src/modules/beta/invites.integration.test.ts`,
`apps/api/src/modules/settings/routes.ts`, `packages/contracts/src/settings.ts`
(or wherever `beta` is described), the console's help text.

- [ ] Test first: the default is 0; a fresh API lets a new number sign up
      with no code; with the setting stored on, the gate still asks.
- [ ] Default 0. `useStoredInviteSetting()` tests store it on where they
      need it. `GET /v1/config` answers `beta: true`.
- [ ] Docs: spec 7 (3.3, 3.5), spec 8 (3.9), spec 12 (3.1, 3.2, R12.1),
      spec 10's settings table if it names the default, pricing and seats'
      configuration values, the privacy register (feedback note).

## PR 3: email links after signing in

### Task 2.1: the kept link

**Files:** `apps/mobile/src/navigation/kept-link.ts` (new) and its test,
`kept-choice.ts`, `apps/mobile/src/app/_layout.tsx`, the web's first
address (`opened-link.web.ts` and `opened-link.ts`).

- [ ] Test first: a member screen's path is kept and taken once; one older
      than an hour is not; a public path, a full address or `//host` is
      never kept; booking, offer and problem go before the link.
- [ ] The member screens come from one list that `_layout.tsx` renders, so
      the two cannot drift apart.
- [ ] Signed out (or with sign-up steps left) on a member link: keep it and
      open Sign in.

### Task 2.2: the web journey

**Files:** `apps/mobile/e2e/review-from-email.spec.ts`.

- [ ] Dóra adds an email, books Bára's trip, the trip completes; in a new
      browser, Dóra opens "Rate the driver" from the email, signs in, lands
      on the rating screen and sends a review.

## PR 4: an email at sign-up on the web

### Task 3.1: About you asks for the email

**Files:** `apps/mobile/src/app/onboarding/about-you.tsx`, a small
`sign-up-email.tsx` part, the screen test, `packages/i18n`
(`onboarding.emailHelp`), the privacy register's Email row, spec 1.

- [ ] Test first (web): the field shows without a verified or waiting
      email, an empty or wrong address is refused, the link is sent before
      the profile is saved, a retry after a failed save does not send it
      again, `email_unavailable` lets sign-up go on. On phones, no field.
- [ ] Build it; update the sign-up journeys that run on the web.

## Martin's steps

- Mailjet keys and `EMAIL_PROVIDER=mailjet` in Render (runbook, "Turn on
  email"), then one hour reminder and one "How was your trip?" read in
  each language.
