# Spec 6: Changes and cancellations

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved (2026-11-13)

Features: C5 Manage my trips, C6 Duplicate a trip or create the return trip,
D5 Cancel a booking ([features](../product/features.md)).
Related: [pricing and seats](../product/pricing-and-seats.md) (trip changes
after bookings exist, rules M2 and S5), [spec 3](2026-11-13-post-a-trip.md)
(posting), [spec 5](2026-11-13-booking-and-requests.md) (booking),
[spec 13](2026-11-13-payments.md) (refunds).

## 1. Problem and goal

Plans change: a driver leaves later, adds a stop or cannot go at all; a
passenger finds another ride. Changes must never leave someone waiting at a
meeting point without knowing, and money must follow fixed, simple rules:
cancel in time and get everything back.

Goal: drivers see and manage their trips with a clear view of who rides where,
change what the rules allow, and cancel with one action that refunds and tells
everyone. Passengers cancel from their booking and see the refund before they
confirm. Drivers repost a regular trip or its return in seconds.

## 2. User stories

- As a driver, I see each upcoming trip with who gets in and out where, and
  how many seats are free on each part.
- As a driver, I move my departure 20 minutes later and my passengers are told.
- As a driver, I add a stop on the way so another passenger can join.
- As a driver whose car broke down, I cancel the trip; everyone is refunded and
  told at once.
- As a passenger, I cancel the day before and see "Full refund" before I
  confirm.
- As a driver, I post next Friday's trip and the return on Sunday from last
  week's trip in a few taps.

## 3. Behaviour

### 3.1 My trips (driver)

1. **Upcoming:** drafts and published trips, soonest first, each with date,
   route, seats booked and free on each part, requests waiting, and expected
   earnings. **Past:** completed and cancelled trips, with payouts (spec 13).
2. **Seat view** for a trip: one row per segment, showing the seats taken and
   which passengers (first names and photos) are in the car on that stretch,
   with where each gets in and out. Pending requests and unpaid accepted
   bookings are shown as such.
3. From a trip: edit (3.2), cancel (3.3), cancel one booking (3.4), post again
   or post the return (3.6), and open each passenger's chat (spec 7).

### 3.2 Changing a published trip

What can change follows
[pricing and seats](../product/pricing-and-seats.md#trip-changes-after-bookings-exist):

| Change | Without bookings | With bookings |
| ------ | ---------------- | ------------- |
| Departure time | Any, within the 60-day window | Up to 30 minutes: passengers are told. More than 30 minutes: passengers are told and may cancel with a full refund, without it counting against them. Never more than 2 hours (decision 1) |
| Add a stop | Yes | Yes; existing bookings keep their price and stops |
| Remove a stop | Yes | Only if no booking gets in or out there; otherwise those bookings are cancelled first, by the passenger or the driver (full refund) |
| Seats offered | 1 to 8 | Down to the most seats taken on any segment, up to 8 |
| Price level | Yes | Yes; applies to new bookings only |
| Car | Yes | Yes; passengers are told the new car |
| Booking mode | Yes | Yes; pending requests stay open |
| Preferences and note | Yes | Yes; shown on the trip, no notification |

- Every planned time is shifted together when the departure moves; the time
  checks of spec 3 (R3.6) still apply.
- Nothing can be changed once the trip has departed.
- Each change is recorded with its time, so passengers can see "Departure
  changed from 08:00 to 08:20".
- If a change would break a rule, the app says which and why, before saving.

### 3.3 Cancelling a trip (driver)

1. "Cancel trip", then a reason: weather, road closed, car problem, illness,
   plans changed, other. An optional note is sent to the passengers.
2. The screen says how many passengers are affected and that each gets a full
   refund.
3. On confirming: every booking is cancelled with a full refund (rule M2),
   pending requests are declined, unpaid accepted bookings lapse, and everyone
   is told at once (spec 7; a cancellation within 24 hours of departure is
   also sent by SMS).
4. The cancellation counts on the driver's reliability, unless the reason is
   weather or a road closure (spec 8 decides how that is checked).

### 3.4 Cancelling one booking (driver)

The driver can cancel a single confirmed booking with a reason (for example the
passenger asked them to, or the car is smaller than planned). The passenger
gets a full refund and is told. It counts on the driver's reliability like a
trip cancellation, unless the passenger agreed in the chat and cancels it
themselves instead.

### 3.5 Cancelling a booking (passenger)

1. From the booking: "Cancel booking", then a reason: plans changed, found
   another ride, the trip changed, weather, other.
2. Before confirming, the screen shows the refund, worked out from rule M2:
   - "Full refund of {amount}" when it is 15 minutes or more before boarding,
     or the driver moved the departure by more than 30 minutes;
   - "No refund: less than 15 minutes before departure" otherwise.
   It also says whether the cancellation counts on their reliability: only
   when it is less than 24 hours before boarding (decision 2, rule R6.8).
3. On confirming: the seats are freed for others, the refund starts (spec 13),
   and the driver is told.
4. A request not yet accepted is withdrawn instead (spec 5), and an accepted
   but unpaid booking can be cancelled with nothing to refund; neither counts
   on reliability.

### 3.6 Post again and post the return trip (C6)

1. **Post again:** from any trip, opens the builder of spec 3 with the same
   stops, car, seats, price level, booking mode, preferences and note; the
   driver picks the new date and time.
2. **Post the return:** the same, with the stops in reverse order. Distances,
   typical times and prices are worked out again for the reverse direction,
   because legs are directional.
3. All of spec 3's checks apply before publishing; stops that are no longer
   active are dropped with a notice.

## 4. Rules

The trip-change table and rules M2 and S5 in
[pricing and seats](../product/pricing-and-seats.md) apply. This spec adds:

| ID | Rule |
| -- | ---- |
| R6.1 | A published trip cannot be changed after it departs. |
| R6.2 | When the departure moves, all planned times move together and must still meet R3.6. |
| R6.3 | A departure moved by more than 30 minutes lets each booked passenger cancel with a full refund, at any time before the new departure, without it counting on reliability. |
| R6.4 | When bookings exist, the departure cannot move by more than 2 hours, earlier or later, from the time the passengers booked (decision 1). A bigger change means cancelling the trip and posting a new one. |
| R6.5 | A stop where a booking gets in or out cannot be removed. |
| R6.6 | Cancelling a trip cancels every booking with a full refund, declines pending requests and lets unpaid accepted bookings lapse. |
| R6.7 | A cancellation records who cancelled, when, the reason and the refund. Weather and road-closure reasons do not count on reliability (spec 8 decides how they are checked). |
| R6.8 | A passenger cancellation counts on reliability only when it is made less than 24 hours before boarding. It never counts when the reason is weather or a road closure (checked as in spec 8), after the driver moved the departure by more than 30 minutes, or for a withdrawn request or an unpaid accepted booking. No-shows always count (spec 8) (decision 2). |
| R6.9 | Every change and cancellation is shown to the affected people with what changed. |

## 5. Screens

1. My trips: upcoming and past
2. Trip seat view
3. Edit trip, with the effect on passengers before saving
4. Cancel trip: reason, note, who is affected
5. Cancel one booking (driver)
6. Cancel booking (passenger): reason, refund and reliability before confirming
7. Trip changed (passenger): what changed, and "Keep my booking" or "Cancel
   with full refund" when the move is over 30 minutes
8. Post again and post the return (opens spec 3's builder)

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)):

- `TripChange`: trip, kind (time, stop added, stop removed, seats, price level,
  car, booking mode, details), before and after, changed at.
- `Booking` uses its cancellation fields (`cancelled_by`, `cancel_reason`,
  `cancelled_at`) plus `refund_amount` and `counts_on_reliability`.

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `GET /me/trips?when=upcoming\|past` | My trips as a driver |
| `GET /me/trips/{id}/seats` | Seat view |
| `PATCH /trips/{id}` | Change a published trip; returns the effect on passengers, or the rule it would break |
| `POST /trips/{id}/cancel` | Cancel a trip with a reason and note |
| `POST /bookings/{id}/cancel` | Cancel a booking, by the passenger or the driver |
| `GET /bookings/{id}/cancellation-preview` | The refund and reliability effect before confirming |
| `POST /trips/{id}/copy?reverse=` | Start a new draft from a trip, or its return |

Domain functions in `packages/domain`: validate a change against the bookings
and return its effect; the refund and reliability effect of a cancellation;
reverse a trip's stops.

Events: `TripChanged`, `TripCancelled`, `BookingCancelled` (with who, reason
and refund). Notifications for each come in spec 7; refunds in spec 13.

## 7. Privacy and safety

- The seat view shows booked passengers' first names and photos to the driver
  only; passengers do not see each other.
- Cancellation reasons are seen by the other party as the chosen reason and
  optional note only, and by the operator.
- Big changes and cancellations reach passengers by push, email and, close to
  departure, SMS, so nobody waits at a meeting point for a car that is not
  coming.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `myTrips.title` | My trips | Ferðirnar mínar |
| `myTrips.seatView` | Who rides where | Hver situr hvar |
| `trip.edit` | Edit trip | Breyta ferð |
| `trip.cancel` | Cancel trip | Hætta við ferð |
| `trip.cancelAffects` | {count, plural, one {# passenger gets} other {# passengers get}} a full refund and will be told now. | {count, plural, one {# farþegi fær} other {# farþegar fá}} fulla endurgreiðslu og fá að vita það strax. |
| `trip.changed` | Departure changed from {old} to {new} | Brottför breytt úr {old} í {new} |
| `trip.keepBooking` | Keep my booking | Halda bókuninni |
| `trip.cancelWithRefund` | Cancel with full refund | Afbóka með fullri endurgreiðslu |
| `booking.cancel` | Cancel booking | Afbóka |
| `booking.fullRefund` | Full refund of {amount} | Full endurgreiðsla, {amount} |
| `booking.noRefund` | No refund: less than 15 minutes before departure | Engin endurgreiðsla: innan við 15 mínútur í brottför |
| `booking.countsOnReliability` | This cancellation shows on your profile | Þessi afbókun sést á prófílnum þínum |
| `trip.postAgain` | Post again | Birta aftur |
| `trip.postReturn` | Post the return trip | Birta ferðina til baka |
| `cancelReason.weather` | Weather | Veður |
| `cancelReason.roadClosed` | Road closed | Vegur lokaður |
| `cancelReason.carProblem` | Car problem | Bilun í bíl |
| `cancelReason.illness` | Illness | Veikindi |
| `cancelReason.plansChanged` | Plans changed | Breyttar áætlanir |
| `cancelReason.other` | Other | Annað |

## 9. Testing

- **Unit (domain):** every row of the change table with and without bookings;
  moves of 30 minutes, just over 30, exactly 2 hours and just over 2 hours; adding a stop inside
  a booked stretch keeps bookings and occupancy right; removing a used stop is
  refused; seats lowered to the highest occupancy and no further; the refund
  and reliability effect of each cancellation case, including exactly 15
  minutes and exactly 24 hours before boarding; reversing stops.
- **Property tests:** after any sequence of allowed changes, bookings keep
  their stops, prices and the capacity invariant.
- **API integration:** cancelling a trip refunds every paid booking once and
  declines requests; a cancellation during a payment window; a change and a
  booking at the same moment; the preview matches what confirming does.
- **End to end:** driver moves a trip by 45 minutes and a passenger cancels
  with a full refund; driver cancels a trip with three passengers; passenger
  cancels in time and late; post the return trip.
- **Manual:** screen reader pass on the seat view and the cancel screens.

## 10. Out of scope

Notification delivery (spec 7), no-shows, trip day and how reliability is
calculated and shown (spec 8), reports about cancellations (spec 9), recurring
trips (after the MVP), and automatic weather or road-closure checks (later;
spec 8 covers the beta).

## Decisions

Accepted by Martin on 2026-11-13 as recommended.

| # | Question | Decision |
| - | -------- | -------- |
| 1 | How far can a driver move the departure once people have booked? | Up to 2 hours, earlier or later. A bigger change is really a different trip: the driver cancels (everyone refunded) and posts a new one |
| 2 | Which passenger cancellations count on their reliability? | Only those in the last 24 hours before boarding, and no-shows. Never weather or road-closure cancellations, or cancellations after the driver moved the trip by more than 30 minutes |
