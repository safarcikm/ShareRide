# Trip limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A trip never brings its driver more than a full car pays at the
price caps, whatever happens after people book: seats added, no-shows, late
cancellations, stops added.

**Architecture:** A new domain module works out the trip limit, the
takings and the highest price level that still fits; booking, trip changes
and the edit screens call it instead of the seat-only `highestPriceLevel`.
The API reads the takings from the bookings it already stores (total price
less refund) and the limit from the segments' stored caps, so there is no
migration. A no-show or a late cancellation refits the level in the same
transaction.

**Tech Stack:** TypeScript domain package (Vitest, fast-check), Hono and
Drizzle (API), Expo Router and React Native (app), Jest with RNTL 14.

**Spec:** [spec 17](../specs/2026-11-17-trip-earnings-limit.md), rules P3,
P4 and M3 in [pricing and seats](../product/pricing-and-seats.md),
[ADR 0030](../decisions/0030-limit-what-a-whole-trip-brings-the-driver.md).
Accepted by Martin on 2026-11-17.

## Global Constraints

- Money is whole krónur in integers; no floating point anywhere in the rule
  (follow `toNearestStep` in `packages/domain/src/trips/prices.ts`).
- Domain code stays free of I/O, clock and randomness.
- No new runtime dependency; fast-check is already in the domain package.
- No database migration: the takings come from `bookings.total_price` and
  `bookings.refund_amount`, the limit from `segments.capacity` and
  `segments.cap`.
- Every text in `en.ts` and `is.ts`; tokens only on screens (spec 15).
- The passenger service fee never counts towards the takings (spec 17,
  decision 4).
- Bookings keep their price: nothing in this plan changes a booking's
  `total_price` or its segment prices.

## Review Focus

1. A booking refunded in part by the operator counts its total less the
   refund. Task 1 tests it.
2. The driver lowers the seats while kept money is above the new limit: the
   highest level is 0%, nothing errors and nothing is taken back. Task 1
   tests it.
3. A request that expires gives its room back to the next booking. Task 4
   tests it.
4. A stop added after bookings re-rounds the caps of the split stretch: the
   level may fall but never rises on its own. Task 3 tests it.
5. A free trip (level 0, takings 0) behaves exactly as today. Task 1 tests
   it.

---

## PR 1: the rule in the domain

### Task 1: Trip limit, takings and the highest level that fits

**Files:**

- Create: `packages/domain/src/trips/limit.ts`
- Modify: `packages/domain/src/index.ts` (export it)
- Test: `packages/domain/src/trips/limit.test.ts`

**Interfaces:**

- Produces:
  - `interface TripLoad { distancesM: readonly number[]; occupancy: readonly number[]; seats: number; takings: number }`
    (takings in whole krónur).
  - `tripLimit(distancesM: readonly number[], seats: number, settings: PriceSettings): Money`:
    the sum of `seats × priceCap(distanceM, seats)`.
  - `takingsOf(bookings: readonly { status: BookingStatus; totalPrice: number; refundAmount: number | null }[]): Money`:
    sum of `totalPrice − (refundAmount ?? 0)` for `requested`, `accepted`,
    `confirmed`, `completed`, `no_show` and `cancelled`.
  - `type LevelLimit = "seats" | "trip_limit"`.
  - `highestLevelWithin(load: TripLoad, settings: PriceSettings): { level: number; limitedBy: LevelLimit }`.
  - `fitLevelWithin(level: number, load: TripLoad, settings: PriceSettings): { level: number; lowered: boolean; limitedBy: LevelLimit }`.
  - `isLevelWithin(level: number, load: TripLoad, settings: PriceSettings): boolean`.
- `PriceSettings` is the `Pick<TripSettings, …>` already used in
  `prices.ts`; export it from there.

- [ ] **Step 1: Write the failing tests.** The trip is spec 17's example,
  `d = [74_000, 171_000, 143_000]`, with `defaultTripSettings`:
  - `tripLimit(d, 3)` is 43 800 kr, `tripLimit(d, 1)` 29 100 kr,
    `tripLimit(d, 8)` 52 000 kr.
  - `takingsOf` counts 14 600 for a confirmed booking, 14 600 for a
    `no_show`, 0 for a cancelled one refunded in full, 9 600 for one with
    a 5 000 refund, 0 for `declined` and `expired`.
  - No bookings, 3 seats: `{ level: 250, limitedBy: "seats" }`.
  - Gap 1: 3 seats, occupancy `[1, 1, 1]`, takings 29 100:
    `{ level: 120, limitedBy: "trip_limit" }`.
  - Gap 2: 3 seats, occupancy `[1, 1, 1]`, takings 43 800:
    `{ level: 0, limitedBy: "trip_limit" }`.
  - One booking at 100% then a no-show (occupancy `[0, 0, 0]`, takings
    5 800): level 210.
  - Normal: 3 seats, occupancy `[2, 2, 2]`, takings 29 200: level 250,
    `limitedBy: "seats"`.
  - Lowering seats to 1 with takings 43 800 and occupancy `[1, 1, 1]`:
    level 0, no throw.
  - Free trip: takings 0, any seats: same level as `highestPriceLevel`.
  - `fitLevelWithin(250, gap 1 load)` gives `{ level: 120, lowered: true, limitedBy: "trip_limit" }`;
    `fitLevelWithin(100, gap 1 load)` gives `{ level: 100, lowered: false, … }`.
  - Property (fast-check): for random distances (1 to 400 km, 1 to 6
    stretches), seats 1 to 8, occupancy within seats and takings from
    bookings priced at or below the caps, `takings + Σ free × price at the
    returned level ≤ tripLimit`.
- [ ] **Step 2:** Run `pnpm --filter @shareride/domain test limit`; expect
  failures.
- [ ] **Step 3: Implement** in `limit.ts`. The only algorithm the
  signatures leave open:

  ```ts
  // From today's seat-only level down, the first step at which a full car
  // still fits in the trip limit; 0% if none does.
  const top = highestPriceLevel(load.seats, settings);
  const limit = tripLimit(load.distancesM, load.seats, settings).amount;
  for (let level = top; level > 0; level -= settings.priceLevelStep) {
    const prices = segmentPrices(load.distancesM, level, load.seats, settings);
    const rest = prices.reduce(
      (sum, price, k) => sum + (load.seats - (load.occupancy[k] ?? 0)) * price.amount,
      0,
    );
    if (load.takings + rest <= limit)
      return { level, limitedBy: level === top ? "seats" : "trip_limit" };
  }
  return { level: 0, limitedBy: top === 0 ? "seats" : "trip_limit" };
  ```

- [ ] **Step 4:** Run the same command; expect all to pass. Then
  `pnpm --filter @shareride/domain check`.
- [ ] **Step 5: Commit** `feat(pricing): the trip limit and the highest level within it`.

### Task 2: Booking checks the room left

**Files:**

- Modify: `packages/domain/src/bookings/check.ts`
- Test: `packages/domain/src/bookings/check.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1 (the API works out the room).
- Produces: `BookingAttempt.limitRoom: Money` (trip limit less takings, at
  least 0) and the problem `{ code: "trip_limit_reached" }`, checked right
  after `price_changed`.

- [ ] **Step 1: Write the failing tests:** a booking whose total is above
  `limitRoom` is refused with `trip_limit_reached`; equal to it is
  accepted; a free booking (total 0) with `limitRoom` 0 is accepted.
- [ ] **Step 2:** Run `pnpm --filter @shareride/domain test check`; expect
  failures.
- [ ] **Step 3: Implement** the check; update every `BookingAttempt` in
  existing tests with a large `limitRoom`.
- [ ] **Step 4:** Run the same command; expect pass.
- [ ] **Step 5: Commit** `feat(booking): refuse a booking past the trip limit`.

### Task 3: Trip changes use the trip limit

**Files:**

- Modify: `packages/domain/src/trips/changes.ts` (`ChangeableTrip`,
  `applied`, `changeProblems`, `withStopAdded`, `withStopRemoved`, the
  change effect)
- Test: `packages/domain/src/trips/changes.test.ts`

**Interfaces:**

- Consumes: `TripLoad`, `fitLevelWithin`, `isLevelWithin` (Task 1).
- Produces: `ChangeableTrip.takings: number`; the change effect's
  `priceLevelLowered` stays, and gains `levelLimitedBy: LevelLimit | null`
  (null when the level did not fall).

- [ ] **Step 1: Write the failing tests** (spec 17's trip, 1 seat booked
  at 500%, takings 29 100, occupancy `[1, 1, 1]`):
  - seats → 3 lowers the level to 120 with `levelLimitedBy: "trip_limit"`,
    and every stretch's new price matches `segmentPrices(d, 120, 3)`;
  - price level 130 with 3 seats is `price_level_invalid`; 120 is allowed;
  - a trip with no bookings behaves as today (seats → 3 lowers 500 to
    250, `levelLimitedBy: "seats"`);
  - adding a stop on the 171 km stretch never raises the level, and the
    level it ends at passes `isLevelWithin` for the new stretches.
- [ ] **Step 2:** Run `pnpm --filter @shareride/domain test changes`;
  expect failures.
- [ ] **Step 3: Implement:** build a `TripLoad` from the trip after the
  change (its distances, occupancy, seats and takings) and use
  `fitLevelWithin` for seats and stops, `isLevelWithin` for the price level.
- [ ] **Step 4:** Run the same command, then
  `pnpm --filter @shareride/domain check`; expect pass.
- [ ] **Step 5: Commit** `feat(trips): changes keep a trip within its limit`;
  open PR 1.

## PR 2: the API and the app

### Task 4: The API counts takings when booking

**Files:**

- Modify: `apps/api/src/modules/bookings/seats.ts` (add `limitRoomOf`)
- Modify: `apps/api/src/modules/bookings/service.ts` (pass `limitRoom` to
  `checkBooking`)
- Modify: `apps/api/src/modules/bookings/routes.ts`,
  `packages/contracts/src/bookings.ts` (`trip_limit_reached`, 409)
- Modify: `packages/i18n/src/messages/en.ts`, `is.ts`
- Test: `apps/api/src/modules/bookings/bookings.integration.test.ts`

**Interfaces:**

- Produces: `limitRoomOf(tx: Transaction, tripId: string): Promise<Money>`:
  `Σ segments.capacity × segments.cap` less the takings summed in SQL as in
  `takingsOf`, never below 0. Call it with the trip locked.
- Text `booking.problem.tripLimitReached`: EN "This ride's price has just
  changed. Look at it again before booking." IS "Verð þessarar ferðar
  breyttist rétt í þessu. Skoðaðu hana aftur áður en þú bókar."

- [ ] **Step 1: Write the failing integration tests:**
  - the gap 1 sequence through the API (1 seat at 500% booked; seats → 3;
    two bookings of the whole route) ends with the driver's bookings
    totalling 43 100 kr;
  - two bookings at once for the last room: one succeeds, the other gets
    `trip_limit_reached` or `seats_taken`;
  - a request that expires gives its room back: the next booking at the
    old price succeeds.
- [ ] **Step 2:** Run `pnpm --filter @shareride/api test:integration bookings`;
  expect failures.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the same command; expect pass.
- [ ] **Step 5: Commit** `feat(booking): the API keeps each trip within its limit`.

### Task 5: Trip changes and the driver's trip carry the takings

**Files:**

- Modify: `apps/api/src/modules/trips/changes.ts` (`readChange` adds
  `takings`; the recorded `seats` and `priceLevel` changes keep
  `levelLimitedBy`)
- Modify: `apps/api/src/modules/trips/service.ts` and
  `packages/contracts/src/trips.ts` (the driver's trip gains
  `takings: moneySchema`)
- Test: `apps/api/src/modules/trips/changes.integration.test.ts`

**Interfaces:**

- Consumes: `ChangeableTrip.takings` (Task 3), `limitRoomOf` (Task 4).
- Produces: `DriverTrip.takings` for the app (Task 7).

- [ ] **Step 1: Write the failing tests:** raising the seats after a
  booking lowers the level to 120% and stores the repriced segments; the
  trip change records `{ seats: 3, priceLevel: 120 }`; the driver's trip
  shows `takings` 29 100 kr; another person's view of the trip has no
  `takings`.
- [ ] **Step 2:** Run `pnpm --filter @shareride/api test:integration changes`;
  expect failures.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the same command and `pnpm check`; expect pass.
- [ ] **Step 5: Commit** `feat(trips): seat and price changes count what is booked`.

### Task 6: A no-show or a late cancellation refits the level

**Files:**

- Create: `apps/api/src/modules/trips/limit.ts`
- Modify: `apps/api/src/modules/trip-day/reports.ts` (after a no-show is
  stored), `apps/api/src/modules/bookings/service.ts` (`cancel`, when the
  refund is less than the total)
- Test: `apps/api/src/modules/trips/limit.integration.test.ts`

**Interfaces:**

- Consumes: `fitLevelWithin` (Task 1); the reprice and record steps the
  trip change service already uses, moved out so both can call them.
- Produces: `refitToTripLimit(tx: Transaction, tripId: string, now: Date): Promise<void>`:
  with the trip locked, lowers its level and reprices its segments when
  `fitLevelWithin` says so, and records a `priceLevel` trip change with
  `{ priceLevel, reason: "trip_limit" }`. Passengers are not told (spec 7,
  3.3: nobody is told of price changes).

- [ ] **Step 1: Write the failing tests:** a full car of 3 at 250% with two
  no-shows prices the stretches still ahead at 0; a trip at 100% with one
  no-show keeps its level; a passenger's cancellation with a full refund
  does not refit.
- [ ] **Step 2:** Run `pnpm --filter @shareride/api test:integration limit`;
  expect failures.
- [ ] **Step 3: Implement.** Tell the trip day thread before merging: its
  file `reports.ts` gains one call.
- [ ] **Step 4:** Run the same command and the trip day and bookings
  integration tests; expect pass.
- [ ] **Step 5: Commit** `feat(trips): a no-show's kept money counts towards the limit`.

### Task 7: The edit screens say why the level fell

**Files:**

- Modify: `apps/mobile/src/app/drive/trips/[id]/edit/price.tsx`,
  `apps/mobile/src/app/drive/trips/[id]/edit/seats.tsx`
- Modify: `apps/mobile/src/testing/trips.ts` (the fake API's `takings`)
- Modify: `packages/i18n/src/messages/en.ts`, `is.ts`
- Test: the screens' tests next to them

**Interfaces:**

- Consumes: `highestLevelWithin`, `fitLevelWithin` (Task 1),
  `DriverTrip.takings` (Task 5).
- Texts, as spec 17 section 11 fixes them: `trip.price.limitUsed` and
  `trip.price.whyLimit.trip`.

- [ ] **Step 1: Write the failing screen tests:** with 1 seat booked at
  500%, choosing 3 seats shows "Passengers have already paid most of this
  trip's limit, so the seats left can cost at most 120%."; the price screen
  stops at 120%; a trip with no bookings shows today's text; "Why is there
  a limit?" has the new sentence; both in Icelandic too.
- [ ] **Step 2:** Run `pnpm --filter @shareride/mobile test edit`; expect
  failures.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the same command and `pnpm check`; expect pass.
- [ ] **Step 5: Commit** `feat(app): the price and seats screens follow the trip limit`.

### Task 8: Docs

**Files:** `docs/architecture/domain-model.md` (the trip limit is computed
from segments and bookings, not stored), `CHANGELOG.md`, the plan and spec
indexes (status built), this plan's ticks.

- [ ] **Step 1:** Update them; run `npx --yes markdownlint-cli2@0.24.0`.
- [ ] **Step 2: Commit** `docs: the trip limit is built`; open PR 2.

## Not in this plan

- **The payout hold** for a trip over its limit (rule M3): built with real
  payouts in milestone 15; that milestone's plan must include it.
- **The console's takings against the limit** on a trip page: with the
  console trips page, once payouts exist.
- **Receipts and the yearly statement** showing each trip's limit (spec 17,
  section 9): with spec 13 receipts in milestone 15.
