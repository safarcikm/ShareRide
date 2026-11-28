# 0054. Estimate the CO2 a shared ride saves as one car not driven

- **Status:** Proposed
- **Date:** 2026-11-28
- **Deciders:** Martin
- **Related:** [spec 34](../specs/2026-11-28-co2-saved.md);
  [ways to make money, 2.14](../strategy/2026-11-27-ways-to-make-money.md#214-co2-count-it-do-not-sell-it);
  [ADR 0031](0031-distances-from-our-own-road-file.md) (the distances);
  [ADR 0032](0032-operator-settings-list-ranges-and-versions.md) (adding a setting needs an ADR)

## Context

Martin wants a small, informative line on how much CO2 shared rides save,
with a record for passengers and drivers. The money report (2.14) found
that the figures can later help employers' and municipalities' climate
accounts and grant applications, but must never be sold as carbon credits,
and that green claims need care: say "estimated", show the method, never
say "carbon neutral". Iceland's Marketing Act (44/2026) bans misleading
claims and makes a trader prove a factual claim (art. 12); the EU's
Directive 2024/825 bans vague green claims from 27 September 2026 (whether
it applies in Iceland yet is not checked).

What we have: the road distance of every stretch of a trip, from our own
road file (ADR 0031), and which bookings were completed (spec 8, R8.2).
What we do not have: how a passenger would have travelled otherwise, or
what fuel a car uses. The Environment and Energy Agency of Iceland
publishes CO2 factors per car kilometre (2022 edition: petrol 208 g,
diesel 191 g, full hybrid 136 g, electric about 0), and Reykjavík's 2025
inventory says about 17% of car kilometres are driven on electricity and
up to 43% with hybrids and plug-ins counted.

## Options considered

1. **One car per seat, compared with driving alone.** Simple; but two
   people booking together would have shared one car, so it overstates.
2. **One car per booking, compared with driving alone,** at the CO2 of an
   average car in Iceland. Simple, needs no new question, and honest when
   every text says "compared with driving alone". Still an upper estimate:
   a passenger who would have taken the bus saves less.
3. **Ask each passenger after the ride how they would have travelled,**
   and count only those who would have driven. The most defensible for
   grants; but one more question after every ride, more personal data,
   fewer answers than rides, and per-person figures that jump about.
4. **Ask drivers what fuel their car uses** and use that car's factor. The
   wrong comparison: the driver drives anyway; what is saved is the
   passenger's own car, whose fuel we do not know.

## Decision

We will count **one car not driven per completed booking** (option 2):
the road distance of the passenger's part times an operator setting,
`co2_grams_per_car_km`, starting at **150 g** (the agency's factors
weighted by the share of kilometres on each fuel; spec 34, 3.3).

- The setting is in its own group, from 0 to 300 g in steps of 1, with
  versions like every setting. 0 hides every figure.
- A booking keeps the grams counted when it completed, as a published trip
  keeps its price settings (R10.3). A booking that stops being completed
  stops counting.
- A member's figures are theirs alone; PuffinRide's own totals count each
  booking once. Carbon credits are not part of this.
- Every text says "estimated" (or "about") and "compared with driving
  alone", and links to the method on About.

## Consequences

- Small to build: no new service, dependency, question or personal data;
  one column on bookings, one small table for totals carried past the
  3-year anonymisation, one setting, two weekly figures.
- The figures are upper estimates. Grant or employer reports must say so,
  or wait for option 3.
- The factor needs a yearly look (each autumn, after the agency's and
  Reykjavík's figures), and the About text with it.

## Revisit when

- An employer, municipality or grant asks for an adjusted figure: add the
  question of option 3 in its own spec.
- The agency publishes new factors, or electric cars' share of kilometres
  changes the weighted factor by more than 10 g.
- Directive 2024/825 or a ruling under the Marketing Act asks for more
  than this.
