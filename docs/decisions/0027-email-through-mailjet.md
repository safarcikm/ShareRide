# 0027. Send email through Mailjet

- **Status:** Accepted (2026-11-15, by Martin with the milestone 5 plan, decision 3)
- **Date:** 2026-11-16
- **Deciders:** Martin
- **Related:** [spec 7](../specs/2026-11-13-chat-and-notifications.md),
  [milestone 5 plan, 4.6](../plans/2026-11-15-milestone-5-chat-and-notifications.md#46-email),
  [ADR 0007](0007-eea-hosting-and-data-residency.md),
  [privacy providers](../compliance/privacy-gdpr.md#providers)

## Context

Spec 7 sends email when someone has no push: news about their bookings,
and a note about chat messages still unread after 15 minutes. Spec 1 adds
an email address, verified by a link. An email carries first names,
places and times, never a chat message's text (R7.9), and must not track
opens or clicks (R7.9). ADR 0007 asks that personal data stays in the EEA.

Sending email well needs a provider: a domain of ours with SPF, DKIM and
DMARC, a sender reputation, and bounces handled. The beta sends a few
hundred emails a day at most.

## Options considered

1. **Mailjet** (French, part of Sinch, Swedish). An HTTP API (Send API
   v3.1) we call with `fetch`; open and click tracking can be turned off in
   each message (`TrackOpens` and `TrackClicks` set to `disabled`); data
   stored in the EU (Google Cloud in Germany and Belgium); the free plan
   sends 6 000 emails a month, 200 a day. No idempotency key: a send whose
   answer is lost may have gone out.
2. **Scaleway Transactional Email** (French). EU data, 300 emails a month
   free, then paid per email; its tracking options were not checked.
3. **Brevo** (French). Ruled out: transactional tracking can be turned off
   only on its Enterprise plan, against R7.9.
4. **Amazon SES** in an EU region. Cheap at volume; an American company
   (Data Privacy Framework), and more to set up (AWS account, sandbox
   exit, bounce handling through SNS).

## Decision

We will send email through **Mailjet's Send API v3.1**, from the
notification worker with `fetch`, with open and click tracking off in
every message and links straight to the web app. `EMAIL_PROVIDER` chooses
`mailjet`, `dev` (the development outbox, refused in production) or `none`
(no email, for staging until there is a domain).

## Consequences

- One adapter behind the `EmailSender` port; a contract test checks it
  against Mailjet in sandbox mode, where nothing is sent.
- A send whose answer is lost is never tried again, as with push: someone
  may miss an email, but never gets it twice (R7.6).
- Martin needs a domain for ShareRide, its SPF, DKIM and DMARC records, a
  Mailjet account with the domain's sender validated, and the keys in
  Render's secret store; he signs Mailjet's data processing agreement.
  Until then staging sends no email.
- Mailjet's sub-processors for support (Atlassian, Zendesk) are American;
  **verify** whether they can see email contents before the beta.
- The free plan may add Mailjet's name to emails (**verify**); a paid plan
  removes it if it does.

## Revisit when

Volume passes the free plan, Mailjet changes where it stores data or its
tracking options, or deliverability to Icelandic mailboxes is poor.
