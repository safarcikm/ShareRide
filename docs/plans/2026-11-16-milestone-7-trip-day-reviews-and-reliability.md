# Milestone 7 plan: trip day, reviews and reliability

**Owner:** Martin · **Date:** 2026-11-16 · **Status:** In progress; the
choices in section 3 accepted by Martin on 2026-11-16 as recommended

Helps people find each other on the day, settle a passenger or driver who
doesn't come, finish trips on their own, and show reviews and a
reliability figure that people can trust. It implements
[spec 8](../specs/2026-11-13-trip-day-reviews-and-reliability.md) on top of
milestones 4 to 6. Bookings already have the `completed` and `no_show`
statuses and the move from completed to cancelled for a driver absence
(`bookings/lifecycle.ts`). Bookings and trips already record whether a
cancellation counts on reliability (milestone 6). The notification
catalogue, the outbox and the reminders' schedule are in place
(milestone 5).

It needs no new service or dependency. Spec 8 is next in the
[spec order](../product/features.md#spec-order).

The UX work (spec 16) owns the look of the booking page and the driver's
trip page. This plan adds the trip day to both and tells the UX thread
before each PR that touches them.

## 1. Goal

When this milestone is done, on the web and on an Android test build:

- At 07:40 Jón opens his booking for the 08:00 trip from Mjódd. It shows
  the trip day: the time, where to stand, Anna's car with its colour and
  number plate, and a large "I'm here". He taps it, and Anna's phone says
  "Jón is at the meeting point".
- Anna's trip page shows each stop in order, who gets in and out there, and
  whether they are here. Gunna, getting in at Hveragerði, never comes. Ten
  minutes after the planned time, Anna taps "Mark as no-show". Gunna is
  told, does not answer, and gets no refund. It counts on her reliability.
- Two hours after the last stop, the trip completes on its own. Jón and
  Anna are asked "How was your trip?". Each gives 5 stars. Both reviews
  appear on the profiles once both are written.
- Before accepting a request, Anna opens the passenger's profile: the
  rating, the reviews, and "Reliability: 96%", with the counts behind it.
- On another day the driver never comes. Sigga reports it, the driver does
  not answer within 24 hours, and Sigga gets a full refund.

## 2. Scope

| In milestone 7 | Later |
| -------------- | ----- |
| Rules R8.1 to R8.11 in the domain, with a test per rule and property tests | The operator console's pages (spec 10). Until then the operator decides through a command (decision 1) |
| Trips depart and complete on their own (R8.1, R8.2), and the review reminders | Payouts and their 24-hour delay (spec 13). An open report already marks the booking, so payouts skip it when they come |
| The trip day on the booking page and the driver's trip page (decision 2), and "I'm here" | Photos of the car, the driver and the meeting point: none exist yet, so the trip day shows the text. Photos come with milestone 2's photo PR |
| Marking a no-show, "The driver didn't come", the other side's answer, and the operator's decision | "Did something go wrong?" with a report after a low rating, the 112 link and sharing trip details (spec 9) |
| Rate and review, hidden until both have reviewed or 14 days have passed | Hiding a review for moderation: the column comes now, and its use comes with spec 9 |
| Public profiles with the rating, reviews and reliability (decision 3) | Automatic weather and road-closure checks (Phase 4) |
| Notifications for every row of spec 8, 3.9, and lines in the conversations | The operator's watch list below 80% as a page (spec 10). The command lists it until then |

## 3. Decisions for Martin

Accepted by Martin on 2026-11-16: all four as recommended. Decision 4
answers question Q19 (A43).

| # | Choice | Recommendation | Why | Alternative |
| - | ------ | -------------- | --- | ----------- |
| 1 | How the operator decides contested cases before the console exists | **A command** in the API's package, like `expire-bookings`. It lists open cases with what the system knows, decides one, overrules a weather or road-closure reason, and lists people below 80%. The console's pages (spec 10) later call the same functions | The rules and their effects are built and tested now, and the beta does not start before the console. A command is small and cannot be reached from the internet | Build a first console page now: operator sign-in, roles and a dispute page. It is spec 10's work brought forward, and makes this milestone about a third bigger |
| 2 | Where the trip day lives | **On the booking page and the driver's trip page**, which become the trip day from 3 hours before. They keep the same address, so links in notifications and My rides keep working. The trip day's actions come first, in large buttons | The page people already open becomes the right one on the day, with nothing new to find | A separate trip day screen, opened from a banner on those pages and from Find. It is cleaner to design, but adds a step on the day, when people are in a hurry |
| 3 | Public profiles | **In this milestone.** Spec 1's public profile (first name, about, languages, member since, rating, reliability and reviews) opens from the driver on trip details and from each passenger on the driver's trip page and requests | Reviews need somewhere to be read, and the driver checks a passenger before accepting (spec 8's user stories). Spec 4 already asks for the driver's profile | Only the figures, on trip details and the requests, with the reviews later. It is one PR smaller, but nobody can read a review |
| 4 | A contested no-show that the operator finds wrong (open question Q19) | **The operator picks one of two outcomes.** "They rode": the booking completes, the driver is paid, and nothing counts on either side. "They were left behind": as a driver absence, a full refund that counts on the driver | Spec 8 has one outcome, "reversed", which does not say which of these happened. They lead to different money and reliability | Always "they rode", the simpler rule. But a driver who left a waiting passenger behind and marked them a no-show would keep the money |

A contested "The driver didn't come" that the operator finds wrong also
says what happened instead (Q20, accepted by Martin on 2026-11-16, A44). "They rode":
the booking goes on and completes, the driver is paid, and nothing counts
against either side. "They didn't come": the passenger's no-show, with no
refund, counted on them. Without the second, a passenger who didn't come
could report the driver first, since a booking is reported once, and
escape the no-show.

## 4. Design notes

### 4.1 Rules (domain)

In `packages/domain`, free of I/O like the rest. Spec 8's settings live
next to the rules that use them, each with its starting value, for the
operator to set later (feature H4): `TripDaySettings` in `trips/day.ts`
(trip day 3 hours, "I'm here" from 30 minutes before to 60 after, the wait
10 minutes, completion 2 hours, the answer window 24 hours),
`ReviewSettings` in `reviews/review.ts` (14 days) and `ReliabilitySettings`
in `people/reliability.ts` (12 months, 5 to show, 80% watch level).

- `trips/day.ts`:
  - `tripStatusAt(trip, now, settings)`: a published trip departs at its
    first stop's planned time and completes 2 hours after its last
    (R8.1). `completesWithTrip(booking)`: a confirmed booking completes
    with it unless a report on it is open (R8.2).
  - `dayPhase(from, lastStopAt, now, settings)` returns `upcoming`,
    `trip_day` (from 3 hours before `from`: the passenger's boarding stop,
    or the driver's first stop) or `completed`.
  - `checkCheckIn(stopAt, now, settings)` refuses with `check_in_not_open`
    (and when it opens) or `check_in_closed` (R8.3).
  - `checkNoShow(booking, now, settings)` refuses with `not_confirmed`,
    `already_reported`, `trip_completed`, `no_show_too_early` (and when
    it is allowed) or `driver_not_checked_in` (R8.4).
  - `checkDriverAbsent(booking, now, settings)` refuses with
    `not_boarding`, `already_reported`, `report_too_early` or
    `report_too_late`, more than 24 hours after completion (R8.5).
  - A booking is reported once: after a no-show the passenger answers it,
    and after "The driver didn't come" the driver does, so the operator
    decides one question.
  - Every window follows the stop's planned time now, after any move
    (spec 6). A removed stop has no window.
- `bookings/disputes.ts`: `answerDeadline` and `checkAnswer` (one answer,
  until the deadline), `settlesUnanswered` (after the deadline),
  `checkDecision` (the operator's outcomes for each kind, decision 4 and
  Q20) and `disputeEffect(kind, outcome, booking)`: the booking's next
  event, a cancellation as if by the driver with the reason
  `driver_absent`, the refund, whether a payout may go, whose reliability
  it counts on, and whether the booking's reviews go (R8.6, R8.7). A
  driver absence found wrong, where the passenger rode, completes a
  booking whose trip completed meanwhile; where the passenger didn't come,
  it is their no-show.
- `reviews/review.ts`:
  - `checkReview(review, now, settings)` refuses with `not_completed`,
    `review_window_closed`, `already_reviewed`, `report_open`,
    `rating_invalid` or the comment's problems: over 500 characters,
    contact details or a link (as the trip note's check) (R8.8).
  - `isRevealed(pair, now, settings)` is true once both have reviewed or
    14 days have passed since completion (R8.9).
  - `ratingOf(reviews)` averages revealed reviews the operator has not
    hidden, to one decimal.
- `people/reliability.ts`: `passengerRecord`, `driverBookingRecord` and
  `driverTripRecord` say what counts, and `reliabilityOf(records, now,
  settings)` gives kept and counted over the last 12 months across both
  roles, by role, and the figure only once 5 count, rounded down
  (R8.10). A no-show counts once it stands. A trip counts as kept when
  the driver came for at least one passenger, even if all were no-shows.
  `canOverrule` allows the operator to overrule only a cancellation that
  does not count because of its weather or road-closure reason alone
  (`excusedByReason` in `bookings/cancellation.ts`,
  `tripExcusedByReason` in `trips/cancel.ts`) (R8.11).

Tests: each rule at its edges (29 and 30 minutes before a stop, 60 and 61
after; the wait at 9 and 10 minutes; exactly 24 hours after completion;
the 14th day). Each dispute path. Reliability for every counted and
excluded case, including a weather reason overruled by the operator and
the minimum count. Property tests: the rating and the reliability counts
always match the records they come from, and a hidden review never moves
the rating.

### 4.2 Trips depart and complete

- A job in the API every minute, next to the booking deadlines:
  1. A published trip whose first stop's time has passed becomes
     `departed`.
  2. Two hours after its last stop's time, it becomes `completed`, in one
     transaction with its bookings: a confirmed booking without a
     no-show and without an open "driver didn't come" report becomes
     `completed`, with `completed_at`, and holds no seats (rule S1).
     `completed_at` is the time the rule gives, however late the job
     runs. Expired deadlines are stored first.
  3. Completion queues "How was your trip?" to the driver and to each
     completed passenger, and schedules one reminder 3 days later. The
     reminder is skipped once that person has reviewed. Both follow the
     trip reminders switch (spec 7). This comes with PR 6, which adds the
     rate screen it opens and the reviews it checks.
- The driver's trips list a trip under way as upcoming until its last
  stop, and a completed one as past. "Message all" still reaches
  passengers whose bookings completed, while their conversations are open
  (spec 7, R7.1).
- Migration: `trips.completed_at`, `bookings.completed_at`. No other column
  changes meaning, so a rollback stays safe (ships in one deploy before
  the beta, [conventions](../engineering/conventions.md#database)).
- The browser tests' API gains a test-only route in `e2e-server.ts`,
  never in the real server, that moves one trip's times so that its
  first stop is a given number of minutes from now, and runs the jobs
  once. It moves one trip rather than the clock: the journeys run in
  parallel against one API, and moving everyone's clock would expire
  other journeys' requests. It comes with PR 4, the first journey that
  needs it.

### 4.3 The trip day

- `check_ins`: trip stop, user and time, one per person per stop. No
  location is collected (spec 8, section 7).
- `POST /trips/{id}/stops/{stopId}/check-in` (driver) and
  `POST /bookings/{id}/check-in` (passenger). A repeat answers with the
  first check-in and tells nobody again.
- A check-in queues a push to the other side at that stop and adds a line
  to the conversation: "Anna is at the meeting point". A driver's check-in
  reaches each passenger getting in there.
- `GET /bookings/{id}` and `GET /me/trips/{id}` gain the phase, the
  check-ins and, for the driver, each passenger's status at their stop:
  not here yet, here or no-show.
- **Passenger's page (decision 2):** the time and the meeting point with
  where to stand and Directions, then the car (make, model, colour, plate)
  and the driver's first name, then "I'm here" and the chat. After the
  wait, "The driver didn't come".
- **Driver's page:** the stops in order with their times. At each stop:
  who gets in and out, with seats and status. "I'm here" for the next
  stop, and "Mark as no-show" after the wait. "Use this only when parked."
  stays at the top.

### 4.4 Reports and answers

- `disputes`: booking, kind (`no_show`, `driver_absent`), raised by, when,
  note, answer (`agreed`, `contested`), answer note, outcome (`stands`,
  `rode`, `left_behind`, `passenger_absent`), decided by (`system` or `operator`),
  and when.
- `POST /bookings/{id}/no-show` (driver) sets the booking to `no_show` and
  opens a dispute. `POST /bookings/{id}/driver-absent` (passenger) opens
  one, and the booking stays as it is until the outcome.
  `POST /disputes/{id}/answer` takes "That's right" or "That's not right"
  with a note.
- The minute job settles disputes once their 24 hours pass without an
  answer. A driver absence that stands cancels the booking as if by the
  driver, with the new cancellation reason `driver_absent` (a migration
  widens the reasons' check), a full refund through `refund_due`; it
  counts on the driver and removes the booking's reviews. A passenger
  left behind is cancelled the same way, as `disputeEffect` says.
- Notes are seen by the operator only. The other side sees that the
  report was contested, and later the outcome (spec 8, section 7).
- The operator's command (decision 1):
  `pnpm --filter @shareride/api operator disputes`,
  `operator decide <dispute> <outcome> --note`,
  `operator reasons` and `operator count <booking or trip> --note`
  (overrule a weather or road-closure reason), and `operator watch`.
  Each decision is recorded with who ran it and tells both sides.

### 4.5 Reviews and profiles

- `reviews`: booking, author, subject, the author's role, rating, comment,
  `created_at`, `hidden_at` (spec 9). One per author per booking.
- `POST /bookings/{id}/review`. The rate screen opens from the
  notification, the booking page and the driver's trip page while the
  window is open: stars, then an optional comment. It then says "Your
  review appears when the other person has reviewed too, or after 14 days."
- `GET /users/{id}` (public profile) and `GET /users/{id}/reviews?role=`
  (revealed reviews, newest first, paged). A deleted author shows "A
  former member". `GET /users/{id}/reliability` returns the counts by role.
- **Reliability is worked out when read**, from the bookings and trips of
  the last 12 months and their `counts_on_reliability`. At the beta's size
  this is a small query per profile, so spec 8's `ReliabilityRecord` and
  `UserStats` tables are not needed yet. They come back if profiles get
  slow. The operator's overrule is a column on the booking or trip, with
  who changed it, when and why. Whether a cancellation could be overruled
  (`excusedByReason`) is saved when it is made, as it depends on the time
  and the bookings then.
- Profiles show the rating ("4.8 (12 ratings)"), "Reliability: 96%" or
  "Not enough trips yet", and the reviews with "As a driver" or "As a
  passenger". Tapping the figure shows "Kept 24 of 25 trips and bookings"
  by role. Trip details, the driver's requests and passengers show the
  rating and the figure, and open the profile.

## 5. Pull requests and tasks

Tests come first in every task. Each PR updates the docs it touches, runs
the browser journeys, and gets a code review before it opens.

### PR 1: `docs(plans)`: this plan

- [x] This plan, the roadmap's milestone 7, the plans index and question
      Q19

### PR 2: `feat(trips)`: trip day, dispute, review and reliability rules in the domain

- [x] `trips/day.ts`, `bookings/disputes.ts`, `reviews/review.ts` and
      `people/reliability.ts`, with spec 8's settings and the tests of 4.1
- Verify: `pnpm --filter @shareride/domain test`

### PR 3: `feat(trips)`: trips depart and complete on their own

- [x] Migration; the minute job (4.2); the driver's lists and "Message
      all" after completion. "How was your trip?" moves to PR 6 and the
      browser tests' trip times to PR 4
- Verify: integration tests (a trip departs, then completes with its
  confirmed bookings, freeing their seats; an unpaid booking is stored
  as expired; a late run completes at the rule's time; a second run
  changes nothing; a locked trip waits for the next run)
- After PR 3, a small follow-up keeps later stops bookable while the trip
  is under way (rule S4; Martin's answer A45 to Q21): search, the trip
  page and booking take a departed trip at each stop until its cut-off

### PR 4: `feat(trips)`: the trip day and "I'm here"

In two parts: 4a the API, 4b the screens and the browser journey.

- [x] `check_ins` and both check-in routes; the push and the conversation
      line; the phase and statuses in the booking and trip answers (4a)
- [ ] The trip day on the booking page and the driver's trip page (4b)
- [ ] The browser tests' route that moves a trip's times (4.2) (4b)
- Verify: integration tests (only the passenger or the driver; outside the
  window refused; a repeat tells nobody again); screen tests; a browser
  journey with a trip moved close: both check in and each sees the other

### PR 5: `feat(bookings)`: no-shows, the driver didn't come, and answers

- [ ] `disputes`; the no-show, driver-absent and answer routes; settling
      after 24 hours; refunds and reliability; notifications
- [ ] Mark as no-show, The driver didn't come, and the answer screen
- [ ] The operator's command (decision 1)
- Verify: integration tests for every path of 4.4 and decision 4, and
  twice gives one effect; a browser journey: a no-show nobody contests,
  and a driver absence that stands with a full refund

### PR 6: `feat(reviews)`: rate and review

- [ ] `reviews` and `POST /bookings/{id}/review`; the reveal; "A review
      about you is now visible"; the rate screen
- [ ] "How was your trip?" on completion and its reminder after 3 days,
      skipped once reviewed (4.2)
- Verify: integration tests (only completed bookings, one each, 14 days,
  hidden until both; the reminder is skipped after a review); a browser
  journey: both review and then see each other's review

### PR 7: `feat(people)`: public profiles with rating, reviews and reliability

- [ ] `GET /users/{id}`, its reviews and reliability; the profile screen;
      the rating and figure on trip details, requests and passengers
- [ ] My own profile and "See it as others do" show the same
- Verify: integration tests (never the phone number or email; hidden
  reviews never shown or counted); screen tests; a browser journey opens
  the driver's profile from trip details

## 6. Review focus

What the spec implies and a person would meet first, each with its test:

1. **A hidden review leaks through the rating:** the average and the count
   use revealed reviews only (PR 2 property test, PR 7).
2. **A departure moved on the day:** "I'm here", the no-show wait and
   "The driver didn't come" follow the stop's time now, not when it was
   booked (PR 2).
3. **"I'm here" or "Mark as no-show" pressed twice, or retried after a
   lost answer:** one record and one notification (PRs 4 and 5).
4. **A trip completes while a report is open:** that booking does not
   complete, and a driver absence reported after completion cancels the
   completed booking and removes its reviews (PRs 3 and 5).
5. **A passenger getting in at a later stop:** their status, the wait and
   "I'm here" belong to their stop, not to the first one (PRs 2 and 4).

## 7. Martin's steps

1. Accept or change the choices in section 3.
2. Try each PR locally as it merges, or on staging once it is set up
   ([runbook](../operations/staging.md#set-it-up-once)).
3. Look at the trip day screens outdoors once, in daylight and in the dark
   (spec 8, section 9).

## 8. Risks

- **Money on a timer:** the minute job completes bookings and settles
  disputes, and spec 13's payouts will follow it. Every step is in one
  transaction and safe to run twice, and the integration tests run it
  twice.
- **The moving clock** is test-only. It lives in the browser tests' server
  and is checked by a test that the real server has no such route.
- **The milestone's size:** seven PRs. PR 5 splits into the reports and
  the operator's command if it grows past what one review can hold.

## 9. Definition of done

All seven PRs merged with green CI; a screen reader pass on the trip day
and the rate screen; Martin has walked a trip day locally or on staging,
with a check-in, a no-show and both reviews; docs, roadmap and CHANGELOG
are updated.
