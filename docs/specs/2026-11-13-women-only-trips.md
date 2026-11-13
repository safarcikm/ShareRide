# Spec 14: Women-only trips

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved (2026-11-13)

Feature: G5 Women-only trips ([features](../product/features.md)), added to
the MVP by Martin on 2026-11-13 (open question Q12, answer A36). Related:
[ADR 0015](../decisions/0015-women-only-trips.md) (accepted),
[spec 1](2026-11-13-sign-in-and-profile.md) (settings),
[spec 3](2026-11-13-post-a-trip.md) (posting),
[spec 4](2026-11-13-search-and-trip-details.md) (search),
[spec 5](2026-11-13-booking-and-requests.md) (booking),
[spec 6](2026-11-13-changes-and-cancellations.md) (cancellations),
[spec 9](2026-11-13-safety-and-moderation.md) (reports),
[spec 10](2026-11-13-operator-settings-and-metrics.md) (metrics),
[legal and regulatory](../compliance/legal-and-regulatory.md#9-questions-for-the-lawyer-phase-1-brief).

## 1. Problem and goal

Some women do not want to ride alone with a man they do not know, and some
women drivers would offer seats only to other women. Without an option for
them, they stay away.

Goal: a woman driver can offer a trip that only women can book. Everyone can
see these trips; only women who have opted in can book them; nobody else gives
any gender data, and nobody is asked for proof.

## 2. User stories

- As a woman who drives from Selfoss every weekday, I offer my seats only to
  women, so I feel at ease with people I don't know.
- As a woman going to Keflavík Airport at 5 in the morning, I look for a
  women-only trip.
- As a passenger booking two seats for my daughter and me, I confirm we are
  both women.
- As a man searching from Selfoss to Reykjavík, I see that a trip is women
  only and know at once that I can't book it.
- As someone who doesn't want the option, I am never asked about my gender.
- As the operator, I can take away access from someone who misuses it.

## 3. Behaviour

### 3.1 Opting in (Settings)

1. Settings has "Women-only trips" with a short explanation and a switch: "I'm
   a woman and want to offer or book women-only trips".
2. Before the switch turns on, the app says: this is private and not on your
   profile; anyone can see that a trip you post is women-only, and the people
   on a trip you book can see you booked it; a false declaration breaks the
   community rules.
3. We store only the date the person opted in. There is no gender field and
   no proof is asked (ADR 0015).
4. The option is not a sign-up question. It is mentioned where it helps: in
   Settings, on the post-a-trip screen (3.2), on a women-only trip that the
   person cannot book yet (3.3), and in the help pages.
5. **Turning it off** is possible at any time. If the person has upcoming
   women-only trips, requests or bookings, the app lists them first: they are
   cancelled as if the person cancelled them, under the normal rules
   (spec 6).

### 3.2 Posting a women-only trip (spec 3)

1. Under "Seats, booking mode and preferences" there is a "Women only"
   switch. A driver who has not opted in sees it with a link to Settings.
2. Turning it on asks the driver to confirm: "Everyone in the car will be a
   woman, including anyone I bring along." It also says that everyone who
   searches can see the trip is women-only.
3. The setting can change only while the trip has no requests or bookings.
   After that it is fixed, because people booked on that basis; the driver
   can still cancel the trip under the normal rules (spec 6).
4. Duplicating a trip or creating the return trip (spec 6) copies the setting
   if the driver is still opted in.
5. Booking mode, prices and seats work as on any trip.

### 3.3 Finding women-only trips (spec 4)

1. **Everyone sees them (decision 2):** women-only trips appear in search
   results, on trip pages, through shared links and on the website like any
   other trip, marked "Women only".
2. Search has the filter "Women-only trips only".
3. Trip details show the label and one line: only women can book, and
   everyone in the car is a woman.
4. **Someone who cannot book** sees "Only women can book this trip" in place
   of the book or request button, and, if signed in, how to turn on
   women-only trips in Settings.
5. The anonymous search log (spec 10) records nothing about this option.

### 3.4 Booking (spec 5)

1. Only opted-in people can request or book. The server checks this, not
   just the app.
2. **More than one seat:** the passenger confirms "Everyone I'm booking for
   is a woman." The confirmation is stored with the booking.
3. Everything else, including payment and cancellation, works as on any
   trip.

### 3.5 Misuse and reports (spec 9)

1. A new report category, "Misuse of a women-only trip", for example when
   someone books who has said they are not a woman, or a driver brings a man
   along.
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
| R14.3 | Women-only trips are shown to everyone, marked "Women only"; only people who have opted in can request or book them. |
| R14.4 | A booking of more than one seat on a women-only trip needs the passenger's confirmation that everyone in it is a woman. |
| R14.5 | Turning off the option cancels the person's upcoming women-only trips, requests and bookings under the normal rules, after a warning. |
| R14.6 | The option is stored only as the date of opting in; no gender is stored and no proof is asked. |
| R14.7 | Someone whose access was withdrawn cannot opt in again until the operator restores it. |

## 5. Screens

1. Settings: women-only trips, with explanation, switch and the "this will
   cancel" list
2. Post a trip: the "Women only" switch, the driver's confirmation, and the
   link to Settings for drivers who have not opted in
3. Search results and trip details: label and filter
4. Trip details for someone who cannot book: "Only women can book this trip"
   and how to opt in
5. Booking: confirmation for more than one seat
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
| `GET /search`, `GET /trips/{id}` | Gain the filter `women_only` and the label; trip details say whether the viewer can book |
| `POST /bookings` | Gains `party_confirmed` |

Console endpoints under `/admin/v1`: withdraw and restore a user's access.

Domain functions in `packages/domain`: whether a person can book a trip,
whether the setting can change, and what opting out cancels.

Events: `WomenOnlyAccessWithdrawn`, `WomenOnlyAccessRestored`. Opting out
uses the existing cancellation events.

## 7. Privacy and safety

- **The opt-in** is personal data that can hint at a person's gender, so we
  keep only its date. Legal basis: consent, given with the switch and
  withdrawn by turning it off. Seen by the person and the operator. Not on
  the public profile. Part of the data export (spec 11) and erased with the
  account.
- **What others can infer:** anyone can see that a trip is women-only, and so
  that its driver opted in; the people on a women-only trip can see that a
  passenger booked it. The app says this before someone opts in (3.1) and
  before a driver marks a trip (3.2).
- **Withdrawn access** is kept with the report that led to it (3 years,
  spec 9).
- Because the label is public (decision 2), it also shows that a woman is
  driving. Each trip already shows the driver's first name and photo, and
  the driver is told before marking the trip.
- Listed in the privacy register.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `womenOnly.label` | Women only | Aðeins konur |
| `womenOnly.settingTitle` | Women-only trips | Ferðir aðeins fyrir konur |
| `womenOnly.settingSwitch` | I'm a woman and want to offer or book women-only trips | Ég er kona og vil bjóða eða bóka ferðir aðeins fyrir konur |
| `womenOnly.settingPrivate` | This is private and not shown on your profile. Anyone can see that a trip you post is women-only, and the people on a trip you book can see you booked it. | Þetta sést ekki á prófílnum þínum. Allir sjá að ferð sem þú birtir er aðeins fyrir konur, og þau sem eru í ferð sem þú bókar sjá að þú bókaðir hana. |
| `womenOnly.settingRules` | A false declaration breaks the community rules. | Röng yfirlýsing er brot á samfélagsreglunum. |
| `womenOnly.turnOffWarning` | Turning this off cancels these trips and bookings under the usual rules: | Ef þú slekkur á þessu falla þessar ferðir og bókanir niður samkvæmt venjulegum reglum: |
| `womenOnly.postConfirm` | Everyone in the car will be a woman, including anyone I bring along. | Í bílnum verða aðeins konur, líka þær sem ég tek með mér. |
| `womenOnly.postPublic` | Everyone who searches can see that this trip is women-only. | Allir sem leita sjá að þessi ferð er aðeins fyrir konur. |
| `womenOnly.postNotOptedIn` | To offer women-only trips, turn them on in Settings. | Kveiktu á ferðum aðeins fyrir konur í stillingum til að bjóða þær. |
| `womenOnly.locked` | This can't be changed once someone has booked or sent a request. | Þessu er ekki hægt að breyta eftir að einhver hefur bókað eða sent beiðni. |
| `womenOnly.filter` | Women-only trips only | Aðeins ferðir fyrir konur |
| `womenOnly.details` | Only women can book this trip, and everyone in the car is a woman. | Aðeins konur geta bókað þessa ferð og í bílnum eru aðeins konur. |
| `womenOnly.cannotBook` | Only women can book this trip. | Aðeins konur geta bókað þessa ferð. |
| `womenOnly.howToOptIn` | If you're a woman, turn on women-only trips in Settings. | Ef þú ert kona skaltu kveikja á ferðum aðeins fyrir konur í stillingum. |
| `womenOnly.partyConfirm` | Everyone I'm booking for is a woman. | Allar sem ég bóka fyrir eru konur. |
| `womenOnly.withdrawn` | Your access to women-only trips has been withdrawn. Reason: {reason} | Aðgangur þinn að ferðum aðeins fyrir konur hefur verið afturkallaður. Ástæða: {reason} |
| `report.category.womenOnly` | Misuse of a women-only trip | Misnotkun á ferð aðeins fyrir konur |

## 9. Testing

- **Unit (domain):** who can publish and book; the setting is fixed once
  a request or booking exists; more than one seat needs the confirmation;
  opting out lists the right trips and bookings; withdrawn access blocks
  opting in again.
- **API integration:** search and trip pages show women-only trips to
  everyone, with the label and whether the viewer can book; a request or
  booking without the opt-in is refused by the server; changing
  the setting after a request is refused; withdrawing access cancels and
  refunds as described.
- **End to end:** opt in, post a women-only trip; a second opted-in person
  finds and books it; a third person sees it but cannot book.
- **Manual:** the Icelandic texts with a native speaker; the label and the
  switch with a screen reader.

## 10. Out of scope

Men-only trips; trips for people registered as neutral (decision 1; see
question 9 for the lawyer); a gender field on profiles; any check of gender;
a filter for the driver's gender on ordinary trips; women-only meeting points.

## Decisions

Decided by Martin on 2026-11-13, changing both recommendations.

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Who can join women-only trips? | Women only, with the label "Women only" (the recommendation was women and non-binary people) |
| 2 | Who can see women-only trips? | Everyone, including visitors, with the label; only women who have opted in can request or book (the recommendation was to show them only to people who had opted in) |
