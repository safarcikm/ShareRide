# Spec 10: Operator settings and metrics

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved (2026-11-13)

Features: H4 Pricing and timing settings, H5 Beta metrics, H6 Message all beta
testers ([features](../product/features.md)), and the console's overall
layout. Related: [pricing and seats](../product/pricing-and-seats.md#configuration-values)
(the settings), [vision](../product/vision.md) and
[roadmap](../strategy/roadmap.md#phase-3-closed-beta) (beta metrics and exit
criteria), [spec 7](2026-11-13-chat-and-notifications.md) (sending),
[spec 9](2026-11-13-safety-and-moderation.md) (console, audit log).

## 1. Problem and goal

Every rule in the earlier specs has numbers: prices per km, deadlines, wait
times. Martin must be able to tune them during the beta without a release,
safely and with a record of why. He also needs to know each week whether the
beta is working, and to tell testers what is changing.

Goal: one settings page with safe ranges and a change history; a few
switches to pause things in an emergency; a weekly metrics page built around
the beta's exit criteria, without tracking anyone; a simple way to message
testers; and a console home that shows what needs attention today.

## 2. User stories

- As the operator, I raise the suggested rate by 1 kr per km, see what it does
  to an example trip before saving, and write down why.
- As the operator, I pause new bookings for an hour while the payment provider
  has an outage, and existing bookings carry on.
- As the operator, every Monday I see searches, results, requests, bookings
  and cancellations by corridor and week, and whether we are on track for the
  exit criteria.
- As the operator, I tell all testers in Icelandic and English that a new
  corridor has opened.
- As the operator, I open the console in the morning and see two reports, one
  dispute and a held payout waiting for me.

## 3. Behaviour

### 3.1 Console home and layout

1. **Today:** counts that link to their lists: urgent and other open reports
   (spec 9), disputes waiting for a decision (spec 8), held payouts and failed
   payments or refunds (spec 13), meeting point issues and reviews due
   (spec 2), failed notifications (spec 7), people on the reliability watch
   list (spec 8), and appeals (spec 9).
2. **Sections:** Home, Metrics, Reports, Disputes, Users, Trips and bookings,
   Meeting points, Payments, Notifications, Announcements, Settings, Audit log.
3. The console is a web app for the operator role only, signed in with a
   passkey ([security](../engineering/security.md)), with texts in English and
   Icelandic like the app. It works on a laptop and on a phone for urgent
   reports.

### 3.2 Settings (H4)

1. One page lists every setting from
   [pricing and seats](../product/pricing-and-seats.md#configuration-values)
   and the later specs, grouped: prices; booking and paying; changes and
   cancellations; trip day and reliability; chat and notifications; safety.
2. Each setting shows its value, unit, default, allowed range and a short
   explanation. A value outside the range is refused.
3. Saving needs a reason. The page first shows the effect: for price settings,
   an example trip (Reykjavík to Akureyri with 3 seats) before and after, and
   the highest price level drivers can choose; for timing settings, a
   sentence such as "Requests will expire after 8 hours instead of 12".
4. **When a change applies:** trips published and bookings made after it use
   the new values. Existing trips keep their prices, and existing bookings
   keep their prices, deadlines and refund rules, because each records the
   settings version it was made under.
5. **History:** every change with who, when, old and new value and the
   reason. It cannot be edited, and it is in the audit log (spec 9).
6. Changing a value within its range is an operational change. Changing a
   range, the meaning of a setting, or adding one is a rule change and needs
   an ADR, as for any business rule.
7. Starting values (decision 1): `suggested_rate` 15 kr per km per passenger
   and `reference_cost_per_km` 150 kr per km, the state mileage allowance for
   the first 10 000 km from 1 June 2026. Both are confirmed or lowered by the
   legal opinion before the beta, and the reference cost is reviewed when the
   allowance changes.

### 3.3 Switches

For emergencies, each of these can be turned off and on again without a
release, with a reason:

- new sign-ups;
- new trips;
- new bookings and payments;
- SMS, email or push sending (each separately);
- each external integration
  ([integration rule 5](../architecture/integrations.md#integration-rules)).

Pausing shows a short banner in the app where it matters, and never cancels
or changes existing trips and bookings. A switch that stays off for more than
an hour reminds the operator.

### 3.4 Metrics (H5)

1. **Corridors:** the operator defines corridors as a name and an ordered list
   of places (for example Reykjavík, Hveragerði, Selfoss). A search or trip
   belongs to a corridor when both its ends are places on it. Which corridors
   open first is open question Q6.
2. **Weekly figures** by corridor and in total, for ISO weeks in Iceland time:

   | Metric | How it is counted |
   | ------ | ----------------- |
   | Searches | Searches made |
   | Searches with a result | Share of searches showing at least one trip |
   | Requests per search with a result | Booking requests and instant bookings, divided by searches with a result, in the same week |
   | Trips posted and seats offered | Published trips and their seats |
   | Confirmed bookings and seats | Paid or free bookings confirmed |
   | Seat fill | Booked seat-km divided by offered seat-km on completed trips |
   | Driver cancellation rate | Trip and booking cancellations by drivers that count (spec 6, spec 8), divided by trips with passengers |
   | Passenger late cancellations and no-shows | Counted ones (spec 8), divided by confirmed bookings |
   | Repeat passengers | Passengers who booked again within 60 days of an earlier booking |
   | Reports per 1 000 trips, and time to answer | From spec 9 |
   | Money | Paid, refunded and paid out (spec 13) |
   | Active people | Drivers with a trip, passengers with a booking |

3. **Exit criteria:** a panel compares the last 4 weeks on the launch
   corridors with the beta targets, each marked met or not met (decision 2):
   - at least half of searches show a trip;
   - at least 1 in 5 searches with a result leads to a request;
   - driver cancellations under 10%, excluding weather;
   - seat fill of at least 30%;
   - at least 30% of passengers book again within 60 days;
   - every report answered within 24 hours.
4. Figures are recomputed every night for the last 2 weeks, so late
   cancellations and completions are included. The page can export the
   figures as CSV.
5. **No tracking:** searches are logged without any user ID, device ID or
   network address: only the two places, the date searched for, the number
   of results, the time and the platform. The ratio of requests to searches
   is a ratio of weekly totals, so nothing links a search to a person.

### 3.5 Announcements (H6)

1. The operator writes a title and a message in both Icelandic and English
   (both required) and picks the audience: everyone, drivers (posted a trip),
   passengers (made a booking), or people with a trip or booking on a
   corridor.
2. The console shows how many people it will reach by push and by email, and
   the operator can send it to themselves first.
3. On sending, each person gets it in their language by push and by email
   (verified addresses), through spec 7's delivery with its once-only
   guarantee.
4. Announcements are about the beta and the service, never advertising
   (spec 7). Testers can turn them off with a "Beta news" switch in
   Settings, on by default (decision 3).
5. Sent announcements are listed with their audience, time and delivery
   counts.

## 4. Rules

| ID | Rule |
| -- | ---- |
| R10.1 | Every setting has a default, a unit and an allowed range; values outside it are refused. |
| R10.2 | Every setting change records who, when, the old and new value and a reason, and cannot be edited. |
| R10.3 | Trips and bookings keep the settings version they were made under for prices, deadlines and refund rules. |
| R10.4 | Changing a value within its range is operational; changing a range or a meaning, or adding a setting, needs an ADR. |
| R10.5 | A switch pauses only new activity; it never cancels or changes existing trips and bookings. |
| R10.6 | Metrics use the database's own records and a search log that holds no user ID, device ID or network address. |
| R10.7 | Announcements need both languages, go only to beta testers who have "Beta news" on, and never advertise. |
| R10.8 | Only the operator role can open the console, and every action in it is written to the audit log (spec 9). |

## 5. Screens

1. Console home: today's counts
2. Settings: groups, values, ranges, effect preview, reason, history
3. Switches
4. Metrics: weekly table and charts by corridor, exit criteria panel, CSV
   export
5. Corridors: list and edit
6. Announcements: write in both languages, audience, reach, test send,
   send, history
7. App banner when something is paused

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)):

- `Setting` (existing): key, value, unit, default, minimum, maximum, group.
  `SettingChange`: setting, old and new value, reason, by, at.
  `SettingsVersion`: a number that goes up with every change; trips and
  bookings record the version they were made under.
- Switches are settings with an on or off value.
- `SearchLog`: from place, to place, date searched for (if any), result
  count, time, platform. Nothing else. Kept 14 months.
- `Corridor`: name, ordered places, active.
- `WeeklyMetric`: corridor (or all), ISO week, metric, value, numerator,
  denominator, computed at.
- `Announcement`: audience, title and text in both languages, created by,
  sent at, reach, delivery counts.

Endpoints:

| Method and path | Purpose |
| --------------- | ------- |
| `GET /v1/config` | The setting values clients need (for example price level step, seat limit, cut-offs) and any paused switches; cached for 5 minutes |
| `GET /admin/v1/home` | Today's counts |
| `GET /admin/v1/settings`, `PATCH /admin/v1/settings/{key}` | Read settings; change one with a reason |
| `POST /admin/v1/settings/{key}/preview` | The effect of a new value before saving |
| `GET /admin/v1/settings/history` | Change history |
| `GET /admin/v1/metrics?from=&to=&corridor=` | Weekly figures; `.csv` for export |
| `GET`, `POST`, `PATCH /admin/v1/corridors` | Corridors |
| `POST /admin/v1/announcements`, `POST /admin/v1/announcements/{id}/test`, `POST /admin/v1/announcements/{id}/send` | Draft, test and send |

Domain functions in `packages/domain`: setting ranges and validation, the
price preview (rules P2 to P4), which settings version applies to a trip or
booking, corridor membership, and the metric definitions.

Events: `SettingChanged`, `SwitchChanged`, `AnnouncementSent`. The nightly
metrics job and announcement sending run in the worker.

## 7. Privacy and safety

- The search log is anonymous by design: no user, device or network
  identifier, so the metrics need no consent. It is listed in the privacy
  register.
- Metrics are aggregates. Corridor and week figures based on fewer than 5
  people are shown as "fewer than 5" outside the console's own detail views.
- Announcements go only to beta testers, contain no advertising and can be
  turned off with "Beta news". Marketing messages need opt-in
  consent ([legal](../compliance/legal-and-regulatory.md#6-consumer-protection-and-terms)).
- The console requires the operator role and a passkey; settings, switches
  and announcements are all audited (spec 9).

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

App texts only; console texts follow the same i18n catalogue.

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `paused.bookings` | New bookings are paused for a short while. Your bookings are not affected. | Lokað er fyrir nýjar bókanir um stutta stund. Bókanir þínar haldast óbreyttar. |
| `paused.trips` | Posting new trips is paused for a short while. Your trips are not affected. | Lokað er fyrir nýjar ferðir um stutta stund. Ferðir þínar haldast óbreyttar. |
| `paused.signups` | Sign-ups are paused for a short while. Please try again later. | Lokað er fyrir nýskráningar um stutta stund. Reyndu aftur síðar. |
| `settings.betaNews` | Beta news | Fréttir af beta-prófuninni |
| `announcement.footer` | You get this because you are a ShareRide beta tester. | Þú færð þetta af því að þú tekur þátt í beta-prófun ShareRide. |
| `announcement.turnOff` | Turn off beta news in Settings. | Þú getur slökkt á fréttum af beta-prófuninni í stillingum. |

## 9. Testing

- **Unit (domain):** every setting refuses values outside its range; the
  price preview matches rules P2 to P4, including the highest price level;
  a trip or booking uses the settings version it was made under; corridor
  membership; every metric on a fixed data set, including weeks with no
  data and the "fewer than 5" rule.
- **API integration:** only the operator role reaches `/admin/v1`; a setting
  change without a reason is refused and every change is audited; a paused
  switch refuses new activity with a clear error and leaves existing
  bookings alone; `GET /v1/config` reflects a change within 5 minutes.
- **Worker:** the nightly job is safe to run twice; an announcement sent
  twice by mistake reaches each person once.
- **End to end:** change the suggested rate and see new trips priced with it
  while an existing booking keeps its price; pause bookings and see the
  banner; send an announcement to yourself, then to a corridor.
- **Manual:** the metrics page against a hand count on test data; the
  announcement email in both languages.

## 10. Out of scope

A/B tests; more than one operator role; automatic alerts on metrics; public
statistics; product analytics in the app (Phase 3, consent-based,
[integrations](../architecture/integrations.md)); beta invitations and
feedback (spec 12).

## Decisions

Accepted by Martin on 2026-11-13 as recommended.

| # | Question | Decision |
| - | -------- | -------- |
| 1 | What should the two price rates start at? | Suggested rate 15 kr per km per passenger, so Reykjavík to Akureyri costs about 5 800 kr at 100%. With two passengers that covers roughly the fuel and the new per-km road fee. Reference cost 150 kr per km, the state mileage allowance for the first 10 000 km from 1 June 2026. With 3 seats drivers could then go up to 250%. Both are confirmed or lowered by the legal opinion before the beta |
| 2 | Which beta targets do we hold ourselves to? | The ones in the vision, over the last 4 weeks of the beta on the launch corridors: half of searches show a trip; 1 in 5 searches with a result leads to a request; driver cancellations under 10% (excluding weather); seat fill 30%; 30% of passengers book again within 60 days; every report answered within 24 hours |
| 3 | Can testers turn off announcements? | Yes, with a "Beta news" switch in Settings, on by default. They are not essential, and it keeps us clear of the marketing consent rules |

Sources for decision 1: the state mileage allowance, announcement 1/2026
([Stjórnarráð Íslands](https://www.stjornarradid.is/efst-a-baugi/frettir/stok-frett/2026/05/31/Akstursgjald-rikisstarfsmanna-auglysing-nr.-1-2026/)),
150 kr per km for the first 10 000 km from 1 June 2026; petrol around
280 kr per litre in October 2026 and the per-km road fee from 1 January 2026
([Blue Car Rental](https://www.bluecarrental.is/blog/iceland-fuel-prices-2026-did-car-rental-get-cheaper/)).
