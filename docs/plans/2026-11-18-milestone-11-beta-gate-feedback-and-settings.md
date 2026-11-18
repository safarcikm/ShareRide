# Milestone 11 plan: the beta gate, feedback and operator settings

**Owner:** Martin · **Date:** 2026-11-18 · **Status:** Accepted; Martin accepted
the choices in section 3 as recommended (2026-11-18)

Closes the app to invited testers, lets them say what went wrong from any
screen, and gives the operator what he needs to run a beta from the console:
numbers he can tune without a release, switches for emergencies, weekly
figures against the exit criteria, and a way to tell testers what is
changing. It implements [spec 12](../specs/2026-11-13-beta-access-and-feedback.md)
without its waitlist, and [spec 10](../specs/2026-11-13-operator-settings-and-metrics.md),
on top of milestone 8's console.

It is built alongside the last pull requests of milestones 7, 8 and 9. The
work is split so the threads do not clash:

| Others own | This milestone owns |
| ---------- | ------------------- |
| The console app's shell, sign-in and audit log (milestone 8) | Settings, switches, invite codes, feedback, corridors, metrics and announcements, each a section added to `apps/admin/src/sections.ts` |
| Reports, the users and trips pages (milestone 9); disputes, reviews and reliability (milestone 7) | The home page's remaining "Today" counts, which only read those threads' records |
| The personal data catalogue and Download my data (milestone 10, done) | A catalogue entry and an export section for each new table |

Migrations take the next free number when each pull request merges, and are
renumbered if another thread lands first.

It needs no new service. It adds two packages to the app, both running on
the phone only: `react-native-view-shot` for the screenshot and
`expo-sensors` for the shake (PR 6).

## 1. Goal

When this milestone is done, on the web and on an Android test build:

- Martin creates the group code "Selfoss drivers" with 20 uses in the
  console and sends it to a workplace contact. Anna enters her phone
  number and the text-message code, is asked for her invite code, and
  creates her account. The console shows 149 places left.
- Jón has no code. After the text-message code he reads "ShareRide is in a
  closed beta" and no account is made. He can still search and look at
  trips.
- Anna sees a time that looks wrong. She shakes her phone, checks the
  screenshot, writes a sentence and sends it. Martin reads it in the
  console the next morning, marks it planned and replies; Anna gets the
  reply by push and email and finds it under Settings.
- The payment provider has an outage. Martin turns off new bookings with a
  reason. The app says "New bookings are paused for a short while. Your
  bookings are not affected." An hour later the console reminds him.
- On Monday Martin opens Metrics: searches, searches with a result,
  requests, bookings, seat fill and cancellations for each corridor and
  week, and a panel that marks each exit criterion met or not met.
- Martin raises the suggested rate from 15 to 16 kr per km. Before saving
  he sees Reykjavík to Akureyri go from about 5 800 kr to about 6 200 kr,
  and writes why. Trips published before keep their prices.
- Martin writes "Akranes and Borgarnes open on Monday" in both languages,
  sees that it reaches 43 people, sends it to himself first, then to
  everyone.

## 2. Scope

| In milestone 11 | Later |
| --------------- | ----- |
| Group invite codes, the invite code step in sign-up, the tester cap and "Invite code required" | The waitlist, and personal codes emailed from it: milestone 12, which needs the domain. Until then a code for one person is a group code with one use |
| The "closed beta" message for people without a code | Its link to the waitlist (milestone 12) |
| The "Beta" label | The sentence in the terms that this is a test version: with the lawyer's terms |
| Send feedback with a screenshot, the shake, my feedback, and the console's list, status and reply | Feedback from people who are not signed in |
| The settings store, the settings page with ranges, effect and history, and `GET /v1/config` | Numbers no rule reads yet (`payout_delay`: milestone 15). Numbers of later specs that stay in the code (choice 3) |
| Switches for sign-ups, trips, bookings, SMS, email and push, with the app's banner | A switch per later integration (payments, Google and Apple sign-in), each with its milestone |
| The search log, corridors, weekly figures, the exit criteria panel and CSV | Money paid out (milestone 15). Charts beyond bars per week |
| Announcements with audiences, reach, a test send, "Beta news" and a Beta news page in the app | |
| The home page's counts for reports, disputes, appeals, failed notifications, the watch list, new feedback and switches that are off | Held payouts and failed payments (milestone 15) |

## 3. Decisions for Martin

| # | Choice | Recommendation | Why | Alternative |
| - | ------ | -------------- | --- | ----------- |
| 1 | When sign-up asks for the invite code | **After the text-message code, and only when the number has no account yet.** Step 1 the phone number, step 2 the code, then "Enter your invite code", then step 3 about you | Spec 16 made signing in and signing up one flow, so the app cannot tell a new person from a member before the code. Asked first, every member would meet a question that is not for them. Asked after the code, only the number's owner learns that it has no account | First, before the phone number, as spec 12 says: "Sign in" and "Create an account" become two separate ways in again |
| 2 | Screenshots with feedback | **On phones only, kept in our own database.** The web form sends the message and the technical details without a picture | A phone can take a true picture of its own screen. A browser cannot: a library redraws the page and often gets it wrong. In the database a screenshot is read only through the console, is deleted with the account, and needs no storage account | Also on the web, with a redrawing library; or files in Hetzner storage, which waits for that account |
| 3 | Which numbers the operator can change without a release | **The 17 values of [pricing and seats](../product/pricing-and-seats.md#configuration-values) that a rule reads today, plus the tester cap, each with the range in [ADR 0032](../decisions/0032-operator-settings-list-ranges-and-versions.md).** The numbers of later specs (chat closing after 7 days, the review window and so on) stay in the code | Those 17 are the ones the specs name as the operator's. Each tunable number needs a range, an effect text and tests, and a rule that must read it from the right settings version. Another can be added by an ADR when the beta shows a need | Every number of every spec, as spec 10's 3.2.1 reads: about 25 more, most of which nobody will change |

Martin accepted all three as recommended on 2026-11-18. Choice 1
changes [spec 12](../specs/2026-11-13-beta-access-and-feedback.md), 3.2.3
and [spec 1](../specs/2026-11-13-sign-in-and-profile.md), 3.1.4, and choice
3 changes spec 10, 3.2.1; each is edited in the pull request that builds it.

## 4. Design notes

### 4.1 The settings store (spec 10, 3.2; R10.1 to R10.4)

- Rules in `packages/domain/src/settings/`:
  - `catalogue.ts`: `settingDefinitions`, one entry per key of ADR 0032:
    its group (`beta`, `switches`, `prices`, `booking`, `cancellations`,
    `trip_day`), kind (`number` or `switch`), unit, default, lowest,
    highest and step. Every value is a whole number in its unit; a switch
    is 1 or 0.
  - `values.ts`: `defaultValues`; `valuesAt(version, changes)`, the
    defaults with every change up to that version laid over them;
    `checkChange(key, value, reason, current)` refuses `unknown_setting`,
    `out_of_range`, `not_a_step`, `unchanged`, `reason_missing` (1 to 500
    characters) and `inconsistent` (ADR 0032's one cross-check: the
    suggested price of the largest car must fit under its cap).
- `setting_changes`: `version` (a whole number, one higher each time, no
  gaps), `key`, `old_value`, `new_value`, `reason`, `changed_by` (the
  operator's ID without a foreign key, as in the audit log; null for the
  command) and `created_at`. Triggers refuse updates and deletes (R10.2).
  Version 0 is the defaults. A change takes a table lock, so two changes
  at once get two versions.
- `apps/api/src/modules/settings/`: `createSettingsService` with
  `current()` (the version and its values, re-read from the database at
  most every 5 seconds and at once after a change made here), `at(version)`
  (kept in memory for good, as a version never changes), `change(...)` and
  `history(...)`. A change writes the audit entry `setting.changed` with
  the old and new value in the same transaction.
- Console routes, in `settings/admin-routes.ts`: `GET /admin/v1/settings`
  (every definition with its value and the version), `PATCH
  /admin/v1/settings/{key}` with `{ value, reason, version }` (refused with
  `settings_changed`, 409, when another change came since the page
  loaded), `GET /admin/v1/settings/history`, and from PR 11 `POST
  /admin/v1/settings/{key}/preview`.
- `GET /v1/config`, open to everyone, `Cache-Control: public, max-age=300`:
  `beta` (whether an invite code is required), `paused` (a list of
  `signups`, `trips`, `bookings`, `sms`), and from PR 11 the values the
  app shows or checks (seat limit, price steps, cut-off, deadlines). The
  app reads it at start and every 5 minutes, and falls back to the
  defaults in the domain package when it cannot.
- The console's Settings page: groups, each row with its value, unit,
  default, range and a sentence of explanation; editing asks for the
  reason and shows the effect before Save; a History tab with who, when,
  old and new value and the reason.

### 4.2 Invite codes and the gate (spec 12, 3.2; R12.1 to R12.3)

- Rules in `packages/domain/src/beta/invites.ts`:
  - codes are 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no I,
    L, O, 0 or 1); `normaliseInviteCode` upper-cases and drops spaces and
    hyphens, so "abcd-2345" works;
  - `checkInviteCode(code, testers, maxTesters, now)` gives the code to
    use up, or refuses `invite_invalid` (unknown, ended, expired or out of
    uses, one answer for all four, so codes cannot be probed) or
    `beta_full` (R12.3);
  - `checkGroupCode(draft, now)`: a name of 1 to 80 characters, 1 to 500
    uses, an end date in the future and at most 12 months ahead;
  - `placesLeft(maxTesters, testers)`. A tester is an account that joined
    with a code. An erased account's place is free again.
- `invite_codes`: `code` (unique), `kind` (`group` now, `personal` with
  milestone 12), `name`, `uses_allowed`, `uses`, `expires_at`, `ended_at`
  and `created_by`. `users.invite_code_id` records the code an account
  joined with (spec 12, 3.2.3).
- `POST /v1/auth/phone/verify` takes an optional `inviteCode`. For a number
  with no account, while `invite_code_required` is on:
  - without one it answers `invite_required` (403), keeps the
    text-message code and counts no attempt, so the app can ask for the
    invite code and send both;
  - a wrong one answers `invite_invalid` (400) and counts as an attempt on
    the text-message code, so guessing invite codes is held to the 5
    attempts per code and 5 codes an hour of sign-in;
  - at the cap it answers `beta_full` (409);
  - a good one creates the account with `invite_code_id` and adds one to
    the code's `uses`, with the code's row locked, and one lock for all
    sign-ups while the gate is on so the cap is never passed.
  A member signing in is never asked. With the requirement off, sign-up
  is as today and `invite_code_id` stays empty.
- `POST /v1/invites/check` answers whether a code would work now, for the
  link below; limited to 10 a minute per address.
- Console, in `beta/admin-routes.ts`: `GET /admin/v1/invite-codes` (each
  code with its uses, and the testers, the cap and the places left),
  `POST /admin/v1/invite-codes` (a group code; the API makes the code),
  `POST /admin/v1/invite-codes/{id}/end`. Audit entries
  `invite_code.created` and `invite_code.ended`.
- `pnpm --filter @shareride/api invite add "<name>" <uses> [days]` prints
  a new code, for the first account on a new server, before any operator
  exists.
- The app: the screen "Enter your invite code" after step 2, with the
  closed beta text for people without one. An expired text-message code
  sends the person back to step 1 with the invite code kept. A link
  `/invite/<code>` opens sign-up with the code filled in. The "Beta" label
  sits beside the logo on the main screens while `config.beta` is true.
- Development: the seed makes the group code `BETA2345` and prints it with
  the other development hints. Integration tests and the browser journeys
  turn the requirement off, except the ones that test it.

### 4.3 Feedback (spec 12, 3.3; R12.5)

- Rules in `packages/domain/src/beta/feedback.ts`: kinds (`problem`,
  `idea`, `other`), statuses (`new`, `read`, `planned`, `done`,
  `wont_do`), `checkFeedback(draft)` (a message of 1 to 2 000 characters,
  counted as chat counts them; a known platform; version, system and
  screen name within their lengths), `checkReply` (1 to 1 000 characters)
  and a limit of 10 a day per person. A screenshot is a JPEG of at most
  1 MB without metadata, checked with `checkPhotoFile`.
- `feedback`: user, kind, message, app version, platform, OS version,
  screen, language, status, reply, replied at, created at.
  `feedback_screenshots`: the feedback and the file, apart from it so
  lists never load pictures. Both are deleted with the account.
- `POST /v1/feedback` (signed in; the screenshot in base64, as meeting
  point photos are sent) and `GET /v1/me/feedback` (what I sent, and the
  replies).
- Console, in `beta/admin-routes.ts`: `GET /admin/v1/feedback` (newest
  first, by status and kind), `GET /admin/v1/feedback/{id}`, `GET
  /admin/v1/feedback/{id}/screenshot`, `POST .../status` and `POST
  .../reply` (one reply per feedback). Opening a feedback with its
  screenshot, a status change and a reply are each audited.
- A reply writes the event `FeedbackReplied`; the worker sends
  `feedback_replied` by push and email (spec 7's delivery). The push says
  only that there is a reply and opens My feedback; the email carries the
  reply.
- The app: Send feedback opens from the Beta label, from a row on Profile
  and, on phones, from a shake (`expo-sensors`; a "Shake to send
  feedback" switch in Settings, kept on the device). The picture is taken
  of the screen the person came from (`react-native-view-shot`) before
  the form opens, shown with "Check that the screenshot shows nothing you
  don't want to share", and can be removed. My feedback is under
  Settings.
- Privacy: both tables in the personal data catalogue; Download my data
  gains a "feedback" section with the screenshots as files in the ZIP;
  erasure deletes them. The hourly clean-up deletes feedback 12 months
  after "Invite code required" was last turned off, which is how the
  system knows the beta ended (spec 12, section 7).

### 4.4 Switches (spec 10, 3.3; R10.5)

Six settings of the kind `switch`, all on by default, changed on the
Settings page's first card with a reason:

| Switch | Off means |
| ------ | --------- |
| `signups_open` | A number with no account is refused with `signups_paused`; members sign in |
| `trips_open` | Publishing a trip, posting again and posting the return are refused with `trips_paused`; drafts and changes to published trips go on |
| `bookings_open` | A new booking, a new request and paying are refused with `bookings_paused`; drivers still accept and decline, and everyone can still cancel |
| `sms_sending` | The worker leaves SMS news waiting; a sign-in code is refused with `sms_paused` |
| `email_sending`, `push_sending` | The worker leaves that channel's messages waiting |

- A pause never cancels or changes a trip or a booking. While bookings are
  paused no booking runs out for lack of payment; when they open again,
  each payment deadline that fell inside the pause is set to the pause's
  end plus the payment window, never past the booking cut-off.
- Messages left waiting go out when the switch is back on, unless their
  news is older than the worker's retry time, when they are marked
  skipped with the reason.
- The app shows spec 10's banner where the paused thing starts: on the
  booking screen, on Offer, and on step 1 of sign-up.
- A switch off for an hour sends the operator `switch_still_off` by push
  and email, and once a day after that.
- Audit entries `switch.changed`, and the same history as other settings.

### 4.5 The search log and corridors (spec 10, 3.4.1 and 3.4.5; R10.6)

- `search_log`: from and to (each a place or a meeting point), the date
  searched for if any, the number of results, the platform and the time,
  cut to the hour. No user, session, device or address: the row is
  written after the answer, outside the request's own records. A failed
  write is logged and never fails the search. Kept 14 months by a new
  clean-up rule.
- The platform comes from a header the apps send, `X-Client-Platform`
  (`ios`, `android` or `web`); without it the row says `unknown`.
- `corridors`: name, an ordered list of places, active. Rules in
  `packages/domain/src/metrics/corridors.ts`: a search or a trip belongs
  to a corridor when both its ends are among the corridor's places; an
  end that is a meeting point counts as each place that covers it.
- Console: Corridors, list and edit, through `GET`, `POST` and `PATCH
  /admin/v1/corridors`. The development seed adds the three launch
  corridors; in production Martin adds them with the real places.

### 4.6 Metrics (spec 10, 3.4; decision 2)

- Rules in `packages/domain/src/metrics/`: ISO weeks in Iceland time; one
  function per row of spec 10's table, each from counts to `{ numerator,
  denominator }`; `exitCriteria(weeks)` marks each of the six targets
  `met`, `not_met` or `no_data` over the last 4 complete weeks on the
  active corridors; `fewerThanFive` for figures about people.
- `weekly_metrics`: corridor (or none for all), ISO year and week, metric,
  numerator, denominator and computed at; one row per corridor, week and
  metric, so a second run replaces the first.
- A job in the API computes the current and the two weeks before it each
  night after 03:00; `pnpm --filter @shareride/api metrics recompute
  <weeks>` fills in more.
- Console: `GET /admin/v1/metrics?from=&to=&corridor=` and `GET
  /admin/v1/metrics.csv`; the Metrics page with a corridor picker, the
  weekly table, bars per week drawn in the page's own SVG, the exit
  criteria panel and "Download CSV". The CSV shows "fewer than 5" for
  figures about fewer than 5 people, as it leaves the console.
- Money shows paid and refunded; paid out comes with milestone 15.

### 4.7 Announcements (spec 10, 3.5; R10.7)

- Rules in `packages/domain/src/beta/announcements.ts`: audiences
  (`everyone`, `drivers`, `passengers`, `corridor`); `checkAnnouncement`
  (a title of 1 to 80 and a message of 1 to 1 000 characters in both
  languages; a corridor for that audience); who receives one: accounts in
  good standing with Beta news on.
- `announcements`: audience, corridor, title and text in both languages,
  created by, test sent at, sent at and reach.
  `notification_preferences.beta_news`, on by default.
- Console: draft, edit, reach (how many by push and by email), "Send to
  me" (both languages, to the operator's own account) and Send, through
  `/admin/v1/announcements`. Send sets `sent_at` and writes one event in
  one transaction, and refuses a second time with `already_sent`; the
  worker makes one `announcement` notification per person, keyed by the
  announcement and the person, so each is told once.
- By push and by email to verified addresses, in the person's language,
  with spec 10's footer. Email is optional, so the app gains a Beta news
  page under Settings that lists the announcements sent to the person;
  the push opens it. The "Beta news" switch is beside "Trip reminders".
- Sent announcements are listed with audience, time and delivery counts
  from the delivery log.

### 4.8 The values and their versions (spec 10, 3.2.3 and 3.2.4; R10.3)

- `trips.settings_version` is set when a trip is published, and
  `bookings.settings_version` when a booking is made. Rows from before
  have version 0, the defaults they were made under.
- As ADR 0032 says: later price work on a trip (the level, seats, stops)
  uses the price values of the trip's version; a booking's cancellation
  rules (`free_cancellation_until`, `major_time_change`,
  `reliability_cancellation_window`) use the booking's version; its
  deadlines were stored when it was made. Everything else reads the
  current values.
- `packages/domain/src/settings/bundles.ts`: `settingsFrom(values)` gives
  each module its settings object (`TripSettings`, `BookingSettings` and
  so on) with the operator's values over the code's other defaults. The
  three constants in `bookings/cancellation.ts` and `trips/changes.ts`
  become fields of a `CancellationSettings`.
- The API's services take a way to read settings instead of a fixed
  object: `current()` for new things, `at(version)` with a trip or
  booking in hand.
- Seat limits in the contracts and the database stay at 8, the range's
  top; `max_capacity` below 8 is checked by the rules.
- The effect before saving: for a price value, Reykjavík to Akureyri with
  3 seats at 100% before and after, and the highest level for 3 seats;
  for a time, a sentence from the console's texts, such as "Requests will
  expire after 8 hours instead of 12".
- The app takes its numbers from `GET /v1/config`, and a trip's or a
  booking's own from the answers about it, which already carry prices,
  levels and deadlines.

### 4.9 The console home (spec 10, 3.1.1)

`GET /admin/v1/home` answers the counts, each read through its own
module: urgent and other open reports, appeals, disputes waiting, meeting
point problem reports and reviews due, notifications that failed in the
last 24 hours, people on the watch list, new feedback, places left and
switches that are off. The page shows each as a link to its list, and
leaves out a zero.

### 4.10 Events

The outbox carries an event only when the worker acts on it:
`FeedbackReplied`, `AnnouncementSent` and the switch reminder. What the
specs list as `InviteUsed`, `FeedbackReceived`, `SettingChanged` and
`SwitchChanged` is already a row of its own (the account's code, the
feedback, the settings history) or an audit entry, so no event is written
for them until something needs one.

## 5. Pull requests and tasks

Tests come first in every task. Each PR updates the docs it touches (the
domain model, the API reference, the privacy register, the console guide
and the CHANGELOG), runs the browser journeys, and gets a code review
before it opens. Migrations are generated on the latest `main` right
before merging.

### PR 1: `docs(plans)`: this plan and ADR 0032

- [x] This plan, ADR 0032, the plans and decisions indexes and
      the roadmap's link

### PR 2: `feat(settings)`: the settings store, the Settings page and `GET /v1/config`

- [x] `settings/catalogue.ts` and `values.ts` with `invite_code_required`
      and `beta_max_testers`, and their tests (every refusal at its edge;
      `valuesAt` at versions 0, 1 and one past the last)
- [x] The migration (`setting_changes` with its triggers); the service;
      the three console routes; `GET /v1/config` with `beta`
- [x] The console's Settings page with History
- Verify: integration tests (only an operator; refused without a reason,
  out of range and on an old version; two changes at once get two
  versions; every change audited; updates and deletes of history
  refused); the console's page tests
- As built: the page reads past the 5-second cache (`latest()`), so it
  always shows what is saved. Two changes sent on the same version at the
  same moment end as one saved and one refused with `settings_changed`,
  as the second no longer saw the values it changed. A reason is refused
  when missing (`reason_missing`) or over 500 characters
  (`reason_too_long`). The app starts reading `GET /v1/config` in PR 4,
  with the Beta label.

### PR 3: `feat(beta)`: invite codes and the gate, the API

- [x] `beta/invites.ts` with its tests (a code at its last use and one
      past it; a second before and after its end; the cap at 149, 150 and
      151)
- [x] The migration (`invite_codes`, `users.invite_code_id`); sign-up
      through `verify`; `POST /v1/invites/check`; the console routes; the
      `invite` command; the seed's code; the catalogue entry
- As built: tests and the browser tests' server hold the requirement off
  through `fixedSettings`, which no real server sets; the app's journeys
  about the closed beta come with PR 4.
- Verify: integration tests (a new number without a code is refused and
  no account is made; the text-message code still works afterwards with
  a good invite code; a member signs in without one; a one-use code used
  by two sign-ups at the same moment makes one account; the cap holds
  when two codes are used at once; off, sign-up needs none)

### PR 4: `feat(beta)`: the invite code step, the closed beta and the Beta label

- [x] The app's invite screen, `/invite/<code>`, the closed beta text and
      the Beta label; the console's Invite codes page with places left
- [x] Specs 12 and 1 as choice 1 was decided
- As built: no browser journey. The browser tests' server is shared by
  every journey and holds the gate off, so turning it on for one journey
  would stop the others signing up. The screen tests cover the app's steps
  and the console page, and the API's integration tests the gate itself.
  The waitlist link in the closed beta text waits for milestone 12.
- Verify: screen tests; a browser journey: the operator makes a code, a
  new person signs up with it, a second person without one is told about
  the closed beta

### PR 5: `feat(feedback)`: feedback, the API and the console routes

- [x] `beta/feedback.ts` with its tests; the migration; the two app
      routes; the console routes; `FeedbackReplied` and `feedback_replied`;
      the catalogue, the export section and the retention rule
- As built: the person who sent feedback sees the reply, never the
  operator's status; the language is the account's; the screenshot route
  gives the JPEG itself, since the console's content policy shows images
  from its own origin only; feedback sent after the beta ended is kept
  12 months from when it was sent
- Verify: integration tests (a file that is not a JPEG, has metadata or
  is too large is refused; the eleventh of a day is refused; another
  person's feedback is never listed; a reply is sent once; the export
  holds the message and the picture; erasure removes both)

### PR 6: `feat(feedback)`: Send feedback in the app and the console's page

- [x] Send feedback from the Beta label and Profile; the screenshot and
      the shake on phones (`react-native-view-shot`, `expo-sensors`); the
      switch; My feedback; the console's Feedback page with the
      screenshot, status and reply
- As built: Settings has a "Feedback" section with Send feedback, My
  feedback and, on phones, the shake's switch. A shake is three swings
  past 2.3 g within a second, and then nothing counts for three seconds
  (`shake-rule.ts`); it opens the form only for a signed-in person who is
  not already on it. The picture is taken at lower quality until it fits
  1 MB; if it cannot be taken or does not pass the check, the form opens
  without one. The console shows the picture only after "Show the
  screenshot", since each look is in the audit log. The browser journey's
  reply comes from the test API's `/e2e/feedback-reply`, which does what
  the console's reply does
- Verify: screen tests; a browser journey: send feedback on the web, the
  operator replies, the reply shows under My feedback. Shaking is
  checked by hand on a phone

### PR 7: `feat(settings)`: switches

- [x] The six switches in the catalogue; the refusals; the worker's
      waiting and skipping; payment deadlines across a pause;
      `switch_still_off`; `paused` in `GET /v1/config`; the app's banners;
      the console's switches card
- As built: a refusal is 503 with `signups_paused`, `trips_paused`,
  `bookings_paused` or `sms_paused`. A deadline is a stored time that
  every reader compares with now, so a pause of bookings moves the times
  in the transaction that turns the switch: as it starts, every unpaid
  booking waits until its booking cut-off; as it ends, each gets the
  payment window from then, or its own deadline back when that is still
  ahead, and the "10 minutes left to pay" reminder moves with it. A
  waiting message is skipped as `paused_too_long` when it was queued
  before its channel came back and is older than a failed send is tried
  again for (60 minutes). The reminder counts from the switch that has
  been off longest and names all that are off, so two switches turned off
  together give one reminder; it needs migration `0050_switch_reminder`
  (the new kind in the notification tables' checks). The app reads
  `GET /v1/config` at start and every 5 minutes
- Verify: integration tests (each switch refuses only what is new; a
  booking waiting for payment survives a pause and gets its window
  again; waiting messages go out once after the switch is back on; the
  reminder comes after an hour, once)

### PR 8: `feat(metrics)`: the search log and corridors

- [x] `metrics/corridors.ts` with its tests; the migration (`search_log`,
      `corridors`); writing the log; the clean-up rule; the header in the
      apps; the console's Corridors page; the catalogue entries
- As built: only `GET /v1/trips/search` is noted, once it has answered:
  not a refused search, the days around a date, or the front page's
  rides. A change of filter or order in the app is a new search and a new
  row. The row's key is a random UUID, since the other tables' keys hold
  the moment they were made, and the table has no `created_at`. An end
  is stored as a place or a meeting point with its ID and no foreign
  key. `corridors.place_ids` is an ordered array; a corridor's two ends
  must be two different places of it, so a trip inside one town is on
  none. A corridor is never deleted, only left out of the counting, so
  past weeks keep their figures. `GET /admin/v1/corridors` also lists
  every place, for the form. The web app's CORS answer allows the new
  header. Migration `0051_search_log_and_corridors`
- Verify: integration tests (a signed-in search writes a row that holds
  no person, session or address; the search answers when the log cannot
  be written; rows go after 14 months)

### PR 9: `feat(metrics)`: weekly figures and the exit criteria

- [x] The metric rules with their tests on a fixed set of records,
      including a week with nothing and the "fewer than 5" rule; the
      migration (`weekly_metrics`); the nightly job and the command; the
      two routes; the Metrics page
- As built: `weekMetrics` in the domain counts one week from plain
  records (searches, trips, bookings, reports, payments, refunds), which
  the API reads for the weeks asked for and the 60 days before them, once
  for everything and once per active corridor. A figure belongs to the
  week of its own event: a search to its hour, a request to when it was
  made, a trip to when it was published, left or completed, a booking to
  when it was confirmed. So a booking cancelled late changes the week it
  was confirmed in, on the next run. Drivers' cancellations are counted
  per trip with passengers that was to leave in the week, using
  `counts_on_reliability`, which already leaves weather and closed roads
  out. Bookings, payments and reports belong to their trip's corridors;
  a report about no trip is in the total alone. Reports per 1 000 trips
  is stored per trip and shown per 1 000. Money paid is payments settled;
  refunded is what cancelling gave back. The exit criteria add the
  active corridors' rows of the last 4 complete weeks, so a trip on two
  corridors counts twice there; the report target uses the total. The
  nightly run is asked for every 10 minutes and does its work once a
  day, under an advisory lock, so two servers do not both count. The
  page's week range is 8, 13 or 26 weeks; the routes take up to 53.
  Migration `0052_weekly_metrics`
- Verify: integration tests (the job run twice gives the same rows; a
  late cancellation changes last week's figure on the next run); the
  page against a hand count on the sample data

### PR 10: `feat(announcements)`: announcements and Beta news

- [x] `beta/announcements.ts` with its tests; the migration; the console
      routes and page; the worker's fan-out; the `announcement` texts; the
      "Beta news" switch and page in the app
- As built: the audience is asked of the database twice, when Send
  stores the reach and when the worker makes the notifications a moment
  later, so someone who turns "Beta news" off in between is counted and
  not told. The Beta news page and the delivery counts read the
  notification log, which is kept 90 days; the announcement and its
  stored reach stay. "Send to me" is its own kind (`announcement_test`),
  so a test never shows on the operator's Beta news page. An
  announcement's push shows its title and the start of its message on a
  lock screen, as it is news for every tester and about nobody.
- Verify: integration tests (both languages required; each audience
  reaches the right people; Beta news off reaches nobody; Send twice
  reaches each person once; the reach matches what is sent)

### PR 11: `feat(settings)`: prices from the settings, with versions

- [x] The price values and `max_capacity` in the catalogue with the
      cross-check; `bundles.ts`; `trips.settings_version`; the preview
      route and the page's effect; `GET /v1/config` values and the app
      reading them
- As built: `GET /v1/config` gains only `maxSeats`. The app already
  takes the level step and the prices of a draft from the quote, and a
  trip the driver sees now carries its own four price values
  (`priceSettings`), so no other price value is needed there. A trip
  posted again is a new trip and takes the values as they are now. No
  browser journey changes the rate: the browser tests share one server,
  and a changed rate would move the prices under the journeys running at
  the same time; the integration tests and the app's and the console's
  tests cover it instead.
- Verify: integration tests (a trip published before a rate change keeps
  its prices through a level change, and a trip published after uses the
  new rate; the cross-check refuses a rate the largest car cannot carry);
  a browser journey changes the rate and posts a trip

### PR 12: `feat(settings)`: booking and cancellation values, with versions

- [x] The booking and cancellation values; `bookings.settings_version`;
      `CancellationSettings`; the timing effect texts
- As built: the effect of a timing value is said in its help sentence,
  which names whom a change reaches (bookings from now on, or every trip
  at once), beside "Changes from X to Y". The app's seven sentences that
  stated 15 minutes, 30 minutes or 2 hours now take the value: as it is
  now from `GET /v1/config`, or the booking's own from the booking. They
  read "15 min" and "2 h", as durations do elsewhere in the app, so the
  Icelandic needs no case endings. The sentence a driver reads before a
  large move no longer names a number, as each booking has its own. The
  terms of service state the same numbers and are not changed by a
  setting: the Settings page says so on both groups.
- Verify: integration tests (a booking made before a change to
  `free_cancellation_until` is refunded by the rule it was made under; a
  new request expires by the new value)

### PR 13: `feat(settings)`: trip day and reliability values

- [x] The five values of that group; spec 10 as choice 3 was decided
- As built: none of the five has a version, so a change reaches trips
  already booked and every figure at once. About twenty places take
  these settings as a plain object; they get one whose fields are read
  from the settings as last read, and each request reads the settings
  first, in place of a source threaded through every module. The
  server's job and the two commands read the database themselves. The
  period is named in three sentences, which now take it.
- Verify: integration tests (the no-show wait and the completion delay
  follow a change at once; the watch list follows the watch level)

### PR 14: `feat(console)`: the home page's counts

- [ ] `GET /admin/v1/home` and the page
- Verify: integration tests (each count against records made in the
  test); the page's tests

### PR 15: `docs`: wrap-up

- [ ] The roadmap ticked, the runbook's "the first account on a new
      server" step, the glossary, and a browser journey through the whole
      of section 1

## 6. Review focus

What the specs imply and a person would meet first, each with its test:

1. **The gate tells strangers who has an account:** `invite_required`
   comes only after a right text-message code, so only the number's owner
   learns anything (PR 3 reads the answers to a wrong and a right code).
2. **A code shared in a group chat is used by 30 people at once:** the
   uses and the cap hold under simultaneous sign-ups (PR 3).
3. **A screenshot shows someone else's name or a chat:** it is shown
   before sending and can be removed, is read only through an audited
   console route, and never appears in a list (PR 5, PR 6).
4. **A switch turned off and forgotten:** nothing existing is cancelled,
   waiting payments get their time back, and the operator is reminded
   (PR 7).
5. **A settings change rewrites what someone already agreed to:** a
   booking made under the old refund rule keeps it, and a published
   trip keeps its prices (PR 11, PR 12).
6. **The search log becomes tracking:** a row holds no person, session,
   device or address, and its time is cut to the hour (PR 8).

## 7. Martin's steps

1. Accept or change the choices in section 3 and ADR 0032.
2. On a new server, make the first code with the `invite` command, sign
   up with it, and take the operator role (milestone 8's command).
3. Add the three launch corridors in the console once the real places are
   in.
4. Shake a real iPhone and an Android phone to send feedback, and read
   one announcement email in each language.

## 8. Risks

- **The settings reach into every module.** PRs 11 to 13 change how
  services read their numbers, in files other threads still touch. They
  come last, when milestones 7 and 9 are done, one group per PR, and the
  rules' own tests do not change: only where the numbers come from.
- **A wrong value hurts everyone at once.** Every value has a range, a
  reason and an effect shown first; trips and bookings keep what they
  were made under; the history shows what to put back.
- **Invite codes locking out real testers.** One answer for every bad
  code hides why, so the console shows each code's uses and end date,
  and the cap's places left.
- **Two packages for feedback.** Both are widely used and run only on
  the phone; if either holds back an Expo upgrade, the shake or the
  picture can go without touching the rest.

## 9. Definition of done

All fifteen PRs merged with green CI; the shake and both emails checked
by hand; a screen reader pass on the invite code and feedback screens;
docs, roadmap and CHANGELOG updated.
