# 0008. Phased payments behind a provider-agnostic port

- **Status:** Accepted (2026-11-13: pay the driver directly during the beta;
  the service fee itself stays open as question Q5)
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [legal and regulatory](../compliance/legal-and-regulatory.md),
  [integrations](../architecture/integrations.md), open questions Q2 and Q5

## Context

Passengers pay drivers for a share of the trip cost. In-app payment brings
trust, fewer no-shows and a way to charge a service fee. It also brings hard
questions:

- **Provider availability.** Stripe's list of supported countries does not
  include Iceland, and Adyen's platform (marketplace) product does not list
  Iceland either (checked 2026-11-13). An Icelandic company cannot simply use
  Stripe Connect.
- **Local options.** Icelandic acquirers include Rapyd (formerly Valitor),
  Teya (formerly SaltPay and Borgun) and Straumur (which partners with Adyen).
  Their support for marketplace splits and payouts to private individuals must
  be confirmed.
- **Licensing.** Collecting money from passengers and passing it to drivers
  can count as a payment service under the payment services rules that apply
  in Iceland through the EEA, unless a licensed provider holds the funds or an
  exemption (such as the commercial agent exclusion) applies. This needs legal
  advice.
- **Tax and receipts.** Fees, VAT on the platform's service fee and reporting
  of driver income must be handled correctly.

## Options considered

1. **In-app payments from the first beta.** Most complete experience; delays
   the beta by the provider, legal and integration work.
2. **No in-app payments in the beta, in-app later.** The app shows the price;
   the passenger pays the driver directly (bank app transfer or cash). Fastest
   path to learning whether people use the service.
3. **Register the platform company outside Iceland** (for example in another
   EEA country) to use Stripe Connect or Adyen. Possible, but adds company,
   tax and compliance overhead for one operator.

## Decision

- **Beta (Phase 3):** no money moves through the app. Prices are shown;
  payment happens directly between passenger and driver. The service is free.
- **Phase 5:** introduce in-app payments with payouts to drivers and a
  passenger service fee, through a licensed provider that supports Icelandic
  marketplaces. Choosing the provider (Rapyd, Teya, Straumur, or option 3) and
  the legal structure is a Phase 4 to 5 task with its own ADR.
- The domain model and the API include a `payments` module and a
  `PaymentProvider` port from the start, so adding payments is an adapter and
  some screens, not a rewrite.

## Consequences

- The beta can start as soon as the core features work.
- Without payments, no-shows have no financial cost; we rely on reliability
  scores and reviews, and measure the problem in the beta.
- No revenue until Phase 5.
- Card data never touches our servers in any phase; the provider's hosted
  fields or SDKs handle it, keeping us out of most PCI DSS scope.

## Revisit when

A provider confirms marketplace support for Icelandic platforms and
individuals, or beta data shows no-shows are a serious problem.
