# 0012. One price level per trip instead of per-segment price editing

- **Status:** Accepted (2026-11-13, decided by Martin while reviewing spec 3)
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** supersedes [ADR 0006](0006-meeting-points-and-segment-pricing.md);
  [pricing and seats](../product/pricing-and-seats.md),
  [spec 3](../specs/2026-11-13-post-a-trip.md), open question Q3

## Context

ADR 0006 set up the trip model: curated meeting points, a price per segment,
seats per segment, and a cost-sharing cap. It let the driver change the
price of every segment separately, between zero and the cap.

While reviewing the posting flow (spec 3), Martin chose a simpler control.
Posting a trip should take under a minute, and the app adds the meeting points
along the way automatically, so a trip can have many segments. Editing each
segment's price would slow drivers down. Most drivers would only want to
charge "a bit less" or "a bit more" than the suggestion across the whole trip,
or drive for free.

Because the suggested price and the cap are both proportional to distance,
their ratio is the same on every segment. One multiplier on the suggestion
therefore respects the cap on every segment at once.

## Options considered

1. **Per-segment editing (ADR 0006).** Most control, for example a higher price
   over a mountain pass. Slow to use on trips with many stops, and few
   drivers need it.
2. **One price level for the whole trip.** The driver chooses a percentage of
   the suggested prices, from free to the highest level the cap allows. Quick,
   easy to explain, and prices stay proportional to distance. Drivers cannot
   price one stretch differently.
3. **Platform-fixed prices.** Simplest, but drivers cannot drive for free or
   adjust for their car's costs.

## Decision

We will keep everything in ADR 0006 except how drivers set prices:

- Trips are ordered lists of curated meeting points with planned times, and
  every segment has its own price per seat and its own seat count.
- Bookings reference stop IDs and store a price snapshot per segment. The
  capacity invariant is enforced in a locking transaction and a database
  constraint. Distances come from precomputed legs
  ([ADR 0009](0009-maps-and-routing.md)).
- **New:** the driver sets one **price level** for the whole trip: a percentage
  of the suggested prices, from 0% (free) up to the highest level the
  cost-sharing cap allows. The app computes each segment's price from its
  distance, the central rate and the price level, and never above that
  segment's cap. Drivers do not edit segment prices one by one.

The formulas are in
[pricing and seats](../product/pricing-and-seats.md#rule-p4-the-drivers-price-level).
The cap formula is still to be confirmed by the legal opinion.

## Consequences

- Posting is faster, and the price screen is one control plus the
  whole-route price.
- Free rides are a first-class option.
- Prices stay proportional to distance, which is easy to explain and supports
  the cost-sharing position.
- Drivers cannot charge more for a hard stretch, such as a gravel road or a
  mountain pass. The suggested rate could later vary by road type if needed.
- Segment prices still exist in the data model, so bookings, receipts and
  partial-route prices work as before.

## Revisit when

Drivers repeatedly ask to price one stretch differently, the legal opinion
requires a different pricing rule, or drivers often need places that are not
meeting points.
