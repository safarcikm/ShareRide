# Front page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People without an account land on a front page that shows the app
is alive: a route search on top, the rides leaving soonest, and "Offer a
ride", which goes through sign-up straight to posting a trip.

**Architecture:** A new public API list, `GET /v1/trips/soonest`, reuses the
search service and its domain matching for the whole route of each trip, so
prices, free seats, the booking cut-off and "not your own trip" follow the
same rules as search. The app reuses the search form's fields and the
search result card; "Offer a ride" is kept on the device through sign-up,
like a booking chosen before sign-up (spec 5, 3.1).

**Tech Stack:** Hono and Drizzle (API), Expo Router and React Native (app),
Vitest, Jest with RNTL 14, Playwright.

**Spec:** [spec 1](../specs/2026-11-13-sign-in-and-profile.md) 3.1 and
screen 1, [spec 4](../specs/2026-11-13-search-and-trip-details.md) 3.8 and
decision 5. Layout approved by Martin on 2026-11-15.

## Global Constraints

- Texts in English and Icelandic, every key in both `en.ts` and `is.ts`.
- Tokens only, no raw colours or sizes (spec 15).
- No new runtime dependency.
- First names only; other passengers are never shown (spec 4, section 7).
- The list counts against the search rate limit, like search and trip pages.
- Signed-in people never see the front page (it redirects, as today).

## Review Focus

1. No upcoming rides (an early beta): the section and "See all rides" are
   left out, never "No rides". Task 3 tests it.
2. The list fails to load (offline, rate limited): the section is left out;
   the route search and buttons still work. Task 3 tests it.
3. A trip full on one stretch but free on others: left out of the list
   (seats are counted on the whole route); search still finds its free
   part. Task 1 tests it.
4. Tapping Offer a ride, backing out, then tapping Book on a ride (or the
   other way round): sign-up continues with the last choice only. Task 2
   tests it.
5. `/v1/trips/soonest` must not be taken by `/v1/trips/{id}`. Task 1 tests
   it.

---

### Task 1: API, rides leaving soon

**Files:**

- Modify: `packages/contracts/src/search.ts` (route and query schema)
- Modify: `apps/api/src/modules/search/service.ts` (split `candidates` into
  finding IDs and loading them; add `soonest`)
- Modify: `apps/api/src/modules/search/routes.ts` (register before
  `/v1/trips/{id}`, rate limited)
- Test: `apps/api/src/modules/search/soonest.integration.test.ts`

**Interfaces:**

- Produces: `soonestTripsRoute` (GET `/v1/trips/soonest`, auth optional,
  query `{ limit: 1..50, default 20 }`, response
  `{ results: TripSearchResult[] }`, errors 400, 401, 429).
- Produces: `SearchService.soonest(limit: number, searcherId: string | null): Promise<TripSearchResult[]>`.
  Each result is the whole route: `board.position` 0, `alight.position` the
  last stop, `nearbyM` null, one seat.

- [x] **Step 1: Write the failing tests** (sample trips at the test clock):
  - lists the five sample trips soonest first: `jon-airport`,
    `anna-akureyri`, `sigga-selfoss`, `jon-vik`, `anna-home`, each from its
    first to its last stop, with `total` equal to `pricePerSeat`;
    `limit: 2` gives the first two;
  - leaves out the caller's own trips (signed in as Anna);
  - leaves out a trip full on one stretch, a trip past its booking cut-off,
    a cancelled trip and a trip whose first point is paused;
  - refuses `limit` 0 and 51 (400), and counts against the search limit
    (429), which also proves the path is not taken by `/v1/trips/{id}`.
- [x] **Step 2:** Run `pnpm --filter @shareride/api test:integration soonest`; expect failures.
- [x] **Step 3: Implement.** The SQL finds published trips whose first stop
  is after the cut-off and whose first and last points are searchable,
  soonest first, up to `limit * 3` (at most 150); `matchTrip` with the
  first and last point, one seat and no date decides; keep matches from
  stop 0 to the last stop, sort by first stop time, take `limit`.
- [x] **Step 4:** Run the integration tests and `pnpm check --force`; expect pass.

### Task 2: Offer a ride through sign-up

**Files:**

- Create: `apps/mobile/src/drive/pending-offer.ts` and its test
- Create: `apps/mobile/src/drive/offer-ride.ts`
- Modify: `apps/mobile/src/booking/pending-booking.ts` (keeping a booking
  forgets a kept offer)
- Modify: `apps/mobile/src/app/index.tsx` (`SignedIn` takes a kept offer)
- Modify: `apps/mobile/src/app/search/results.tsx` (its "Offer a ride" uses
  `offerRide`)

**Interfaces:**

- Produces: `keepPendingOffer(at: Date): Promise<void>` (forgets a kept
  booking), `takePendingOffer(at: Date): Promise<boolean>` (true once,
  within an hour).
- Produces: `offerRide(me: Me | null): void`: ready accounts go to
  `/drive`; others keep the offer and go to `/sign-in` or their next
  sign-up step.

- [x] **Step 1: Write the failing tests:** a kept offer is taken once and
  forgotten after an hour; keeping a booking forgets the offer and the
  other way round; signed in with a kept offer, "/" opens Ready to drive.
- [x] **Step 2:** Run `pnpm --filter @shareride/mobile test pending-offer welcome`; expect failures.
- [x] **Step 3: Implement** with the key `pending-offer` in app data, as
  `pending-booking.ts` does.
- [x] **Step 4:** Run the tests; expect pass.

### Task 3: The front page and all rides

**Files:**

- Create: `apps/mobile/src/search/route-search.tsx` (the from, to and date
  fields and the place picker, from the search form)
- Modify: `apps/mobile/src/app/search/index.tsx` (uses it)
- Modify: `apps/mobile/src/app/index.tsx` (the new front page)
- Create: `apps/mobile/src/app/rides/index.tsx` (all rides leaving soon)
- Modify: `apps/mobile/src/app/_layout.tsx` (public `rides/index`)
- Modify: `apps/mobile/src/testing/app.tsx` (an empty `/v1/trips/soonest`
  by default), `apps/mobile/src/testing/search.ts` (sample rides)
- Modify: `packages/i18n/src/messages/en.ts`, `is.ts`
- Test: `apps/mobile/src/__tests__/welcome.test.tsx`, `rides.test.tsx`

**Interfaces:**

- Consumes: `soonestTripsRoute` (Task 1), `offerRide` (Task 2),
  `ResultCard` (`showDay`, one seat).
- Produces: `useRouteSearch(): { fields: ReactElement; picker: ReactElement | null; submit: (seats: number) => void }`;
  `submit` keeps the search among recent searches and opens the results.

Layout, top to bottom: "Sign in" (left) and the language switch (right);
the title and tagline; the route search (from, to, date, "Find a ride");
"Leaving soon" with up to 5 rides (asks for 6; "See all rides" only when a
sixth came back); "Offer a ride" (main button); "See the meeting points".

- [x] **Step 1: Write the failing tests:**
  - shows five rides soonest first and "See all rides" when there are
    more; a ride opens the trip for its whole route;
  - with no rides, or when the list can't load, shows neither the section
    nor "See all rides"; with five, no "See all rides";
  - searches from the front page (both places needed), and the search is
    kept among recent searches;
  - "Sign in" opens the sign-in screen; "Offer a ride" opens it too and
    keeps the offer;
  - All rides lists up to 50 with their days, says so when it shows 50,
    offers a retry when they can't load, and offers "Offer a ride" when
    there are none.
- [x] **Step 2:** Run them; expect failures.
- [x] **Step 3: Implement.** Remove `welcome.continuePhone` and
  `welcome.browseTrips`.
- [x] **Step 4:** Run `pnpm check --force`; expect pass.

### Task 4: Web journeys, docs and screenshots

**Files:**

- Modify: `apps/mobile/e2e/welcome.spec.ts`, `search.spec.ts`,
  `look.spec.ts`, `support/account.ts` (sign in from "Sign in"; search from
  the front page)
- Modify: specs 1 and 4, `docs/engineering/testing-strategy.md`,
  `CHANGELOG.md`, `docs/plans/README.md`

- [x] **Step 1:** Update the journeys; run `pnpm --filter @shareride/mobile e2e:web`; expect pass.
- [x] **Step 2:** Screenshots at phone and desktop sizes: front page with
  rides, without rides, all rides.
- [x] **Step 3:** Code review, fixes, `pnpm check --force`, integration
  tests, Prettier and markdownlint; commit
  `feat(mobile): front page with a route search and rides leaving soon`.
