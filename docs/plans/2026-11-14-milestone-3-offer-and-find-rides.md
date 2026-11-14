# Milestone 3 plan: offer and find rides

**Owner:** Martin · **Date:** 2026-11-14 · **Status:** Approved by Martin
(2026-11-14: all five choices in section 3 accepted)

The core of ShareRide, tried on the web first: a driver offers a ride from
meeting points with prices worked out for them, and anyone searches, finds
trips that pass their places (partial routes included) and opens a trip.
Martin asked for this on 2026-11-14, while Apple reviews his developer
account. It implements most of [spec 3](../specs/2026-11-13-post-a-trip.md)
(post a trip) and [spec 4](../specs/2026-11-13-search-and-trip-details.md)
(search and trip details), and the parts of
[spec 2](../specs/2026-11-13-meeting-points.md) (meeting points and place
search) they need. The screens follow
[spec 15](../specs/2026-11-13-visual-design-system.md#54-screens). Business
rules come from [pricing and seats](../product/pricing-and-seats.md).

It builds on milestones 1 and 2 and on ADRs
[0006](../decisions/0006-meeting-points-and-segment-pricing.md) (meeting
points and segment prices), [0009](../decisions/0009-maps-and-routing.md)
(legs computed ahead and stored), [0012](../decisions/0012-trip-price-level.md)
(one price level per trip) and [0021](../decisions/0021-map-tiles-from-maptiler.md)
(MapTiler). No new ADR is needed: section 3 lists the choices, each
temporary or inside an existing decision.

## 1. Goal

When this milestone is done, on the web and on an Android emulator (and in
the TestFlight build once Apple approves Martin's account):

- A signed-in person adds a car, declares their licence and publishes a trip
  from Reykjavík to Akureyri. The app adds the meeting points on the way,
  prefills times and prices, and keeps every price under the cost-sharing
  cap. Drafts are saved as they go.
- Anyone, signed in or not, searches Borgarnes to Blönduós and finds that
  trip, with their own departure time, price and free seats. With nothing on
  the day, they see other days and nearby meeting points.
- Anyone opens a trip: their part, the whole route, the driver, the car, the
  preferences and the note. A trip has a link that can be shared.
- Meeting points can be browsed in a list by region, and on a map once the
  MapTiler key is in (PR 8).

## 2. Scope

| In milestone 3 | Later |
| -------------- | ----- |
| Sample meeting points on three corridors, with legs from a sample road graph | The real meeting point list v1, photos, the routing engine job (spec 2, 3.7), the operator console |
| Place search: meeting points, towns and landmarks, Icelandic letters typed in ASCII, small typos | "Near me" (needs location on the device), offline catalogue, problem reports |
| Cars, the licence declaration, the ready-to-drive list | Plate reminders (with notifications, spec 7), profile photo upload (milestone 2, PR 7) |
| Post a trip: route, times, price level, seats, booking mode, preferences, note, review, publish, drafts | Editing and cancelling published trips, the return trip (spec 6), women-only trips (spec 14) |
| Search with partial routes, filters, sorting, other days and nearby points; recent searches on the device | Ride alerts, blocking (spec 9), ratings and badges (spec 8) |
| Trip details for a chosen part, the seat view, shared links that search engines do not index | Booking and requests (spec 5): the book button says booking opens soon |
| Maps on the web and phones (PR 8) | Weather and road warnings |

Milestone 2's open PRs (iPhone builds, then the profile photo, Google and
Apple sign-in, development builds and Maestro) follow this milestone. The
iPhone build PR opens as soon as Apple approves Martin's account.

## 3. Decisions for Martin

| # | Choice | Decision (accepted) | Why | Alternative |
| - | ------ | ----------- | --- | ----------- |
| 1 | Meeting points and distances | **Sample data now**: about 30 real public places (bus terminals, fuel stations, the airport) on Reykjavík to Akureyri, Reykjavík to Vík and Reykjavík to Keflavík Airport, with road distances from a small hand-made road graph. Shown as sample data; local and staging only | Every feature needs meeting points and distances. The real list needs photos, "where to stand" and the operator's check for each point, and the routing engine needs its own job | Write the real list v1 first; everything waits for it |
| 2 | Profile photo before publishing (rule R3.1) | **Shown in the ready-to-drive list, required once photo upload exists** (milestone 2, PR 7, which needs the Hetzner account) | Drivers can be tried now; the rule itself does not change | Build photo upload first |
| 3 | Payouts before publishing a priced trip (R3.1) | **Not checked until payments are built** (spec 13); priced trips publish on staging, and no money moves | Payments are their own milestone; without this, only free trips could be tried | Only free trips until payments |
| 4 | Maps | **Lists first, the map last** (PR 8): the route and meeting points as lists, which the specs ask for anyway for screen readers | The map needs Martin's MapTiler key and a check that MapLibre builds with Expo SDK 58 | Map first, everything waits on the key |
| 5 | Order after this milestone | **Booking and requests (spec 5) next**, then milestone 2's remaining PRs | Booking turns trips into rides; sign-in with Google and Apple matter less until then | Milestone 2's remaining PRs first |

Settings the operator will change later (feature H4) start as values in the
domain package, as pricing and seats gives them: a suggested rate of 15 kr
per km, a reference cost of 150 kr per km, a 100 kr price step, 10% level
steps, 8 seats at most, and the margins in specs 3 and 4. The operator
settings screen comes with the console.

## 4. Design notes

### 4.1 Meeting points, places and legs

- Tables `meeting_points`, `places` and `legs` as in the
  [domain model](../architecture/domain-model.md), without photos, shelter
  hours or problem reports. `search_text` holds the names and aliases
  normalised by the domain rule R2.6, with a trigram index (`pg_trgm`).
- `places` adds `match_radius_m` (spec 4) and `municipalities`: a place with
  municipalities covers every active point in them instead of a radius.
  That is how "Reykjavík" covers the whole capital area while "Kópavogur"
  stays one town.
- Legs come through the `Router` port (spec 2). The sample adapter finds the
  shortest path on a small road graph: one edge per stretch of road between
  neighbouring sample points, with an approximate distance and typical time.
  Legs are then consistent, so "on the way" works as it will with real data.
  The routing engine adapter replaces it with the real list.
- The seed adds the sample points, places and legs on local and staging
  only (the seed guard from milestone 2). The data says it is sample data,
  and the app shows "Sample meeting point" on each.
- Place search: prefix and exact matches first, then aliases, then trigram
  matches; meeting points before places when equally good (spec 2, 3.4).
- Places are a sample list of the towns and landmarks near the corridors.
  The open dataset spec 2 asks for (for example the place names of
  Landmælingar Íslands, or OpenStreetMap) is chosen with the real list.

### 4.2 Cars and getting ready to drive

- `vehicles` (make, model, colour, plate optional) and
  `users.licence_declared_at`. The plate is stored in capitals without
  spaces or hyphens and returned only to its owner for now (booked
  passengers come with spec 5).
- Makes come from a short list of common makes in Iceland, or are typed;
  colours from a fixed list in both languages.
- `GET /me/driver-readiness` lists what is missing: car and licence block
  publishing; the photo shows but does not block (decision 2); payouts are
  left out (decision 3).

### 4.3 Route, times and prices

Pure functions in `packages/domain/src/trips/`, with property tests
(`fast-check`, a new development dependency):

- **Prices** (P2 to P4): suggested price, cap and highest level for a
  segment, segment prices from a level, the whole-route price. The worked
  example in pricing and seats is a test: 100% gives 5 800 kr, 80% gives
  4 700 kr.
- **Stops along the way** (R3.3): every active point in season whose detour
  is at most 5% or 3 km, in route order; where an added stop goes; the 1.5
  route factor (R3.4) and the 20% or 20 km warning.
- **Times** (R3.5, R3.6): planned times from typical times rounded to 5
  minutes, the 90% floor, the long-break warning, the 30-minute notice and
  the 60-day window, in Iceland time.
- **Publish validation**: every broken rule at once, as codes the app turns
  into texts in both languages.

`GET /routes/stops-along` and `POST /routes/quote` call these with legs from
the database.

### 4.4 Trips and drafts

- Tables `trips`, `trip_stops` and `segments` as in the domain model.
  Segments store the price, the cap and the suggested price at publishing,
  and an occupancy of 0 with `CHECK (occupancy <= capacity)` ready for
  booking.
- A draft is created at the first step and saved as the driver goes
  (`POST /trips`, `PATCH /trips/{id}`). `POST /trips/{id}/publish` runs every
  check again with the server's legs, settings and clock, and refuses a
  tampered price level. Overlap with the driver's other published trips is
  checked in the same transaction (R3.7).
- The hourly clean-up deletes drafts 30 days after their last change or once
  their departure has passed (R3.11).
- **Sample trips** on local and staging: the seed adds a few upcoming trips
  by fictional drivers (no phone numbers), so search has something to find.

### 4.5 Search

- `GET /trips/search` resolves "from" and "to" to meeting points (R4.2), and
  one SQL query finds candidate trips by `trip_stops (meeting_point_id,
  planned_at)`. The domain decides: direction, the date at the boarding stop
  in Iceland time, the 15-minute cut-off, seats free on every segment of the
  part (S3), the driver is not the searcher, and the choice of stops when
  several match.
- Filters: instant booking, time of day. Sort by departure or price; without
  a date, grouped by day.
- `GET /trips/search/alternatives`: counts on the three days either side,
  and trips from points within 20 km.
- Search needs no account and is not stored with a person or device (R4.5);
  it is rate limited per network address. Recent searches stay on the device.

### 4.6 Trip details and links

- `GET /trips/{id}?from_stop=&to_stop=&seats=` returns the trip with the
  price and free seats for that part; any stop can become the boarding or
  alighting stop.
- The screen follows the trip board in spec 15: your part with the seat
  view, the route list with your part highlighted, the driver (first name,
  the first letter until photos exist, "New driver"), the car's make, model
  and colour, preferences and note. The plate is never shown here yet.
- "Share" copies the trip's web address. Trip pages get `noindex`, and the
  web app sends `X-Robots-Tag: noindex` for them (R4.6).
- The book button says "Booking opens soon" until spec 5.

### 4.7 Maps (PR 8)

- MapLibre GL JS on the web and `@maplibre/maplibre-react-native` on phones
  (checked first with Expo SDK 58), with MapTiler tiles and the
  OpenStreetMap attribution. The key is limited to our app IDs and the
  staging address; the content security policy allows MapTiler.
- Expo Go cannot show the native map, so phones show the lists there.

## 5. Pull requests and tasks

Tests come first in every task. Each PR updates the docs it touches, runs the
browser journeys, and gets a code review before it opens. Tick tasks as they
merge.

### PR 1: `docs(plans)`: this plan

- [ ] This plan, the roadmap and the milestone 2 plan's order

### PR 2: `feat(meeting-points)`: sample meeting points and place search

- [x] Domain: search normalisation (R2.6) with property tests, seasons
      across the new year (R2.5), visibility by status
- [x] Schema and migration (`pg_trgm`), the `Router` port and its sample
      adapter, the sample seed with its guard
- [x] `GET /meeting-points`, `GET /meeting-points/{id}`,
      `GET /places/search`, `GET /places/{id}/nearest-meeting-points`, with
      integration tests for ranking (exact, ASCII, alias, misspelt) and the
      capital area
- [x] App: the place search screen shared by later steps; meeting points by
      region and their details; both languages
- Verify: "thorlakshofn", "Akureyi" and "KEF" find their places in the app
  (a browser journey, `apps/mobile/e2e/meeting-points.spec.ts`)
- Done with 25 sample points, 33 places and 29 road stretches. Legs come
  from the road graph through `legsFromRoadGraph` in the seed; the `Router`
  port is written with its first real adapter, the routing engine job.

### PR 3: `feat(trips)`: cars and the ready-to-drive list

- [ ] Vehicles and the licence declaration: endpoints and rules (plate
      format, removal while a future trip uses the car)
- [ ] Ready to drive, add or edit a car, licence declaration screens
- Verify: a new driver adds a car and declares their licence on the web

### PR 4: `feat(trips)`: route, times and prices

- [ ] Domain functions in 4.3 with property tests and the worked example
- [ ] `GET /routes/stops-along`, `POST /routes/quote`
- Verify: the quote for Reykjavík to Akureyri lists the stops on the way
  and prices that sum to the whole-route price

### PR 5: `feat(trips)`: post a trip

- [ ] Trips, stops, segments; drafts; publish with every check; overlap;
      draft clean-up; sample trips
- [ ] The five steps (route, date and times, price, seats and preferences,
      check and publish) and the published screen; "My trips" lists drafts
      and published trips
- [ ] Browser journey: a first-time driver sets up and publishes a trip, in
      English and Icelandic
- Verify: Martin publishes Reykjavík to Akureyri on the web

### PR 6: `feat(search)`: search and results

- [ ] Domain matching (R4.1 to R4.3) with property tests: every match
      boards before it alights, free seats follow S3, prices follow P1
- [ ] `GET /trips/search` and `/alternatives`, rate limit, integration tests
      at a fixed clock
- [ ] Search form with recent searches, results, nothing matches
- Verify: Borgarnes to Blönduós finds a Reykjavík to Akureyri trip

### PR 7: `feat(search)`: trip details and shared links

- [ ] `GET /trips/{id}` for a part; the trip details screen with the seat
      view and route list; changing the part; share; `noindex`
- [ ] Browser journey: search without an account, open a trip, change the
      boarding stop, open the shared link
- Verify: a shared link opens the trip in another browser

### PR 8: `feat(maps)`: maps on the web and phones

- [ ] Check MapLibre with Expo SDK 58 first; map of meeting points, the
      route on the post and trip screens
- Verify: the map shows the sample points on the web and the Android
  emulator (needs Martin's MapTiler key)

## 6. Martin's steps

1. Accept or change the choices in section 3.
2. Try each PR locally on the web as it merges (README, "Run it locally"),
   and on staging once it runs (milestone 2, Render setup).
3. Before PR 8: a MapTiler account and a key limited to our app IDs and the
   staging address (milestone 2 plan, step 5).

## 7. Risks

- **Sample distances** are approximate. Prices on staging are close to real
  ones, not exact; the real list brings routing-engine legs.
- **Search speed:** the target is 500 ms at the 95th percentile with 10 000
  upcoming trips. A load test waits for the beta; the indexes are in from
  the start.
- **Scope:** specs 3 and 4 are large. Each PR stays testable on its own, and
  anything not listed in section 2 waits.

## 8. Definition of done

All eight PRs merged with green CI; Martin has published a trip, found it by
a partial route without signing in, and opened it from a shared link, on the
web and on an Android emulator; docs, roadmap and CHANGELOG are updated.
