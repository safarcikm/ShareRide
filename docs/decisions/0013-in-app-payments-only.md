# 0013. All payments through the app, from the beta

- **Status:** Accepted (2026-11-13, decided by Martin while reviewing spec 5);
  the payment provider is chosen in a later ADR
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** supersedes [ADR 0008](0008-payments-phased.md);
  [pricing and seats](../product/pricing-and-seats.md#payment-and-refunds),
  [legal and regulatory](../compliance/legal-and-regulatory.md#5-payments),
  [integrations](../architecture/integrations.md), open questions Q2 and Q5

## Context

ADR 0008 kept money out of the beta: the app showed the price and passengers
paid drivers directly. Martin decided instead that payment happens only
through the app, from the start. Reasons: one clear way to pay, no cash
discussions between strangers, fewer no-shows, refunds the app can guarantee,
and a business that can charge a fee later.

The constraints found for ADR 0008 still apply (checked 2026-11-13):

- Stripe's supported countries and Adyen's platform product do not list
  Iceland, so an Icelandic company cannot simply use Stripe Connect.
- Icelandic acquirers (Rapyd, Teya, Straumur) must confirm that they support
  marketplace payments, refunds and payouts to private individuals.
- Collecting passengers' money and passing it to drivers can be a regulated
  payment service unless a licensed provider holds the funds or an exemption
  applies. In-app payment may also affect how the Taxi Act views the service.
  Both need the legal opinion.

## Options considered

1. **Pay the driver directly in the beta, in-app later (ADR 0008).** Fastest
   start; no money control, no refunds, cash between strangers.
2. **In-app payments only, from the beta.** One payment path, guaranteed
   refunds, fewer no-shows. The beta now waits for a company, a provider
   contract, the legal opinion and the integration.
3. **Both: in-app or direct, the passenger chooses.** Flexible, but two
   payment paths to explain, and refunds only work for one of them.

## Decision

We will take payments only through the app, from the first beta:

- When a booking is accepted (at once for instant booking, or when the driver
  accepts a request), the passenger confirms and pays in the app within a short
  window. Paid bookings are confirmed; unpaid ones lapse and free their seats.
- Free rides (price 0) skip the payment step.
- A passenger who cancels up to 15 minutes before their boarding time gets a
  full refund. When the driver cancels, or the trip is cancelled, passengers
  always get a full refund.
- A licensed payment provider holds the funds and pays drivers out. Card data
  never touches our servers. The domain keeps its `PaymentProvider` port, so
  the provider can change.
- The provider and legal structure (Rapyd, Teya, Straumur, or an EEA entity
  using Stripe or Adyen) are chosen in a separate ADR after provider talks and
  the legal opinion.

The rules are in
[pricing and seats](../product/pricing-and-seats.md#payment-and-refunds).

## Consequences

- Passengers and drivers have one simple, trusted way to pay; refunds are
  automatic.
- The beta now depends on: a registered company, a signed provider contract,
  the legal opinion on payments and the Taxi Act, and the payments integration.
  The legal and company track becomes part of the critical path.
- Drivers must set up payouts with the provider, which checks their identity
  and bank account (the provider holds that data, not us).
- Card fees, refunds, receipts, chargebacks, VAT on any service fee and
  reporting of payments to drivers must be handled from the beta.
- If no provider or legal structure is ready in time, Martin decides then
  whether to delay the beta or run it with free rides only. Paying outside the
  app is not an option.

## Revisit when

The provider talks or the legal opinion rule out in-app payments for an
Icelandic company, or beta data shows the payment step stops people booking.
