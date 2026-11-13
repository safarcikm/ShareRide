# 0014. A passenger service fee from public launch

- **Status:** Accepted (2026-11-13, decided by Martin answering open question Q5)
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [ADR 0013](0013-in-app-payments-only.md),
  [pricing and seats](../product/pricing-and-seats.md#rule-p5-service-fee),
  [spec 13](../specs/2026-11-13-payments.md), open question Q5

## Context

ShareRide takes all payments in the app (ADR 0013). In the beta it charges
no fee and pays the card fees itself. After the beta it needs income to cover
card fees, hosting, SMS and the operator's time. The model must keep the
service a cost-sharing platform, not a taxi service: drivers must not earn
more than their costs (rule P3), and the legal opinion is still pending.

## Options considered

1. **Passenger service fee per booking.** Shown separately on top of the
   ride price. Drivers keep the whole contribution, so the price cap is not
   affected. Passengers see a higher total.
2. **Driver commission.** Taken from the driver's payout. Hidden from
   passengers, but it reduces the cost share drivers receive and makes the
   cap harder to explain.
3. **Subscription.** Predictable income, but a barrier for occasional
   travellers and visitors, who are a large part of the market.
4. **Free.** Simplest, but not sustainable once the beta ends.

## Decision

We will add a small passenger service fee per booking from public launch,
shown separately from the ride price, and refunded together with the price
when the booking is refunded in full. The beta has no fee. The amount is
decided before launch from beta data (booking values, card costs and running
costs) and recorded in rule P5.

## Consequences

- Drivers keep their whole contribution; rule P3 stays about the ride price
  only.
- The booking, receipt and refund flows must show and handle the fee as its
  own line from launch (specs 5 and 13); the beta builds can leave it at zero.
- VAT on the fee, and how it appears on receipts, go to the accountant and
  the lawyer before launch.
- The fee amount is a setting with a range (spec 10), so it can be tuned.

## Revisit when

- The legal opinion says a fee changes how the service is classified.
- Beta data shows the fee would push common routes above bus fares.
- Card or running costs change enough to need a different model.
