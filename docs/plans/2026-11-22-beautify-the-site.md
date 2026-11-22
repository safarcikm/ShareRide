# Beautify the site implementation plan

**Owner:** Martin · **Date:** 2026-11-22 · **Status:** In progress

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** after a review of every main screen on a phone and a laptop, in
light and dark mode, the site looks finished: a car that stands out, a
front page whose top has its own colour, the main search button on the
first screen of a phone, and a few empty screens filled.

**Why:** Martin, 2026-11-22: "the puffins in the car are same as
background, I'm wondering if the selected area shouldn't be darker? … can
you go over the whole site again and see if we can beautify it completely,
make some suggestions, also shouldn't we select the amount of seats before
we set the price?" and, for the launch ads, "make the car looking more
appealing, maybe something like a VW Beetle".

**Design:** [spec 15](../specs/2026-11-13-visual-design-system.md)
(section 4.2 and 5.3, decision 14), [spec 3](../specs/2026-11-13-post-a-trip.md)
(the order of the steps), [spec 16](../specs/2026-11-15-one-home-and-simpler-flows.md)
and [spec 18](../specs/2026-11-18-laptop-layout.md). No business rule
changes: the seats and price rules (P3, P4, S1 to S5) stay as they are; only
the order the driver answers them in changes. The boards Martin chose from
are in the project files (`beautify/`).

## PR 1: the puffins' car (#226)

- [x] Test first (`components/puffin-scenes.test.tsx`): the car is
  `puffinCar.body` with `wing` and `glass`; the puffins are cut by their
  car's own window outline (two cars, two outlines); in dark mode the tyres
  lift to `puffin.nightBlack` and the puffins behind the glass keep basalt.
- [x] `packages/ui/src/tokens.ts`: `puffinCar` colours.
- [x] `PuffinsInCar`: the round car with a domed roof, wings, a step, a
  round headlight and a case on a roof rack; the puffins through the side
  windows. Same props and sizes, so the front page and the booked screen
  need no change.
- [x] Spec 15: section 4.2 (colours and picture), the `PuffinsInCar` row of
  section 5.3, decision 14.
- [x] The drawing is shared with the launch ads
  (`puffinride-look/car/` in the project files).

## PR 2: seats before price

- [x] Test first (`__tests__/post-a-trip.test.tsx`): step 3 is "Seats and
  booking", step 4 the price; the price step quotes the seats chosen; a
  draft's level above the highest for more seats is lowered quietly on the
  first pass, and with the notice when the seats change from the review.
- [x] `trips/steps.ts`: `route`, `time`, `seats`, `price`, `review`; the
  steps' next buttons ("Choose seats", "Set your price", "Review your
  trip") and `TripSoFar` follow the new order.
- [x] Spec 3 (amendment, 3.6 item 4, screens list), spec 15 (5.4 and
  `TripSoFar`), spec 18 (3.13 item 3). The journeys
  (`e2e/post-a-trip.spec.ts`, `laptop.spec.ts`, `post-again.spec.ts`,
  `support/trips.ts`) follow the new order.

## PR 3: the phone's search in one card

- [x] On a phone, the date, the seats and Find a ride sit in the From and To
  card, so the main button is on the first screen of an iPhone 13.
- [x] The date and the seats on one line (Martin asked): the date as the
  laptop's field, the seats' value closer between its buttons, and
  "Allir dagar" for "Any day" in Icelandic, which fits where "Hvaða dag sem
  er" took three lines.

## PR 4: the front page's top (Martin's pick)

- [ ] As chosen on the decision card: A, a moss panel behind the logo, the
  car and the title with the search card on its edge (on a laptop, a rounded
  panel as wide as the page); B, an Iceland scene; or C, nothing more.

## PR 5: empty screens

- [ ] Profile signed out: a welcome card with the puffin by a pin, what an
  account is for, and Sign in; the links as rows.
- [ ] Offer a ride, step 1: fill the gap under From and To.
