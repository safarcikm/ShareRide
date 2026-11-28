# 0051. The store apps in Martin's name until the company, checked on emulators first

- **Status:** Accepted (accounts: Martin, 2026-11-27, on a decision card);
  Proposed (the rest); the iPhone sign-in sentence superseded by
  [ADR 0056](0056-keep-apples-token-to-end-sign-in-with-apple.md) (Martin
  turned Sign in with Apple on, 2026-11-28)
- **Date:** 2026-11-27
- **Deciders:** Martin
- **Related:** [spec 32](../specs/2026-11-27-phone-apps-in-the-stores.md),
  [ADR 0003](0003-cross-platform-client-expo.md) (Expo and EAS),
  [ADR 0026](0026-push-through-expo.md) (push), [ADR 0034](0034-google-and-apple-sign-in-through-our-api.md)
  (Google and Apple sign-in), the [roadmap](../strategy/roadmap.md) (store
  accounts in the company's name)

## Context

Martin asked for the Android and iPhone apps in Google Play and the App
Store (2026-11-27). The roadmap planned the store accounts in the company's
name, but the ehf. is not registered yet. An organization account in either
store needs a D-U-N-S number (Google: up to 30 days) and a check of the
company. Google asks a new personal account for a closed test with at least
12 testers for 14 days in a row before the app may go public; an
organization account skips it. Both stores let an app move to another
developer account later, with its users, ratings and reviews. Martin
already stands as the operator in the Terms of Service and on the About page.

No phone build has been made yet: every screen was checked in browsers
only. Apple's guideline 4.8 asks an app that offers Google sign-in to offer
an equal private choice, in practice Sign in with Apple, whose users get new
identifiers when an app moves to another account.

## Options considered

1. **Both accounts personal now, moved to the company later.** Test builds
   within days; Google's 14-day test starts at once. Martin's legal name shows
   as the seller, and as an EU trader his address, phone and email show on
   the store pages in EU countries. A move to the company's accounts later.
2. **Google personal now, Apple waits for the company.** Android starts at
   once; the iPhone app likely waits 4 to 8 weeks, and Martin's name still
   shows on Google Play.
3. **Both wait for the company.** The company's name from the start and no
   12-tester test, but nothing installable until the ehf., the D-U-N-S
   number and both stores' checks.

## Decision

We will open both store accounts in Martin's own name now and move the
apps to the company's accounts once the ehf. exists (Martin chose option 1).
Until then, the iPhone app offers no Google sign-in and no Sign in with
Apple; Sign in with Apple comes with the company's Apple account, so its
users never have to move. Builds run in Expo's cloud (ADR 0003), started
from a GitHub Actions button, and no build goes to the stores before an
Android build on an emulator and an iPhone build on the simulator have
passed the Maestro journeys in GitHub Actions on the same code.

## Consequences

- Testers can have the apps within days of the accounts, and Google's
  14-day test, the longest wait, starts early.
- Martin's name, and as an EU trader his phone, are public on the store
  pages until the move. The move needs a new version of the Terms and the
  privacy policy, and new push and signing credentials in Expo.
- iPhone members who joined with Google sign in with an email code.
- Every app pull request also builds and runs both apps in CI; the iPhone
  run uses macOS runners, free while the repository is public.
- Maestro is a new test tool in CI (no runtime dependency).
- Follow-up: Sign in with Apple and revoking Apple's tokens at account
  deletion (spec 19, section 10), with the company's account.

## Revisit when

The ehf. is registered and has its D-U-N-S number; a store refuses the app
over its sign-in; the repository stops being public; the emulator runs
become too slow or unreliable to gate releases.
