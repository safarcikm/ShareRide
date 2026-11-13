# Spec 4: Search and trip details

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Draft for review

Features: D1 Search trips, including partial routes, D2 Trip details, D6 Help
when nothing matches ([features](../product/features.md)).
Related: [pricing and seats](../product/pricing-and-seats.md) (rules P1, S3,
S4), [architecture: search](../architecture/overview.md#search),
[spec 2](2026-11-13-meeting-points.md) (place search),
[spec 3](2026-11-13-post-a-trip.md) (what a trip contains).

## 1. Problem and goal

A passenger wants to get from one place to another on a day, and does not care
where the driver starts or ends. The app must find every trip that passes
through both places in the right order, show what that part costs and how many
seats are free on it, and give enough about the driver, car and meeting points
to decide.

Goal: anyone, with or without an account, searches from, to and a date, sees
matching trips including partial routes, and opens a trip to see the route,
their part, the price, the driver and the car.

## 2. User stories

- As a passenger, I search Borgarnes to Blönduós and find a Reykjavík to
  Akureyri trip that stops at both.
- As a passenger, I type "Reykjavík" and see trips from any meeting point in
  the capital area.
- As a passenger, I see my departure time, my price and the seats free on my
  part, without doing sums.
- As a passenger, I open a trip and see where exactly I get in, who drives, the
  car, and the driver's rules for luggage and pets.
- As a passenger who finds nothing, I see trips on nearby days or from nearby
  meeting points.
- As a visitor with my phone on home time, I see times in Iceland time, clearly
  labelled.

## 3. Behaviour

### 3.1 Search form

1. **From** and **To** use the place search from spec 2: a meeting point, a
   town or landmark, or "Near me" (computed on the device; only the matching
   meeting point IDs are sent, never the position).
2. **Date** (see question 2) and **seats** (1 to 8, default 1).
3. Available without an account (spec 1, decision 1). Booking needs one
   (spec 5).
4. The last five searches are kept on the device for one-tap repeat.

### 3.2 Which meeting points a search covers

- **A meeting point:** that point, plus active points within 3 km, shown as
  "nearby" with the distance ("Mjódd, 2.1 km from Kringlan").
- **A town or landmark:** active points within its radius: 10 km for towns,
  5 km for villages and landmarks, adjustable per place by the operator.
  Whether "Reykjavík" covers the whole capital area is question 1.

### 3.3 Which trips match

A trip matches when all of these hold (rule R4.1):

1. It is published, not departed and not cancelled.
2. It has a stop among the "from" points and a later stop among the "to"
   points. Direction matters: a trip Akureyri to Reykjavík does not match
   Borgarnes to Blönduós.
3. The planned time at the boarding stop falls on the chosen date, in Iceland
   time. For partial routes this is the passenger's own departure, not the
   trip's start.
4. The boarding stop is at least the booking cut-off away (15 minutes, rule
   S4).
5. At least the requested number of seats is free on every segment between the
   two stops (rule S3).
6. The searcher is not the driver, and neither has blocked the other.

When several stops of one trip match (for example two capital area points),
the result uses the boarding stop and the alighting stop closest to what was
searched, preferring exact matches. The passenger can change both on the trip
page.

### 3.4 Results

1. Each result shows: departure time at the boarding stop and arrival time at
   the alighting stop; both stop names (with "nearby" distances); the whole
   trip in small text ("Reykjavík → Akureyri"); the price per seat for this part
   and the total for the chosen seats, or "Free"; seats free on this part; the
   driver's first name, photo and rating with the number of reviews, or "New
   driver"; and "Instant" or "Request" for the booking mode.
2. Sorted by departure time at the boarding stop. Can be sorted by price
   instead.
3. Filters: instant booking only; time of day (morning, afternoon, evening).
4. Trips that are full on the searched part are not shown.
5. Times are in Iceland time; if the phone uses another time zone, the screen
   says "Iceland time".

### 3.5 Nothing matches

When there are no results:

1. **Other days:** the number of matching trips on each of the three days
   before and after, tap to switch.
2. **Nearby meeting points:** trips from or to active points within 20 km of
   the searched places, with distances.
3. If neither finds anything: "No trips yet on this route", with "Offer a ride"
   for drivers. Ride alerts come after the MVP.

### 3.6 Trip details

1. **Your part:** boarding and alighting stops with times, seats chosen, price
   per seat and total, seats free on this part. Tapping any stop on the route
   makes it the boarding or alighting stop (in travel order); price and seats
   update.
2. **Route:** map and list of every stop with planned times; the passenger's
   part highlighted, the rest greyed. Each stop opens its meeting point details
   (spec 2, with "where to stand").
3. **Driver:** first name, photo, rating, number of reviews, member since,
   badges and reliability (spec 8), about and languages; tap for the public
   profile with reviews.
4. **Car:** make, model and colour (spec 3, decision 7). The number plate is
   shown after booking.
5. **Preferences and note:** luggage, pets, smoking, child seat, chat, and the
   driver's note.
6. **Booking mode:** "Instant booking" or "The driver approves each request".
7. **Payment:** "Pay the driver directly, by bank transfer or cash"
   ([ADR 0008](../decisions/0008-payments-phased.md)).
8. **Actions:** "Book" or "Request to book" (spec 5), "Share" (a link to the
   trip page), "Report this trip" (spec 9).
9. **Other states:** full on this part (with "Try another part of the trip"),
   departed, cancelled, or past the booking cut-off; each shown plainly
   instead of the booking button.

### 3.7 Shared trip links

A trip has a public web address that opens the trip page in the web app or, if
installed, in the app. It shows the same details as above. Trip pages are not
indexed by search engines, because they show a person's name and travel plans.

## 4. Rules

Rules P1, S3 and S4 in [pricing and seats](../product/pricing-and-seats.md)
apply. This spec adds:

| ID | Rule |
| -- | ---- |
| R4.1 | A trip matches a search only under all six conditions in 3.3. |
| R4.2 | A meeting point search also covers active points within 3 km; a place covers active points within its radius (10 km towns, 5 km villages and landmarks, adjustable per place). |
| R4.3 | The date of a result is the date of the planned time at the passenger's boarding stop, in Iceland time. |
| R4.4 | Prices shown are the current segment prices (rule P1). The price is fixed when the booking is made (spec 5). |
| R4.5 | Searching needs no account; searches are not stored with a user or device on the server. |
| R4.6 | Trip pages are public by link and never indexed by search engines. |
| R4.7 | "Nothing matches" looks three days either side and 20 km around. |

The 3 km, 10 km, 5 km, 20 km and three-day values are settings the operator
can change (feature H4).

## 5. Screens

Phone first; on wide screens results and the map are side by side.

1. Search form, with recent searches
2. Results, with sort and filters
3. Nothing matches: other days and nearby meeting points
4. Trip details, with "your part" and the route map and list
5. Driver's public profile (spec 1) with reviews (spec 8)
6. Shared trip page on the web

## 6. Data and API

No new entities. `Place` gains `match_radius_m`. Search runs as a SQL query
with indexes on `trip_stop (meeting_point_id, planned_at)` and on the
segments' occupancy, as described in the
[architecture overview](../architecture/overview.md#search); no search engine
is needed at Iceland's scale.

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `GET /trips/search?from=&to=&date=&seats=&instant=&time_of_day=&sort=` | Matching trips; `from` and `to` are a meeting point, a place, or a list of meeting point IDs from "Near me" |
| `GET /trips/search/alternatives?from=&to=&date=&seats=` | Counts on nearby days and trips from nearby meeting points |
| `GET /trips/{id}?from_stop=&to_stop=&seats=` | Trip details with the price and free seats for that part |

Domain functions in `packages/domain`: match a trip against a search,
choose the boarding and alighting stops, price for a part (P1) and seats free
for a part (S3). The SQL query narrows candidates; the domain functions decide,
so the rules are tested once.

Target: search answers in under 500 ms at the 95th percentile with 10 000
upcoming trips.

## 7. Privacy and safety

- Searches need no account and are not stored with a user or device. Recent
  searches stay on the device. Analytics only with consent (J3).
- "Near me" sends meeting point IDs, never a position (spec 2, R2.7).
- Trip pages show the driver's first name, photo, rating, car make, model and
  colour, and the route and times: public by design, but not indexed by search
  engines (R4.6).
- Other passengers are not shown before booking, not even as names; results
  show only free seats.
- Searching is rate limited per IP address to prevent scraping.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `search.from` | From | Frá |
| `search.to` | To | Til |
| `search.date` | Date | Dagsetning |
| `search.seats` | Seats | Sæti |
| `search.submit` | Search | Leita |
| `results.seatsLeft` | {count, plural, one {# seat left} other {# seats left}} | {count, plural, one {# sæti laust} other {# sæti laus}} |
| `results.free` | Free | Ókeypis |
| `results.newDriver` | New driver | Nýr ökumaður |
| `results.nearby` | {distance} from {place} | {distance} frá {place} |
| `results.instant` | Instant | Strax |
| `results.request` | Request | Beiðni |
| `results.sortEarliest` | Earliest | Fyrst |
| `results.sortCheapest` | Cheapest | Ódýrast |
| `results.instantOnly` | Instant booking only | Aðeins bókun strax |
| `results.none` | No trips on {date} | Engar ferðir {date} |
| `results.otherDays` | Trips on other days | Ferðir aðra daga |
| `results.nearbyPoints` | Trips from nearby meeting points | Ferðir frá nálægum mótsstöðum |
| `results.noTripsYet` | No trips yet on this route | Engar ferðir enn á þessari leið |
| `trip.yourPart` | Your part of the trip | Þinn hluti ferðarinnar |
| `trip.payDriver` | Pay the driver directly, by bank transfer or cash | Greiddu ökumanninum beint, með millifærslu eða reiðufé |
| `trip.book` | Book | Bóka |
| `trip.requestToBook` | Request to book | Óska eftir fari |
| `trip.fullOnPart` | Full on your part of the trip | Fullt á þínum hluta ferðarinnar |
| `trip.share` | Share | Deila |

## 9. Testing

- **Unit (domain):** the partial-route example (Borgarnes to Blönduós finds
  Reykjavík to Akureyri); the opposite direction does not match; the date taken
  from the boarding stop, including a trip that starts before midnight and
  reaches the boarding stop after it; free seats per part using the occupancy
  example in pricing and seats; choice of stops when several match; the
  booking cut-off; blocked users and own trips.
- **Property tests:** every match boards before it alights; free seats equal
  rule S3; the price equals rule P1.
- **API integration:** search on seeded trips at a fixed clock; filters and
  sorting; alternatives; trip details for a chosen part; rate limits.
- **Load:** 10 000 upcoming trips, search under 500 ms at the 95th percentile
  (k6).
- **End to end:** search without an account in Icelandic and English, open a
  trip, change the boarding stop, open a shared link on the web.
- **Manual:** screen reader pass on results, trip details and the route list;
  a phone set to another time zone.

## 10. Out of scope

Booking and requests (spec 5), reviews and reliability (spec 8), reporting
(spec 9), ride alerts and saved searches (after the MVP), weather and road
warnings on trips (later), route pages for search engines (website, later),
and connecting two trips into one journey (ideas list).

## Questions for Martin

| # | Question | Recommendation |
| - | -------- | -------------- |
| 1 | Does a search for "Reykjavík" cover the whole capital area, including Hafnarfjörður, Kópavogur and Mosfellsbær? | Yes. People think of the capital area as one place when travelling around Iceland. A search for a specific meeting point stays precise |
| 2 | Must the passenger pick a date? | No. The date is optional; without one, results show all upcoming trips on the route, grouped by day. With few trips in the beta, people see everything available |
