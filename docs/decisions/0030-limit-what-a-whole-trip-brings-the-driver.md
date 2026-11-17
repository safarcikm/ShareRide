# 0030. Limit what a whole trip brings the driver, counting money already booked

- **Status:** Accepted (2026-11-17, decided by Martin; he chose to keep the
  driver's own share on a decision card the same day)
- **Date:** 2026-11-17
- **Deciders:** Martin
- **Related:** [spec 17](../specs/2026-11-17-trip-earnings-limit.md) (the
  analysis, numbers and proposed rules), rules P3 and P4 in
  [pricing and seats](../product/pricing-and-seats.md),
  [ADR 0012](0012-trip-price-level.md), [ADR 0013](0013-in-app-payments-only.md),
  [ADR 0014](0014-passenger-service-fee-from-launch.md), open questions A48
  (Q25) and A39, [legal and regulatory](../compliance/legal-and-regulatory.md)

## Context

Iceland's Taxi Act No. 120/2022 has no exemption for cost sharing. ShareRide's
case for being carpooling rests on drivers receiving no more than the cost of
a trip they make anyway. Rule P3 caps each stretch's price per seat at
distance × 150 kr (the state mileage allowance, akstursgjald) ÷ (seats + 1),
so a full car pays at most seats ÷ (seats + 1) of the cost and the driver
keeps a share.

The cap is checked one booking at a time, at the price level of that moment.
Bookings keep their price, seats can be added after people have booked, and a
driver keeps the money after a no-show or late cancellation while the seat
becomes free to sell again. Spec 17 shows, with the pricing code on `main`,
that a trip can then bring its driver more than the cost: 108% of 150 kr per
km with 3 seats added one at a time (181% up to 8 seats), or 116% after two
no-shows are resold. Short stretches round up too (A39, with the lawyer).

Martin asked on 2026-11-17 for the overall gain from one ride to stay within
the state rate per km.

## Options considered

1. **Keep today's cap per seat.** Nothing to build; the gaps stay open.
2. **Freeze the seats once someone books, and keep paid-for seats taken.**
   Simple and closes both gaps, but drivers lose flexibility and seats left
   by no-shows ride empty.
3. **A trip limit that counts money already booked.** Normal trips are
   unchanged; after a gap the seats left cost less. Medium work, all in the
   domain package and the booking transaction.
4. **Split the cost after the trip, with refunds as the car fills.** The
   truest cost sharing, but passengers don't know their price, part-route
   splits are complex, and partial refunds cost card fees.
5. **Refund anything over the limit at payout.** Catches everything after
   the fact, but payouts and prices become uncertain, and a credit balance
   would mean holding stored money.
6. **Let a full car cover the whole 150 kr per km** (stop counting the
   driver). A third more per seat with 3 seats, but passengers would pay the
   driver's whole car, which reads as earning.

## Decision

We will give every trip a limit, what a full car pays at the caps (the sum
over stretches of seats × cap), and count against it the price of every
booking whose money goes or went to the driver, including money kept after a
no-show or a late cancellation, but not the passenger service fee. The
highest price level for the seats still free is the one that keeps a full car
inside the limit. The booking transaction checks the limit, and the payout
job holds any trip found over it. The driver stays one of the people sharing
the cost.

## Consequences

- On a normal trip nothing changes for drivers or passengers.
- Every trip has one number that shows it is cost sharing, for the lawyer,
  Samgöngustofa, the police or Skatturinn.
- After seats are added or a no-show, the seats left can cost less, down to
  free; the price screens must say why.
- The domain gains `tripLimit` and `takings`; `highestPriceLevel` and
  `fitPriceLevel` need the trip's bookings; the payout job gains a check.
- If the lawyer says the fee counts as part of the ride's price, the limit
  can include it with one setting, lowering drivers' highest level.
- Follow-up: rules P3, P4 and M3 and specs 3, 6 and 13 updated on
  acceptance; the build follows the
  [implementation plan](../plans/2026-11-17-trip-earnings-limit.md); two new
  questions for the lawyer (section 8 of spec 17).

## Revisit when

- The legal opinion sets a different rate, measure of cost or rounding.
- The lawyer says the service fee or kept money must count differently.
- Drivers often see the level fall after adding seats and find it confusing.
