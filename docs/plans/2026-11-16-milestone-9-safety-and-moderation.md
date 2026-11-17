# Milestone 9 plan: safety and moderation

**Owner:** Martin · **Date:** 2026-11-16 · **Status:** In progress; the
choices in section 3 accepted by Martin on 2026-11-16 as recommended

Lets people get help fast, tell someone where they are going, keep away
from someone, and report bad behaviour knowing it will be looked at. Gives
the operator a queue to handle reports, act on them and explain each
decision. It implements [spec 9](../specs/2026-11-13-safety-and-moderation.md)
on top of milestones 4 to 6.

It is built in parallel with milestone 7 (trip day, reviews and
reliability) and milestone 8 (the operator console, spec 10's shell and
spec 2's meeting points). The work is split so the three do not clash:

| Milestone 8 (console) owns | This milestone owns |
| -------------------------- | ------------------- |
| The console app (`apps/admin`), its shell and sections | Reports, blocks, moderation actions, appeals and operator notes |
| The operator role, passkey sign-in and the `/admin/v1` guard | The reports queue and report pages in the console |
| The `audit_log` table, `recordAudit` and the audit log page | Spec 9, 3.5: users, trips and bookings search and detail pages |

Milestone 7 owns `disputes` (no-shows and a driver who didn't come) and
`reviews`, which comes with a `hidden_at` column for this milestone to use.
Reporting a review waits for milestone 7's reviews and public profiles.

It needs no new service or dependency: SMS, push, email and refunds are in
place (milestones 2, 4 and 5).

## 1. Goal

When this milestone is done, on the web and on an Android test build:

- Before a winter trip to Akureyri, Jón opens his booking. "Emergency: 112"
  is on it, below the booking's own actions. "Before you go" links to the weather, road conditions and
  SafeTravel. He taps "Share trip details" and sends his partner the date,
  the meeting point, Anna's first name and her car with its number plate.
- After a trip, Sigga reports a driver who drove dangerously. The report
  screen first says "If you are in danger, call 112 now". Martin's phone
  buzzes at once. He opens the report in the console, reads the trip and
  the driver's earlier reports, and suspends the driver for 30 days with a
  reason. The driver's two upcoming trips are cancelled with full refunds,
  and the driver gets the statement of reasons. Sigga's report says "We've
  taken action".
- Gunna blocks a passenger who kept messaging her. Their chat becomes
  read-only, neither sees the other's trips, and she is asked whether to
  cancel the booking they share.
- The suspended driver opens the app, sees why and until when, and appeals.
  Martin answers the appeal in the console.

## 2. Scope

| In milestone 9 | Later |
| -------------- | ----- |
| Rules in the domain: who sees whom, reports, suspension and its effects, alert times | Holding and releasing payouts (spec 13). A report on a booking marks it now, so payouts skip it when they come (R9.3) |
| "Emergency: 112", "Before you go" and "Share trip details" on trip details, the booking and the driver's trip page | Placing them on the trip day layout: milestone 7's PR 4 does that with the component built here |
| Block and unblock, the blocked list, and blocks in search, trip pages, booking and chat | Blocking from the public profile: added once milestone 7's profile merges |
| Report a person, trip, message or booking problem; my reports and their outcomes; alerts to the operator | Reporting and hiding a review: once milestone 7's reviews merge |
| Moderation actions with a statement of reasons and an appeal; suspension, reinstatement, warnings, hidden content, operator cancellations and refunds | Withdrawing access to women-only trips: spec 14 is not built |
| The suspended account screen | Profile photos: none exist yet (milestone 2's photo PR) |
| Console: the reports queue, the report page and its actions, appeals, and the users, trips and bookings pages (3.5) with notes and decline rates | The console's shell, sign-in and audit log page (milestone 8) |

## 3. Decisions for Martin

| # | Choice | Recommendation | Why | Alternative |
| - | ------ | -------------- | --- | ----------- |
| 1 | How people read a statement of reasons and appeal | **In the app.** Each action that affects someone appears in Profile, under "Notices", with what was done, the rule, the content and an "Appeal" box for 14 days. The appeal lands in the console, and the answer comes back to the notice. An email with the same statement also goes to everyone with a verified email, and says to appeal in the app | Email is optional (spec 1, decision 5), so many people could not appeal by email. It needs no inbox to watch, and each appeal is kept with its action | Reply to the email, as spec 9 says: needs a domain, an inbox and a way to match replies to actions, and people without an email cannot appeal |
| 2 | Whether a block keeps two passengers out of the same car | **Yes.** Someone who blocked you, or whom you blocked, being booked on a trip hides that trip from you and refuses your booking, silently | Spec 9 covers trips the other person drives. A passenger who blocks another passenger for harassment would otherwise still meet them in the car | Blocks apply only between a driver and a passenger, as spec 9 says. Simpler, but two passengers can still end up side by side |
| 3 | What a suspension does to the suspended person's own bookings as a passenger | **A full refund to them**, as with every operator cancellation (spec 9, 3.4) | One rule for every cancellation the operator makes; the driver's seat is free to book again at once | The normal cancellation rules (spec 6), as if they had cancelled: the driver keeps a share when it is late, but the operator then decides what someone else pays |

**Decision 2 revised on review (2026-11-16, Martin confirmed 2026-11-17):** closing
a trip because someone in a block is booked on it would show the blocker
which rides the other person booked (compare a signed-in search with a
signed-out one), and a block can be made through any booking ever shared.
Blocks therefore close only the trips the other person drives, as spec 9
says; two passengers in a block can still share a car.

Spec 9 says "the rule it concerns" for each action, but the community
rules are not written yet. Until they are, the operator picks from a
fixed list that matches the report categories (safety, harassment,
discrimination, payment outside the app, false information, offensive
content, trip not as listed, reliability, other). The list moves to the
rules' own headings once the lawyer has reviewed them.

## 4. Design notes

### 4.1 Rules (domain)

In `packages/domain/src/safety/`, free of I/O like the rest, with spec 9's
numbers in `SafetySettings` (`safety/settings.ts`): `textMaxLength` 1 000
(a description, a reason or an appeal, counted as chat counts characters),
`bookingReportHours` 24 after completion, `responseHours` 24,
`smsAlertFromHour` 7 and `smsAlertUntilHour` 23 Reykjavik time,
`appealDays` 14 and `reportsPerDay` 10.

- `blocks.ts`: `isBlockedBetween(blocks, a, b)` in either direction, and
  `hiddenFrom(blocks, me)`, the people I don't see and who don't see me
  (R9.4). `checkBlock(me, other)` refuses `self`.
- `reports.ts`: `reportSubjects` (`user`, `trip`, `message`, `review`,
  `booking`) and `reportCategories` (`safety`, `harassment`,
  `discrimination`, `scam`, `false_info`, `offensive`, `not_as_listed`,
  `other`). `checkReport(reporterId, context, draft, now, settings)`
gives the person reported and whether it is urgent, and refuses `own` (yourself,
  your own trip, message or review), `not_involved` (a message only by a
  member of its conversation, a booking only by its passenger or driver),
  `too_long` and `window_closed` (a booking more than 24 hours after its
  trip completed) (R9.1). `isUrgent(category)`, `holdsPayout(report)`
  (R9.3), `responseDueAt(report)` (R9.9) and `queueOrder` (urgent first,
  then oldest).
- `alerts.ts`: `alertChannels(urgent, now, settings)` gives push, plus SMS from 07:00 to
  23:00 Reykjavik time (R9.9, spec 9 decision 4).
- `suspension.ts`: `isSuspended(user, now)` (until the end date, or for
  good without one); `checkSuspension(input, now)` refuses a missing
  reason or rule and an end in the past; `suspensionEffects(trips,
  bookings, now)` lists the upcoming trips the person drives and the
  bookings they have not boarded yet, even at a later stop of a trip under
  way, each to cancel with a full refund (R9.10, decision 3);
  `checkActive(user, now)` refuses `restrictedActions`: searching,
  booking, requesting, posting or changing a trip, sending a message and
  reviewing. Reading their own data, reporting, blocking and appealing
  stay open.
- `moderation.ts`: the action kinds and rules, `checkStatement`, appeals
  (`checkAppeal`, `appealDueAt`), and `operatorTripCancellation`: a full
  refund, and it counts on the driver only when the operator says so
  (3.4).
- `before-you-go.ts`: `leavesCapitalArea(stops)`, true when any stop's
  meeting point is outside the `capital` region (3.3).

Tests: each refusal at its edge (1 000 and 1 001 characters; 24 hours
after completion and a second later; SMS at 06:59, 07:00, 22:59 and
23:00); blocks both ways; a suspension with and without an end date; which
trips and bookings a suspension cancels (published and not departed;
requested, awaiting payment and confirmed and not yet boarded; never
completed).

### 4.2 Safety on the trip

- A `TripSafety` component in `apps/mobile/src/safety/`, which milestone
  7's trip day places on its own layout:
  - **"Emergency: 112"** opens the phone's dialler (`tel:112`).
  - **"Before you go"**, only when the trip leaves the capital area:
    vedur.is, umferdin.is and safetravel.is, in the reader's language
    where each site has it, from the regions of the stops the viewer
    travels between.
  - **"Share trip details"** opens the share sheet with spec 9's text. The
    booking's version needs a confirmed booking, since the plate comes
    only then (R5.12). The driver's version has the date, time and route
    only: the passengers' names are not the driver's to share. On a web
    browser without a share sheet, the text is copied and the button says
    so. Nothing is stored (R9.8).
- Shown on trip details (without Share, which already shares its link),
  the booking page while it holds seats until the passenger's last stop's
  time, and the driver's trip page until the last stop's time, below the
  trip's main actions. An earlier draft of this plan also put 112 in the
  conversation's header; spec 9 asks for the trip page, the booking and
  the trip day screen, so it stays out.

### 4.3 Blocks

- `blocks`: blocker, blocked and when; one per pair and direction; gone
  when either account is deleted.
- People are blocked through something the two share, never by their own
  ID: user IDs are uuidv7 and show when the account was made, so the API
  never shows them to another person. `POST /v1/bookings/{id}/block`
  blocks the other person of a booking of mine and answers the bookings
  and requests the two still have together. `GET /v1/me/blocks` lists
  whom I blocked (the block's own ID, first name, colour and since), and
  `DELETE /v1/me/blocks/{id}` lifts one of mine. Both changes are safe to
  repeat.
- In effect both ways (R9.4), for the trips the other person drives; a
  trip someone else is booked on stays open, since who is booked is
  private (decision 2, revised):
  - Search, rides leaving soon and trip details leave the trip out, as if
    it did not exist (`not_found`). Signed out, anyone sees public trips;
    a block cannot change that, but booking needs signing in.
  - Booking and requesting refuse with `not_found`.
  - Sending a message refuses with `chat_closed`, as a closed chat does,
    and `canWrite` is false. The conversation shows "This chat is closed.
    You can still read it.", never telling the blocked person who blocked
    whom. The driver's message to all passengers skips them. ShareRide's
    own trip news (changes, cancellations, check-ins) still reaches both.
- Block from the conversation, beside the other person's name, now, and
  the public profile once milestone 7's merges (through the profile's own
  public reference, not a user ID). The confirmation is spec 9's
  `block.confirm`, on its own screen. Once blocked, the screen lists the
  bookings and requests the two still have together, on any trip, each
  with the usual way out (spec 9 decision 1): Cancel opens the
  cancellation screen with its reasons and refund; a request is withdrawn
  by the passenger or declined by the driver there and then. Blocking
  alone changes no refund. The blocker's conversation says "You blocked
  {name}" and where to unblock; the other person's says only that the
  chat is closed (`blockedByMe`).
- Settings gains a "Safety" section, as spec 9 puts it there: Blocked
  people (with Unblock) now, and My reports with PR 5. The community rules
  stay with the other legal documents.

### 4.4 Reports

- `reports`: reporter, subject kind and the record (trip, booking,
  message, later review), the person reported (the driver of a trip, the
  sender of a message, the other side of a booking), the conversation a
  message report unlocks (R9.6), category, description, `urgent`, status
  (`open`, `closed`), outcome (`action_taken`, `no_breach`), who closed it
  and when. The reporter and the person reported become empty if their
  account is deleted, and the report is kept (spec 9, section 7).
- `POST /v1/reports` and `GET /v1/me/reports`. At most 10 reports a day
  per person, with the rate limits we already have.
- A new report queues `report_filed` to every operator: push, and SMS for
  an urgent one from 07:00 to 23:00 (R9.9). The notification says only
  "New safety report" or "New report", never who or what. Closing a
  report queues `report_closed` to the reporter, in general terms (3.1.6).
- Chat clean-up keeps a conversation that a report covers until the
  report's own retention ends.
- **Report screen** (`/report`): what is reported, then the category; for
  safety, spec 9's 112 notice with a call button first; then the
  description with its count, the community rules link and "Send report".
  Thanks: "Thank you. We look at every report", and "Block this person
  too" when it was about a person.
- Entry points: trip details ("Report this trip"), the conversation's menu
  ("Report this person"), a message's menu on long press or right click
  ("Report message"), the booking page and the driver's trip page ("Report
  a problem with this trip", until 24 hours after completion). The booking
  problem screen points to milestone 7's "The driver didn't come" when
  that exists.

### 4.5 Moderation actions, suspension and appeals

- `moderation_actions`: the person affected, kind (`warning`,
  `content_hidden`, `suspension`, `reinstatement`, `trip_cancelled`,
  `refund`), the report if any, the rule, the reason (written for the
  person), the content affected (its kind and ID), the end of a
  suspension, by, when, and the appeal (text, when, the answer, its
  outcome `upheld` or `reversed`, when answered).
- `users.suspended_until` (empty with `suspended` means for good);
  `hidden_at` on messages, on the trip note (`trips.note_hidden_at`) and
  on the bio (`users.about_hidden_at`). A hidden message reads "Removed by
  ShareRide" to both people; a hidden note or bio is simply not shown.
- `operator_notes`: person, text, by, when (PR 8, with Add note).
- Each action is one function in `apps/api/src/modules/moderation/`, run
  in one transaction with its `recordAudit` entry (R9.7) and its
  `moderation_action` notification (the statement of reasons by email and
  push, decision 1):
  - `suspend` sets the status and end, then cancels the trips and
    bookings of `suspensionEffects` through milestone 6's cancellation
    code as the operator, with full refunds. The other people get the
    usual "cancelled" notification, never why (R9.10).
  - `reinstate`, `warn`, `hideContent`, `cancelTrip` (through
    `cancelTripAsOperator`), `closeReport` and `answerAppeal`;
    `refundBooking` comes with payouts (spec 13), which own refunds
    outside a cancellation.
- Requests from a suspended person to search, book, request, post, change
  a trip, send a message or review get 403 `account_suspended`. The
  minute job ends suspensions whose end has passed and tells the person.
- Found while building (PR 6a, safety first, easy to undo): a trip under
  way that a suspended person drives carries on but takes nobody new. It
  leaves search, booking it is refused as `trip_not_bookable`, and its
  driver can decline a request but not accept one. A suspended person
  stays signed in, as spec 9, 3.6.2 needs; security.md said before that
  their sessions end.
- Found while building (PR 6d): a different note or About you is new
  content, shown again until the operator hides it too; the same text
  saved again stays hidden, and "Post again" leaves a hidden note out. A
  reversed appeal shows hidden content again only if it is still the one
  hidden. A message to all passengers is one message: hiding it hides
  every copy, with one notice. A message removed before its push went out
  sends none. In "Download my data", the sender keeps their own words,
  marked removed, and the other person reads "Removed by ShareRide".
  A review is hidden the same way (`reviews.hidden_at`, from milestone
  7): it no longer shows to the person it is about, nor counts in their
  rating. A review whose author's account was erased stays under the
  former member and can still be hidden, with no notice. Reversing an appeal on a cancelled trip leaves
  the cancellation, and whether it counts on reliability is changed on
  the trip (3.5.3, PR 8). Left for later: a notice names the kind of
  content, not which trip or message, so the operator's reason says
  which; the driver's own trip and profile do not yet show that a note or
  About you is hidden; the API still takes a report of a removed message,
  which the app does not offer.
- `GET /v1/me/notices` and `POST /v1/me/notices/{id}/appeal` (once, within
  14 days).
- **Suspended account screen**, in place of Find and Offer: until when,
  the reason, what is closed and what stays open, "Read why and appeal"
  to Notices, and My rides. Messages and Profile (with privacy, milestone
  10, and Sign out) stay as they are; an action refused meanwhile says
  where to read why.

### 4.6 The console

Behind milestone 8's guard, each route writing its audit entry:

- `/admin/v1/reports`: open reports, urgent first, then oldest, with the
  time left to 24 hours. A report's page shows spec 9's 3.4.2: the report,
  the related records, earlier reports by and about both, ratings and
  reliability once milestone 7 has them, and recent trips.
  `GET /admin/v1/reports/{id}/conversation` opens the conversation only
  for a message report, and is logged (R9.6).
- Actions on the report page: close with "no breach" or "action taken",
  warn, hide content, suspend, cancel a trip, refund a booking. Each asks
  for the rule and the reason, and shows the statement before it goes.
- Appeals: a list of open appeals, and an answer that is final.
- Users, trips and bookings (3.5): search, the detail pages, Suspend,
  Reinstate and Add note on the user page, and each driver's request
  decline rate (3.4.5).

## 5. Pull requests and tasks

Tests come first in every task. Each PR updates the docs it touches, runs
the browser journeys, and gets a code review before it opens. Before the
beta, each ships in one deploy ([conventions](../engineering/conventions.md#database)).
Each migration is generated on top of the latest main right before
merging, and generated again if another thread's lands first.

### PR 1: `docs(plans)`: this plan

- [x] This plan, the roadmap's milestone 9 and the plans index

### PR 2: `feat(safety)`: safety rules in the domain

- [x] `safety/` with the settings and the tests of 4.1
- Verify: `pnpm --filter @shareride/domain test`

### PR 3: `feat(safety)`: emergency, before you go and share trip

- [x] `TripSafety` on trip details, the booking page and the driver's
      trip page, with `leavesCapitalArea` from the stops' regions the
      answers already carry; the texts in both languages
- Verify: screen tests (112 opens `tel:112`; the links only for a trip
  leaving the capital area; the shared text for a confirmed booking and
  for a driver, without passengers' names; copy on the web without a share
  sheet); the booking journey finds 112, the links and Share on a
  confirmed booking

### PR 4: `feat(safety)`: block and unblock

- [x] `blocks` and its routes; blocks in search, rides leaving soon, trip
      details, booking, requesting and chat
- [x] Block in the conversation with the bookings together; the Safety
      section in Settings and Blocked people
- Verify: integration tests (each way, and for two passengers; repeat is
  safe; the message to all passengers skips them); a browser journey:
  block, lose each other's trips, unblock

### PR 5: `feat(safety)`: reports and the operator's alert

Built in two parts: 5a the reports themselves, 5b the operator's alert.

- [x] 5a: `reports` and its routes; chat clean-up keeps covered
      conversations; a booking says whether its problem can still be
      reported (`problemReportable`)
- [x] 5a: The report screen, its entry points (trip details, the
      conversation and a message pressed and held or right-clicked, the
      booking page, a request and each passenger on the driver's trip
      page), and My reports in Settings; no name in any address; a person
      report from the chat raises Q22
- [x] 5b: `report_filed` to operators by push, and SMS from 07:00 to 23:00
      for a safety report (`report_filed_urgent`)
- Verify: integration tests (each subject and refusal, the daily limit,
  the alert's channels by time, never the reporter's name to anyone); a
  browser journey reports a trip and sees it in My reports

### PR 6: `feat(moderation)`: actions, suspension and appeals

In four parts, each its own pull request:

- [x] 6a: `moderation_actions` and `suspended_until` (migration
      `0035_moderation`); `suspend`, `warn` and `reinstate` with their
      audit entries and notices; ShareRide's cancellation of a trip and of
      a booking (`trips.cancelled_by`); refusals while suspended, and a
      suspended person stays signed in; ends in the minute job
- [x] 6b: `GET /v1/me/notices` and the appeal; `closeReport` (with
      `report_closed` to the reporter) and `answerAppeal` (with
      `appeal_answered` to the person; reversing the suspension they are
      under lifts it); migration `0036_appeals`
- [x] 6c: Notices with Appeal (Profile, and where a notice's push
      opens), and the suspended account screen in place of Find and
      Offer; `suspension` in `GET /v1/me`; a browser journey with a
      suspension made by the test API (`POST /e2e/suspend`)
- [x] 6d: the `hidden_at` columns (migration `0037_hidden_content`);
      `hideContent` for a message, a trip's note and About you
      (reversing it on appeal shows the content again), and `cancelTrip`
      with the driver's notice; "Removed by ShareRide" in the chat.
      `operator_notes` moves to PR 8 and `refundBooking` to payouts
- Verify: integration tests (a suspension cancels upcoming trips and
  bookings with full refunds and tells the others without the reason; a
  suspended person can read but not act; an appeal once, within 14 days;
  every action writes one audit entry); a browser journey with a
  suspension made by the test API

### PR 7: `feat(console)`: reports queue, report page and appeals

- [x] 7a: `/admin/v1/reports` and the report page, the logged
      conversation, the actions (close, warn, suspend, reinstate, hide
      content, cancel a trip) and the appeals
- [ ] 7b: their console pages, with the statement shown before it goes
- Verify: integration tests (only the operator; only a message report
  opens a conversation, and it is logged); a console browser journey:
  dismiss one report, suspend from another, the reporter sees each outcome
- Found while building (7a): the report page names a reported message
  without its words, which are read in the conversation, so every reading
  is logged. Ratings and reliability join the page with milestone 7's
  profiles. An appeal shows the action and links its report; what was
  hidden is read there.

### PR 8: `feat(console)`: users, trips and bookings

- [ ] Search and detail pages (3.5); Suspend, Reinstate and Add note
      (`operator_notes`); decline rates
- Verify: integration tests (search by name, phone, email and ID; every
  action audited); a console browser journey: find a user and reinstate
  them

### Afterwards, with milestone 7

- [ ] Report a review (hiding one is in PR 6d); Block and Report on the public profile

## 6. Review focus

What the spec implies and a person would meet first, each with its test:

1. **A block leaks who blocked whom:** every refusal reads as "not found"
   or "You can't send messages here" to both sides (PR 4 integration
   tests read both answers).
2. **A shared link to a blocked person's trip:** trip details answers
   `not_found` to a signed-in blocked person, as for a trip that is gone
   (PR 4).
3. **The reporter's name reaches the reported person:** no answer,
   notification or statement of reasons to them names the reporter (PR 5
   and PR 6 tests check every text sent).
4. **A suspension while a trip is under way:** a departed trip and its
   bookings carry on; only upcoming ones are cancelled (PR 2, PR 6).
5. **The operator's alert in the middle of the night:** push only between
   23:00 and 07:00 Reykjavik time, and the SMS never says what happened
   (PR 2, PR 5).

## 7. Martin's steps

1. Accept or change the choices in section 3.
2. Give his own account the operator role (milestone 8's command) and turn
   on push on his phone, so report alerts reach him.
3. Call 112 from the button once on a real iPhone and Android phone, and
   hang up before it connects (spec 9, section 9).
4. Read one statement of reasons in each language.

## 8. Risks

- **Three milestones at once:** migrations and shared pages can clash.
  Each migration is generated last, the safety parts are one component
  that milestone 7 places, and console pages register through milestone
  8's sections.
- **A suspension cancels many bookings at once:** it runs in one
  transaction and is safe to run twice, and the refunds go through
  milestone 6's queue, which already retries.
- **Abuse of reports:** the daily limit, and the operator sees earlier
  reports by the reporter too.
- **Blocks used to watch someone:** a block can be made through any
  booking two people ever shared, so nothing a block changes may depend on
  the other person's private bookings (decision 2, revised). Blocks close
  only the trips the other person drives, which are public anyway.

## 9. Definition of done

All eight PRs merged with green CI; a screen reader pass on the report and
block screens; the 112 button checked on real phones; docs, roadmap and
CHANGELOG updated.
