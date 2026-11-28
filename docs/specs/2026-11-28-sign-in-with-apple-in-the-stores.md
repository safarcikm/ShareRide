# Spec 37: Sign in with Apple in the store apps, and ending it with the account

**Owner:** Martin · **Date:** 2026-11-28 · **Status:** Proposed
(2026-11-28): Martin turned Sign in with Apple on before the App Store
submission; how its link ends is on a decision card (section 7). Build plan:
[docs/plans/2026-11-28-sign-in-with-apple-in-the-stores.md](../plans/2026-11-28-sign-in-with-apple-in-the-stores.md).
Decision: [ADR 0056](../decisions/0056-keep-apples-token-to-end-sign-in-with-apple.md).

Amends: [spec 32](2026-11-27-phone-apps-in-the-stores.md) (3.3 sign-in on
the phones; R32.5 stands) and [spec 19](2026-11-22-google-and-apple-sign-in.md)
(section 10: revoking Apple's tokens is now in scope).

## 1. Why

- On 2026-11-28 at 01:00 UTC Martin chose to turn Sign in with Apple on
  before the App Store submission. It has been live on staging and
  `puffinride.is` since 01:17, on his own Apple developer team (Services ID
  `is.puffinride.web`), and he signed in with it at 01:41.
- The apps take their sign-in choices from the API (`signInProviders` in
  `/v1/config`, through `providersOffered`). With Apple on, the iPhone app
  offers Apple and Google, as R32.5 allows, and the Android app offers both
  too. Spec 32, 3.3, ADR 0051 and the App Store notes still say the iPhone
  has neither until the company's account.
- Apple asks every app that offers Sign in with Apple to revoke the
  person's tokens through Apple's REST API when their account is deleted
  (Apple, "Offering account deletion in your app"). Spec 19 left this for
  just before the App Store release (section 10), and nothing does it yet.

## 2. What people see

Nothing new on screen. On the iPhone and on Android: Continue with Apple,
Continue with Google, the email with a code or a password, as on the
website.

When an account with Apple linked is erased, or its Apple link is removed
or replaced on Sign-in methods, Apple ends PuffinRide's access to that
Apple account within the hour, so PuffinRide leaves the person's "Sign in
with Apple" list in their Apple Account settings.

## 3. How it works

### 3.1 Keeping Apple's token

Apple's token endpoint answers a sign-in's code with a refresh token
beside the ID token. The API keeps that refresh token with the sign-in:
on the waiting sign-in (`provider_sign_ins`, at most 30 minutes), then on
the link (`identities`) when the sign-in finishes or links. A later sign-in
with the same Apple account replaces it with the newer one. Google's tokens
are not kept: Google asks nothing of the kind.

### 3.2 Ending the link

When an Apple link goes, its token moves to a queue of revocations
(`apple_tokens_to_revoke`), alone and with no account ID, in the same
transaction:

- the account is erased, whichever way: the person's own deletion once its
  grace period ends, the console, the retention clean-up, or
  `privacy reapply-erasures` after a restore;
- the member removes Apple on Sign-in methods;
- the member links another Apple account in its place.

The API sends each queued token to Apple's revoke endpoint
(`https://appleid.apple.com/auth/revoke`, with our Services ID, the client
secret the API already signs, the token and `token_type_hint=refresh_token`)
in a job, `apple-revocations`, that runs every minute while Apple is on. The
API sends, not the hourly clean-up, because the clean-up's cron job holds no
Apple keys, as with photos ([ADR 0033](../decisions/0033-profile-photos-made-in-the-app-and-checked-by-the-api.md)). A run
takes up to 50 due tokens and holds them for 2 minutes, so no other run
sends them meanwhile. Apple's 200 deletes the row. Any other answer, or no
answer, sends it again 10 minutes later. The hourly clean-up deletes a row
still queued after 7 days and logs a warning with the count, never the
token.

Apple keeps one Sign in with Apple state for each Apple account and app, so
revoking a queued token also ends a newer link to the same Apple account
made before the token was sent: within a minute, or longer while Apple
refuses. The member stays signed in to PuffinRide; their next Apple sign-in
shows Apple's first-time sheet and keeps a fresh token. Rare, and accepted.

### 3.3 Links made before this

Apple links made between 2026-11-28 01:17 and this change's release have no
token. The person's next Apple sign-in stores one. An account erased before
that ends without revoking: there is nothing to send. Very few accounts, and
the person can still remove PuffinRide in their Apple Account settings.

An Apple sign-in that never becomes a link (a newcomer who stops at the
phone step, a Settings link never confirmed) is not revoked either: no
account was made, and the clean-up deletes the waiting sign-in and its
token an hour after it ends. Revoking it could end a live link of the same
Apple account (3.2). The person can remove PuffinRide in their Apple Account
settings.

### 3.4 Staging, development and tests

The stand-in provider gives a made-up refresh token, so tests see it kept
and queued. Its revoke answers yes without a request, so the job deletes
queued stand-in tokens and nothing is sent anywhere. Without any Apple
provider the job does not run.

## 4. Privacy and security

- A refresh token alone is useless: Apple takes it only with a client secret
  signed with our Apple key, which stays a Render secret.
- It is never in "Download my data" (the export already shows the link:
  provider, email, date), in a response or in a log.
- It goes with the account. In the queue it is kept alone, with no account
  ID, until Apple confirms, at most 7 days.
- The record of processing (`docs/compliance/privacy-gdpr.md`) and the
  personal data register (`packages/db/src/personal-data.ts`) list the
  column and the queue. The privacy policy already names Apple as a
  recipient for sign-in; its next version mentions the kept token in that
  sentence, with no new version for this alone.

## 5. The store pages

- App Store notes for the reviewers: the line saying version 1.0 has no
  Sign in with Apple goes. A line asks them to use the review account,
  since a new account made with Apple or Google still needs the Icelandic
  phone check.
- Privacy answers: Apple's "User ID" is also Google's or Apple's ID for the
  person; Google Play's account question names Google and Apple sign-in.
- `listing.py` still keeps sign-in services out of the App Store
  description, now so the text never goes stale.

## 6. Requirements

| # | Requirement |
| - | ----------- |
| R37.1 | The API keeps Apple's refresh token from a sign-in with its link, and only Apple's; a newer one replaces it. |
| R37.2 | When an Apple link ends (account erased, Apple removed, link replaced), its token is revoked with Apple within minutes, and tried again for 7 days. |
| R37.3 | The token never appears in a log, a response or "Download my data". |
| R37.4 | Without Apple's keys, nothing is sent to Apple. |

## 7. Decision for Martin

How deleting an account ends its Sign in with Apple link, on a decision
card on 2026-11-28:

| Option | What happens |
| ------ | ------------ |
| **Keep Apple's key to end it** (recommended) | The server keeps the token Apple gives at sign-in and uses it when an account is deleted or Apple is removed. Nothing changes in the app; build 1.0.0 (4) can go to review. It also works when an account is erased from the console or after a long time unused. |
| Ask for Apple once more | Nothing extra is kept, but deleting an account asks Apple members to continue with Apple again, and it needs a new app build before review. Erasures nobody starts (console, retention) cannot revoke. |

## 8. Tests

- Unit: the Apple provider returns the refresh token from Apple's answer,
  and none when Apple sends none; the revoke request's address and form,
  with a fake `fetch`.
- Integration: the callback keeps the token on the waiting sign-in; a
  sign-in to an existing link replaces it; a new link takes it; removing,
  replacing and erasing queue it and leave no token on the account; the
  job deletes a row on Apple's 200 and sends a refused one again 10 minutes
  later; the clean-up drops a row after 7 days; no log line holds a token;
  the personal data register test passes.

## 9. Out of scope

- Apple's server notifications (a person stops using Apple with PuffinRide,
  or changes their relay email).
- Apple's own sheet on the iPhone instead of the browser sheet (spec 19,
  section 10), unless the App Store review asks for it.
- Moving Apple members to the company's team (spec 19, 3.5, stands).
