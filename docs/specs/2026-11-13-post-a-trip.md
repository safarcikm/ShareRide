# Spec 3: Driver setup and posting a trip with prices

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Draft for review

Features: A3 Driver setup, C1 Post a trip, C2 Segment prices, C3 Seats and
booking mode, C4 Trip preferences and notes ([features](../product/features.md)).
Related: [pricing and seats](../product/pricing-and-seats.md) (source of truth
for prices and seats), [domain model](../architecture/domain-model.md),
[ADR 0012](../decisions/0012-trip-price-level.md),
[spec 1](2026-11-13-sign-in-and-profile.md),
[spec 2](2026-11-13-meeting-points.md).

## 1. Problem and goal

Passengers only find rides if drivers post them, and drivers only post if it
is quick. A driver who already drives Reykjavík to Akureyri should be able to
offer the empty seats in under a minute, with fair prices worked out for them
and a clear limit that keeps the trip cost sharing.

Goal: a driver sets up once (photo, car, licence declaration), then posts a
trip by
choosing where they start and end. The app adds the stops along the way and
prefills times and prices; the driver confirms the date, one price level,
seats and preferences.

## 2. User stories

- As a new driver, I add my car and declare that I hold a driving licence
  once, so every later trip is quick to post.
- As a driver, I choose Reykjavík (BSÍ) to Akureyri and the app adds the
  meeting points on the way, so people along the route can join.
- As a driver, I see what passengers pay and can make the whole trip cheaper,
  a bit dearer within the limit, or free, with one control.
- As a driver, I choose how many seats to offer and whether I approve each
  passenger.
- As a driver, I say whether there is room for luggage, whether pets are
  welcome and how chatty I am, so passengers know what to expect.
- As the operator, I know every trip respects the cost-sharing cap, the stop
  limit and the 60-day window.

## 3. Behaviour

### 3.1 Getting ready to drive

"Offer a ride" is always visible. A driver can start building a trip at once;
before publishing the first trip, the app shows a short checklist of what is
missing, and each item can be done from there:

1. Verified phone number and the current terms accepted (spec 1).
2. A profile photo (spec 1, decision 4).
3. A car (3.2).
4. A driving licence declaration (3.3).

### 3.2 Cars

1. The driver enters the car's make and model (from a list, or typed), picks
   its colour from a list, and adds the number plate.
2. **Any car:** it does not matter who owns the car. The Terms of Service make
   the driver responsible for being allowed to use it, and for its insurance
   (decision 5).
3. **Number plate later:** the plate can be left empty when publishing and
   added at the latest before departure (decision 4). If it is missing, the app
   reminds the driver 24 hours and 1 hour before departure, and booked
   passengers see "The driver will add the number plate before departure".
4. The plate is stored in capitals without spaces or hyphens, 2 to 8 letters
   and digits, and shown only to booked passengers. What the rest of the car
   shows publicly is question 1.
5. A driver can save several cars and chooses one per trip; the last used is
   preselected. A car used by a future trip cannot be removed until that trip
   uses another car or ends. Removed cars stay on past trips.

### 3.3 Driving licence declaration

1. Before their first trip, the driver ticks "I declare that I hold a valid
   driving licence for the cars I drive on ShareRide" (decision 3).
2. Only the date of the declaration is stored. No licence details are asked
   for or checked, and there are no spot checks.
3. The Terms of Service say drivers must hold a valid licence on every trip;
   a false declaration breaks the community rules and can lead to suspension
   (spec 9).

### 3.4 Building the route

1. **From** and **To**: the place search from spec 2. Choosing a town offers
   its nearest meeting points.
2. **Stops are added automatically** (decision 1): every active meeting point
   that lies on the way becomes a stop, in route order. A point is on the way
   when going through it adds at most 5% or 3 km to the direct distance,
   whichever is more. Because the operator places meeting points along the
   main routes, this gives a sensible list without the driver choosing.
3. The driver can **remove** any added stop they will not stop at, and **add**
   another active meeting point through search. An added point is inserted
   where it adds the least distance.
4. **Stop limit:** a trip can have at most the maximum number of stops,
   including start and end (8 today, features decision 6; see question 2). If
   more points lie on the way, the app adds them all and asks the driver to
   remove some before continuing.
5. **Order check** for stops the driver adds: the whole route may be at most
   1.5 times the direct distance from the first to the last stop. A stop that
   adds more than 20% or 20 km to the stretch between its neighbours shows a
   warning ("This stop adds 35 km"), but is allowed.
6. The driver stops only where someone gets on or off. Other stops are passed
   without stopping, so many stops do not slow the trip down.
7. A map shows the route through the stops, using the stored route lines of
   the legs.

### 3.5 Date and times

1. The driver picks the date and the departure time from the first stop.
   Departure must be at least 30 minutes from now and at most 60 days ahead
   (features decision 7).
2. Planned times at the other stops are prefilled from the legs' typical
   driving times, rounded to 5 minutes.
3. The driver can change any planned time. Each stretch must take at least 90%
   of its typical driving time, so plans never require speeding. A stretch more
   than 2 hours longer than typical shows a warning ("Planning a long break?").
4. All times are entered and shown in Iceland time. When the phone is set to
   another time zone, the screen says "Iceland time".
5. A driver cannot publish a trip that overlaps in time with another of their
   published trips.

### 3.6 Price level

Drivers do not edit segment prices one by one (decision 2,
[ADR 0012](../decisions/0012-trip-price-level.md)).

1. The price screen shows the whole-route price large ("A passenger for the
   whole route pays 5 800 kr") and the price of each stretch below it, read
   only.
2. One control sets the **price level** for the whole trip, in steps of 10%:
   from **Free** (0%) up to the highest level the cost-sharing cap allows
   (rule P4). The suggested level, 100%, is marked. Every price on the screen
   updates as the level changes.
3. The default is the level of the driver's previous trip, or 100% the first
   time.
4. If the driver offers more seats, the highest level falls; a level above it
   is lowered to it and the driver is told.
5. "Why is there a limit?" explains in two sentences that ShareRide is cost
   sharing, that a full car must not earn more than the cost of the trip, and
   links to the community rules.

### 3.7 Seats, booking mode and preferences

1. **Seats offered:** 1 to 8. Default: the number used on the driver's last
   trip, or 3 the first time. Offering no more seats than the car has is the
   driver's responsibility.
2. **Booking mode:** request and approval (default in the beta) or instant
   booking ([pricing and seats](../product/pricing-and-seats.md#booking-modes)).
3. **Preferences**, all prefilled from the driver's last trip:
   - Luggage per passenger: small bag only, one suitcase, or more by
     arrangement
   - Pets: no, ask me, yes
   - Smoking: no (default), or only during breaks outside the car
   - Child seat available: yes or no
   - Chat: quiet, some chat, chatty
4. **Note** to passengers: up to 500 characters. Phone numbers, email addresses
   and links are not allowed, with an explanation that contact happens in the
   app chat (features decision 8).

### 3.8 Review and publish

1. A summary shows the route on a map, stops and times, the price level and
   prices, seats, booking mode, car, preferences and note, each with "Edit".
2. "Publish" runs every check in section 4 again on the server and publishes
   the trip, or lists what must be fixed.
3. After publishing, the trip page opens with "Share" (a link to the trip on
   the web app) and "Post the return trip" (C6, spec 6).
4. Until published, the trip is a draft. Drafts are saved as the driver goes,
   listed under "My trips", and deleted 30 days after their last change, or
   when their departure has passed.

### 3.9 Errors and edge cases

- A stop is paused or retired by the operator while the trip is a draft: the
  draft drops it and tells the driver; the start or end must be chosen again.
- A meeting point on the way is activated while the trip is a draft: it is not
  added silently; the review screen offers it.
- Legs are missing for a pair (for example, just after a point was activated):
  the draft waits with "Working out distances…" and the server retries.
- The driver goes offline while building: the draft is kept on the phone and
  sent when the connection returns; publishing needs a connection.
- Rates or settings changed by the operator while drafting: the server's
  values at publish time win, and changes are shown before publishing.

## 4. Rules

Rules P1 to P5 and S1 to S5 in [pricing and seats](../product/pricing-and-seats.md)
apply. This spec adds:

| ID | Rule |
| -- | ---- |
| R3.1 | Publishing needs a verified phone number, the current terms accepted, a profile photo, a car (make, model and colour) and the driving licence declaration. |
| R3.2 | A trip has from 2 stops up to the stop limit, each an active meeting point in season on the trip date (spec 2, R2.4), each used once. |
| R3.3 | Meeting points on the way are added as stops automatically; the driver may remove them or add others. |
| R3.4 | The route is at most 1.5 times the direct distance between the first and last stops. |
| R3.5 | Departure is at least 30 minutes after publishing and at most 60 days ahead. |
| R3.6 | Planned times strictly increase, and each segment takes at least 90% of its typical driving time. |
| R3.7 | A driver's published trips do not overlap in time. |
| R3.8 | The driver sets one price level per trip, from 0% to the highest level the cap allows, in 10% steps. Segment prices are computed from it (rule P4) and never edited one by one. |
| R3.9 | Seats offered are between 1 and 8. |
| R3.10 | Notes contain no phone numbers, email addresses or links. |
| R3.11 | Drafts are deleted 30 days after their last change or once their departure has passed. |
| R3.12 | The number plate may be added after publishing, but by the planned departure at the latest. |

The "on the way" margin, the 1.5 route factor, the 90% time floor, the
30-minute minimum notice, the price level step, the 8-seat maximum and the
plate reminder times are settings the operator can change (feature H4).

## 5. Screens

Phone first. The same screens work in the web app in a centred column.

1. Ready to drive: the checklist (photo, car, licence)
2. Add or edit a car, including adding the plate later
3. Driving licence declaration
4. Route: from, to, the stops added along the way, map
5. Date and times
6. Price level, with the whole-route price and the price of each stretch
7. Seats, booking mode, car and preferences
8. Note
9. Review and publish
10. Published: share and post the return trip

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)):

- `Vehicle`: owner, make, model, colour, registration (optional until
  departure), `removed_at`. It no longer stores seats or a 4x4 flag.
- `User.licence_declared_at`: when the driver made the licence declaration.
- `Trip`, `TripStop` and `Segment` as in the domain model. `Trip.price_level`
  holds the driver's level. `Trip.preferences` holds luggage, pets, smoking,
  child seat and chat. Segments store the price, the cap and the suggested
  price at the time of publishing, so the operator can check that caps were
  respected.
- `Leg` gains a simplified route line (computed by the legs job in spec 2),
  used to draw routes and, later, to match weather warnings and road closures.

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `GET /me/driver-readiness` | What is still missing before publishing |
| `GET /me/vehicles`, `POST /me/vehicles` | List and add cars |
| `PATCH /me/vehicles/{id}`, `DELETE /me/vehicles/{id}` | Edit a car (including adding the plate) or remove it |
| `PUT /me/driver-licence-declaration` | Make the licence declaration |
| `GET /routes/stops-along?from=&to=` | Meeting points on the way, in route order |
| `POST /routes/quote` | For a list of stops, seats, a departure and a price level: distances, typical times, segment prices, the highest level and warnings |
| `POST /trips`, `PATCH /trips/{id}` | Create and update a draft |
| `POST /trips/{id}/publish` | Publish after all checks |
| `DELETE /trips/{id}` | Delete a draft |

Domain functions in `packages/domain`, free of I/O: suggested price, cap,
highest price level and segment prices from a level (P2 to P4); stops along
the way, insertion position and order check; time planning and checks; the
full publish validation returning every broken rule.

Events: `VehicleAdded`, `VehicleRemoved`, `LicenceDeclared`, `TripPublished`.

## 7. Privacy and safety

- The licence declaration stores only its date. No licence number, copy or
  kennitala is ever collected.
- The number plate is shown only to booked passengers.
- Trips start and end at meeting points, never at a home address. A published
  trip's route, times and the driver's public profile are visible to everyone,
  which is the purpose of the service. Retention follows the privacy inventory
  (trips and bookings).
- Notes cannot carry contact details (R3.10), which keeps contact in the app
  and protects both sides.
- The 90% time floor (R3.6) avoids plans that require speeding.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `driver.offerRide` | Offer a ride | Bjóða far |
| `driver.ready.title` | Before you publish | Áður en þú birtir |
| `vehicle.add` | Add a car | Bæta við bíl |
| `vehicle.registration` | Number plate | Bílnúmer |
| `vehicle.plateLater` | You can add the number plate later, before you set off. | Þú getur bætt bílnúmerinu við síðar, áður en þú leggur af stað. |
| `trip.plateComing` | The driver will add the number plate before departure | Ökumaðurinn bætir bílnúmerinu við fyrir brottför |
| `licence.declare` | I declare that I hold a valid driving licence for the cars I drive on ShareRide | Ég lýsi því yfir að ég sé með gilt ökuskírteini fyrir þá bíla sem ég ek á ShareRide |
| `trip.from` | From | Frá |
| `trip.to` | To | Til |
| `trip.stopsAdded` | We added the meeting points on your way. Remove any you won't stop at. | Við bættum við mótsstöðum á leiðinni. Fjarlægðu þá sem þú stoppar ekki á. |
| `trip.tooManyStops` | Remove stops until there are at most {max}. | Fjarlægðu viðkomustaði þar til þeir eru ekki fleiri en {max}. |
| `trip.stopAdds` | This stop adds {km} km | Þessi viðkomustaður bætir {km} km við |
| `trip.icelandTime` | Iceland time | Íslenskur tími |
| `trip.priceLevel` | Price level | Verðstig |
| `trip.priceLevel.free` | Free | Ókeypis |
| `trip.priceLevel.suggested` | Suggested | Ráðlagt |
| `trip.wholeRoutePrice` | A passenger for the whole route pays {price} | Farþegi alla leiðina greiðir {price} |
| `trip.whyLimit` | Why is there a limit? | Af hverju er hámark? |
| `trip.seatsOffered` | Seats offered | Sæti í boði |
| `trip.bookingMode.approval` | I approve each passenger | Ég samþykki hvern farþega |
| `trip.bookingMode.instant` | Instant booking | Bókun strax |
| `trip.noContactDetails` | Please don't share phone numbers, emails or links. Passengers can chat with you in the app once they book. | Vinsamlegast ekki deila símanúmerum, netföngum eða tenglum. Farþegar geta spjallað við þig í appinu þegar þeir hafa bókað. |
| `trip.publish` | Publish trip | Birta ferð |

## 9. Testing

- **Unit (domain), with property tests:** no segment price ever exceeds its
  cap; level 0% makes every segment free; prices never fall as the level
  rises; the highest level falls as seats rise; prices are multiples of the
  price step; the whole-route price equals the sum of segments; the worked
  example in pricing and seats (100% gives 5 800 kr, 80% gives 4 700 kr);
  stops along the way come out in route order; insertion and the order check;
  the stop limit; time planning and the 90% floor, including trips that pass
  midnight; overlap detection; every R3 rule reported by the publish
  validation.
- **API integration:** driver readiness, including the licence declaration;
  car rules (removal while used, plate added after publishing, plate
  reminders); quote and publish with a fixed distance
  table; the server rejecting a tampered price level above the highest level;
  overlapping trips; drafts cleaned up.
- **End to end:** a first-time driver sets up and publishes a trip; a returning
  driver publishes Reykjavík to Akureyri in under a minute, in Icelandic and
  English, on iOS, Android and web.
- **Manual:** time five beta drivers posting their usual trip; screen reader
  pass on the price level and time controls.

## 10. Out of scope

Editing, cancelling and managing published trips, and the return trip (spec
6), search and trip details (spec 4), booking and requests (spec 5), recurring
trips, vehicle register lookups, any licence check beyond the declaration,
weather and road warnings (later), and the actual values of the
suggested rate and reference cost (set in the console, feature H4, with the
legal opinion).

## Decisions

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Does the driver pick the stops along the way? | No. The app adds the meeting points on the way automatically; the driver can remove any (Martin, 2026-11-13) |
| 2 | Can the driver edit each segment's price? | No. One price level for the whole trip, from free up to the cap ([ADR 0012](../decisions/0012-trip-price-level.md); Martin, 2026-11-13) |
| 3 | How is the driving licence confirmed? | A declaration tick box only; no expiry date, no spot checks (Martin, 2026-11-13; replaces features decision 3) |
| 4 | When must the number plate be added? | At the latest before departure; it can be missing when the trip is published (Martin, 2026-11-13) |
| 5 | Does it matter who owns the car, for example a rental car? | No. The driver picks the make, model and colour; being allowed to use the car is the driver's responsibility, not ShareRide's (Martin, 2026-11-13) |

## Questions for Martin

| # | Question | Recommendation |
| - | -------- | -------------- |
| 1 | Who sees the car's make, model and colour? | Everyone viewing the trip, as it helps people recognise the car and choose a ride. The number plate stays visible only to booked passengers. This updates the privacy inventory |
| 2 | Now that stops are added automatically, should the stop limit rise from 8? | Yes, to 12 including start and end. The driver only stops where someone gets on or off, so more stops cost little time and give passengers more places to join |
