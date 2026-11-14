# 0023. Send sign-in codes by SMS with Vonage, 46elks as the fallback

- **Status:** Accepted (2026-11-14, by Martin, on the decision card "Use
  Vonage for SMS, and keep 46elks as a fallback?")
- **Date:** 2026-11-14
- **Deciders:** Martin
- **Supersedes:** [ADR 0019](0019-sms-with-46elks.md)
- **Related:** [ADR 0007](0007-eea-hosting-and-data-residency.md),
  [ADR 0016](0016-own-sign-in-module.md),
  [integrations](../architecture/integrations.md),
  [privacy and GDPR](../compliance/privacy-gdpr.md)

## Context

ADR 0019 chose 46elks for sign-in codes, with Sinch as the fallback. The
46elks adapter was built and tested, but no 46elks account was opened. Martin
has opened a Vonage account instead and wants staging to send codes with it.

The needs from ADR 0019 still hold: reach Síminn, Nova and Vodafone and
foreign numbers, keep data in the EEA (ADR 0007), stay cheap at low volume,
and allow an alphanumeric sender name such as "ShareRide".

Vonage (formerly Nexmo) is a large global provider, owned by Ericsson and
run from the United States. Its SMS API has an EU endpoint
(`api-eu.vonage.com`), and SMS records (numbers and message text) are stored
in Dublin and Frankfurt by default. Its staff and systems outside the EU can
still reach that data for support and fraud checks, under its data
processing agreement. Vonage keeps the message text in its records unless
its paid Advanced Auto-redact is turned on; 46elks could be told not to keep
it (`dontlog`). A trial account only sends to numbers verified on it.

## Options considered

1. **Vonage, with 46elks kept as the fallback.** An account exists today. A
   mature API and an EU endpoint. Keeps the message text, the code included,
   unless we pay to redact it. The price to Iceland is shown only in the
   account. The 46elks adapter stays, chosen by one setting.
2. **Vonage only.** The same, with less code, but no ready fallback if
   delivery to an Icelandic network fails.
3. **46elks, as decided, with Vonage as the fallback.** All data in Sweden
   and no stored text, but it needs a second account before staging can send
   anything.

## Decision

We will send SMS through **Vonage's SMS API at its EU endpoint**, behind the
`SmsSender` port, with `SMS_PROVIDER=vonage`. The **46elks adapter stays** as
the fallback (`SMS_PROVIDER=46elks` with its keys), in place of Sinch.
Messages go as unicode, so Icelandic letters arrive intact; each sign-in text
fits one part. Before the beta we test delivery on all three Icelandic
networks, as ADR 0019 planned.

## Consequences

- Staging can send real codes as soon as the Vonage keys are in Render.
- Vonage keeps each code in its message records. A code works once and for
  ten minutes only, so a stored code cannot sign anyone in later; the privacy
  inventory lists the number and text as kept by Vonage, a processor.
- Vonage is a United States company: its data processing agreement, with
  its transfer terms, must be signed before the beta, as for Render and
  Sentry.
- Our own guard against SMS pumping stays the same: the country list, the
  daily cap per country, the kill switch.
- Follow-up: ask Vonage the price of Advanced Auto-redact; check the price
  per message to Iceland in the account; check delivery and the sender name
  on Síminn, Nova and Vodafone.

## Revisit when

Delivery to an Icelandic network fails or is slow, the price to Iceland is
high next to 46elks, or Vonage cannot sign a data processing agreement that
covers the EEA.
