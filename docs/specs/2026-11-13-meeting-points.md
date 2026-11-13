# Spec 2: Meeting points, place search and their admin

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Draft for review

Features: B1 Meeting point catalogue, B2 Place search, B3 Suggest a meeting
point, H1 Meeting points in the operator console
([features](../product/features.md)).
Related: [meeting points](../product/meeting-points.md),
[ADR 0005](../decisions/0005-postgresql-postgis.md),
[ADR 0006](../decisions/0006-meeting-points-and-segment-pricing.md),
[ADR 0009](../decisions/0009-maps-and-routing.md) (proposed),
[spec 1](2026-11-13-sign-in-and-profile.md).

## 1. Problem and goal

Every trip is built from curated meeting points, so passengers must be able to
find them quickly, trust that they are safe and easy to find, and know exactly
where to stand. The operator, working alone, must be able to keep a few hundred
points accurate with little effort.

Goal: anyone can browse meeting points on a map or a list and find a place by
typing it with or without Icelandic letters. Each point tells people where to
stand and what is there. Users can suggest new points, and the operator can
create, check, activate, pause and retire points, with distances between them
computed automatically.

## 2. User stories

- As a passenger, I find the meeting point nearest to me or to a town I type,
  so I know where I can be picked up.
- As a visitor, I type "Hofn" or "Thingvellir" and still find Höfn and the
  points near Þingvellir.
- As a passenger, I see a photo, where exactly to stand, and whether there is
  shelter open at my departure time, so I'm not waiting in the dark and cold.
- As a passenger with poor coverage, I can still open the details of a meeting
  point I looked at before.
- As a user, I suggest a meeting point that is missing, or report that one has
  changed.
- As the operator, I add and check meeting points, pause one that is unsafe,
  and know that distances and suggested prices stay correct.

## 3. Behaviour

### 3.1 Meeting point map and list

1. Available without an account (spec 1, decision 1).
2. The map opens on the user's last viewed area, or on the whole of Iceland the
   first time. Points are clustered when zoomed out. Tapping a point opens its
   summary; tapping again opens the details.
3. A list view shows the same points grouped by region (the eight regions of
   Iceland), sorted by name. The list is a full alternative to the map for
   screen readers.
4. Filters: amenities (shelter, toilets, shop, parking, step-free access) and
   "in use now" (hides seasonal points out of season).
5. Paused points show with a notice and their reason. Draft and retired points
   are not shown.

### 3.2 Meeting point details

- Name in Icelandic, and in English where different; type (gas station, bus
  hub, shopping centre, airport, ferry terminal, parking, other); region and
  municipality.
- Up to 5 photos, each with a description for screen readers.
- **Where to stand:** a short description in the user's language, for example
  "By the bus shelter in front of the main entrance".
- Amenities, and the shelter's weekly opening hours with a note (for example
  holiday hours). "Last checked" date.
- Season: "In use all year", or "In use from May to September".
- Actions: "Open in maps" (hands the coordinates to the phone's maps app),
  "Trips from here" (opens search, spec 4), "Something wrong here?" (3.5).

### 3.3 Offline

The whole catalogue is small (hundreds of points), so the app downloads it
once and then fetches only what changed since the last update. Details and
photos of points the user has opened stay available offline (feature I4).

### 3.4 Place search

One search field is used everywhere a place is chosen: here, when searching
trips (spec 4) and when posting a trip (spec 3).

1. Results appear as the user types, from the second character.
2. Matching ignores case and accents and understands Icelandic letters typed
   in ASCII: "thorlakshofn" finds Þorlákshöfn, "egilsstadir" finds
   Egilsstaðir. Small typos are tolerated ("Akureyi" finds Akureyri).
3. Results include meeting points (by name, English name and aliases such as
   "KEF") and places that are not meeting points: towns, villages and
   well-known landmarks. Choosing a place shows the nearest active meeting
   points and how far they are from it in a straight line.
4. Order: exact and prefix matches first, then aliases, then close matches;
   meeting points before places when equally good.
5. Street addresses are not searched in the beta (see question 2).
6. **Near me:** asks for location permission when first tapped, takes one
   position, and lists the nearest active meeting points with straight-line
   distance. The position is used on the device only, against the downloaded
   catalogue, and never sent or stored.
7. No results: "No places found for …", with "Suggest a meeting point".

### 3.5 Suggest a meeting point or report a problem

Requires an account with a verified phone number.

**Suggest:** drop a pin on the map, give a name, choose a type, and say why it
is a good place and where to stand (up to 300 characters). If the pin is
within 200 m of an active point, the app first asks "Is it this one?". The
suggestion goes to the operator's queue and the user can see its status:
submitted, accepted, declined (with a reason) or already exists.

**Something wrong here?:** on a point's details, choose a reason (closed or
moved, unsafe, wrong location, wrong information, other) and add a note. It
goes to the same queue and marks the point for review.

### 3.6 Operator console

1. **List and map** of all points with filters: status, region, type, season,
   review overdue, open issues.
2. **Create or edit:** all fields above, pin placement on the map with the
   coordinates shown, photos with descriptions in both languages, "where to
   stand" in both languages, weekly shelter hours, season, aliases.
3. **Activate:** allowed only when the activation checklist passes (rule
   R2.3). Activation computes the point's distances (3.7).
4. **Pause** (temporarily unusable, for example road works): a reason in both
   languages and an optional end date. New trips cannot use it. Drivers and
   booked passengers of future trips that use it are notified, and drivers are
   asked to choose another stop (changes follow spec 6).
5. **Retire** (permanently): with no future trips using it, the point is
   retired at once. Otherwise it stops being offered for new trips and retires
   automatically after its last future trip.
6. **Move:** moving an active point by more than 50 m recomputes its distances
   and tells participants of future trips that use it about the new location.
7. **Queue:** suggestions and problem reports. Accept a suggestion (creates a
   prefilled draft), mark it as already existing (linked to that point), or
   decline with a reason. Resolve a problem report with a note, which can
   update the point's last checked date.
8. **Review due:** every active point shows when it is due for its yearly
   review; overdue points are highlighted.
9. **Import:** create drafts in bulk from a CSV file, for the first corridors.
10. Every change is recorded with who made it and when (the audit log of H3,
    spec 9).

### 3.7 Distances between meeting points (legs)

1. A leg is computed for every ordered pair of active meeting points that are
   connected by road: road distance and typical driving time. A→B and B→A are
   separate legs.
2. Legs are computed by a background job with an open-source routing engine on
   the Iceland OpenStreetMap extract (ADR 0009). The car profile avoids ferries
   and mountain (F) roads.
3. The job runs when a point is activated or moved, and for all points when the
   map data is updated (at least every three months) or when the operator
   chooses "Recompute all".
4. The console shows when legs were last computed, the map data version, and
   any pairs with no road connection.
5. Whether a trip's stop order is sensible is checked from leg distances when a
   trip is posted (spec 3), not by limiting which legs exist.

## 4. Rules

| ID | Rule |
| -- | ---- |
| R2.1 | Only the operator creates, edits, activates, pauses and retires meeting points. |
| R2.2 | Meeting points are never deleted. Retired points stay readable on past trips and bookings. |
| R2.3 | A point can be activated only with: a name, location, type, region and municipality; "where to stand" in Icelandic and English; at least one photo with descriptions; amenities and season reviewed; an on-site check date (see question 1); computed legs. |
| R2.4 | A new stop on a trip must be an active meeting point, in season on the trip date. Paused points cannot be added to trips. |
| R2.5 | Seasons are whole months and may cross the new year (for example November to March). |
| R2.6 | Search ignores case and accents and maps þ→th, ð→d, æ→ae, ö→o, á→a, é→e, í→i, ó→o, ú→u, ý→y, in both the query and the names. |
| R2.7 | "Near me" uses the device's position on the device only. It is never sent to the server or stored. |
| R2.8 | Suggestions and problem reports need a verified phone number; at most 5 per user per day. |
| R2.9 | Every active point is reviewed at least once a year, and after any problem report. |
| R2.10 | Moving an active point by more than 50 m recomputes its legs and notifies participants of future trips that use it. |
| R2.11 | Legs exist for every ordered pair of active points connected by road, avoiding ferries and mountain (F) roads. |

Numbers in R2.8 and R2.10 and the 200 m duplicate radius are settings the
operator can change (feature H4).

## 5. Screens

Phone first; on wide screens the map and the list are shown side by side.

1. Meeting points: map with a list toggle, filters and search
2. Meeting point details
3. Place search (shared with specs 3 and 4), with "Near me"
4. Suggest a meeting point: pin on map, then the form
5. Something wrong here?: reason and note
6. My suggestions and reports, with status
7. Console: meeting point list and map
8. Console: create and edit, with the activation checklist
9. Console: queue of suggestions and problem reports
10. Console: legs status and "Recompute all"

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)):

- `MeetingPoint` adds: `name_is`, `name_en`, `aliases`, `location`
  (`geography(Point, 4326)`), `region`, `municipality`, `type`, `amenities`,
  `where_to_stand` (per language), `shelter_hours` (weekly) and
  `shelter_note` (per language), `season_start_month`, `season_end_month`,
  `status` (draft, active, paused, retiring, retired), `pause_reason`,
  `paused_until`, `last_checked_on`, `review_due_on`, `search_text`
  (normalised names and aliases, with a trigram index).
- `MeetingPointPhoto`: point, storage key, description per language, order.
- `Place`: name, aliases, location, kind (town, village, landmark), region,
  `search_text`. Imported from an open dataset whose licence allows storing it
  (to be chosen in the plan).
- `Leg` as in the domain model, computed for all connected pairs.
- `MeetingPointSuggestion`: user, location, name, type, note, status,
  decision reason, decided at, linked meeting point.
- `MeetingPointIssue`: user, meeting point, reason, note, status, resolution.

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `GET /meeting-points?changed_since=` | Catalogue of visible points, or what changed since a time (cached) |
| `GET /meeting-points/{id}` | Details with photos |
| `GET /places/search?q=` | Meeting points and places matching a query |
| `GET /places/{id}/nearest-meeting-points` | Nearest active points to a place, with straight-line distance |
| `POST /meeting-point-suggestions` | Suggest a point |
| `POST /meeting-points/{id}/issues` | Report a problem |
| `GET /me/meeting-point-feedback` | My suggestions and reports with status |

Console endpoints live under `/admin/v1` and need the operator role: create,
update, activate, pause, retire and move points; upload photos; import CSV;
list and decide suggestions and issues; legs status and recompute.

Events: `MeetingPointActivated`, `MeetingPointUpdated`, `MeetingPointMoved`,
`MeetingPointPaused`, `MeetingPointRetired`, `LegsRecomputed`,
`MeetingPointSuggested`, `MeetingPointIssueReported`. Pausing and moving
notify trip participants through spec 7.

The routing engine sits behind a `Router` port, so domain and API tests use a
fixed distance table and only the adapter talks to the engine.

## 7. Privacy and safety

- Browsing and searching need no account. Search queries are not stored with a
  user or device. Queries with no results are counted without any identifier
  and kept 90 days, so the operator can add aliases.
- "Near me" never leaves the device (R2.7).
- A suggestion's pin may be near the user's home. Suggestions and reports are
  visible only to the operator; the link to the user is removed when they are
  decided, and they are deleted 12 months after that.
- Operator photos show no recognisable faces or number plates (blurred before
  upload) and have metadata removed, as in spec 1.
- The map tile provider receives the user's IP address and the map area being
  viewed. It needs a data processing agreement and EEA or adequate-country
  hosting ([ADR 0007](../decisions/0007-eea-hosting-and-data-residency.md));
  self-hosted tiles remove this (ADR 0009).
- "Open in maps" hands only the point's coordinates to the phone's maps app.
- Safety comes from the activation checklist, the yearly review, problem
  reports, and the ability to pause a point at once.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `meetingPoints.title` | Meeting points | Mótsstaðir |
| `meetingPoints.whereToStand` | Where to stand | Hvar á að bíða |
| `meetingPoints.inUseAllYear` | In use all year | Í notkun allt árið |
| `meetingPoints.inUseMonths` | In use from {from} to {to} | Í notkun frá {from} til {to} |
| `meetingPoints.paused` | Not in use at the moment | Ekki í notkun eins og er |
| `meetingPoints.lastChecked` | Last checked {date} | Síðast yfirfarið {date} |
| `meetingPoints.openInMaps` | Open in maps | Opna í kortaforriti |
| `meetingPoints.tripsFromHere` | Trips from here | Ferðir héðan |
| `meetingPoints.somethingWrong` | Something wrong here? | Er eitthvað að hér? |
| `amenities.shelter` | Shelter | Skjól |
| `amenities.toilets` | Toilets | Salerni |
| `amenities.shop` | Shop | Verslun |
| `amenities.parking` | Parking | Bílastæði |
| `amenities.stepFree` | Step-free access | Þrepalaust aðgengi |
| `search.placeholder` | Town or meeting point | Bær eða mótsstaður |
| `search.nearMe` | Near me | Nálægt mér |
| `search.noResults` | No places found for "{query}" | Engir staðir fundust fyrir „{query}“ |
| `search.nearestTo` | Meeting points near {place} | Mótsstaðir nálægt {place} |
| `suggest.title` | Suggest a meeting point | Stinga upp á mótsstað |
| `suggest.isItThisOne` | Is it this one? | Er það þessi? |
| `suggest.thanks` | Thanks! We'll look at your suggestion. | Takk! Við skoðum tillöguna þína. |

## 9. Testing

- **Unit (domain):** search normalisation (property tests: idempotent, ASCII
  output, examples such as Höfn, Þorlákshöfn, Egilsstaðir, Æðey); season
  checks, including seasons across the new year; activation checklist; status
  changes (draft, active, paused, retiring, retired); duplicate radius.
- **API integration:** search ranking for exact, ASCII, alias and misspelt
  queries; nearest points to a place; catalogue changes since a time; rate
  limits on suggestions; pause and retire with and without future trips; legs
  job with a fixed distance table.
- **Adapter:** the `Router` adapter against the routing engine on a small
  extract, run nightly rather than on every PR.
- **End to end:** browse the map and list in both languages, open details,
  search without Icelandic letters, use "Near me" with a mocked position,
  suggest a point; operator creates, activates, pauses and retires a point.
- **Manual:** on-site check of every launch point; screen reader pass on the
  map, list and details; details opened offline in airplane mode.

## 10. Out of scope

Choosing stops and checking stop order when posting a trip (spec 3), trip
search and results (spec 4), delivering notifications (spec 7), general user
reports and the audit log screen (spec 9), street address search, photos from
users, public meeting point pages on the website (later), weather and road
closure warnings (later), and places reachable only by ferry, such as
Vestmannaeyjar, Hrísey and Grímsey.

## Docs to update when approved

- [Meeting points](../product/meeting-points.md): statuses (draft, active,
  paused, retiring, retired) and legs for every connected pair.
- [Domain model](../architecture/domain-model.md): `MeetingPoint` fields,
  `Place`, `MeetingPointSuggestion`, `MeetingPointIssue`.

## Questions for Martin

| # | Question | Recommendation |
| - | -------- | -------------- |
| 1 | Must every meeting point be checked on site before it goes live? | Yes. Safety and "where to stand" are the core promise. You, or a trusted local helper, visit, take the photos and confirm the details. Plan the launch corridors as a few road trips |
| 2 | Should search find street addresses in the beta? | No. Towns, villages, landmarks and "Near me" cover how people choose a meeting point; addresses add data and licence work. Revisit after the beta |
| 3 | Who can suggest meeting points? | Any user with a verified phone number, up to 5 a day. Drivers and passengers both know good spots |
