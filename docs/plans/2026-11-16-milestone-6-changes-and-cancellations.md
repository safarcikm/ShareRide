# Milestone 6 plan: changes and cancellations

**Owner:** Martin · **Date:** 2026-11-16 · **Status:** In progress; the
choices in section 3 accepted by Martin on 2026-11-16 as recommended

Lets drivers change or cancel a published trip and passengers cancel a
booking, with refunds by fixed rules and everyone told at once. It
implements [spec 6](../specs/2026-11-13-changes-and-cancellations.md)
(changes and cancellations) on top of milestones 4 and 5: bookings and the
test payment provider, which can already refund a payment
(`refund_due`, then `refunded`), and the notification catalogue, whose
rows for spec 6's events and SMS window are domain rules waiting for their
events.

It needs no new service or dependency. SMS goes through the `SmsSender`
port ([ADR 0023](../decisions/0023-sms-with-vonage.md)) that sends sign-in
codes today. Reliability is recorded here but calculated and shown with
[spec 8](../specs/2026-11-13-trip-day-reviews-and-reliability.md).

The UX work (spec 16) owns the look of the booking page and the driver's
trip page. This plan adds actions to both and tells the UX thread before
each PR that touches them.

## 1. Goal

When this milestone is done, on the web and on an Android test build:

- Anna moves Friday's 08:00 trip to 08:45. Her two passengers are told by
  push and email, and by SMS because it is within 24 hours of boarding.
  Their booking says "Departure changed from 08:00 to 08:45". Jón taps
  "Cancel with full refund" and gets all 2 900 kr. back, and it never counts
  against him. Gunna taps "Keep my booking".
- Anna adds a stop at Borgarnes so another passenger can join; Gunna's
  booking keeps its stops and price.
- Anna's car breaks down: she cancels the trip with "Car problem". Every
  passenger is refunded in full and told at once; a pending request is
  declined; the conversations say what happened.
- Gunna cancels the day before and sees "Full refund of 2 900 kr." before
  she confirms. Had she cancelled 10 minutes before boarding, the screen
  would have said "No refund: less than 15 minutes before departure".
- Anna posts next Friday's trip, and the return on Sunday, from last week's
  trip in a few taps.

## 2. Scope

| In milestone 6 | Later |
| -------------- | ----- |
| The change table (3.2) and rules R6.1 to R6.9, M2 and S5 as domain rules, with a test per row and a property test | Automatic weather and road-closure checks (spec 6, out of scope; the reason is trusted in the beta) |
| The passenger cancels a confirmed or unpaid booking, with the refund and the reliability line shown first (3.5) | How reliability is calculated and shown, and no-shows (spec 8) |
| The driver cancels one booking (3.4) or the whole trip (3.3), with reasons and a note | Reports about cancellations (spec 9) |
| Changing a published trip: departure, seats, price level, car, booking mode, preferences and note; each change recorded and shown (3.2) | Payouts on past trips (spec 13); the real payment provider's refunds (spec 13), which take the same `refund_due` path |
| Adding and removing a stop on a published trip | Recurring trips (after the MVP) |
| Post again and post the return (3.6) | The operator cancelling a booking or trip (spec 10) |
| Notifications for every event of spec 6, SMS for the four last-minute ones of spec 7 (3.4), and system lines in the conversations | Meeting point moved or paused (spec 2, from the console) |

My trips with Upcoming and Past, and the seat view (3.1), are already built
(milestone 4 and spec 16).

## 3. Decisions for Martin

Accepted by Martin on 2026-11-16: all three as recommended.

| # | Choice | Recommendation | Why | Alternative |
| - | ------ | -------------- | --- | ----------- |
| 1 | How the driver edits a published trip | **An "Edit trip" page** listing what can change (time, stops, seats, price, car, booking mode, details). Each row opens the posting step it came from, then a review says what changes for the passengers before saving | Reuses the posting steps the driver already knows, and spec 6 asks for the effect before saving (screen 3) | One long form with every field. Fewer screens, but it is a new form to learn and harder to read on a phone |
| 2 | Stops on a published trip | **In this milestone, as its own PR (PR 6).** A new stop's time is worked out between its neighbours from the typical times; if it does not fit, the driver is asked to move the departure first. Other stops keep their times | The user story asks for it, and it is the only way a passenger can join on the way. Keeping the other times means no booked passenger's time moves | Leave stops for after the beta starts: the milestone is a PR smaller, and drivers cancel and post again to change stops |
| 3 | The reliability line | **Shown now:** "This cancellation shows on your profile" for a late passenger cancellation. The count is recorded on the booking from this milestone and shown with spec 8 | The rule is decided (R6.8), and people should know before they confirm, even if the figure comes later | Hide the line until spec 8 shows the figure. Less to explain now, but early cancellations would be counted without warning |

## 4. Design notes

### 4.1 Rules (domain)

In `packages/domain`, free of I/O like the rest:

- `trips/changes.ts`, `checkTripChange(trip, bookings, change, now, settings)`:
  `Result<ChangeEffect, ChangeProblem[]>`.
  - A change is one of: `departure` (new departure time), `seats`,
    `priceLevel`, `vehicle`, `bookingMode` or `details` (preferences and
    note). `addStop` and `removeStop` join it with PR 6.
  - Problems: `trip_departed` (R6.1) or `trip_cancelled`;
    `departure_too_soon` or `departure_too_far` (R3.5, from now: running
    late on the day is a chat message); `move_too_far` (R6.4: more than 2
    hours from any booking's departure when it was booked, with the
    earliest and latest allowed); the time problems of `checkTimes` (R6.2,
    R3.6); `stop_out_of_season` and `overlaps_trip` (publishing's checks);
    `seats_invalid` or `seats_below_taken` (S5, with the highest
    occupancy); `price_level_invalid`; the note's problems. With PR 6:
    `stop_in_use` (R6.5) and `stop_does_not_fit` (decision 2).
  - The effect: the trip as it will be (more seats can lower the price
    level, as when posting); after a change of seats or price level, each
    segment's new price and cap for new bookings (P3, P4), from the
    segments' distances; and for each booked passenger, accepted or
    confirmed, the event they are told (`DepartureMoved` by minutes from
    the departure when booked, or `TripChanged` for a new car; nobody for
    the price level, seats, booking mode or details, or when nothing
    changed) and whether a paid passenger may now cancel for free (R6.3).
    A request's passenger is told only of a cancelled trip (spec 7, 3.3),
    though the request still limits how far the departure moves.
- `bookings/cancellation.ts`, `cancellationTerms(booking, canceller, now)`:
  `Result<{ refund: Money; countsOnReliability: boolean }, ChangeNotAllowed>`,
  from who cancels and why, the booking's status and total, its boarding
  time and the trip's departure now and when booked.
  - The passenger: a full refund 15 minutes or more before boarding, or
    before boarding after a move of more than 30 minutes; otherwise none
    (M2, R6.3). It counts only when confirmed, less than 24 hours before
    boarding, not for weather or a road closure, and not after a move of
    more than 30 minutes (R6.8).
  - The driver: always a full refund; it counts unless the reason is
    weather or a road closure (R6.7).
  - An unpaid accepted booking: nothing to refund, never counts. A request
    is withdrawn or declined instead (spec 5), and is refused here.
- `trips/copy.ts`, `stopsToCopy(stops, { reverse })`: the stops in order or
  reversed, and the points no longer offered, left out and named (3.6).
- Reasons as constants: the trip's (`weather`, `road_closed`,
  `car_problem`, `illness`, `plans_changed`, `other`), the driver's for one
  booking (the trip's plus `passenger_asked` and `car_smaller`), and the
  passenger's (`plans_changed`, `found_another`, `trip_changed`,
  `weather`, `other`).

Tests: every row of the change table with and without bookings (the stop
rows with PR 6); moves of 30 minutes, 31, exactly 2 hours and 2 hours and a
minute; two moves of 20 minutes (40 from booking); seats down to the
highest occupancy and no further; each cancellation case at exactly 15
minutes and exactly 24 hours before boarding. A property test (fast-check,
already in the domain tests) applies random changes to random trips with
bookings and checks, after each allowed one, that the seats taken are
unchanged and within the seats offered, the price level and planned times
still pass, and every booking is within 2 hours of its time.

### 4.2 Cancelling on the server

- Migration (additions only): on `bookings`, `cancel_reason`, `cancel_note`,
  `refund_amount`, `counts_on_reliability` and `departs_at_when_booked`.
  The last is set when a booking is made and gives R6.3 and R6.4 their
  starting point; existing bookings take their trip's departure.
- `GET /bookings/{id}/cancellation-preview`: the refund, whether it counts,
  and the reasons the viewer can choose, from the same `cancellationTerms`
  as confirming. Confirming sends the refund and count it showed; if the
  terms changed in between (a time edge passed, or the trip moved), it
  answers 409 `terms_changed` with the new terms, as booking does for a
  changed price (R5.3).
- `POST /bookings/{id}/cancel` `{ reason, note? }`, by the passenger or the
  trip's driver. Under the trip's lock, as booking is:
  - the seats are freed on every segment of the part (S1);
  - a paid booking's payment becomes `refund_due` with the refund, and the
    refund job (milestone 4) takes it; an unpaid one has nothing to refund,
    and a payment that settles after it is refunded by `settlePayment`, as
    today;
  - asked twice, it answers the cancelled booking again and refunds once.
- The note goes to the passengers as written, as long as a trip's note may
  be, and is kept with the booking. The privacy register gains the
  cancellation's reason, note and refund, kept as long as the booking.
- `POST /trips/{id}/cancel` `{ reason, note? }`: the trip is `cancelled`;
  every confirmed booking is cancelled by the driver with a full refund,
  requests are declined (`trip_cancelled`), and accepted unpaid bookings are
  cancelled with nothing to refund (R6.6). One transaction. The
  cancellation counts once, on the trip, and only with passengers (spec 8,
  3.8), so its bookings do not count one by one.
- Events in the outbox, in the same transaction: `BookingCancelled` (the
  booking and who cancelled; the reason and refund are read from the
  booking), `TripCancelled`, and `RefundIssued` once the provider has
  refunded. The catalogue already maps them; the worker gains their texts.
- **SMS:** the worker sends the catalogue's SMS rows through `SmsSender` to
  the passenger's verified number, only within 24 hours of boarding and at
  most 5 a day (R7.10), with spec 7's texts (`sms.tripCancelled`,
  `sms.bookingCancelled`, `sms.departureMoved`). An SMS whose answer is lost
  is never sent again, as for push and email.
- **System lines** (spec 7, 3.1, item 3): "Anna cancelled the booking: Car
  problem", "Gunna cancelled the booking", "Anna cancelled the trip: Road
  closed", in the reader's language, with the note as the driver wrote it.
- Reminders for a cancelled booking or trip are dropped, as `stillApplies`
  already says.

### 4.3 Changing a published trip on the server

- `PATCH /trips/{id}` keeps changing drafts only. A published trip takes
  one change at a time (4.1) at `POST /trips/{id}/changes` (as built in PR
  5a: a draft's partial body and a published trip's one change read
  differently, so each has its own endpoint). With `?preview=true` it
  answers the effect without saving. A change that breaks a rule answers
  422 `change_not_allowed` with the problems as details, as publishing
  does, so the app can say which rule and why (3.2); a departed or
  cancelled trip answers 409 `trip_not_changeable`.
- A departure move shifts every stop's planned time, the trip's departure
  and arrival, and every booking's reminders. Requests' and unpaid
  bookings' deadlines are worked out again from the new boarding time
  (`requestDeadline`, `paymentDeadline`), and one already passed expires.
  The trip's search entry follows.
- More seats or a new price level store the effect's prices and caps on
  the segments, and the seats as each segment's capacity.
- A new car must be one of the driver's, not removed, as when publishing.
- `trip_changes`: one row per change (trip, kind, before, after, changed
  at). The booking answers its trip's changes since it was booked, so the
  passenger sees "Departure changed from 08:00 to 08:45".
- Events: `DepartureMoved` (by how many minutes from each booking's
  departure when booked) and `TripChanged` (stops, car). The price level,
  seats, booking mode and details tell nobody (3.2).
- Pending requests stay open when the booking mode changes (3.2).
- The privacy register gains the trip's changes, kept as long as the trip.

### 4.4 Stops on a published trip (decision 2)

- Adding a stop splits one segment in two. Both keep its occupancy, since
  every booking on it still rides both. The new segments' prices come from
  the trip's price level, as when posting. Each booking over the split keeps
  its total: its price for the old segment is shared between the two new
  ones in proportion to their prices, rounded so the sum stays the same.
- Removing a stop no booking uses joins two segments. Their occupancy is
  equal, since no booking gets in or out there, and a booking's prices for
  the two are added.
- Segment positions after the change move up or down in the same
  transaction, with `booking_segment_prices`.
- The new stop's planned time lies between its neighbours, from the typical
  times of the two new stretches. If they take longer than the gap allows
  (R3.6's 90%), the change is refused with `stop_does_not_fit`, and the
  driver moves the departure first.

### 4.5 In the app

- **The passenger's booking page:** "Cancel booking" for a confirmed or
  unpaid booking opens `/bookings/[id]/cancel`: the reasons, the refund line
  and, when it counts, the reliability line from the preview, then "Cancel
  booking". Focus goes to the outcome on the booking. A request keeps
  "Withdraw request".
- **Trip changed:** the booking shows each change since it was booked. After
  a move of more than 30 minutes it offers "Keep my booking", which hides
  the offer on this device, and "Cancel with full refund", which opens the
  cancel screen with "The trip changed" chosen.
- **The driver's trip page:** "Edit trip", "Cancel trip", "Cancel booking" on
  each passenger, "Post again" and "Post the return".
  - Edit trip (decision 1): rows that open the posting steps in an edit
    mode, then "What changes for passengers" before "Save".
  - Cancel trip: the reasons, a note, "{count} passengers get a full refund
    and will be told now", then "Cancel trip".
- **Post again and the return:** `POST /trips/{id}/copy?reverse=` makes a
  draft with the same stops (reversed for the return), car, seats, price
  level, booking mode, preferences and note, without a date. The builder
  opens at the time step. Stops no longer active are dropped with a notice
  (3.6). Prices and typical times are worked out again for the reverse.
- Texts in both languages: spec 6's table, plus the new reasons and the
  outcome lines. Spec 6's table gains each new key.

## 5. Pull requests and tasks

Tests come first in every task. Each PR updates the docs it touches, runs
the browser journeys, and gets a code review before it opens.

### PR 1: `docs(plans)`: this plan

- [x] This plan, the roadmap's milestone 6 and the plans index

### PR 2: `feat(trips)`: change and cancellation rules in the domain

- [x] `checkTripChange`, `cancellationTerms`, `stopsToCopy` and the
      reasons, with the tests of 4.1 and the property test
- Verify: `pnpm --filter @shareride/domain test`

### PR 3: `feat(bookings)`: the passenger cancels a booking

- [x] Migration; the preview and `POST /bookings/{id}/cancel` for the
      passenger; refunds; `BookingCancelled` and `RefundIssued` with their
      texts; system lines
- [x] The cancel screen and the booking page's outcome
- Verify: integration tests (the preview matches confirming; twice
  refunds once; a payment that settles after cancelling is refunded; the
  seats are free again); a browser journey cancels in time. Cancelling
  late, in the last 15 minutes, is tested in the API and screen tests,
  because the browser tests' API keeps the real clock

### PR 4: `feat(trips)`: the driver cancels a booking or the trip

In two parts, so each stays reviewable.

PR 4a, `feat(bookings)`: the driver cancels one booking.

- [x] `POST /bookings/{id}/cancel` and its preview for the driver, with
      the driver's reasons and an optional note; the note on the booking
      and in the chat line, never in push, email or SMS
- [x] SMS in the worker for the last-minute rows, with the daily limit
- [x] "Cancel booking" under each passenger on the driver's trip page; the
      cancel screen in the driver's words; the outcome on the trip page
- Verify: integration tests (a full refund that counts on the driver; an
  unpaid booking; the note; an SMS within 24 hours and none outside it; at
  most 5 a day; a lost SMS answer never sent twice); screen tests; a
  browser journey cancels a paid booking with a note

PR 4b, `feat(trips)`: the driver cancels the trip.

- [x] `POST /trips/{id}/cancel`; `TripCancelled`; requests declined and
      unpaid bookings cancelled
- [x] The Cancel trip screen
- Verify: integration tests (three passengers each refunded once, a
  request declined, an unpaid booking cancelled); a browser journey
  cancels a trip with three passengers

### PR 5: `feat(trips)`: changing a published trip

In three parts, so each stays reviewable: the departure first, end to end,
then the changes nobody is told of, then the car, which tells passengers.

PR 5a, `feat(trips)`: the driver moves the departure.

- [x] `POST /trips/{id}/changes` with `preview`, for a new departure;
      `trip_changes`; `DepartureMoved`, with its push, email and SMS;
      reminders and deadlines moved with the trip
- [x] Edit trip with its time row and the review; "Trip changed" on the
      booking with "Keep my booking" and "Cancel with full refund"
- Verify: integration tests (a move of 45 minutes lets each passenger
  cancel for free; over 2 hours refused; a change and a booking at the
  same moment; the preview matches what saving does); a browser journey
  moves a trip by 45 minutes and a passenger cancels with a full refund

PR 5b, `feat(trips)`: seats, price level, booking mode, and preferences
and note.

- [x] The four changes on the same endpoint, each stretch's seats, cap and
      price stored for new bookings; nobody told
- [x] Their rows on Edit trip, each with its own screen that saves
- Verify: integration tests (seats below the highest occupancy refused;
  more seats lower the price level; bookings keep their prices; pending
  requests stay open when the booking mode changes; a note with contact
  details refused; the same value saves nothing)

PR 5c, `feat(trips)`: the car.

- [x] A new car on the same endpoint; `TripChanged`, with its push and
      email, and the change on each booking
- [x] The car row on Edit trip
- Verify: integration tests (a new car tells each passenger; the same car
  tells nobody)

### PR 6: `feat(trips)`: adding and removing a stop

- [ ] Splitting and joining segments with occupancy and booking prices;
      the new stop's time; `stop_in_use` and `stop_does_not_fit`; the
      property test gains stops (bookings keep their stops and prices)
- [ ] The stops row of Edit trip
- Verify: integration tests (a booking over the new stop keeps its total
  and stops; a used stop cannot be removed); a browser journey adds a stop
  and books from it

### PR 7: `feat(trips)`: post again and post the return

- [ ] `POST /trips/{id}/copy?reverse=`; "Post again" and "Post the return"
- Verify: a browser journey posts the return trip

## 6. Review focus

What the spec implies and a person would meet first, each with its test:

1. **A payment settles after its booking was cancelled:** the booking stays
   cancelled and the payment is refunded once (PR 3).
2. **"Cancel" pressed twice, or retried after a lost answer:** one
   cancellation, one refund, one notification (PRs 3 and 4).
3. **Exactly 15 minutes or 24 hours before boarding:** the edges of M2 and
   R6.8 follow the boarding stop's time, not the departure (PR 2).
4. **A departure moved twice, 20 minutes each time:** 40 minutes from
   booking, so a free cancellation; moved back, it is not (PR 2 and PR 5).
5. **A cancelled trip's reminders and SMS:** nothing more is sent for it,
   and a passenger gets at most 5 SMS a day (PR 4).

## 7. Martin's steps

1. Accept or change the choices in section 3.
2. Try each PR on the web as it merges.
3. Nothing new for SMS: staging already sends sign-in codes through Vonage
   (milestone 2), and these messages go the same way. Locally they print in
   the API's terminal, as codes do.

## 8. Risks

- **Segment positions:** adding or removing a stop renumbers segments and
  booking prices in one transaction (4.4). A property test and the
  integration tests guard it.
- **The real payment provider (spec 13)** may refund later or fail. Refunds
  already wait as `refund_due` and are retried, so only the provider adapter
  changes.
- **SMS costs:** at most 5 a day per passenger, and only within 24 hours of
  boarding.

## 9. Definition of done

All seven PRs merged with green CI; a screen reader pass on the cancel
screens and the seat view (spec 6, section 9); Martin has moved, cancelled
and reposted a trip and cancelled a booking on the web, and seen each told
to the other account; docs, roadmap and CHANGELOG are updated.
