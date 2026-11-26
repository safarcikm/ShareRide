# Spec 8: Trip day, reviews and reliability

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved (2026-11-13)

Features: E2 "I'm here" check-in, E3 Mark a no-show, E4 Trip completion,
G1 Ratings and reviews, G3 Reliability figure
([features](../product/features.md)). Related:
[pricing and seats](../product/pricing-and-seats.md#cancellations-and-reliability)
(rule M2 and reliability), [spec 6](2026-11-13-changes-and-cancellations.md)
(which cancellations count), [spec 7](2026-11-13-chat-and-notifications.md)
(notifications), [spec 13](2026-11-13-payments.md) (payouts and held
bookings).

Amended by [spec 31](2026-11-26-one-ride-one-ticket.md) (3.4): in English
a member now reads "ride" where the texts quoted here say "trip" (which
stays in "Trip day"), and the actions are named "Find a ride", "Offer a
ride" and "Publish ride". The keys keep their names;
`packages/i18n/src/messages/en.ts` has the words as they are.

## 1. Problem and goal

On the day, the driver and the passenger have to find each other at a meeting
point, sometimes in the dark or in bad weather, without sharing phone numbers
or locations. Afterwards, the next people to ride with them need an honest
picture of how it went.

Goal: a clear trip day screen with one-tap "I'm here", a fair way to handle a
passenger who doesn't come or a driver who doesn't come, trips that complete on
their own, reviews that neither side can game, and a reliability figure that
counts only what matters. The operator steps in only when the two sides
disagree.

## 2. User stories

- As a passenger, I open the booking on the day and see the car, the meeting
  point photo and where to stand, and tap "I'm here" when I arrive.
- As a driver, I see who gets in at the next stop and whether they have
  arrived.
- As a driver, I mark a passenger who didn't come after waiting, and I am still
  paid.
- As a passenger whose driver never came, I report it and get my money back.
- As a passenger, I rate the driver after the trip and see their review of me
  only once I have written mine.
- As a driver, I check a passenger's reliability before accepting their
  request.

## 3. Behaviour

### 3.1 Trip day screen

From 3 hours before the planned time at a booking's boarding stop (or the
trip's first stop for the driver), the booking and the trip open in a trip day
view. It is built to be used while parked: large buttons and no typing needed.

- **Passenger:** time, meeting point with photo, "where to stand" and
  "Directions" (spec 2); the car's make, model, colour and number plate; the
  driver's first name and photo; "I'm here"; the chat (spec 7); and, after the
  wait time, "The driver didn't come" (3.4).
- **Driver:** the stops in order with their planned times; at each stop, who
  gets in and out, with seats and a status: not here yet, here, or no-show; "I'm
  here" for the next stop; "Mark as no-show" after the wait time (3.3); a chat
  button per passenger and "Message all passengers" (spec 7).
- "Before you go" and "share trip details" are spec 9.
- Since [spec 31](2026-11-26-one-ride-one-ticket.md) (3.9) the passenger's
  trip day has no heading of its own: the booking's title counts down
  ("Leaves at 10:00", then "Leaves in 10 minutes", then "Trip day"), with
  "Today at 10:00 from Borgarnes." under it, and says "Anna is at the
  meeting point" once the driver said "I'm here". Where to stand comes
  first, then the driver with **Message** and the number plate as a tag,
  then the ride as a ticket and the rows. "I'm here" is in a bar at the
  bottom of the screen, on the first screen with no scrolling (at the top
  of the side column on a laptop). "The driver didn't come" is a link in
  that bar: under "I'm here" while that can be pressed, and the bar's main
  button after.
- Since spec 31 (3.9 and 3.12) the driver's trip day is the first part of
  the driver's ride: the stops with who gets in and out, then the
  passengers, the ticket and the rows. "I'm here at Mjódd bus terminal"
  is the main button, in the bar at the bottom (at the top of the side
  column on a laptop), for the first stop that is open, with another open
  stop outlined under it. Before a stop opens the bar says from when;
  once said, it says the passengers were told, and so does the stop.
  Message is the round button on a passenger's row.

### 3.2 "I'm here" (E2)

1. One tap tells the other side that you have arrived at the meeting point.
   A driver's tap goes to every passenger getting in at that stop; a
   passenger's tap goes to the driver. It also appears as a line in the chat.
2. It can be used from 30 minutes before to 60 minutes after the planned time
   at that stop. It records only the time. No location is collected or
   checked.
3. The records matter if the two sides later disagree (3.5).

### 3.3 A passenger doesn't come (E3)

1. The driver can mark a confirmed passenger as a no-show once the wait time
   has passed: 10 minutes after the planned time at their boarding stop
   (decision 2), and
   only after the driver tapped "I'm here" at that stop.
2. The driver confirms, with an optional note for the operator. The passenger
   is told at once (push and email) and can answer "That's right" or "That's
   not right" with a note, within 24 hours after the trip completes.
3. If the passenger agrees or does not answer, the no-show stands: no refund
   (rule M2), the driver is paid (rule M3), and it counts on the passenger's
   reliability.
4. If the passenger contests it, the booking's payout is held (spec 13) and
   the operator decides (3.5).
5. Since [spec 31](2026-11-26-one-ride-one-ticket.md) (3.19) the screen
   that marks a no-show, and the one that answers it, have their title at
   the left over the passenger's part as a ticket, and their main button
   ("Mark as no-show", "Send answer") in the bar at the bottom, with why
   it did nothing over it.

### 3.4 The driver doesn't come

1. Once the wait time has passed after the planned time at their boarding
   stop, a passenger can report "The driver didn't come", with an optional
   note. This is possible until 24 hours after the trip completes.
2. The booking's payout is held at once (spec 13), and the driver is told
   "{passenger} says you didn't come." and asked "Is this right?", as a
   passenger marked as a no-show is (section 8), with 24 hours to answer.
3. If the driver agrees or does not answer, the booking is cancelled as if by
   the driver (reason: the driver didn't come), even if the trip has already
   completed. The passenger gets a full refund, it counts on the driver's
   reliability like a cancellation (spec 6), and any reviews of that booking
   are removed.
4. If the driver contests it, the operator decides (3.5).
5. Since [spec 31](2026-11-26-one-ride-one-ticket.md) (3.8 and 3.9) "The
   driver didn't come" is in the bar on the trip day (3.1), and one of the
   booking's rows once the ride is over, for as long as it can be said.
   Its screen, and the driver's answer, have the title at the left over
   the booked seat as a ticket, and "Tell PuffinRide" or "Send answer" as
   the main button in the bar (3.19).

### 3.5 When the two sides disagree

The operator console lists contested cases with what the system knows: both
"I'm here" times, the planned times, any trip changes, the notes, and the
booking's chat, which the operator may read for this purpose (spec 7, R7.3).
The operator decides which side is right; the decision sets the refund, the
payout and the reliability effect as in 3.3 and 3.4, and both sides are told.
A contested no-show the operator finds wrong ends in one of two ways
(decision 4): the passenger rode, so the booking completes, the driver is
paid and nothing counts against either side; or the passenger was left
behind, which is a driver absence: a full refund that counts on the
driver. A contested driver absence found wrong ends in one of two ways
too (decision 5): the passenger rode, so the booking goes
on and nothing counts against either side; or the passenger didn't come,
which is their no-show: no refund, the driver is paid, and it counts on
the passenger.
The operator's decision is final in the app; the terms of use say how to
complain further.

### 3.6 Trip completion (E4)

1. A trip **departs** at the planned time of its first stop. From then on it
   cannot be changed (spec 6, R6.1), but a later stop can still be booked
   until its own cut-off (rule S4; Martin, 2026-11-16, A45).
2. It **completes** on its own 2 hours after the planned time of its last
   stop. Every confirmed booking that is not a no-show and has no open "driver
   didn't come" report becomes **completed**.
3. Completion opens reviews (3.7) and starts the 24-hour payout delay (rule
   M3). No-shows must be marked before completion.

### 3.7 Ratings and reviews (G1)

1. After completion, the passenger rates the driver and the driver rates each
   passenger: 1 to 5 stars and an optional comment of up to 500 characters,
   with no phone numbers, email addresses or links.
2. Reviews can be written for 14 days after completion. A review stays hidden
   until both sides have reviewed each other, or the 14 days have passed, so
   neither can answer the other's review. It cannot be edited after it is
   sent.
3. Only completed bookings can be reviewed: no-shows, cancellations and
   disputes still open are handled through reliability and the operator, not
   reviews.
4. A rating of 1 or 2 asks "Did something go wrong?" and offers a report
   (spec 9).
5. **On the profile:** the average rating with one decimal and the number of
   ratings, and the reviews, newest first, each with the author's first name,
   month and year, and whether they rode as driver or passenger. Reviews of a
   deleted account's author show "A former member".
6. People are reminded to review when the trip completes and once more after 3
   days, using the trip reminders switch (spec 7).
7. Since [spec 31](2026-11-26-one-ride-one-ticket.md) (3.8) a passenger's
   completed booking asks in its title, "How was your ride?", with until
   when it can be reviewed under it, while it can; **Rate the driver** is
   the page's main button, in the bar at the bottom. A review sent, the
   other's review and why a ride cannot be reviewed show under the title,
   as before. The rating's own screen (3.19) has "How was your ride?" at
   the left, with the day over it and the part under it; "Send review" is
   its main button, in the bar, with "Choose a rating from 1 to 5 stars."
   over it when none is chosen; and once sent, or when the ride cannot be
   reviewed, the way back is the main button.

### 3.8 Reliability (G3)

1. Each profile shows one reliability figure across both roles: the share of
   trips and bookings the person kept, out of those that count, over the last
   12 months. It is shown once 5 count; before that the profile says "Not
   enough trips yet" (decision 3).
   - **Kept:** a completed booking, as passenger; a completed trip with at
     least one passenger, as driver.
   - **Not kept:** a no-show or a passenger cancellation that counts (spec 6,
     R6.8); a driver's trip or booking cancellation that counts (spec 6), or a
     driver absence that stands.
   - Nothing else counts: early cancellations, withdrawn requests, unpaid
     bookings, trips without passengers.
2. Cancellations with the reason weather or road closed do not count. In the
   beta the reason is trusted as given. The console lists these
   cancellations, and the operator can overrule a clearly wrong one, which
   then counts; repeated misuse leads to a warning (decision 1). Automatic
   checks against official warnings and closures come later (Phase 4).
3. Tapping the figure shows the counts behind it, by role.
4. Nothing is suspended automatically. The operator sees who falls below 80%
   and decides on a warning or a suspension
   ([pricing and seats](../product/pricing-and-seats.md#cancellations-and-reliability)).

### 3.9 Notifications

Sent through spec 7, in the recipient's language:

| Event | Who is told | Channels |
| ----- | ----------- | -------- |
| "I'm here" | The other side at that stop | Push |
| No-show marked | Passenger | Push and email |
| Driver didn't come reported | Driver | Push and email |
| Dispute decided by the operator | Both | Push and email |
| Trip completed: rate your trip | Driver and passengers | Push, and email without push (spec 20); one reminder after 3 days |
| A review about you is now visible | The person reviewed | Push |

## 4. Rules

| ID | Rule |
| -- | ---- |
| R8.1 | A trip departs at the planned time of its first stop and completes 2 hours after the planned time of its last stop. |
| R8.2 | At completion, every confirmed booking that is not a no-show and has no open "driver didn't come" report becomes completed. |
| R8.3 | "I'm here" works from 30 minutes before to 60 minutes after the planned time at that stop and records only the time. |
| R8.4 | A driver can mark a no-show only for a confirmed passenger of their own trip, after the 10-minute wait, after checking in at that stop, and before the trip completes. |
| R8.5 | A passenger can report that the driver didn't come from the wait time after their boarding time until 24 hours after the trip completes. |
| R8.6 | The other side has 24 hours to contest. Uncontested reports stand; contested ones hold the payout until the operator decides. |
| R8.7 | A no-show that stands gives no refund and counts on the passenger's reliability. A driver absence that stands gives a full refund and counts on the driver's reliability. |
| R8.8 | Reviews exist only for completed bookings, one per author per booking, written within 14 days; rating 1 to 5; comment up to 500 characters without contact details or links. |
| R8.9 | A review is revealed when both sides have reviewed, or 14 days after completion, and cannot be edited after it is sent. |
| R8.10 | Reliability is the share of trips and bookings kept out of those that count, over 12 months and across both roles, shown once 5 count (3.8). It never suspends anyone automatically. |
| R8.11 | A weather or road-closure reason is trusted in the beta; the operator can overrule a clearly wrong one, and it then counts. |

## 5. Screens

1. Trip day, passenger
2. Trip day, driver: stops, who gets in where, statuses
3. Mark as no-show (confirm, optional note)
4. The driver didn't come (confirm, optional note)
5. Answer a report: "That's right" or "That's not right" with a note
6. Rate and review
7. Profile: rating, reviews, reliability and its counts
8. Console: contested cases, weather and road-closure cancellations, people
   below the reliability watch level (spec 10 for the console layout)

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)):

- `CheckIn`: trip stop, user, booking (the passenger's; none for the
  driver's), at. One per booking, and one per stop for the driver.
- `Dispute`: booking, kind (`no_show`, `driver_absent`), raised by, raised at,
  note, answer (`agreed`, `contested`, none), answered at, answer note,
  outcome (`stands`, `rode`, `left_behind`, `passenger_absent`), decided by (system or operator), decided at.
- `Review` (existing): adds `hidden_at` for moderation (spec 9).
- `ReliabilityRecord`: user, role, booking or trip, outcome (`kept`,
  `cancelled`, `no_show`, `driver_absent`), counts or not, why not (for
  example `weather`, `early`, `trip_moved`), at; the operator can change
  whether it counts, with a note.
- `UserStats`: rating average and count, reliability kept and counted,
  updated by the worker after each event.

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `POST /trips/{id}/stops/{stopId}/check-in` | Driver: "I'm here" at a stop |
| `POST /bookings/{id}/check-in` | Passenger: "I'm here" |
| `POST /bookings/{id}/no-show` | Driver: mark a no-show |
| `POST /bookings/{id}/driver-absent` | Passenger: the driver didn't come |
| `POST /disputes/{id}/answer` | The other side agrees or contests |
| `POST /bookings/{id}/review` | Rate and review |
| `GET /people/{profileId}/reviews?role=` | Visible reviews of a person, paged; each says whether I wrote it (`mine`), as I cannot report my own ([spec 9](2026-11-13-safety-and-moderation.md)) |
| `GET /people/{profileId}` | The profile, with the rating and the counts behind the figure (spec 1) |

Console endpoints under `/admin/v1`: list and decide disputes; list weather
and road-closure cancellations and change whether one counts; the reliability
watch list.

Domain functions in `packages/domain`: trip and booking status over time
(departed, completed), check-in and no-show windows, dispute outcomes and
their money and reliability effects, review windows and reveal, and the
reliability figure.

Events: `CheckedIn`, `PassengerNoShow` (existing), `DriverAbsentReported`,
`DisputeAnswered`, `DisputeDecided`, `TripDeparted`, `TripCompleted`
(existing), `ReviewSubmitted` (existing), `ReviewsRevealed`.

The booking lifecycle in [pricing and seats](../product/pricing-and-seats.md#booking-lifecycle)
has one step for this: a completed booking becomes cancelled when a driver
absence stands.

Settings: `no_show_wait` 10 minutes, `trip_completion_delay` 2 hours,
`dispute_answer_window` 24 hours, `review_window` 14 days,
`reliability_period` 12 months, `reliability_min_count` 5,
`reliability_watch_level` 80%.

## 7. Privacy and safety

- "I'm here" stores a time, never a location.
- Reviews and the rating are public on the profile; reliability is a public
  figure with counts only, never the reasons or notes behind them.
- Dispute notes are seen by the operator only; the other side sees only that
  the report was contested and the outcome. The operator reads the booking's
  chat for a dispute, as for a report (privacy register, messages row).
- Reliability is shown to help people choose; any warning or suspension is a
  decision by a person, never automatic, so no solely automated decision
  affects anyone.
- The trip day screen is designed for use while parked, with no typing, and
  reminds drivers not to use the phone while driving.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `tripDay.title` | Trip day | Ferðadagur |
| `tripDay.imHere` | I'm here | Ég er á staðnum |
| `tripDay.toldDriver` | We've told the driver you're here. | Við létum bílstjórann vita að þú sért á staðnum. |
| `tripDay.toldPassengers` | We've told your passengers you're here. | Við létum farþegana vita að þú sért á staðnum. |
| `tripDay.otherHere` | {name} is at the meeting point | {name} er á mótsstaðnum |
| `tripDay.parkedOnly` | Use this only when parked. | Notaðu þetta aðeins þegar bíllinn er kyrr. |
| `tripDay.statusNotHere` | Not here yet | Ekki á staðnum enn |
| `tripDay.statusHere` | Here | Á staðnum |
| `tripDay.statusNoShow` | No-show | Mætti ekki |
| `tripDay.markNoShow` | Mark as no-show | Skrá fjarvist |
| `tripDay.noShowConfirm` | Mark this passenger as a no-show? They get no refund, and it shows on their profile. | Skrá fjarvist farþegans? Engin endurgreiðsla, og þetta sést á prófíl farþegans. |
| `tripDay.driverAbsent` | The driver didn't come | Bílstjórinn kom ekki |
| `dispute.question` | Is this right? | Er þetta rétt? |
| `dispute.agree` | That's right | Það er rétt |
| `dispute.contest` | That's not right | Það er ekki rétt |
| `dispute.decided` | ShareRide has looked into it and decided. | ShareRide hefur skoðað málið og tekið ákvörðun. |
| `review.title` | How was your trip? | Hvernig var ferðin? |
| `review.rateDriver` | Rate the driver | Gefðu bílstjóranum einkunn |
| `review.ratePassenger` | Rate your passenger | Gefðu farþeganum einkunn |
| `review.comment` | Tell others what it was like (optional) | Segðu öðrum frá ferðinni (valfrjálst) |
| `review.hiddenUntil` | Your review appears when the other person has reviewed too, or after 14 days. | Umsögnin birtist þegar hinn aðilinn hefur líka skrifað umsögn, eða eftir 14 daga. |
| `review.lowRating` | Did something go wrong? | Fór eitthvað úrskeiðis? |
| `review.asDriver` | As a driver | Sem bílstjóri |
| `review.asPassenger` | As a passenger | Sem farþegi |
| `review.formerMember` | A former member | Fyrrverandi notandi |
| `profile.rating` | {rating} ({count, plural, one {# rating} other {# ratings}}) | {rating} ({count, plural, one {# einkunn} other {# einkunnir}}) |
| `profile.reliability` | Reliability: {percent} | Áreiðanleiki: {percent} |
| `profile.reliabilityNew` | Not enough trips yet | Ekki nógu margar ferðir enn |
| `profile.reliabilityCounts` | Kept {kept} of {total} trips and bookings | Staðið við {kept} af {total} ferðum og bókunum |

## 9. Testing

- **Unit (domain):** departure and completion times; check-in window edges;
  no-show refused before the wait time, without a check-in, for another
  driver's passenger and after completion; driver absence window edges;
  every dispute path (agreed, no answer, contested and decided either way)
  with its refund, payout and reliability effect; review window and reveal
  (both reviewed, one reviewed and 14 days passed, none); the reliability
  figure for every counted and excluded case, including exactly 24 hours
  before boarding, weather overruled by the operator, and the minimum count.
- **Property tests:** the rating average and reliability counts always match
  the records they come from.
- **API integration:** only the right person can check in, mark a no-show,
  report, answer or review; repeating a request has no extra effect; an open
  dispute holds the payout and a decision releases or refunds it (spec 13).
- **End to end, with a fake clock:** a full trip day with check-ins and one
  no-show; a contested no-show decided by the operator; a driver who didn't
  come and didn't answer, leading to a full refund; both sides review and see
  each other's reviews.
- **Manual:** the trip day screens outdoors in daylight and darkness, with a
  screen reader, and with gloves on.

## 10. Out of scope

Live location sharing; public replies to reviews; editing reviews; automatic
weather and road-closure checks (Phase 4, [integrations](../architecture/integrations.md));
reporting, blocking and sharing trip details (spec 9); the
console's layout (spec 10).

## Decisions

Accepted by Martin on 2026-11-13 as recommended.

| # | Question | Decision |
| - | -------- | -------- |
| 1 | How are weather and road-closure cancellations checked in the beta, before we connect the Met Office and Road Administration data? | Trust the reason the person gives. The console lists these cancellations so you can overrule a clearly wrong one, which then counts. Repeated misuse leads to a warning |
| 2 | How long must a driver wait before marking a passenger as a no-show? | 10 minutes after the planned time at that stop. The passenger can report that the driver didn't come after the same wait |
| 3 | How is reliability counted and shown? | One figure per person, across both roles, over the last 12 months: kept trips and bookings out of those that count. Shown once there are 5 that count. Counted: completed bookings and trips with passengers (kept); no-shows, driver absences and cancellations that count under spec 6 (not kept). The operator watches anyone below 80% |
| 4 | When a passenger contests a no-show and the operator finds the driver was wrong, what happens? (Q19, accepted by Martin on 2026-11-16) | The operator picks one of two outcomes. "They rode": the booking completes, the driver is paid, and nothing counts on either side. "They were left behind": as a driver absence, a full refund that counts on the driver |
| 5 | When the driver contests a passenger's "The driver didn't come" and the operator finds the driver was there, what happens? (Q20, accepted by Martin on 2026-11-16) | The operator picks one of two outcomes, as for a no-show. "They rode": the booking goes on and completes, the driver is paid, and nothing counts against either side. "They didn't come": the passenger's no-show, with no refund, the driver paid, and it counts on the passenger |
