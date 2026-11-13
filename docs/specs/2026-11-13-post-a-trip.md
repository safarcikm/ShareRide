# Spec 3: Driver setup and posting a trip with prices

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Draft for review

Features: A3 Driver setup, C1 Post a trip, C2 Segment prices, C3 Seats and
booking mode, C4 Trip preferences and notes ([features](../product/features.md)).
Related: [pricing and seats](../product/pricing-and-seats.md) (source of truth
for prices and seats), [domain model](../architecture/domain-model.md),
[ADR 0006](../decisions/0006-meeting-points-and-segment-pricing.md),
[spec 1](2026-11-13-sign-in-and-profile.md),
[spec 2](2026-11-13-meeting-points.md).

## 1. Problem and goal

Passengers only find rides if drivers post them, and drivers only post if it
is quick. A driver who already drives Reykjavík to Akureyri should be able to
offer the empty seats in under a minute, with fair prices worked out for them
and a clear limit that keeps the trip cost sharing.

Goal: a driver sets up once (photo, car, licence), then posts a trip by
choosing where they start and end, picking stops along the way, and confirming
a date, prefilled times, prices, seats and preferences.

## 2. User stories

- As a new driver, I add my car and confirm my licence once, so every later
  trip is quick to post.
- As a driver, I choose Reykjavík (BSÍ) to Akureyri and the app offers the
  meeting points on the way, so I can pick up people along the route.
- As a driver, I see a suggested price for each part of the trip and can
  change it within a limit, so I cover my costs without guessing.
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
3. At least one vehicle (3.2).
4. A driving licence declaration (3.3).

### 3.2 Vehicles

- Fields: make (from a list, or "Other"), model, colour (from a list),
  passenger seats (1 to 8, not counting the driver), registration number, and
  whether it is a 4x4.
- The registration number is stored in capitals without spaces or hyphens,
  2 to 8 letters and digits, and shown only to booked passengers. What the rest
  of the vehicle shows publicly is question 1.
- A driver can have several vehicles and chooses one per trip; the last used
  is preselected.
- A vehicle used by a future trip cannot be removed until that trip uses
  another vehicle or ends. Removed vehicles stay on past trips.

### 3.3 Driving licence

Following the features decision 3 (self-declaration plus spot checks in the
beta):

1. The driver confirms "I hold a valid driving licence for this car" and
   enters the licence's country of issue and expiry date.
2. A trip can only be published if the licence is valid on the trip date. The
   app reminds the driver 30 days before the expiry date.
3. **Spot checks:** the operator can ask a driver to show their licence on a
   short video call or in person. Only the date, the operator and the result
   are recorded; no copy, photo or licence number is stored, because Icelandic
   licences show the kennitala.
4. A failed check, or no answer within 7 days, stops the driver from
   publishing until resolved. Published trips are handled by the operator
   (spec 9).

### 3.4 Building the route

1. **From** and **To**: the place search from spec 2. Choosing a town offers
   its nearest meeting points.
2. **Stops along the way:** the app lists active meeting points that lie on the
   way, using the leg distances (a point is "on the way" when going through it
   adds at most 10% or 5 km to the direct distance, whichever is more). They
   are listed in route order with the detour in minutes; the driver ticks the
   ones they will stop at. Up to 8 stops including start and end
   (features decision 6).
3. The driver can also add any other active meeting point through search. The
   app inserts it where it adds the least distance, and the driver can reorder
   stops.
4. **Order check:** the whole route may be at most 1.5 times the direct
   distance from the first to the last stop. A stop that adds more than 20% or
   20 km to the stretch between its neighbours shows a warning ("This stop adds
   35 km"), but is allowed.
5. A map shows the route through the stops, using the stored route lines of
   the legs.

### 3.5 Date and times

1. The driver picks the date and the departure time from the first stop.
   Departure must be at least 30 minutes from now and at most 60 days ahead
   (features decision 7).
2. Planned times at the other stops are prefilled from the legs' typical
   driving times, plus 5 minutes at each intermediate stop.
3. The driver can change any planned time. Each stretch must take at least 90%
   of its typical driving time, so plans never require speeding. A stretch more
   than 2 hours longer than typical shows a warning ("Planning a long break?").
4. All times are entered and shown in Iceland time. When the phone is set to
   another time zone, the screen says "Iceland time".
5. A driver cannot publish a trip that overlaps in time with another of their
   published trips.

### 3.6 Prices

1. Each segment shows its suggested price (rule P2) and can be changed with
   minus and plus buttons in steps of 100 kr (the price step), from 0 up to the
   cap (rule P3). Free segments are allowed.
2. The suggested price is never above the cap. If the driver offers more
   seats, the cap falls; any price above the new cap is lowered to it and the
   driver is told.
3. Below the segments: "A passenger for the whole route pays 5 800 kr".
4. "Why is there a limit?" explains in two sentences that ShareRide is cost
   sharing, that a full car must not earn more than the cost of the trip, and
   links to the community rules.
5. "Reset to suggested" restores all suggested prices.

### 3.7 Seats, booking mode and preferences

1. **Seats offered:** 1 up to the vehicle's passenger seats. Default: the
   number used on the driver's last trip, or 3 (or fewer if the car has fewer
   seats) the first time.
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

1. A summary shows the route on a map, stops and times, prices, seats, booking
   mode, vehicle, preferences and note, each with "Edit".
2. "Publish" runs every check in section 4 again on the server and publishes
   the trip, or lists what must be fixed.
3. After publishing, the trip page opens with "Share" (a link to the trip on
   the web app) and "Post the return trip" (C6, spec 6).
4. Until published, the trip is a draft. Drafts are saved as the driver goes,
   listed under "My trips", and deleted 30 days after their last change, or
   when their departure has passed.

### 3.9 Errors and edge cases

- A stop is paused or retired by the operator while the trip is a draft: the
  draft shows it and asks the driver to choose another stop.
- Legs are missing for a pair (for example, just after a point was activated):
  the draft waits with "Working out distances…" and the server retries.
- The driver goes offline while building: the draft is kept on the phone and
  sent when the connection returns; publishing needs a connection.
- Prices or settings changed by the operator while drafting: the server's
  values at publish time win, and changes are shown before publishing.

## 4. Rules

Rules P1 to P5 and S1 to S5 in [pricing and seats](../product/pricing-and-seats.md)
apply. This spec adds:

| ID | Rule |
| -- | ---- |
| R3.1 | Publishing needs a verified phone number, the current terms accepted, a profile photo, a vehicle and a licence valid on the trip date, with no open failed spot check. |
| R3.2 | A trip has 2 to 8 stops, each an active meeting point in season on the trip date (spec 2, R2.4), each used once. |
| R3.3 | The route is at most 1.5 times the direct distance between the first and last stops. |
| R3.4 | Departure is at least 30 minutes after publishing and at most 60 days ahead. |
| R3.5 | Planned times strictly increase, and each segment takes at least 90% of its typical driving time. |
| R3.6 | A driver's published trips do not overlap in time. |
| R3.7 | Segment prices are multiples of the price step, from 0 up to the cap. The suggested price is the lower of rule P2 and the cap. |
| R3.8 | Seats offered are between 1 and the vehicle's passenger seats. |
| R3.9 | Notes contain no phone numbers, email addresses or links. |
| R3.10 | Drafts are deleted 30 days after their last change or once their departure has passed. |

The 10% or 5 km "on the way" margin, the 1.5 route factor, the 90% time floor,
the 30-minute minimum notice and the 30-day licence reminder are settings the
operator can change (feature H4).

## 5. Screens

Phone first. The same screens work in the web app in a centred column.

1. Ready to drive: the checklist (photo, vehicle, licence)
2. Add or edit a vehicle
3. Driving licence declaration
4. Route: from, to, stops along the way, map
5. Date and times
6. Prices
7. Seats, booking mode, vehicle and preferences
8. Note
9. Review and publish
10. Published: share and post the return trip
11. Console: a driver's licence declaration and spot check history, and
    "Record a spot check"

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)):

- `Vehicle` as in the domain model (`seats` counts passenger seats), plus
  `removed_at`.
- `DriverLicence`: user, country of issue, expiry date, declared at.
- `LicenceSpotCheck`: user, requested at, checked at, operator, result
  (passed, failed, no answer), note.
- `Trip`, `TripStop` and `Segment` as in the domain model. `Trip.preferences`
  holds luggage, pets, smoking, child seat and chat. Segments store the price,
  the cap and the suggested price at the time of publishing, so the operator
  can check that caps were respected.
- `Leg` gains a simplified route line (computed by the legs job in spec 2), used
  to draw routes and, later, to match weather warnings and road closures.

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `GET /me/driver-readiness` | What is still missing before publishing |
| `GET /me/vehicles`, `POST /me/vehicles` | List and add vehicles |
| `PATCH /me/vehicles/{id}`, `DELETE /me/vehicles/{id}` | Edit or remove a vehicle |
| `PUT /me/driver-licence` | Declare or update the licence |
| `GET /routes/stops-along?from=&to=` | Meeting points on the way, in order, with detours |
| `POST /routes/quote` | For a list of stops, a capacity and a departure: distances, typical times, suggested prices, caps and warnings |
| `POST /trips`, `PATCH /trips/{id}` | Create and update a draft |
| `POST /trips/{id}/publish` | Publish after all checks |
| `DELETE /trips/{id}` | Delete a draft |

Console endpoints under `/admin/v1`: view a driver's licence declaration and
spot checks, request and record a spot check.

Domain functions in `packages/domain`, free of I/O: suggested price and cap
(P2, P3), stops along the way, insertion position and order check, time
planning and checks, the full publish validation returning every broken rule.

Events: `VehicleAdded`, `VehicleRemoved`, `LicenceDeclared`,
`LicenceSpotChecked`, `TripPublished`.

## 7. Privacy and safety

- The licence declaration stores only the country of issue and expiry date.
  Spot checks store no copy of the licence and no licence number or kennitala.
- The registration number is shown only to booked passengers.
- Trips start and end at meeting points, never at a home address. A published
  trip's route, times and the driver's public profile are visible to everyone,
  which is the purpose of the service. Retention follows the privacy inventory
  (trips and bookings).
- Notes cannot carry contact details (R3.9), which keeps contact in the app
  and protects both sides.
- The 90% time floor (R3.5) avoids plans that require speeding, and the
  4x4 flag helps passengers in winter.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `driver.offerRide` | Offer a ride | Bjóða far |
| `driver.ready.title` | Before you publish | Áður en þú birtir |
| `vehicle.add` | Add a car | Bæta við bíl |
| `vehicle.seats` | Passenger seats | Farþegasæti |
| `vehicle.registration` | Registration number | Bílnúmer |
| `licence.confirm` | I hold a valid driving licence for this car | Ég er með gilt ökuskírteini fyrir þennan bíl |
| `licence.expiry` | Licence expiry date | Gildistími ökuskírteinis |
| `trip.from` | From | Frá |
| `trip.to` | To | Til |
| `trip.stopsAlong` | Stops along the way | Viðkomustaðir á leiðinni |
| `trip.stopAdds` | This stop adds {km} km | Þessi viðkomustaður bætir {km} km við |
| `trip.icelandTime` | Iceland time | Íslenskur tími |
| `trip.wholeRoutePrice` | A passenger for the whole route pays {price} | Farþegi alla leiðina greiðir {price} |
| `trip.whyLimit` | Why is there a limit? | Af hverju er hámark? |
| `trip.resetPrices` | Reset to suggested | Nota ráðlögð verð |
| `trip.seatsOffered` | Seats offered | Sæti í boði |
| `trip.bookingMode.approval` | I approve each passenger | Ég samþykki hvern farþega |
| `trip.bookingMode.instant` | Instant booking | Bókun strax |
| `trip.noContactDetails` | Please don't share phone numbers, emails or links. Passengers can chat with you in the app once they book. | Vinsamlegast ekki deila símanúmerum, netföngum eða tenglum. Farþegar geta spjallað við þig í appinu þegar þeir hafa bókað. |
| `trip.publish` | Publish trip | Birta ferð |

## 9. Testing

- **Unit (domain), with property tests:** the suggested price never exceeds
  the cap; the cap falls as seats rise; prices are multiples of the step; the
  whole-route price equals the sum of segments; stops along the way and
  insertion keep the route order; the order check; time planning and the 90%
  floor, including trips that pass midnight; overlap detection; every R3 rule
  reported by the publish validation.
- **API integration:** driver readiness; vehicle rules (removal while used);
  licence expiry before the trip date; quote and publish with a fixed distance
  table; server checks rejecting tampered prices above the cap; overlapping
  trips; drafts cleaned up.
- **End to end:** a first-time driver sets up and publishes a trip; a returning
  driver publishes Reykjavík to Akureyri with two stops in under a minute, in
  Icelandic and English, on iOS, Android and web.
- **Manual:** time five beta drivers posting their usual trip; screen reader
  pass on the price and time controls.

## 10. Out of scope

Editing, cancelling and managing published trips, and the return trip (spec
6), search and trip details (spec 4), booking and requests (spec 5),
recurring trips, vehicle register lookups, a stronger licence check before
public launch, weather and road warnings (later), and the actual values of the
suggested rate and reference cost (set in the console, feature H4, with the
legal opinion).

## Questions for Martin

| # | Question | Recommendation |
| - | -------- | -------------- |
| 1 | Who sees the car's make, model, colour and 4x4 flag? | Everyone viewing the trip, as it helps people choose (a 4x4 in winter, a bigger car for luggage). The registration number stays visible only to booked passengers. This updates the privacy inventory |
| 2 | Can drivers use rental cars in the beta? | No. Rental agreements commonly forbid carrying passengers for payment. Add it to the questions for the lawyer and revisit before launch |
