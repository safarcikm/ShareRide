# 0038. Passengers pay the driver in person until payments in the app work

- **Status:** Proposed
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Related:** supersedes [ADR 0013](0013-in-app-payments-only.md) until
  milestone 15; [ADR 0014](0014-passenger-service-fee-from-launch.md) (no
  change), [ADR 0030](0030-limit-what-a-whole-trip-brings-the-driver.md),
  [ADR 0032](0032-operator-settings-list-ranges-and-versions.md) (a new
  setting), [ADR 0035](0035-open-web-beta-reached-by-email.md),
  [pricing and seats](../product/pricing-and-seats.md#payment-and-refunds),
  [spec 13](../specs/2026-11-13-payments.md),
  [legal and regulatory](../compliance/legal-and-regulatory.md)

## Context

ADR 0013 takes every payment in the app, through a licensed provider, and
says paying outside the app is not an option. Real payments (milestone 15)
need the company, a provider contract and the legal opinion, none of which
exist yet. Until then the app has only a test payment sheet, where no money
moves, and the API refuses to use it in production. ADR 0013 left one way
out: run the beta with free rides only.

On 2026-11-22 Martin asked for a temporary way for passengers to pay in cash,
so the open beta (ADR 0035) can be public before payments in the app work.

What this touches:

- **The Taxi Act.** It has no cost-sharing exemption. ShareRide's case rests
  on the capped price (rule P3) and the trip limit (ADR 0030), and both
  still hold for the price the app shows. What is lost is proof: the only
  record of money is the booking's price, not what was paid. In 2015 the
  police called paid lifts arranged in a Facebook group ("skutlarar")
  illegal, and money passed straight to the driver looks more like that. In
  ShareRide's favour, it takes no money and no fee, which may make it harder
  to call a commercial taxi dispatch station, and there is no payment
  licence question. Untested; it goes to the lawyer.
- **Iceland pays by bank app.** Few people carry cash; a transfer from the
  bank app is the everyday way to pay a person.
- **No-shows.** With nothing paid ahead, a late cancellation or a no-show
  costs the passenger nothing but their reliability figure.

## Options considered

1. **Wait for payments in the app.** ADR 0013 as written. The public beta
   waits for the company, a provider contract and milestone 15.
2. **Free rides only.** ADR 0013's fallback. No money anywhere, but drivers
   get nothing for their costs, so few will post.
3. **Pay the driver in person, behind a switch, until milestone 15.** The
   app shows the same capped price, the passenger pays exactly that in
   person, and ShareRide handles no money. Fast; loses refunds, no-show
   cost and payment records for that time.
4. **Both ways at once, the passenger chooses.** ADR 0013 rejected this: two
   ways to pay to explain, refunds for only one. Not possible anyway until
   a real provider exists.

## Decision

We will let passengers pay the driver in person, behind an operator switch,
until payments in the app work:

1. While the switch is on, a new booking is paid to the driver in person,
   in cash or by bank transfer as the two agree, when the passenger gets in.
   They pay the price the app shows, never more. ShareRide holds no money.
2. Such a booking is confirmed when it is accepted, as a free ride is now:
   no payment window, no payment sheet.
3. Cancelling refunds nothing, as nothing was paid. A late cancellation or
   a no-show owes the driver nothing; it still counts on reliability.
4. The price cap and the trip limit stay. A cancelled or no-show booking
   paid in person counts nothing towards the trip's takings.
5. No service fee and no card fees. ADR 0014 stands: the fee starts with
   payments in the app.
6. The switch is a console setting, off by default. Each booking stores how
   it is paid, so turning the switch off never changes a booking already
   made. Milestone 15 removes the switch once card payments work.

## Consequences

- The open beta can start with paid rides now, on staging or production.
- No refunds or no-show costs through the app; reliability and the
  operator's watch list are the only answer, as ADR 0008 had.
- A driver could ask for more than the price. The terms and community
  rules forbid it, a passenger can report it, and the operator can suspend.
- Members may send bank details in the chat, which ShareRide then keeps as
  chat messages; the app suggests agreeing in person instead.
- Rules M1 to M5 apply only to bookings paid in the app. The terms,
  community rules, lawyer questions, booking, cancel and trip-day texts and
  notifications all need an in-person version; see the
  [plan](../plans/2026-11-22-pay-the-driver-in-person.md).
- A new column on bookings and a new setting (an addition to ADR 0032's
  list).

## Revisit when

- Payments in the app work (milestone 15): the switch goes, and ADR 0013
  applies again.
- The lawyer says paying in person changes the Taxi Act answer.
- No-shows or reports of drivers asking for more become common in the beta.
