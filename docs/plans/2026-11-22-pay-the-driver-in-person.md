# Paying the driver in person Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While the operator's switch is on, passengers book paid rides and
pay the driver in person, the price the app shows, with no payment step,
so the open beta can be public before payments in the app (milestone 15).

**Architecture:** Every booking stores how it is paid, `in_app` or
`in_person`, chosen from the `pay_in_person` setting when it is made. The
domain treats an in-person booking as a free ride is treated for money
(confirmed on acceptance, nothing to refund) while keeping its price for
showing and for the trip limit. The app reads the switch from `/v1/config`
for trips not yet booked, and each booking's own method after that.

**Tech Stack:** TypeScript domain package (Vitest), Hono and Drizzle (API),
Expo Router and React Native (app), Jest with RNTL 14, Playwright journeys
on the web.

**Rules:** rule M6 in [pricing and seats](../product/pricing-and-seats.md),
[ADR 0038](../decisions/0038-pay-the-driver-in-person-until-card-payments.md);
the draft terms 6.9, 7.6 and 8.2. Accepted by Martin on 2026-11-22, who
asked for the payment step to say that card payments are coming soon and to
pay the driver in cash or by bank transfer, and for the build to stay lean.

## Global Constraints

- No money moves and no payment row is made for an in-person booking:
  `oweRefund` and the payment service never see one.
- A booking's method never changes after it is made, whatever the switch
  does later.
- Prices, caps and the trip limit are computed exactly as now; only the
  takings of a cancelled or no-show in-person booking change (to 0).
- Every new text in `en.ts` and `is.ts`; tokens only on screens.
- The test payment sheet keeps working on local and staging with the
  switch off, so every journey that pays today still passes unchanged.
- Migration `0058` (check `packages/db/migrations` first: other threads
  add migrations too). Backward compatible: a default of `in_app`.

## Review Focus

1. A booking accepted under `in_app` and still waiting for payment when
   the switch turns on keeps its payment sheet and deadline.
2. Cancelling an in-person booking, by either side, by the operator, by a
   suspension, by an account deletion or with the whole trip, owes no
   refund and calls no provider.
3. A driver absence that stands on an in-person booking refunds nothing.
4. The trip limit counts an in-person booking while it holds seats or
   completes, and stops counting it once it is cancelled or a no-show.
5. Notifications, SMS and emails for an in-person booking never mention
   paying in the app or a refund.

---

## PR 1: the rule, from the domain to the API

Nothing changes for anyone until the operator turns the switch on, and the
texts come in PR 2, so the switch stays off on every server until then.

- [ ] **Domain, payment methods.** `paymentMethods = ["in_app",
      "in_person"]` in `packages/domain/src/bookings/lifecycle.ts`;
      `statusOnAcceptance(total, method)` confirms an in-person booking at
      once. `checkBooking` (`check.ts`) takes the method. Tests first in
      `lifecycle.test.ts` and `check.test.ts`.
- [ ] **Domain, cancelling.** `BookingToCancel` gains `paymentMethod`;
      `cancellationTerms` gives an in-person booking a refund of 0 in every
      case and the same `countsOnReliability` as today. The driver-absence
      refund (`disputes.ts`) is 0 for it too. Tests first.
- [ ] **Domain, takings.** `TakingsBooking` gains `paymentMethod`;
      `takingsOf` counts nothing for an in-person booking that is cancelled
      or `no_show`. Property test: an in-person trip never has more
      takings than the same trip paid in the app.
- [ ] **Setting.** `pay_in_person` in
      `packages/domain/src/settings/catalogue.ts`: group `booking`, a
      switch, default 0 (off), the console's name and help in both
      languages. The list is ADR 0032's; ADR 0038 adds it.
- [ ] **Database.** Migration 0058: `bookings.payment_method text not null
      default 'in_app'` with a check on the two values;
      `pnpm --filter @shareride/db generate`.
- [ ] **API, booking.** The booking and request routes read the switch
      inside the booking transaction, as `bookings_open` is read, and store
      the method. `accept` passes it to `statusOnAcceptance`. Every
      cancellation path (`bookings/service.ts`, `bookings/cancel-trip.ts`,
      `trips/changes.ts`, `trip-day/outcome.ts`, suspension and account
      deletion) passes the booking's method to the domain, so no refund is
      owed. Integration tests: book instant and request with the switch
      on; flip the switch while a booking waits for payment.
- [ ] **API, what clients see.** `bookingSchema` in
      `packages/contracts/src/bookings.ts` gains `payment: "in_app" |
      "in_person"`; `/v1/config` gains `payInPerson`. The notification
      worker's `paid` flag is false for an in-person booking, so the
      existing "unpaid" SMS and texts are used. Download my data shows how
      each booking is paid.

## PR 2: what passengers, drivers and the operator see

- [ ] **Trip page and booking screen.** While `payInPerson` is on: "Pay
      {driver} {total} in person when you get in: cash or a bank transfer"
      instead of "You pay when {driver} says yes", and the cancellation
      line says there is nothing to pay if you cancel. No payment sheet.
- [ ] **My rides and a booking's page.** An in-person booking shows the
      price to pay the driver, never "Waiting for payment" or a refund. The
      cancel sheets of both sides say nothing is refunded and nothing is
      owed, and whether it counts on reliability.
- [ ] **The driver's side.** The trip's bookings say "Pays you {total} in
      person"; the no-show and dispute texts drop "no refund" and "the
      driver is paid" for in-person bookings.
- [ ] **Chat and reports.** The chat's safety tip and the report category
      "Scam, or payment outside the app" become "asked for more than the
      price" while the switch is on; the community rule follows the terms.
- [ ] **Notifications.** Booking confirmed (push, email) says how much to
      pay the driver in person; cancellations use the "unpaid" variants.
- [ ] **Console.** The switch on the Settings page, with its help text;
      a booking's method on the console's booking view.
- [ ] **Journey.** A web journey books an in-person ride with the switch
      on and cancels it; the existing paying journeys keep the switch off.
- [ ] **Docs.** Roadmap tick, CHANGELOG, the staging runbook's "Turn on
      paying in person", and spec 5 and spec 6 notes where they say "pay".

Martin's steps after PR 2: turn the switch on in the staging console
(Settings, Booking), then book a ride on the web to see it.
