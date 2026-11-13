# Spec 14: Women-only trips

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Draft for review

Feature: G5 Women-only trips ([features](../product/features.md)), added to
the MVP by Martin on 2026-11-13 (open question Q12, answer A36). Related:
[ADR 0015](../decisions/0015-women-only-trips.md) (proposed),
[spec 1](2026-11-13-sign-in-and-profile.md) (settings),
[spec 3](2026-11-13-post-a-trip.md) (posting),
[spec 4](2026-11-13-search-and-trip-details.md) (search),
[spec 5](2026-11-13-booking-and-requests.md) (booking),
[spec 6](2026-11-13-changes-and-cancellations.md) (cancellations),
[spec 9](2026-11-13-safety-and-moderation.md) (reports),
[spec 10](2026-11-13-operator-settings-and-metrics.md) (metrics),
[legal and regulatory](../compliance/legal-and-regulatory.md#9-questions-for-the-lawyer-phase-1-brief).

"Women-only" is the working name. Who can join, and so the label in the app,
depends on question 1; the texts in section 8 follow the recommendation.

## 1. Problem and goal

Some women do not want to ride alone with a man they do not know, and some
women drivers would offer seats only to other women. Without an option for
them, they stay away.

Goal: a driver who has opted in can offer a trip only to people who have
opted in; they can find and book it; and nobody else gives any gender data,
sees these trips, or is asked for proof.

## 2. User stories

- As a woman who drives from Selfoss every weekday, I offer my seats only to
  women, so I feel at ease with people I don't know.
- As a woman going to Keflavík Airport at 5 in the morning, I look for a
  women-only trip.
- As a passenger booking two seats for my daughter and me, I confirm we can
  both join.
- As someone who doesn't want the option, I am never asked about my gender.
- As the operator, I can take away access from someone who misuses it.

## 3. Behaviour

### 3.1 Opting in (Settings)

1. Settings has "Women-only trips" with a short explanation and a switch: "I'm
   a woman or non-binary and want to offer or book women-only trips".
2. Before the switch turns on, the app says: this is private and not on your
   profile; when you post or book a women-only trip, the others on that trip
   can see it is women-only; a false declaration breaks the community rules.
3. We store only the date the person opted in. There is no gender field and
   no proof is asked (ADR 0015).
4. The option is not a sign-up question. It is mentioned where it helps: in
   Settings, on the post-a-trip screen (3.2), and in the help pages.
5. **Turning it off** is possible at any time. If the person has upcoming
   women-only trips, requests or bookings, the app lists them first: they are
   cancelled as if the person cancelled them, under the normal rules
   (spec 6).

### 3.2 Posting a women-only trip (spec 3)

1. Under "Seats, booking mode and preferences" there is a "Women only"
   switch. A driver who has not opted in sees it with a link to Settings.
2. Turning it on asks the driver to confirm: "Everyone in the car will be a
   woman or non-binary, including anyone I bring along."
3. The setting can change only while the trip has no requests or bookings.
   After that it is fixed, because people booked on that basis; the driver
   can still cancel the trip under the normal rules (spec 6).
4. Duplicating a trip or creating the return trip (spec 6) copies the setting
   if the driver is still opted in.
5. Booking mode, prices and seats work as on any trip.

### 3.3 Finding women-only trips (spec 4)

1. **Who sees them (question 2):** only signed-in people who have opted in.
   For everyone else they are left out of search results, trip pages and the
   driver's list of trips.
2. Opted-in people see women-only trips among the others, marked "Women
   only", and can use the filter "Women-only trips only".
3. Trip details show the label and one line: who can book, and that everyone
   in the car can join women-only trips.
4. A shared link to a women-only trip, opened by someone who cannot see it,
   shows only: "This is a women-only trip. Sign in and turn on women-only
   trips in Settings to see it." No route, time or driver.
5. The anonymous search log (spec 10) records nothing about this option.

### 3.4 Booking (spec 5)

1. Only opted-in people can request or book. The server checks this, not
   just the app.
2. **More than one seat:** the passenger confirms "Everyone I'm booking for
   is a woman or non-binary." The confirmation is stored with the booking.
3. Everything else, including payment and cancellation, works as on any
   trip.

### 3.5 Misuse and reports (spec 9)

1. A new report category, "Misuse of a women-only trip", for example when
   someone joins who said they are not eligible, or a driver brings along
   someone who isn't.
2. **At the meeting point:** a passenger who finds the car is not as promised
   does not have to ride. They cancel and report; the operator refunds them
   in full and takes the cancellation off their reliability (spec 9, 3.4). If
   the driver marks them a no-show, the dispute flow in spec 8 applies.
3. The operator never asks for proof and does not judge by how someone looks
   or sounds. Action is based on what the person said or did, such as their
   own statement in the chat or bringing a man along.
4. **Withdraw access:** a new operator action with a reason and the rule it
   concerns. The person's upcoming women-only trips and bookings are
   cancelled with full refunds to the others, and they cannot opt in again
   unless the operator restores access. They get the statement of reasons
   and can appeal, as for any action (spec 9, R9.5). Warnings and suspension
   remain available as usual.

### 3.6 In the console

1. A user's page shows whether they have opted in, and when, and whether
   access was withdrawn. Trips show the "Women only" label.
2. Weekly metrics (spec 10) add: women-only trips published, seats booked on
   them, and their share of all trips, by corridor. Counts only.

## 4. Rules

| ID | Rule |
| -- | ---- |
| R14.1 | Only a person who has opted in can publish a women-only trip, or request or book one. |
| R14.2 | A trip's women-only setting can change only while it has no requests or bookings. |
| R14.3 | Women-only trips are shown only to signed-in people who have opted in (question 2). |
| R14.4 | A booking of more than one seat on a women-only trip needs the passenger's confirmation that everyone in it can join. |
| R14.5 | Turning off the option cancels the person's upcoming women-only trips, requests and bookings under the normal rules, after a warning. |
| R14.6 | The option is stored only as the date of opting in; no gender is stored and no proof is asked. |
| R14.7 | Someone whose access was withdrawn cannot opt in again until the operator restores it. |

## 5. Screens

1. Settings: women-only trips, with explanation, switch and the "this will
   cancel" list
2. Post a trip: the "Women only" switch, the driver's confirmation, and the
   link to Settings for drivers who have not opted in
3. Search results and trip details: label and filter
4. Booking: confirmation for more than one seat
5. Shared link that the viewer cannot open
6. Console: opt-in status and "withdraw access" on the user page; label on
   trips; metric rows

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)):

- `User` gains `women_only_since` (empty when not opted in) and
  `women_only_withdrawn_at` (set by the operator).
- `Trip` gains `women_only` (true or false).
- `Booking` gains `party_confirmed_at`, for bookings of more than one seat on
  a women-only trip.

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `PUT /me/women-only` | Opt in |
| `DELETE /me/women-only` | Opt out; with `preview=true`, list what would be cancelled |
| `POST /trips`, `PATCH /trips/{id}` | Gain `women_only` |
| `GET /search` | Gains the filter `women_only`; leaves these trips out for people who can't see them |
| `POST /bookings` | Gains `party_confirmed` |

Console endpoints under `/admin/v1`: withdraw and restore a user's access.

Domain functions in `packages/domain`: whether a person can see a trip,
whether they can book it, whether the setting can change, and what opting out
cancels.

Events: `WomenOnlyAccessWithdrawn`, `WomenOnlyAccessRestored`. Opting out
uses the existing cancellation events.

## 7. Privacy and safety

- **The opt-in** is personal data that can hint at a person's gender, so we
  keep only its date. Legal basis: consent, given with the switch and
  withdrawn by turning it off. Seen by the person and the operator; the others
  on a women-only trip see that the trip is women-only. Not on the public
  profile. Part of the data export (spec 11) and erased with the account.
- **Withdrawn access** is kept with the report that led to it (3 years,
  spec 9).
- Hiding these trips from everyone else also stops anyone using the label to
  find women who travel alone.
- Listed in the privacy register.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

If question 1 is answered "women only", the words "or non-binary" are dropped
and the label stays "Women only".

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `womenOnly.label` | Women and non-binary only | Aðeins konur og kynsegin |
| `womenOnly.settingTitle` | Women-only trips | Ferðir aðeins fyrir konur |
| `womenOnly.settingSwitch` | I'm a woman or non-binary and want to offer or book women-only trips | Ég er kona eða kynsegin og vil bjóða eða bóka ferðir aðeins fyrir konur |
| `womenOnly.settingPrivate` | This is private and not shown on your profile. When you post or book a women-only trip, the others on that trip can see it is women-only. | Þetta sést ekki á prófílnum þínum. Þegar þú birtir eða bókar slíka ferð sjá aðrir í ferðinni að hún er aðeins fyrir konur. |
| `womenOnly.settingRules` | A false declaration breaks the community rules. | Röng yfirlýsing er brot á samfélagsreglunum. |
| `womenOnly.turnOffWarning` | Turning this off cancels these trips and bookings under the usual rules: | Ef þú slekkur á þessu falla þessar ferðir og bókanir niður samkvæmt venjulegum reglum: |
| `womenOnly.postConfirm` | Everyone in the car will be a woman or non-binary, including anyone I bring along. | Allir í bílnum verða konur eða kynsegin, líka þau sem ég tek með. |
| `womenOnly.postNotOptedIn` | To offer women-only trips, turn them on in Settings. | Kveiktu á ferðum aðeins fyrir konur í stillingum til að bjóða þær. |
| `womenOnly.locked` | This can't be changed once someone has booked or sent a request. | Þessu er ekki hægt að breyta eftir að einhver hefur bókað eða sent beiðni. |
| `womenOnly.filter` | Women-only trips only | Aðeins ferðir fyrir konur |
| `womenOnly.details` | Only women and non-binary people can book this trip, and everyone in the car is a woman or non-binary. | Aðeins konur og kynsegin geta bókað þessa ferð og allir í bílnum eru konur eða kynsegin. |
| `womenOnly.partyConfirm` | Everyone I'm booking for is a woman or non-binary. | Allir sem ég bóka fyrir eru konur eða kynsegin. |
| `womenOnly.sharedLink` | This is a women-only trip. Sign in and turn on women-only trips in Settings to see it. | Þetta er ferð aðeins fyrir konur. Skráðu þig inn og kveiktu á slíkum ferðum í stillingum til að sjá hana. |
| `womenOnly.withdrawn` | Your access to women-only trips has been withdrawn. Reason: {reason} | Aðgangur þinn að ferðum aðeins fyrir konur hefur verið afturkallaður. Ástæða: {reason} |
| `report.category.womenOnly` | Misuse of a women-only trip | Misnotkun á ferð aðeins fyrir konur |

## 9. Testing

- **Unit (domain):** who can publish, see and book; the setting is fixed once
  a request or booking exists; more than one seat needs the confirmation;
  opting out lists the right trips and bookings; withdrawn access blocks
  opting in again.
- **API integration:** search, trip pages, shared links and a driver's trip
  list never show a women-only trip to visitors or to people who have not
  opted in; a booking without the opt-in is refused by the server; changing
  the setting after a request is refused; withdrawing access cancels and
  refunds as described.
- **End to end:** opt in, post a women-only trip; a second opted-in person
  finds and books it; a third person never sees it.
- **Manual:** the Icelandic texts with a native speaker; the label and the
  switch with a screen reader.

## 10. Out of scope

Men-only trips; a gender field on profiles; any check of gender; a filter for
the driver's gender on ordinary trips; women-only meeting points; showing
these trips to visitors on the website.

## Questions for Martin

| # | Question | Recommendation |
| - | -------- | -------------- |
| 1 | Who can join women-only trips? | Women and non-binary people, as Lyft does with Women+ Connect. The equal treatment act counts people registered as neutral as a gender of their own, so leaving them out is a second exclusion the lawyer would have to justify, and they share the same safety concern. The alternative is women only, with the simpler label "Women only" |
| 2 | Who can see women-only trips? | Only signed-in people who have opted in. Results then show only trips you can book, and nobody can use the label to find women who travel alone. The alternative is showing them to everyone with a label, bookable only by those who opted in: the option is more visible, but most people see trips they cannot book |
