# 0023. Send sign-in codes by SMS with Vonage, 46elks as the fallback

- **Status:** Accepted (2026-11-14, by Martin: he chose this option on a
  decision card, and accepts the privacy facts below by merging the pull
  request that adds this record)
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
in Dublin and Frankfurt by default. That is storage only: processing is not
limited to the EU, and its staff and systems elsewhere can reach the data
for support, fraud checks and reporting, under its data processing
agreement. Keeping processing in the EU ("EU data centre isolation") is a
beta for managed customers. Vonage keeps the number and the text for 13
months in its message records and for 10 to 30 days in its server logs. It
can remove the text: free, one message at a time, with its Redact API
(access on request, records only, a few minutes after sending), or for a
fee with Auto-redact (Advanced removes it from the logs too, at once).
46elks could be told not to keep the text (`dontlog`). A trial account only
sends to numbers verified on it.

## Options considered

1. **Vonage, with 46elks kept as the fallback.** An account exists today. A
   mature API and an EU endpoint. Keeps the number and the text, the code
   included, for 13 months unless we redact it. The 46elks adapter stays,
   chosen by one setting.
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
- Vonage keeps each code in its message records for 13 months. A code works
  once and for ten minutes only, so a stored code cannot sign anyone in
  later, but the record still shows that the number asked ShareRide for a
  code. The privacy inventory lists it, with Vonage as a processor.
- ADR 0007 asks for data stored and processed in the EEA. Vonage stores in
  the EU, and its processing elsewhere relies on the transfer terms of its
  data processing agreement, as Render's and Sentry's do. That agreement
  must be signed before the beta.
- Our own guard against SMS pumping stays the same: the country list, the
  daily cap per country, the kill switch.
- Follow-up: ask Vonage support for the Redact API (free) and redact each
  code's text after sending, or price Auto-redact; ask about EU data centre
  isolation; check the price per message to Iceland in the account; check
  delivery and the sender name on Síminn, Nova and Vodafone.

## Revisit when

Delivery to an Icelandic network fails or is slow, the price to Iceland is
high next to 46elks, or Vonage cannot sign a data processing agreement that
covers the EEA.
