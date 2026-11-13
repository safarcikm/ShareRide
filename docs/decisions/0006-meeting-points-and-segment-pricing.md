# 0006. Meeting-point network with per-segment prices and seats

- **Status:** Accepted (2026-11-13: app suggests a cost-based segment price,
  driver adjusts up to a cap; the cap formula is confirmed by the legal opinion)
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [pricing and seats](../product/pricing-and-seats.md),
  [meeting points](../product/meeting-points.md), open questions Q3 and Q4

## Context

Martin's product idea: drivers build routes from strategically placed meeting
points, prices are set per route segment, and passengers book empty seats. We
must decide how routes, prices and seats are modelled, because this shapes the
database, search, the app and the legal position.

## Options considered

Route model

1. **Free addresses for pickup and drop-off.** Flexible, but unsafe meeting
   spots, unpredictable detours, hard matching, and closer to a taxi service.
2. **Curated meeting points; trips are ordered lists of them.** Safe, simple,
   reliably searchable, supports partial routes.

Pricing model

1. **One price for the whole trip**, pro-rated by distance for partial rides.
   Simple, but drivers cannot express that some stretches cost more (mountain
   passes, gravel).
2. **Price per segment between consecutive stops**, with a suggested
   cost-based price and a cap.
3. **Platform-fixed prices** with no driver input. Simplest and legally safest,
   but drivers lose all control.

Seat model

1. **Seats per trip** (a seat is taken for the whole trip). Simple, but wastes
   capacity on partial routes.
2. **Seats per segment** (a seat can carry different passengers on different
   stretches).

## Decision

- Trips are **ordered lists of curated meeting points** with planned times.
- Each **segment** has its own price per seat. The app suggests a price from
  distance and a central rate; the driver may set any price from zero up to a
  **cost-sharing cap** (formula in
  [pricing and seats](../product/pricing-and-seats.md#rule-p3-price-limits-cost-sharing-cap),
  confirmed by the legal opinion).
- **Seats are tracked per segment.** A booking holds seats on every segment
  from its boarding stop to its alighting stop.
- Bookings reference **stop IDs**, not positions, and store a **price
  snapshot** per segment.
- The capacity invariant is enforced in a transaction that locks the trip row,
  and backed by a database constraint on per-segment occupancy.
- Distances between meeting points are **precomputed legs**
  ([ADR 0009](0009-maps-and-routing.md)).

## Consequences

- Partial-route bookings make more seats useful and more trips match searches.
- The rules are more complex than per-trip seats, so the domain package needs
  thorough unit and property-based tests (see
  [testing strategy](../engineering/testing-strategy.md)).
- The operator must curate and maintain meeting points.
- The price cap keeps the model on the cost-sharing side; its exact formula is
  a legal question tracked in the open questions.

## Revisit when

Drivers repeatedly need places that are not meeting points (consider faster
suggestion approval), or the legal opinion requires a different pricing rule.
