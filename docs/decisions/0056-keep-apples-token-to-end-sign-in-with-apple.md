# 0056. Keep Apple's refresh token to end Sign in with Apple with the account

- **Status:** Accepted (Martin chose it on his decision card, 2026-11-28
  11:38 UTC). Supersedes the sentence of
  [ADR 0051](0051-store-apps-in-martins-name-until-the-company.md)
  that kept Google and Apple sign-in off the iPhone (Martin turned Apple on,
  2026-11-28), and amends what [ADR 0034](0034-google-and-apple-sign-in-through-our-api.md)
  keeps from Apple
- **Date:** 2026-11-28
- **Deciders:** Martin
- **Related:** [spec 37](../specs/2026-11-28-sign-in-with-apple-in-the-stores.md),
  [spec 19](../specs/2026-11-22-google-and-apple-sign-in.md) (section 10),
  [spec 32](../specs/2026-11-27-phone-apps-in-the-stores.md) (3.3, R32.5),
  [spec 11](../specs/2026-11-13-privacy-self-service.md) (erasure)

## Context

Martin turned Sign in with Apple on, on his own Apple team, before the App
Store submission (2026-11-28). The apps offer what the API offers, so the
iPhone app now has Apple and Google, as R32.5 allows. ADR 0051 had kept
both off the iPhone until the company's Apple account, so that Apple
members would never have to move; web members of Apple now exist on
Martin's team anyway, and spec 19, 3.5 already says how they move.

Apple asks an app with Sign in with Apple to revoke the person's tokens
through its REST API when the account is deleted. Revoking needs a token
Apple issued: a refresh or access token from a code exchange. ADR 0034 has
the API keep only the subject and a verified email, so today there is
nothing to revoke with. Doing nothing risks the App Store review and
leaves PuffinRide in a deleted member's Apple settings.

## Options considered

1. **Keep Apple's refresh token with the link, and revoke it when the link
   ends.** The API change only; nothing changes in the app, so a build
   already on TestFlight can go to review. Works for every erasure,
   including those nobody starts (console, retention, after a restore).
   Cons: one more stored value, useless without our Apple key; links made
   before it have no token.
2. **Ask the person to continue with Apple once more when they delete.**
   Nothing stored (spec 19, section 10 suggested it). Cons: an extra step
   in account deletion, a new app build before the review, and erasures
   nobody starts cannot revoke.
3. **Do nothing.** Cons: against Apple's rule for account deletion; a
   reason to refuse the app.

## Decision

We will keep Apple's refresh token on the waiting sign-in and on the link,
replace it with each newer one, and, when an Apple link ends (erasure,
removal, replacement), move it to a queue that the API sends to Apple's
revoke endpoint every minute, retried for 7 days. The API sends, not the
hourly clean-up, because the clean-up's cron job holds no Apple keys, as
with photos ([ADR 0033](0033-profile-photos-made-in-the-app-and-checked-by-the-api.md)).
Google's tokens stay unkept. Option 1 is the only one that covers every
erasure without changing the app (Martin's card, recommended).

## Consequences

- No new app build for the review; the change ships with a production
  release.
- One more column on `identities` and `provider_sign_ins`, and a small
  `apple_tokens_to_revoke` table with no account ID, all in the personal
  data register; never in logs, responses or the export.
- Apple links made between 2026-11-28 01:17 and the release have no token
  until their next Apple sign-in.
- Moving to the company's Apple team later revokes nothing by itself: spec
  19, 3.5 still applies.

## Revisit when

Apple's review asks for its native sheet on the iPhone, Apple changes its
revoke endpoint, or the app moves to the company's Apple team.
