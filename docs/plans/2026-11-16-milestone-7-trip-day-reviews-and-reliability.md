# Milestone 7 plan: trip day, reviews and reliability

**Owner:** Martin · **Date:** 2026-11-16 · **Status:** Proposed; the
choices in section 3 wait for Martin

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

| # | Choice | Recommendation | Why | Alternative |
| - | ------ | -------------- | --- | ----------- |
| 1 | How the operator decides contested cases before the console exists | **A command** in the API's package, like `expire-bookings`. It lists open cases with what the system knows, decides one, overrules a weather or road-closure reason, and lists people below 80%. The console's pages (spec 10) later call the same functions | The rules and their effects are built and tested now, and the beta does not start before the console. A command is small and cannot be reached from the internet | Build a first console page now: operator sign-in, roles and a dispute page. It is spec 10's work brought forward, and makes this milestone about a third bigger |
| 2 | Where the trip day lives | **On the booking page and the driver's trip page**, which become the trip day from 3 hours before. They keep the same address, so links in notifications and My rides keep working. The trip day's actions come first, in large buttons | The page people already open becomes the right one on the day, with nothing new to find | A separate trip day screen, opened from a banner on those pages and from Find. It is cleaner to design, but adds a step on the day, when people are in a hurry |
| 3 | Public profiles | **In this milestone.** Spec 1's public profile (first name, about, languages, member since, rating, reliability and reviews) opens from the driver on trip details and from each passenger on the driver's trip page and requests | Reviews need somewhere to be read, and the driver checks a passenger before accepting (spec 8's user stories). Spec 4 already asks for the driver's profile | Only the figures, on trip details and the requests, with the reviews later. It is one PR smaller, but nobody can read a review |
| 4 | A contested no-show that the operator finds wrong (open question Q19) | **The operator picks one of two outcomes.** "They rode": the booking completes, the driver is paid, and nothing counts on either side. "They were left behind": as a driver absence, a full refund that counts on the driver | Spec 8 has one outcome, "reversed", which does not say which of these happened. They lead to different money and reliability | Always "they rode", the simpler rule. But a driver who left a waiting passenger behind and marked them a no-show would keep the money |

A contested "The driver didn't come" that the operator finds wrong has
one outcome: the booking stays completed, the driver is paid, and nothing
counts.

## 4. Design notes

### 4.1 Rules (domain)

In `packages/domain`, free of I/O like the rest, with spec 8's settings in
`trips/settings.ts` and `bookings/settings.ts`: `noShowWait` 10 minutes,
`completionDelay` 2 hours, `answerWindow` 24 hours, `reviewWindow` 14 days,
`reliabilityPeriod` 12 months, `reliabilityMinCount` 5, `watchLevel` 80%.

- `trips/day.ts`:
  - `dayPhase(trip, stop, now)` returns `upcoming`, `trip_day` (from 3
    hours before the passenger's boarding stop, or the first stop for the
    driver), `departed` or `completed` (R8.1).
  - `checkInWindow(stop)` runs from 30 minutes before to 60 minutes after
    the stop's planned time (R8.3).
  - `checkNoShow(booking, checkIns, now)` refuses with
    `not_confirmed`, `too_early` (before the 10-minute wait),
    `driver_not_here` (no check-in at that stop) or `trip_completed`
    (R8.4).
  - `checkDriverAbsent(booking, trip, now)` refuses with `too_early` or
    `too_late`, more than 24 hours after completion (R8.5).
  - Every window follows the stop's planned time now, after any move
    (spec 6). A removed stop has no window.
- `bookings/disputes.ts`, `disputeOutcome(dispute, answer, decision)`:
  the booking's next status, the refund, whether a payout may go, and
  what counts on whose reliability, for every path: agreed, no answer
  within 24 hours, contested and decided (decision 4) (R8.6, R8.7).
- `reviews/review.ts`:
  - `checkReview(booking, author, now, existing)` refuses with
    `not_completed`, `window_closed`, `already_reviewed`, `rating_invalid`
    or the comment's problems: over 500 characters, contact details or a
    link (as the trip note's check) (R8.8).
  - `isRevealed(pair, now)` is true once both have reviewed or 14 days have
    passed since completion (R8.9).
- `people/reliability.ts`, `reliabilityOf(records, now)`: kept and counted
  over the last 12 months across both roles, and the figure only once 5
  count (R8.10, R8.11). `ratingOf(reviews)` averages revealed reviews only,
  to one decimal.

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
     `completed`, with `completed_at`.
  3. Completion queues "How was your trip?" to the driver and to each
     completed passenger, and schedules one reminder 3 days later. The
     reminder is skipped once that person has reviewed. Both follow the
     trip reminders switch (spec 7).
- Migration: `trips.completed_at`, `bookings.completed_at`. No other column
  changes meaning, so a rollback stays safe (ships in one deploy before
  the beta, [conventions](../engineering/conventions.md#database)).
- The browser tests' API gains a clock it can move forward, for the trip
  day journeys. It is a test-only route in `e2e-server.ts`, never in the
  real server, and it runs the jobs once after each move.

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
  `rode`, `left_behind`, `reversed`), decided by (`system` or `operator`),
  and when.
- `POST /bookings/{id}/no-show` (driver) sets the booking to `no_show` and
  opens a dispute. `POST /bookings/{id}/driver-absent` (passenger) opens
  one, and the booking stays as it is until the outcome.
  `POST /disputes/{id}/answer` takes "That's right" or "That's not right"
  with a note.
- The minute job settles disputes once their 24 hours pass without an
  answer. A driver absence that stands cancels the booking with a full
  refund through `refund_due`, counts on the driver, and removes the
  booking's reviews.
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
  who changed it, when and why.
- Profiles show the rating ("4.8 (12 ratings)"), "Reliability: 96%" or
  "Not enough trips yet", and the reviews with "As a driver" or "As a
  passenger". Tapping the figure shows "Kept 24 of 25 trips and bookings"
  by role. Trip details, the driver's requests and passengers show the
  rating and the figure, and open the profile.

## 5. Pull requests and tasks

Tests come first in every task. Each PR updates the docs it touches, runs
the browser journeys, and gets a code review before it opens.

### PR 1: `docs(plans)`: this plan

- [ ] This plan, the roadmap's milestone 7, the plans index and question
      Q19

### PR 2: `feat(trips)`: trip day, dispute, review and reliability rules in the domain

- [ ] `trips/day.ts`, `bookings/disputes.ts`, `reviews/review.ts` and
      `people/reliability.ts`, with spec 8's settings and the tests of 4.1
- Verify: `pnpm --filter @shareride/domain test`

### PR 3: `feat(trips)`: trips depart and complete on their own

- [ ] Migration; the minute job (4.2); "How was your trip?" and its
      reminder in the catalogue; the moving clock for the browser tests
- Verify: integration tests (a trip departs, then completes with its
  confirmed bookings; an unpaid or cancelled booking stays as it was; a
  second run changes nothing; the reminder is skipped after a review)

### PR 4: `feat(trips)`: the trip day and "I'm here"

- [ ] `check_ins` and both check-in routes; the push and the conversation
      line; the phase and statuses in the booking and trip answers
- [ ] The trip day on the booking page and the driver's trip page
- Verify: integration tests (only the passenger or the driver; outside the
  window refused; a repeat tells nobody again); screen tests; a browser
  journey with the moving clock: both check in and each sees the other

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
- Verify: integration tests (only completed bookings, one each, 14 days,
  hidden until both); a browser journey: both review and then see each
  other's review

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
