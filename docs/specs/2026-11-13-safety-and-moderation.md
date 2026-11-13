# Spec 9: Safety and moderation

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved (2026-11-13)

Features: G2 Report and block, G4 Safety information and trip sharing,
H2 Users, trips and bookings, H3 Reports and audit log
([features](../product/features.md)). Related:
[spec 1](2026-11-13-sign-in-and-profile.md) (community rules, profiles),
[spec 7](2026-11-13-chat-and-notifications.md) (chat),
[spec 8](2026-11-13-trip-day-reviews-and-reliability.md) (reviews, disputes),
[spec 13](2026-11-13-payments.md) (held payouts and refunds),
[legal](../compliance/legal-and-regulatory.md#7-platform-regulation)
(Digital Services Act).

## 1. Problem and goal

Strangers share a car, often on long roads in winter. People must be able to
get help fast, tell someone where they are going, keep away from someone they
don't want to meet again, and report bad behaviour knowing it will be looked
at. Martin runs the platform alone, so moderation must be quick to do and
leave a clear record.

Goal: one-tap reporting from anywhere it matters, silent blocking, emergency
and road safety information on every trip, trip sharing with a contact, and a
console where one person can handle a report, act on it and explain the
decision, with every operator action logged.

## 2. User stories

- As a passenger, I share my trip details with my partner before I get in the
  car.
- As a passenger on a winter trip north, I see links to the weather, road
  conditions and SafeTravel before I go.
- As a passenger, I report a driver who drove dangerously, and I am told
  later that action was taken.
- As a user, I block someone who made me uncomfortable, and I never see their
  trips again.
- As a driver, I report a passenger who asked me to take cash instead.
- As the operator, I open a report, see everything related to it in one
  place, suspend the user with a reason, and the user gets that reason by
  email.

## 3. Behaviour

### 3.1 Reporting (G2)

1. **What can be reported, and from where:** a person (their profile), a trip
   (the trip page), a message (press and hold it in the chat), a review (on
   the profile), and a problem with a booking (the booking, until 24 hours
   after the trip completes).
2. **Categories:** safety (dangerous driving, threats, violence); harassment
   or unwanted contact; discrimination; scam or payment outside the app;
   false profile, car or licence; offensive content; the trip wasn't as
   listed; something else. A no-show or a missing driver is not a report but
   spec 8's flow, which the report screen points to.
3. For the safety category, the screen first says "If you are in danger, call
   112 now", with a call button. ShareRide is not an emergency service.
4. The reporter can add a description of up to 1 000 characters. The report
   links the related records: the trip, the booking, the message or the
   review. A report about a message lets the operator read that conversation
   (spec 7, R7.3).
5. A problem reported about a booking holds that booking's payout until the
   operator releases it or refunds it (spec 13).
6. The reporter is thanked at once and told the outcome later in general
   terms: "We've taken action" or "We found no breach of our rules". The
   reported person is never told who reported them.
7. A user can see their own reports and their outcomes in Settings.

### 3.2 Blocking (G2)

1. From a profile or a chat: "Block". Blocking is silent: the other person is
   not told.
2. Both people stop seeing each other's trips in search and trip pages, and
   neither can request or book the other's trips. Their chats become
   read-only (spec 7).
3. If they have an upcoming booking together, the app offers to cancel it
   under the normal rules (spec 6). If the person also reports a safety
   problem, the operator can refund in full and keep the cancellation off
   their reliability. Blocking alone never changes the refund, so it cannot
   be used to dodge the late-cancellation rules (decision 1).
4. Blocked people are listed in Settings (spec 1), where they can be
   unblocked.

### 3.3 Safety information and trip sharing (G4)

1. **Emergency:** "Emergency: 112" with a call button on the trip page, the
   booking and the trip day screen (spec 8), always visible without
   scrolling on the trip day screen.
2. **Before you go:** every trip that leaves the capital area shows links to
   the weather forecast and warnings (vedur.is), road conditions
   (umferdin.is) and SafeTravel (safetravel.is), in the user's language where
   those sites offer it. These are links only; automatic warnings come later
   (Phase 4, [integrations](../architecture/integrations.md)).
3. **Share trip details:** from a booking or a trip, "Share trip" opens the
   phone's share sheet with a short text: date and time, from and to, the
   meeting point, the driver's first name, and the car's make, model, colour
   and number plate. Nothing is stored and no link is created; the person
   chooses whom to send it to.
4. The community rules (spec 1) are one tap away from the report screen and
   the profile.

### 3.4 Reports in the console (H3)

1. **Queue:** open reports, safety first, then oldest first, with the time
   left to the response target: every report is answered within 24 hours.
   A safety report alerts the operator at once by push and SMS from 07:00 to
   23:00, and by push only at night (decision 4). The app always tells people
   to call 112 in an emergency.
2. **A report shows** the category, description, reporter and subject; the
   related trip, booking, message or review; earlier reports by and about
   both people; ratings, reliability and recent trips; and, when the report
   covers it, the conversation.
3. **Actions:** dismiss; warn the user; hide content (a message, review, trip
   note, profile photo or bio); suspend (3.6); refund a booking or release a
   held payout (spec 13); cancel an upcoming trip as the operator (full
   refunds; it does not count on the driver's reliability unless the operator
   says so).
4. **Statement of reasons:** every action that affects a user sends them an
   email in their language with what was done, which community rule it
   concerns, the content affected, and how to appeal: by replying to that
   email within 14 days. The operator looks at the appeal and answers; that
   answer is final in the app.
5. **Other checks:** the console lists each driver's request decline rate,
   so a pattern that could be discrimination can be looked at (spec 5).

### 3.5 Users, trips and bookings in the console (H2)

1. Search users by name, phone number, email or ID; trips by date, route or
   driver; bookings by ID or person.
2. A user's page shows the profile, verification, vehicles, trips, bookings,
   payments and payouts (spec 13), reports by and about them, reliability
   records (spec 8), reviews, warnings and suspensions, and operator notes.
3. Actions: suspend and reinstate (3.6), hide profile content, add a note,
   change whether a cancellation counts on reliability (spec 8), and refund
   (spec 13).
4. Opening a conversation is possible only from a report or a dispute that
   covers it, and is logged.

### 3.6 Suspension

1. A suspension has a reason, the rule it concerns, and an end date or none
   (permanent). The user gets the statement of reasons (3.4).
2. A suspended user can still sign in to see their data, download it or
   delete the account, but cannot search, book, post, chat or review. Their
   upcoming trips and bookings are cancelled at once with full refunds to the
   other people, who are told the trip or booking was cancelled, not why.
   Payouts for trips already done are still paid unless the operator holds
   them (decision 2).
3. Reinstating ends the suspension early, with a note; the user is told.

### 3.7 Pre-checks

The operator does not check new profiles, photos, trips or reviews before
they appear; everything goes live at once and is handled through reports
(decision 3). Automatic checks stay as decided: no contact details
in requests and trip notes (specs 3 and 5), and no contact details or links
in reviews (spec 8).

### 3.8 Audit log (H3)

Every operator action is written to an append-only log: who, what, on which
record, when, from which device and network address, and the values before
and after. Opening a conversation or a user's payment details is logged too.
The console shows the log with filters, and it cannot be edited or deleted
from the console.

## 4. Rules

| ID | Rule |
| -- | ---- |
| R9.1 | Anyone signed in can report a person, trip, message or review; a booking problem can be reported until 24 hours after the trip completes. |
| R9.2 | The reported person is never told who reported them. |
| R9.3 | A booking problem holds that booking's payout until the operator decides (spec 13). |
| R9.4 | Blocking is mutual in effect and silent: neither sees nor books the other's trips, and their chats become read-only. |
| R9.5 | Every operator action that affects a user comes with a statement of reasons and a way to appeal within 14 days. |
| R9.6 | The operator reads a conversation only through a report or dispute that covers it, and every such opening is logged. |
| R9.7 | Every operator action is recorded in an append-only audit log. |
| R9.8 | Shared trip details are sent only by the user through their phone's share sheet; ShareRide stores nothing and creates no link. |
| R9.9 | Every report is answered within 24 hours. Safety reports alert the operator at once: push and SMS from 07:00 to 23:00, push only at night. |
| R9.10 | A suspension cancels the person's upcoming trips and bookings with full refunds to the other people; the person keeps access to their data, its download and account deletion. |

## 5. Screens

1. Report: what, category, 112 notice for safety, description
2. My reports and their outcomes (Settings)
3. Block confirmation, and the booking question when one exists
4. Emergency and "Before you go" on trip, booking and trip day screens
5. Share trip
6. Console: report queue and report detail with actions
7. Console: user, trip and booking search and detail
8. Console: audit log
9. Suspended account screen in the app

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)):

- `Report` (existing): subject can now also be a message, review or booking;
  `urgent` for the safety category; outcome shown to the reporter.
- `ModerationAction`: user, kind (`warning`, `content_hidden`, `suspension`,
  `reinstatement`, `trip_cancelled`, `refund`), report (if any), rule,
  reason, content affected, ends at (suspensions), by, at, appeal (text,
  answered at, outcome).
- `Block`: blocker, blocked, created at. Unique per pair and direction.
- `User` (existing): `status` `suspended` with `suspended_until`.
- `OperatorNote`: user, text, by, at.
- `AuditLog` (existing).

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `POST /reports` | Report a person, trip, message, review or booking problem |
| `GET /me/reports` | My reports and their outcomes |
| `POST /users/{id}/block`, `DELETE /users/{id}/block` | Block or unblock |
| `GET /me/blocks` | People I blocked |

Console endpoints under `/admin/v1` (operator role, passkey sign-in,
[security](../engineering/security.md)): reports (list, view, act), users,
trips and bookings (search, view, act), moderation actions and appeals, and
the audit log.

Domain functions in `packages/domain`: whether two users can see each other
(blocks), whether a report holds a payout, the effect of a suspension on
trips and bookings, and the reliability effect of an operator cancellation.

Events: `ReportFiled` (existing), `ReportResolved`, `UserBlocked`,
`UserSuspended`, `UserReinstated`, `ContentHidden`. Notifications through
spec 7: the reporter on the outcome (push), the affected user on an action
(email, and push where they have it), the operator on new reports
(push, and SMS for safety reports from 07:00 to 23:00).

## 7. Privacy and safety

- Reports, moderation actions and appeals are seen by the operator only; the
  reporter sees the outcome in general terms, the affected user sees the
  statement of reasons. Kept 3 years after closure (privacy register,
  **verify**).
- Blocks are seen only by the person who blocked; kept until unblocked or
  either account is deleted.
- The audit log holds operator activity and the IDs of the records touched,
  not copies of personal data; kept 3 years (**verify**), as listed in the
  privacy register.
- Sharing trip details is the user's own choice; the plate is included
  because it helps the contact if something goes wrong.
- The statement of reasons and the appeal follow the Digital Services Act
  model even before it is confirmed to apply in Iceland ([question 8 for the lawyer](../compliance/legal-and-regulatory.md#9-questions-for-the-lawyer-phase-1-brief)).

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `report.title` | Report | Tilkynna |
| `report.person` | Report this person | Tilkynna þennan notanda |
| `report.trip` | Report this trip | Tilkynna þessa ferð |
| `report.message` | Report message | Tilkynna skilaboð |
| `report.review` | Report review | Tilkynna umsögn |
| `report.problem` | Report a problem with this trip | Tilkynna vandamál með ferðina |
| `report.emergency` | If you are in danger, call 112 now. | Ef þú ert í hættu, hringdu strax í 112. |
| `report.category.safety` | Safety: dangerous driving, threats or violence | Öryggi: hættulegur akstur, hótanir eða ofbeldi |
| `report.category.harassment` | Harassment or unwanted contact | Áreitni eða óæskileg samskipti |
| `report.category.discrimination` | Discrimination | Mismunun |
| `report.category.scam` | Scam, or payment outside the app | Svik, eða greiðsla utan appsins |
| `report.category.false` | False profile, car or licence | Rangar upplýsingar um notanda, bíl eða ökuréttindi |
| `report.category.offensive` | Offensive content | Móðgandi efni |
| `report.category.notAsListed` | The trip wasn't as listed | Ferðin var ekki eins og henni var lýst |
| `report.category.other` | Something else | Annað |
| `report.thanks` | Thank you. We look at every report. | Takk. Við förum yfir allar tilkynningar. |
| `report.outcomeAction` | We've looked into your report and taken action. | Við höfum skoðað tilkynninguna og gripið til aðgerða. |
| `report.outcomeNone` | We've looked into your report and found no breach of our rules. | Við höfum skoðað tilkynninguna og fundum ekki brot á reglunum. |
| `block.action` | Block | Loka á |
| `block.confirm` | Block this person? You won't see each other's trips, and they won't be told. | Loka á þennan notanda? Þið sjáið ekki ferðir hvors annars og viðkomandi fær ekki að vita af því. |
| `block.cancelBooking` | You have a booking together. Cancel it too? | Þið eigið bókun saman. Viltu líka afbóka hana? |
| `safety.call112` | Emergency: 112 | Neyðarnúmer: 112 |
| `safety.beforeYouGo` | Before you go: check the weather, road conditions and SafeTravel. | Áður en lagt er af stað: kannaðu veður, færð og SafeTravel. |
| `share.title` | Share trip details | Deila upplýsingum um ferðina |
| `share.text` | My trip: {date} at {time} · {from} – {to} · Meeting point: {point} · Driver: {driver} · Car: {car}, {plate} · Booked on ShareRide | Ferðin mín: {date} kl. {time} · {from} – {to} · Mótsstaður: {point} · Bílstjóri: {driver} · Bíll: {car}, {plate} · Bókað á ShareRide |
| `suspension.notice` | Your account is suspended until {date}. Reason: {reason}. To appeal, reply to the email we sent you. | Aðganginum þínum hefur verið lokað til {date}. Ástæða: {reason}. Svaraðu tölvupóstinum frá okkur til að andmæla. |
| `suspension.permanent` | Your account is closed. Reason: {reason}. To appeal, reply to the email we sent you. | Aðganginum þínum hefur verið lokað. Ástæða: {reason}. Svaraðu tölvupóstinum frá okkur til að andmæla. |

## 9. Testing

- **Unit (domain):** visibility between users with and without blocks, in
  both directions; booking problem window edges; which reports hold a
  payout; the effect of a suspension on upcoming trips and bookings; an
  operator cancellation's refund and reliability effect.
- **API integration:** a blocked user's trips are missing from search and
  cannot be booked, both ways; a report about a message unlocks only that
  conversation for the operator, and the opening is logged; console
  endpoints refuse anyone without the operator role; every console action
  writes an audit entry; the audit log cannot be changed through any
  endpoint.
- **End to end:** report a trip and see the outcome; block a person and lose
  each other's trips; operator suspends a driver with upcoming bookings and
  the passengers are refunded and told; share trip details opens the share
  sheet with the right text.
- **Manual:** the 112 button calls on real iOS and Android phones; screen
  reader pass on the report and block screens; the statement of reasons
  email in both languages.

## 10. Out of scope

Automatic scanning of chat content; identity document checks (Phase 5);
live trip tracking or a live shared link; an in-app emergency alarm; age
verification beyond the declaration (spec 1); public transparency reports;
the console's general layout, settings and metrics (spec 10).

## Decisions

Accepted by Martin on 2026-11-13 as recommended.

| # | Question | Decision |
| - | -------- | -------- |
| 1 | What happens to an upcoming booking when one of the two blocks the other? | The app offers to cancel it, under the normal rules (spec 6). If the person also reports a safety problem, you can refund in full and keep it off their reliability. This stops blocking being used to dodge late-cancellation rules |
| 2 | What does a suspension do? | The person can still sign in to see their data, download it or delete the account, but cannot search, book, post or chat. Their upcoming trips and bookings are cancelled at once with full refunds to the other people. Payouts for trips already done are still paid unless you hold them |
| 3 | Do you check new profiles, photos, trips or reviews before they appear? | No. Everything appears at once and is handled through reports, plus the automatic contact-detail checks we already have. Checking everything first would not scale for one person |
| 4 | How fast are reports answered, and how are you alerted? | Every report within 24 hours. Safety reports alert you at once by push and SMS from 07:00 to 23:00, and by push only at night. The app always tells people to call 112 in an emergency |
