# 0046. Sign in with an email code or Google; a text message only checks the number

- **Status:** Proposed
- **Date:** 2026-11-23
- **Deciders:** Martin
- **Related:** supersedes the sign-in choice of
  [ADR 0010](0010-authentication-and-identity.md) (phone number with a
  one-time code as the primary method); amends
  [ADR 0034](0034-google-and-apple-sign-in-through-our-api.md) (the phone
  step); [ADR 0016](0016-own-sign-in-module.md),
  [ADR 0023](0023-sms-with-vonage.md),
  [ADR 0027](0027-email-through-mailjet.md),
  [spec 26](../specs/2026-11-23-sign-in-without-text-messages.md)

## Context

ADR 0010 made a phone number with a code by text message the main way to
sign in, and said to revisit it if "SMS costs or fraud become significant".
PuffinRide opened to the public on 2026-11-22. On 2026-11-23 Martin wrote
that texts for sign-in "would bankrupt me": every phone sign-in, and every
confirm code, is a paid text, while an email through Mailjet costs almost
nothing. A form that texts any number is also the target of SMS pumping.

What must stay: every account has a verified phone number, so drivers and
passengers can reach each other (ADR 0010's first verification level);
Google sign-in works as ADR 0034 built it; sessions last 60 days after last
use (ADR 0016). Email already works on production (ADR 0027), and most
accounts made on the web already have a verified email (spec 20).

## Options considered

1. **Google, or a 6-digit code by email; one text at sign-up.** Everyone has
   an email; codes are nearly free; nothing to remember or leak. Costs: a
   wait for the email, deliverability to watch, two codes at sign-up.
2. **Google, or email and password.** Familiar and instant. Costs: a
   forgotten password still needs an email code, plus screens to set,
   change and reset it, a password store to guard, and reused passwords.
3. **Google only.** Least to build. Costs: people without a Google account
   cannot join until Apple sign-in is set up.
4. **Option 1 plus passkeys.** Face ID or a fingerprint, no wait. Costs:
   about a day more work, and passkeys gave Martin trouble in the console
   (ADR 0041); it can come later on top of option 1.

## Decision

We will sign people in with Google (and Apple once set up) or a 6-digit code
by email, and send a text message only to check a phone number, because it
removes the paid text from every sign-in while keeping a verified number on
every account.

- The email comes first, then the number: a text code goes only in the phone
  step of a waiting email, Google or Apple sign-in, at most 3 per waiting
  sign-in, and all sign-in texts together have an hourly and a daily
  ceiling on top of today's limits.
- A number that already has an account signs in to it at the phone step,
  and the new email becomes the account's (replacing an old one, which is
  told). That is how members from before, and people who lost their inbox,
  get in.
- Confirm codes go by email to the account's verified email, by text only
  without one. A new way into an account, including a new email, needs a
  code to a way it already has.
- Email codes reuse the sign-in code's rules and storage (ADR 0016): keyed
  hashes, 10 minutes, 5 attempts.

Everything else in ADR 0010 stands: the verification levels, no kennitala,
Apple and Google as ways in.

## Consequences

- A sign-in costs one email instead of one text; a new member costs one
  text, once. Confirm codes are free for almost everyone.
- Email delivery becomes part of signing in: a Mailjet outage stops email
  sign-ins (Google still works), so the Mailjet plan's daily limit must stay
  above the day's sign-ins. A server with no email setting shows Google
  alone.
- Whoever controls a member's inbox can sign in, as with Google; the notice
  to the old address and "Sign out on all devices" answer a changed email.
- Every journey test that signs in changes to the email code.
- Follow-up: change the phone number (spec 1, 3.6) with one text; passkeys
  or a password on top of the email if members ask for them.

## Revisit when

Email codes arrive late or in spam for many people, Mailjet's price or
limits change, members ask for passwords or passkeys, or the text ceilings
stop real sign-ups.
