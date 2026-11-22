# 0035. An open beta on the web, reaching members by email

- **Status:** Accepted (2026-11-22, by Martin)
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Related:** [spec 20](../specs/2026-11-22-email-alerts-and-open-beta.md),
  [spec 12](../specs/2026-11-13-beta-access-and-feedback.md) (R12.1),
  [spec 1](../specs/2026-11-13-sign-in-and-profile.md) (decision 5),
  [spec 7](../specs/2026-11-13-chat-and-notifications.md) (3.3),
  [ADR 0032](0032-operator-settings-list-ranges-and-versions.md) (the
  `invite_code_required` default), [ADR 0027](0027-email-through-mailjet.md)

## Context

Spec 12 planned a closed beta: a waitlist, invite codes in waves per
corridor, and at most 150 testers, with the phone apps on TestFlight and
Google Play testing. The beta now starts on the web first, at
`staging.skinnar.is` and later the production domain, while the phone
apps wait for the Apple account, Firebase and the stores.

A browser gets no push. Email was optional at sign-up (spec 1, decision
5), and three notifications that a trip depends on were push only or
needed an email the member might not have given: the hour-before
reminder, a new request for the driver, and "How was your trip?", which
brings the reviews that profiles and reliability are built on. A web
member without an email would see none of them unless they opened the
app at the right moment.

On 2026-11-22 Martin asked for the beta to be open to the public with no
invite code, for these three to go by email until the phone apps can
push, and chose on a decision card that web accounts give an email at
sign-up.

## Options considered

1. **Keep the closed beta and email optional.** As specified. Needs the
   waitlist, personal codes and waves to be built and run by one person,
   and leaves web members without an email unreachable.
2. **Open the beta; email stays optional.** Anyone joins. The finish
   screens keep asking for an email, but whoever skips it hears nothing
   outside the app, and a driver's requests can expire unanswered.
3. **Open the beta; the web asks for an email at sign-up; these
   notifications fall back to email.** Every web member can be reached.
   One more field at sign-up on the web, and more email to send.

## Decision

We will open the beta to everyone: the setting `invite_code_required` is
off by default (this replaces its default in ADR 0032; its range and the
switch stay), and the waitlist and emailed personal codes are dropped.

We will reach web members by email: sign-up on the web asks for an email
when the account has no verified one (Google and Apple bring theirs), and
the hour-before reminder and "How was your trip?" go by email when the
person has no device with push, as a new request already does. A link in
an email opened before signing in opens its screen once signing in is
done. Details are in spec 20.

## Consequences

- Anyone can join, with no waitlist or waves to run. `signups_open` stays
  the emergency stop, and the invite switch can close sign-ups to invited
  people again.
- The tester cap (`beta_max_testers`) applies only with the switch on, so
  the beta has no upper size. The weekly figures and exit criteria (spec
  10) still measure it.
- Every web member has an email to confirm, so more email goes out: about
  two to four more per booking. Mailjet's free plan sends 200 a day and
  6 000 a month (ADR 0027); its dashboard shows the count, and a paid plan
  is a cost decision for Martin.
- Feedback retention counted from the switch being turned off. Off by
  default is not a change, so feedback is kept until a launch moment is
  chosen at public launch.
- Phone app members keep email optional and get push; when they have push
  the new emails do not go.
- Follow-up: spec 12's waitlist is no longer built (milestone 12); the
  roadmap's Phase 3 is an open beta.

## Revisit when

- Sign-ups bring abuse or more people than one operator can look after:
  turn the invite switch on, or `signups_open` off.
- The phone apps can push, and web push is worth adding: the email
  fallbacks then reach fewer people, and asking the web for an email may
  no longer be needed.
- Email volume nears 200 a day, Mailjet's free limit.
