# 0032. Operator settings: the list, their ranges, and versions on trips and bookings

- **Status:** Accepted (2026-11-18); the default of `invite_code_required` superseded by [ADR 0035](0035-open-web-beta-reached-by-email.md)
- **Date:** 2026-11-18
- **Deciders:** Martin
- **Related:** [spec 10](../specs/2026-11-13-operator-settings-and-metrics.md)
  (3.2 to 3.3, rules R10.1 to R10.5),
  [spec 12](../specs/2026-11-13-beta-access-and-feedback.md) (R12.1, R12.3),
  [pricing and seats](../product/pricing-and-seats.md#configuration-values),
  [milestone 11 plan](../plans/2026-11-18-milestone-11-beta-gate-feedback-and-settings.md),
  [ADR 0012](0012-trip-price-level.md),
  [ADR 0030](0030-limit-what-a-whole-trip-brings-the-driver.md)

## Context

Spec 10 lets the operator change the rules' numbers without a release. It
says every setting has a default, a unit and an allowed range (R10.1), that
trips and bookings keep the settings version they were made under (R10.3),
and that changing a range or adding a setting is a rule change that needs
an ADR (R10.4). It does not say which numbers are settings, what their
ranges are, or which rule reads which version. Today every number is a
constant in the domain package: 18 named in pricing and seats, and about
25 more in later specs (chat, reminders, reviews, safety).

A range is a safety rail for one person changing live rules alone. Two
values also carry the legal case for cost sharing: the reference cost per
km is the state mileage allowance, and the cap built on it must never be
raised by a slip of the hand.

## Options considered

1. **Every number of every spec is a setting.** Nothing ever needs a
   release. But each needs a range, an effect text, tests, and a rule that
   reads the right version; most would never be changed.
2. **The numbers pricing and seats names, plus the beta's own.** The ones
   the specs call the operator's. Others join by an ADR when needed.
3. **No settings page: change a constant and release.** Least to build,
   but a release takes a review and store builds, and leaves no reason or
   history beside the number.

For versions: (a) a version number on each trip and booking, looked up in
the history; (b) copy every value onto each row; (c) one current set for
everything. (b) widens two busy tables for numbers that rarely change.
(c) would change the refund rule of a booking already paid for.

## Decision

We will make the values below operator settings, each a whole number with
this default and range, and no others. A value outside its range, or off
its step, is refused.

| Setting | Default | Range | Group |
| ------- | ------- | ----- | ----- |
| `invite_code_required` | on | on or off | Beta |
| `beta_max_testers` | 150 people | 0 to 1 000 | Beta |
| `signups_open`, `trips_open`, `bookings_open`, `sms_sending`, `email_sending`, `push_sending` | on | on or off | Switches |
| `suggested_rate` | 15 kr per km | 5 to 30 | Prices |
| `reference_cost_per_km` | 150 kr per km | 50 to 150 | Prices |
| `price_step` | 100 kr | 50 to 500, in steps of 50 | Prices |
| `price_level_step` | 10% | 5 to 25, in steps of 5 | Prices |
| `max_capacity` | 8 seats | 1 to 8 | Prices |
| `booking_cutoff` | 15 minutes | 0 to 120 | Booking and paying |
| `request_expiry` | 12 hours | 1 to 48 | Booking and paying |
| `payment_window` | 30 minutes | 10 to 120 | Booking and paying |
| `free_cancellation_until` | 15 minutes | 0 to 120 | Changes and cancellations |
| `major_time_change` | 30 minutes | 10 to 120 | Changes and cancellations |
| `max_time_change` | 120 minutes | 30 to 360 | Changes and cancellations |
| `reliability_cancellation_window` | 24 hours | 0 to 72 | Changes and cancellations |
| `no_show_wait` | 10 minutes | 5 to 30 | Trip day and reliability |
| `trip_completion_delay` | 2 hours | 1 to 12 | Trip day and reliability |
| `reliability_period` | 12 months | 3 to 24 | Trip day and reliability |
| `reliability_min_count` | 5 | 1 to 20 | Trip day and reliability |
| `reliability_watch_level` | 80% | 50 to 95 | Trip day and reliability |

`payout_delay` (24 hours, 0 to 72) joins the list with payouts in
milestone 15. The top of `reference_cost_per_km` is the state mileage
allowance: raising it when the allowance changes needs a new ADR. One
check goes across values: `suggested_rate` × (`max_capacity` + 1) must not
be more than `reference_cost_per_km`, so the suggested price always fits
under the cap of the largest car.

Every change makes a new settings version; version 0 is the defaults.

- A trip records the version when it is published. Later price work on it
  (the price level, seats, stops) uses that version's four price values.
- A booking records the version when it is made. Its cancellation rules
  (`free_cancellation_until`, `major_time_change`,
  `reliability_cancellation_window`) use that version. Its deadlines are
  stored when it is made and do not move.
- Everything else reads the current values: who can book until when, how
  far a departure can move, the trip day's waits, reliability, the seat
  limit and the beta's own settings.

## Consequences

- The operator tunes prices, deadlines and the beta from the console, with
  a reason and a history, and can pause sign-ups, trips, bookings and each
  way of sending.
- Nobody's deal changes after the fact: a paid booking keeps its refund
  rule and a published trip its prices.
- Rules about one trip or booking must load its version: more to pass
  around in the API, covered by tests per group (plan, PRs 11 to 13).
- Numbers outside the list still need a release. Adding one is a new ADR.
- Spec 10's 3.2.1 is narrowed to this list.

## Revisit when

The state mileage allowance changes; the legal opinion sets a different cap
or rate; the beta shows a number outside the list that needs tuning more
than once; or a range turns out too narrow for a real need.
