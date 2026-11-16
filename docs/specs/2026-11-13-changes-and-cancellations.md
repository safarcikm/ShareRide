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

As built (milestone 6, PR 5a, the departure; PR 5b, the seats, price
level, booking mode, preferences and note; PR 5c, the car; PR 6a adds a
stop):

1. "Edit trip" sits just before "Cancel trip" on the driver's trip page,
   until the planned departure (R6.1). It opens Edit trip, a row for each
   part of the trip with a link to change it, the first being the time: the
   day and every stop's time, and "Change the time".
2. Change the departure gives the date and the departure; every stop moves
   with it, and the screen shows their new times (R6.2). With a booking or
   a request on the trip, it says the departure can move by up to 2 hours
   from when the passengers booked. "Check the change" asks the server
   without saving, and says under the time which rule the move breaks: the
   departure it has now, too soon or too far ahead (R3.5), another trip of
   the driver's (R3.7), a stop out of season, or more than 2 hours from when
   a booking was made (R6.4), giving the departures the bookings allow.
3. The check shows "Departure changed from {old} to {new}", the new times,
   and what changes for passengers: how many are told (accepted and
   confirmed bookings), how many of those who paid may now cancel with a
   full refund, without it counting (moved more than 30 minutes from the
   departure when they booked, R6.3), how many who asked for a seat see the
   new time in the app, and any request the move makes expire (item 6).
   "Save the change" saves it under the
   same checks, as of that moment, and the trip page says "Trip changed.
   Your passengers have been told." with focus.
4. Each move is recorded with its time. A passenger reads "Departure changed
   from 10:00 to 10:45" at their own boarding stop, on the booking under
   "Changes since you booked" and in the chat. Push and email say the same,
   with the part and the new time; for a paid booking moved more than 30
   minutes they add that it can be kept or cancelled with a full refund,
   and an SMS says so too when the old or the new boarding time is less
   than 24 hours away (spec 7, 3.4). A request is not told (spec 7, 3.3).
   A booking that ended shows only the moves made while it held seats.
5. After a move of more than 30 minutes, a paid booking offers "Keep my
   booking", which hides the offer on that device until the trip moves
   again, and "Cancel with full refund" ("Cancel booking" for a free ride),
   which opens the cancel screen with "The trip changed" chosen. A booking
   not yet paid costs nothing to cancel, so it is not offered the choice.
6. What hangs on the times follows the move: a request's deadline to answer
   and an accepted booking's deadline to pay are worked out again from the
   new boarding time (R5.5, rule M1), and a request whose new deadline has
   passed expires. The driver's halfway reminder, the pay reminder and the
   trip reminders move too; one already sent is not sent again (R7.11).
7. A published trip changes through `POST /trips/{id}/changes`, one change
   at a time, with `?preview=true` for the check; a draft keeps `PATCH`.
   A change that breaks a rule is refused with each rule named; from the
   planned departure on, or once cancelled, nothing changes.
8. Edit trip also has the price, the seats, how people book, and the
   preferences and note, each with a link to its own screen. Nobody is
   told of these (spec 7, 3.3), so each screen says what the change means
   and "Save the change" saves it there; the trip page then says "Trip
   changed." with focus. Saving what the trip already has says "This is
   what the trip has now. Change something first." and saves nothing.
9. The price: the level control with each stretch's new price, worked out
   on the phone by the rules publishing uses (P3, P4) from the stretches'
   distances. It is for new bookings: bookings keep the price they booked
   at (P1).
10. The seats: no fewer than are taken on any stretch, requests counting
    (S5), up to 8, and the screen says how many are taken. More seats can
    lower the price level to the highest they allow, which the screen says
    before saving; each stretch's cap and price for new bookings follow.
11. How people book: requests already waiting for an answer stay open,
    and the screen says how many.
12. The preferences and note change together. Passengers see them on the
    trip, with no notification and no line in the chat. The note never
    holds contact details (R3.10), checked on the phone and on the server.
13. Each of these is recorded with its time, as a move is, for the
    operator to answer questions about what the trip offered and when; for
    the note, only whether it changed, not its text. "Changes since you
    booked" lists only the moves, new cars and stops added or removed, as the rest shows
    on the trip as it is now. The change's effect also gives the seats, the price
    level, whether more seats lowered it, and each stretch's price for new
    bookings.
14. The car: Edit trip shows it ("Toyota Yaris, white") with "Change the
    car", which lists the driver's cars to choose from, with "Add a car",
    which comes back to the list. The screen says that passengers who
    booked are told when it is saved. Only a car of the driver's that is
    not removed can be chosen (`car_missing` otherwise); the car the trip
    has stays, even once removed. Saving another car records it, before
    and after, by make, model and colour; each accepted or confirmed
    booking reads "New car: Red Volvo XC40" under "Changes since you
    booked" and in the chat, and is told by push and email (spec 7, 3.3),
    never by SMS. A request is not told; it sees the new car in the app,
    on the trip and under "Changes since you booked", as it sees a move.
    A new car does not bring back "Keep my booking" after a move. The
    number plate is never in the line, the push or the email (R7.9).
15. A stop: Edit trip lists the stops ("BSÍ → Borgarnes → Akureyri") with
    "Add a stop", which opens the meeting point search. The server places
    the stop where it adds the least distance, never before the first stop
    or after the last, at a time between its neighbours from the typical
    times of the two new stretches, rounded to 5 minutes where that fits
    and to the minute otherwise; every other stop keeps its time. The
    check shows "New stop: Mosfellsbær at 09:20", the new times, the two
    new stretches' prices for new bookings (from the trip's price level,
    capped as when posting), and who is told. It refuses, naming the
    stop: one already on the trip, one paused or out of season, one that
    makes the route more than 1.5 times the direct way (R3.4), or one too
    far out of the way to fit between its neighbours, which keep their
    times (R3.6; moving the departure cannot help, as every stop moves
    with it). A meeting point whose road distances are still being worked
    out says so, with "Try again".
16. Saving splits the stretch the stop lands on in two. Both keep its
    seats taken and its seats, since every booking over it rides both;
    each booking over it keeps its stops and total, its price for the old
    stretch shared between the new ones by their distances, rounded so
    the sum stays the same (P1). Stretches and booking prices after it
    are renumbered in the same transaction. The change is recorded with
    the stop's name and time; each accepted or confirmed booking reads
    "New stop: Mosfellsbær at 09:20" under "Changes since you booked" and
    in the chat, and is told by push and email, never by SMS. A request
    is not told; it sees the stop in the app. Search finds the trip from
    the new stop at once.
17. A part chosen on the trip is kept with its meeting points as well as
    its positions, through signing up and on to booking, which sends
    both. When a stop was added since, they no longer match: the booking
    screen says the driver changed the stops and to choose again from the
    trip, and the server refuses such a booking with `stops_changed`.
18. Removing a stop: with more than two stops, the Stops row also has
    "Remove a stop", which lists the stops between the ends, each with its
    time. Only those can go: the first and last make the trip, and
    changing them is cancelling it and posting a new one (`stop_at_end`).
    A stop where a booking or a request gets in or out cannot go
    (`stop_in_use`, R6.5); the screen says how many and to cancel or
    decline them from the trip first, or ask them to cancel. The joined
    stretch takes the road distance and typical time past the stop, and
    must leave at least 90% of that time between its neighbours, which
    keep their times (`stretch_too_fast`, R3.6). The check shows "Stop
    removed: Borgarnes", the new times, the joined stretch's price for
    new bookings, and who is told.
19. Saving joins the two stretches into one, with the higher of their
    seats taken. Each booking over both keeps its stops and its total: its
    two prices are added into one (P1). Stretches and booking prices after
    it are renumbered in the same transaction. The stop stays on the trip,
    marked removed, for bookings that once got in or out there and still
    name it, and leaves every list of the trip's stops, search included;
    it can be added again. The change is recorded with the stop's name
    and planned time; each accepted or confirmed booking reads "Stop
    removed: Borgarnes" under "Changes since you booked" and in the chat,
    and is told by push and email, never by SMS. A request is not told;
    it sees the change in the app. A part chosen on the trip before the
    stop went no longer matches, as in item 17.

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

As built (milestone 6, PR 4b):

1. "Cancel trip" is the last thing on the driver's trip page, until the
   planned departure (R6.1): from then on, what happens is the trip day's
   (spec 8). It opens its own screen: the reasons, then how many paid and
   get a full refund, and how many more with a booking or request (not yet
   accepted or paid, or a free ride) are told; nobody, when nobody booked.
2. It shows on the driver's profile, once for the trip and not for each
   booking, only when a booking on it is confirmed (paid, or a free ride)
   and the reason is not weather or a road closure. The screen works it out
   with the domain, as the server does, and sends what it showed: if
   someone paid or left meanwhile, the server cancels nothing and the
   screen shows it again, keeping the reason and the note.
3. The note follows the same rules as for one booking (3.4): up to 500
   characters, without contact details, shown in the app only. Each
   passenger reads "{driver} cancelled the trip: {reason}" with the note, on
   the booking and in the chat; a request declined this way says the same.
   Push and email give the reason and the refund; an SMS within 24 hours of
   boarding gives only the day, the time and whether it is refunded.
4. Accepted bookings not yet paid are cancelled with nothing to refund
   ("lapse" in R6.6), so the passenger reads why, like everyone else.
5. Asked again, as a retry is, the answer is the same trip, and nobody is
   refunded or told twice. The trip then says it is cancelled, with focus,
   and offers nothing more. It is listed under Past in My rides at once
   (3.1), marked Cancelled with the reason. A booking the driver cancelled
   alone before keeps its own reason.

### 3.4 Cancelling one booking (driver)

The driver can cancel a single confirmed booking with a reason (for example the
passenger asked them to, or the car is smaller than planned). The passenger
gets a full refund and is told. It counts on the driver's reliability like a
trip cancellation, unless the passenger agreed in the chat and cancels it
themselves instead.

As built (milestone 6, PR 4):

1. "Cancel booking" shows under each passenger on the driver's trip page,
   after their chat, until the planned time at their boarding stop, as for
   the passenger (decision 3, confirmed for the driver by Martin on
   2026-11-16). A booking accepted and waiting for payment
   can be cancelled too: there is nothing to refund and it never counts.
2. The driver's own screen gives the reasons, the refund in the passenger's
   name, whether it shows on the driver's profile for the reason chosen
   (never for weather or a road closure), and an optional note to the
   passenger of up to 500 characters, without contact details, as for a
   trip's note (R3.10).
3. The passenger sees the reason and the note on the booking and in the
   chat. Push and email give the reason and the refund; an SMS, within 24
   hours of boarding and at most 5 a day (spec 7, 3.4 and R7.10), says only
   that the driver cancelled, the day and time, and whether it is refunded.
   The note never leaves the app.

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
5. A booking can be cancelled until the planned time at the boarding stop.
   After that, what happens belongs to the trip day (spec 8): a passenger who
   did not come is a no-show, and a driver who did not come is reported.

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
  car, booking mode, details), before and after, changed at. As built
  (PR 5a): `trip_changes` with the kinds `departure`, `seats`, `priceLevel`,
  `vehicle`, `bookingMode` and `details`, `addStop` (PR 6a) and
  `removeStop` (PR 6b). PR 5b
  records the seats with the price level they left, the price level, the
  booking mode, and the preferences, each before and after, with whether
  the note changed (not its text). PR 5c records the car by its ID, make,
  model and colour, never its number plate. PR 6a records a new stop by
  its meeting point's ID and names and its planned time; PR 6b records a
  removed stop the same way, as it was.
- `TripStop` gains `removed_at` (PR 6b): a removed stop stays for the
  bookings that name it, and only the stops not removed hold the trip's
  positions and meeting points uniquely.
- `Booking` uses its cancellation fields (`cancelled_by`, `cancel_reason`,
  `cancel_note`, `cancelled_at`) plus `refund_amount`,
  `counts_on_reliability` and `departs_at_when_booked`.

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `GET /me/trips?when=upcoming\|past` | My trips as a driver |
| `GET /me/trips/{id}/seats` | Seat view |
| `POST /trips/{id}/changes?preview=` | Change a published trip, one change at a time; returns the effect on passengers, or the rules it would break (as built; `PATCH /trips/{id}` stays for drafts) |
| `POST /trips/{id}/cancel` | Cancel a trip with a reason and note |
| `POST /bookings/{id}/cancel` | Cancel a booking, by the passenger or the driver |
| `GET /bookings/{id}/cancellation-preview` | The refund and reliability effect before confirming |
| `POST /trips/{id}/copy?reverse=` | Start a new draft from a trip, or its return |

Domain functions in `packages/domain`: validate a change against the bookings
and return its effect; the refund and reliability effect of a cancellation;
reverse a trip's stops.

Events: `DepartureMoved` (the booking and the recorded change, as built in
PR 5a), `TripChanged` (a new car, or a stop added or removed: the booking
and the recorded change, as built in PR 5c, 6a and 6b), `TripCancelled`, `BookingCancelled` (the booking and
who cancelled; the reason and refund are read from the booking, as events hold
IDs only). Notifications for each come in spec 7; refunds in spec 13.

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
| `trip.cancelTitle` | Cancel your trip | Hætta við ferðina |
| `trip.cancelWhy` | Why are you cancelling? | Af hverju hættirðu við ferðina? |
| `trip.cancelAffects` | {count, plural, one {# passenger gets} other {# passengers get}} a full refund and will be told now. | {count, plural, one {# farþegi fær fulla endurgreiðslu og fær} other {# farþegar fá fulla endurgreiðslu og fá}} að vita það strax. |
| `trip.cancelAlsoTold` | {count, plural, one {# more person with a booking or request is} other {# more people with a booking or request are}} told too. | {count, plural, one {# í viðbót með bókun eða beiðni fær} other {# í viðbót með bókun eða beiðni fá}} líka að vita það. |
| `trip.cancelTold` | {count, plural, one {# person with a booking or request will} other {# people with a booking or request will}} be told now. | {count, plural, one {# með bókun eða beiðni fær} other {# með bókun eða beiðni fá}} að vita það strax. |
| `trip.cancelNobody` | Nobody has booked this trip, so nobody needs to be told. | Enginn hefur bókað þessa ferð svo enginn þarf að fá að vita það. |
| `trip.cancelCounts` | This cancellation shows on your profile | Að hætta við ferðina sést á prófílnum þínum |
| `trip.cancelNote` | Note to passengers (optional) | Skilaboð til farþega (valfrjálst) |
| `trip.cancelNoteHelp` | Up to {max} characters, without phone numbers or links. Everyone on the trip sees it with your reason. | Allt að {max} stafir, án símanúmera eða tengla. Allir í ferðinni sjá þau með ástæðunni. |
| `trip.keep` | Keep the trip | Halda ferðinni |
| `trip.notCancellable` | This trip can no longer be cancelled. | Ekki er lengur hægt að hætta við þessa ferð. |
| `trip.termsChanged` | Something changed since you opened this. Check who is affected again. | Eitthvað breyttist síðan þú opnaðir þetta. Athugaðu aftur hverjir verða fyrir áhrifum. |
| `driverTrip.cancelledTrip` | You cancelled this trip: {reason} | Þú hættir við þessa ferð: {reason} |
| `driverTrip.yourNote` | Your note: {note} | Skilaboðin þín: {note} |
| `booking.tripCancelledBy` | {name} cancelled the trip: {reason} | {name} hætti við ferðina: {reason} |
| `chat.tripCancelledByMe` | You cancelled the trip: {reason} | Þú hættir við ferðina: {reason} |
| `chat.tripCancelledByThem` | {name} cancelled the trip: {reason} | {name} hætti við ferðina: {reason} |
| `notify.tripCancelled` | Trip cancelled: {reason} | Ferð aflýst: {reason} |
| `sms.tripCancelled` | ShareRide: your trip on {date} at {time} is cancelled. Full refund. Details in the app. | ShareRide: Ferðinni þinni var aflýst: {date} kl. {time}. Full endurgreiðsla. Nánar í appinu. |
| `sms.tripCancelledUnpaid` | ShareRide: your trip on {date} at {time} is cancelled. Details in the app. | ShareRide: Ferðinni þinni var aflýst: {date} kl. {time}. Nánar í appinu. |
| `trip.changed` | Departure changed from {old} to {new} | Brottför breytt úr {old} í {new} |
| `trip.keepBooking` | Keep my booking | Halda bókuninni |
| `trip.cancelWithRefund` | Cancel with full refund | Afbóka með fullri endurgreiðslu |
| `trip.editIntro` | Change one thing at a time. Before you save, you see what it means for your passengers. | Breyttu einu í einu. Áður en þú vistar sérðu hvað það þýðir fyrir farþegana. |
| `trip.editTime` | Time | Tími |
| `trip.editTimeAction` | Change the time | Breyta tímanum |
| `trip.editTimeTitle` | Change the departure | Breyta brottför |
| `trip.editTimeIntro` | Every stop moves with the departure. | Allir viðkomustaðir færast með brottförinni. |
| `trip.editTimeBooked` | With bookings, the departure can move by up to 2 hours from the time your passengers booked. | Þegar bókanir eru komnar má færa brottförina um allt að 2 klukkustundir frá þeim tíma sem farþegarnir bókuðu. |
| `trip.editTimeSame` | This is the departure the trip has now. Choose another time. | Ferðin fer nú þegar á þessum tíma. Veldu annan tíma. |
| `trip.editCheck` | Check the change | Skoða breytinguna |
| `trip.editReviewTitle` | Check the change | Skoðaðu breytinguna |
| `trip.editNewTimes` | New times | Nýir tímar |
| `trip.editForPassengers` | What changes for passengers | Hvað breytist fyrir farþegana |
| `trip.editTold` | {count, plural, one {# passenger is} other {# passengers are}} told the new time now. | {count, plural, one {# farþegi fær} other {# farþegar fá}} að vita af nýja tímanum strax. |
| `trip.editFreeCancel` | It moves more than 30 minutes from when they booked, so {count, plural, one {# passenger} other {# passengers}} can cancel with a full refund, without it counting against them. | Brottförin færist um meira en 30 mínútur frá því þeir bókuðu svo {count, plural, one {# farþegi getur} other {# farþegar geta}} afbókað með fullri endurgreiðslu án þess að það telji gegn þeim. |
| `trip.editNobody` | Nobody has booked yet, so nobody needs to be told. | Enginn hefur bókað enn svo enginn þarf að fá að vita það. |
| `trip.editRequests` | {count, plural, one {# person who asked for a seat sees} other {# people who asked for a seat see}} the new time in the app. | {count, plural, one {# sem bað um sæti sér} other {# sem báðu um sæti sjá}} nýja tímann í appinu. |
| `trip.editRequestsExpire` | {count, plural, one {# request} other {# requests}} can no longer be answered in time, so {count, plural, one {it expires} other {they expire}}. | Ekki er lengur hægt að svara {count, plural, one {# beiðni} other {# beiðnum}} í tæka tíð svo {count, plural, one {hún rennur} other {þær renna}} út. |
| `trip.editSave` | Save the change | Vista breytinguna |
| `trip.editSame` | This is what the trip has now. Change something first. | Ferðin er nú þegar svona. Breyttu einhverju fyrst. |
| `trip.editPriceAction` | Change the price | Breyta verðinu |
| `trip.editPriceHelp` | The new price is for new bookings. Passengers who booked keep the price they booked at. | Nýja verðið gildir fyrir nýjar bókanir. Farþegar sem hafa bókað halda verðinu sem þeir bókuðu á. |
| `trip.editSeats` | Seats | Sæti |
| `trip.editSeatsAction` | Change the seats | Breyta sætunum |
| `trip.editSeatsTaken` | {count, plural, one {# seat is} other {# seats are}} taken on part of the trip, so you can offer no fewer. | {count, plural, one {# sæti er tekið} other {# sæti eru tekin}} á hluta leiðarinnar svo þú getur ekki boðið færri. |
| `trip.editSeatsLowers` | With {seats, plural, one {# seat} other {# seats}} the highest price level is {level}%, so yours goes down to it for new bookings. | Með {seats, plural, one {# sæti} other {# sætum}} er hæsta verðstigið {level}%, svo þitt lækkar niður í það fyrir nýjar bókanir. |
| `trip.editBookingAction` | Change how people book | Breyta því hvernig fólk bókar |
| `trip.editBookingRequests` | {count, plural, one {# request waiting for your answer stays} other {# requests waiting for your answer stay}} open. | {count, plural, one {# beiðni sem bíður svars þíns er áfram opin} other {# beiðnir sem bíða svars þíns eru áfram opnar}}. |
| `trip.editCarAction` | Change the car | Breyta bílnum |
| `trip.editCarHelp` | Passengers who have booked are told about the new car when you save. | Farþegar sem hafa bókað fá að vita af nýja bílnum þegar þú vistar. |
| `trip.carChanged` | New car: {car} | Nýr bíll: {car} |
| `trip.editStops` | Stops | Viðkomustaðir |
| `trip.editAddStopAction` | Add a stop | Bæta við viðkomustað |
| `trip.editAddStopHelp` | The stop goes where it's least out of your way, at a time between the stops either side. They keep their times. | Viðkomustaðurinn fer þar sem hann er minnst úr leið, á tíma milli staðanna sitt hvoru megin. Þeir halda sínum tímum. |
| `trip.editNewStretches` | Prices for new bookings | Verð fyrir nýjar bókanir |
| `trip.editToldStop` | {count, plural, one {# passenger is} other {# passengers are}} told of the new stop now. | {count, plural, one {# farþegi fær} other {# farþegar fá}} að vita af nýja viðkomustaðnum strax. |
| `trip.editRequestsStop` | {count, plural, one {# person who asked for a seat sees} other {# people who asked for a seat see}} the new stop in the app. | {count, plural, one {# sem bað um sæti sér} other {# sem báðu um sæti sjá}} nýja viðkomustaðinn í appinu. |
| `trip.editStopKeeps` | Passengers who booked keep their stops and the price they booked at. | Farþegar sem hafa bókað halda sínum viðkomustöðum og verðinu sem þeir bókuðu á. |
| `trip.editOtherPoint` | Choose another meeting point | Velja annan mótsstað |
| `trip.stopAdded` | New stop: {stop} at {time} | Nýr viðkomustaður: {stop} kl. {time} |
| `trip.problem.stop_does_not_fit` | {name} is too far out of your way to fit between {from} and {to}, which keep their times. | {name} er of langt úr leið til að komast fyrir milli {from} og {to}, sem halda sínum tímum. |
| `trip.problem.stop_too_far` | Through {name} the route would be more than 1.5 times as long as the direct way. | Um {name} yrði leiðin meira en 1,5 sinnum lengri en beina leiðin. |
| `booking.stopsChanged` | The driver has changed the trip's stops. Go back to the trip to choose where you get in and out again. | Ökumaðurinn hefur breytt viðkomustöðum ferðarinnar. Farðu aftur í ferðina til að velja aftur hvar þú ferð inn og út. |
| `trip.editRemoveStopAction` | Remove a stop | Fella niður viðkomustað |
| `trip.editRemoveStopHelp` | Choose the stop to leave out. The stops either side keep their times. Where passengers get in or out, their bookings have to end first. | Veldu viðkomustaðinn sem á að sleppa. Staðirnir sitt hvoru megin halda sínum tímum. Þar sem farþegar fara inn eða út þurfa bókanir þeirra að falla niður fyrst. |
| `trip.editRemoveStopChoose` | Choose the stop to remove. | Veldu viðkomustaðinn sem á að fella niður. |
| `trip.editNoStopToRemove` | Your trip has no stops between where it starts and where it ends. | Ferðin þín hefur enga viðkomustaði milli upphafs og enda. |
| `trip.editToldStopRemoved` | {count, plural, one {# passenger is} other {# passengers are}} told the stop is removed now. | {count, plural, one {# farþegi fær} other {# farþegar fá}} að vita strax að viðkomustaðurinn fellur niður. |
| `trip.editRequestsStopRemoved` | {count, plural, one {# person who asked for a seat sees} other {# people who asked for a seat see}} the change in the app. | {count, plural, one {# sem bað um sæti sér} other {# sem báðu um sæti sjá}} breytinguna í appinu. |
| `trip.editOtherStop` | Choose another stop | Velja annan viðkomustað |
| `trip.stopRemoved` | Stop removed: {stop} | Viðkomustaður felldur niður: {stop} |
| `trip.problem.stop_in_use` | {count, plural, one {# passenger gets} other {# passengers get}} in or out at {name}. Cancel or decline their bookings from the trip first, or ask them to cancel. | {count, plural, one {# farþegi fer} other {# farþegar fara}} inn eða út á {name}. Afbókaðu eða hafnaðu bókunum þeirra í ferðinni fyrst, eða biddu þá að afbóka. |
| `trip.problem.stop_at_end` | The first and last stops make the trip. To change them, cancel the trip and post a new one. | Fyrsti og síðasti viðkomustaðurinn mynda ferðina. Til að breyta þeim skaltu aflýsa ferðinni og birta nýja. |
| `trip.problem.stop_removal_too_fast` | Without {name}, the drive from {from} to {to} needs more time than the trip leaves between them. | Ef {name} fellur niður þarf aksturinn frá {from} til {to} meiri tíma en ferðin gefur á milli þeirra. |
| `trip.editDetails` | Preferences and note | Óskir og skilaboð |
| `trip.editDetailsAction` | Change the preferences and note | Breyta óskum og skilaboðum |
| `trip.editDetailsHelp` | Passengers see the change on the trip. Nobody is notified. | Farþegar sjá breytinguna á ferðinni. Enginn fær tilkynningu. |
| `trip.problem.seats_below_taken` | Passengers have taken more seats than that on part of the trip. | Farþegar hafa tekið fleiri sæti en það á hluta leiðarinnar. |
| `trip.notChangeable` | This trip can no longer be changed. | Ekki er lengur hægt að breyta þessari ferð. |
| `trip.moveTooFar` | With bookings, the departure can be between {earliest} and {latest}. | Með bókunum getur brottförin verið frá kl. {earliest} til kl. {latest}. |
| `driverTrip.changed` | Trip changed. Your passengers have been told. | Ferðinni var breytt. Farþegarnir hafa fengið að vita það. |
| `driverTrip.changedNobody` | Trip changed. | Ferðinni var breytt. |
| `booking.changesTitle` | Changes since you booked | Breytingar frá því þú bókaðir |
| `booking.movedFar` | The departure moved more than 30 minutes, so you can cancel with a full refund, without it counting against you. | Brottförin færðist um meira en 30 mínútur svo þú getur afbókað með fullri endurgreiðslu án þess að það telji gegn þér. |
| `booking.movedFarFree` | The departure moved more than 30 minutes, so you can cancel without it counting against you. | Brottförin færðist um meira en 30 mínútur svo þú getur afbókað án þess að það telji gegn þér. |
| `notify.movedBody` | {from} – {to} · {when}. | {from} – {to} · {when}. |
| `notify.movedFarBody` | {from} – {to} · {when}. You can keep your booking or cancel with a full refund. | {from} – {to} · {when}. Þú getur haldið bókuninni eða afbókað með fullri endurgreiðslu. |
| `sms.departureMoved` | ShareRide: your trip on {date} now leaves at {time}. Keep it or cancel with a full refund in the app. | ShareRide: Ný brottför: {date} kl. {time}. Haltu bókuninni eða afbókaðu með fullri endurgreiðslu í appinu. |
| `sms.departureMovedUnpaid` | ShareRide: your trip on {date} now leaves at {time}. Details in the app. | ShareRide: Ný brottför: {date} kl. {time}. Nánar í appinu. |
| `booking.cancel` | Cancel booking | Afbóka |
| `booking.fullRefund` | Full refund of {amount} | Full endurgreiðsla, {amount} |
| `booking.noRefund` | No refund: less than 15 minutes before departure | Engin endurgreiðsla: innan við 15 mínútur í brottför |
| `booking.countsOnReliability` | This cancellation shows on your profile | Þessi afbókun sést á prófílnum þínum |
| `booking.cancelTitle` | Cancel your booking | Afbóka bókunina |
| `booking.cancelWhy` | Why are you cancelling? | Af hverju afbókarðu? |
| `booking.cancelChooseReason` | Choose a reason. | Veldu ástæðu. |
| `booking.nothingPaid` | Nothing to refund: you haven't paid yet. | Ekkert að endurgreiða: þú hefur ekki greitt enn. |
| `booking.nothingToRefund` | This ride is free, so there's nothing to refund. | Farið er ókeypis svo það er ekkert að endurgreiða. |
| `booking.cancelTold` | {driver} is told, and {seats, plural, one {the seat is} other {the seats are}} freed for others. | {driver} fær að vita það og {seats, plural, one {sætið losnar} other {sætin losna}} fyrir aðra. |
| `booking.keep` | Keep my booking | Halda bókuninni |
| `booking.backToBooking` | Back to the booking | Aftur í bókunina |
| `booking.termsChanged` | Something changed since you opened this. Check the refund again. | Eitthvað breyttist síðan þú opnaðir þetta. Athugaðu endurgreiðsluna aftur. |
| `booking.notCancellable` | This booking can no longer be cancelled. | Ekki er lengur hægt að afbóka þessa bókun. |
| `booking.cancelledByYou` | You cancelled this booking: {reason} | Þú afbókaðir þessa bókun: {reason} |
| `booking.cancelledByOther` | {name} cancelled this booking: {reason} | {name} afbókaði þessa bókun: {reason} |
| `booking.cancelledByOperator` | ShareRide cancelled this booking. | ShareRide afbókaði þessa bókun. |
| `booking.refundOnItsWay` | Full refund of {amount}, back to the card you paid with. | Full endurgreiðsla, {amount}, aftur á kortið sem þú greiddir með. |
| `booking.cancelTitleDriver` | Cancel booking: {name} | Afbóka: {name} |
| `booking.driverRefund` | {name} gets a full refund of {amount} | {name} fær fulla endurgreiðslu, {amount} |
| `booking.driverNothingPaid` | {name} hasn't paid yet, so there's nothing to refund. | {name} hefur ekki greitt enn svo það er ekkert að endurgreiða. |
| `booking.cancelToldPassenger` | {name} is told at once, and {seats, plural, one {the seat is} other {the seats are}} freed for others. | {name} fær að vita það strax og {seats, plural, one {sætið losnar} other {sætin losna}} fyrir aðra. |
| `booking.cancelNote` | Note to the passenger (optional) | Skilaboð til farþegans (valfrjálst) |
| `booking.cancelNoteHelp` | Up to {max} characters, without phone numbers or links. {name} sees it with your reason. | Allt að {max} stafir, án símanúmera eða tengla. {name} sér þau með ástæðunni. |
| `booking.cancelNoteNoContact` | Please don't share phone numbers, emails or links in the note. | Vinsamlegast ekki deila símanúmerum, netföngum eða tenglum í skilaboðunum. |
| `booking.keepTheirs` | Keep the booking | Halda bókuninni |
| `booking.driverNote` | Note from the driver: {note} | Skilaboð frá bílstjóranum: {note} |
| `driverTrip.cancelBooking` | Cancel booking: {name} (spoken) | Afbóka: {name} |
| `driverTrip.cancelledBooking` | Booking cancelled. The passenger has been told. | Bókunin var afbókuð. Farþeginn hefur fengið að vita það. |
| `trip.postAgain` | Post again | Birta aftur |
| `trip.postReturn` | Post the return trip | Birta ferðina til baka |
| `cancelReason.weather` | Weather | Veður |
| `cancelReason.roadClosed` | Road closed | Vegur lokaður |
| `cancelReason.carProblem` | Car problem | Bilun í bíl |
| `cancelReason.illness` | Illness | Veikindi |
| `cancelReason.plansChanged` | Plans changed | Breyttar áætlanir |
| `cancelReason.other` | Other | Annað |
| `cancelReason.passengerAsked` | The passenger asked | Farþeginn bað um það |
| `cancelReason.carSmaller` | The car is smaller than planned | Bíllinn er minni en til stóð |
| `cancelReason.foundAnother` | Found another ride | Fann annað far |
| `cancelReason.tripChanged` | The trip changed | Ferðin breyttist |
| `chat.cancelledByMe` | You cancelled the booking: {reason} | Þú afbókaðir: {reason} |
| `chat.cancelledByThem` | {name} cancelled the booking: {reason} | {name} afbókaði: {reason} |
| `chat.withNote` | {line} “{note}” | {line} „{note}“ |
| `notify.cancelledByPassenger` | Booking cancelled: {name} | Bókun afbókuð: {name} |
| `notify.refunded` | Refund of {total} | Endurgreiðsla, {total} |
| `notify.refundedBody` | {from} – {to} · {when}. It goes back to the card you paid with. | {from} – {to} · {when}. Hún fer aftur á kortið sem þú greiddir með. |
| `notify.cancelledByDriver` | The driver cancelled: {reason} | Bílstjórinn afbókaði: {reason} |
| `notify.cancelledRefundBody` | {from} – {to} · {when}. Full refund of {total}. | {from} – {to} · {when}. Full endurgreiðsla, {total}. |
| `sms.bookingCancelled` | ShareRide: the driver cancelled your booking for {date} at {time}. Full refund. Details in the app. | ShareRide: Bílstjórinn aflýsti bókun þinni: {date} kl. {time}. Full endurgreiðsla. Nánar í appinu. |
| `sms.bookingCancelledUnpaid` | ShareRide: the driver cancelled your booking for {date} at {time}. Details in the app. | ShareRide: Bílstjórinn aflýsti bókun þinni: {date} kl. {time}. Nánar í appinu. |

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
| 3 | Until when can a passenger cancel? | Until the planned time at their boarding stop. After that it is the trip day's (spec 8), so a cancellation never stands in for a no-show, which always counts (decided by Martin 2026-11-16, in milestone 6, PR 3). The same for a driver cancelling one booking (decided by Martin 2026-11-16, open question Q18) |
