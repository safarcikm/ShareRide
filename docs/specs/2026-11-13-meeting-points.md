# Spec 2: Meeting points, place search and their admin

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved (2026-11-13)

Features: B1 Meeting point catalogue, B2 Place search, H1 Meeting points in the
operator console ([features](../product/features.md)). B3, suggesting meeting
points, was dropped: the operator curates every meeting point (decision 1).
Related: [meeting points](../product/meeting-points.md),
[ADR 0005](../decisions/0005-postgresql-postgis.md),
[ADR 0006](../decisions/0006-meeting-points-and-segment-pricing.md),
[ADR 0009](../decisions/0009-maps-and-routing.md) (accepted),
[spec 1](2026-11-13-sign-in-and-profile.md).

## 1. Problem and goal

Every trip is built from curated meeting points, so passengers must be able to
find them quickly, trust that they are safe and easy to find, and know exactly
where to stand. The operator, working alone, must be able to keep a few hundred
points accurate with little effort.

Goal: anyone can browse meeting points on a map or a list and find a place by
typing it with or without Icelandic letters. Each point tells people where to
stand and what is there. Users can report a problem with a point. Only the
operator creates, checks, activates, pauses and retires points, and distances
between them are computed automatically.

## 2. User stories

- As a passenger, I find the meeting point nearest to me or to a town I type,
  so I know where I can be picked up.
- As a visitor, I type "Hofn" or "Thingvellir" and still find Höfn and the
  points near Þingvellir.
- As a passenger, I see a photo, where exactly to stand, and whether there is
  shelter open at my departure time, so I'm not waiting in the dark and cold.
- As a passenger with poor coverage, I can still open the details of a meeting
  point I looked at before.
- As a user, I report that a meeting point has changed or feels unsafe.
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
5. Street addresses are not searched in the beta (decision 3).
6. **Near me:** asks for location permission when first tapped, takes one
   position, and lists the nearest active meeting points with straight-line
   distance. The position is used on the device only, against the downloaded
   catalogue, and never sent or stored.
7. No results: "No places found for …", with a hint to try a nearby town.

### 3.5 Report a problem with a meeting point

Requires an account with a verified phone number. Users cannot add or suggest
meeting points (decision 1).

On a point's details, "Something wrong here?" lets the user choose a reason
(closed or moved, unsafe, wrong location, wrong information, other) and add a
note of up to 300 characters. The report goes to the operator's queue, marks
the point for review, and the user sees a thank-you message.

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
7. **Problem reports:** a queue of reports with the point, reason and note.
   Resolve a report with a note, which can update the point's last checked
   date, or pause the point at once.
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
| R2.1 | Only the operator creates, edits, activates, pauses and retires meeting points. Users cannot add or suggest them. |
| R2.2 | Meeting points are never deleted. Retired points stay readable on past trips and bookings. |
| R2.3 | A point can be activated only with: a name, location, type, region and municipality; "where to stand" in Icelandic and English; at least one photo with descriptions; amenities and season reviewed; the date the operator confirmed it (decision 2); computed legs. |
| R2.4 | A new stop on a trip must be an active meeting point, in season on the trip date. Paused points cannot be added to trips. |
| R2.5 | Seasons are whole months and may cross the new year (for example November to March). |
| R2.6 | Search ignores case and accents and maps þ→th, ð→d, æ→ae, ö→o, á→a, é→e, í→i, ó→o, ú→u, ý→y, in both the query and the names. |
| R2.7 | "Near me" uses the device's position on the device only. It is never sent to the server or stored. |
| R2.8 | Problem reports need a verified phone number; at most 5 per user per day. |
| R2.9 | Every active point is reviewed at least once a year, and after any problem report. |
| R2.10 | Moving an active point by more than 50 m recomputes its legs and notifies participants of future trips that use it. |
| R2.11 | Legs exist for every ordered pair of active points connected by road, avoiding ferries and mountain (F) roads. |

Numbers in R2.8 and R2.10 are settings the operator can change (feature H4).

## 5. Screens

Phone first; on wide screens the map and the list are shown side by side.

1. Meeting points: map with a list toggle, filters and search
2. Meeting point details
3. Place search (shared with specs 3 and 4), with "Near me"
4. Something wrong here?: reason and note
5. Console: meeting point list and map
6. Console: create and edit, with the activation checklist
7. Console: problem reports
8. Console: legs status and "Recompute all"

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
- `MeetingPointIssue`: user, meeting point, reason, note, status, resolution.

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `GET /meeting-points?changed_since=` | Catalogue of visible points, or what changed since a time (cached) |
| `GET /meeting-points/{id}` | Details with photos |
| `GET /places/search?q=` | Meeting points and places matching a query |
| `GET /places/{id}/nearest-meeting-points` | Nearest active points to a place, with straight-line distance |
| `POST /meeting-points/{id}/issues` | Report a problem |

Console endpoints live under `/admin/v1` and need the operator role: create,
update, activate, pause, retire and move points; upload photos; import CSV;
list and resolve problem reports; legs status and recompute.

Events: `MeetingPointActivated`, `MeetingPointUpdated`, `MeetingPointMoved`,
`MeetingPointPaused`, `MeetingPointRetired`, `LegsRecomputed`,
`MeetingPointIssueReported`. Pausing and moving
notify trip participants through spec 7.

The routing engine sits behind a `Router` port, so domain and API tests use a
fixed distance table and only the adapter talks to the engine.

## 7. Privacy and safety

- Browsing and searching need no account. Search queries are not stored with a
  user or device. Queries with no results are counted without any identifier
  and kept 90 days, so the operator can add aliases.
- "Near me" never leaves the device (R2.7).
- Problem reports are visible only to the operator; the link to the user is
  removed when a report is resolved, and the report is deleted 12 months after
  that.
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
| `search.label` | Town or meeting point | Bær eða mótsstaður |
| `search.nearMe` | Near me | Nálægt mér |
| `search.noResults` | No places found for "{query}" | Engir staðir fundust fyrir „{query}“ |
| `search.resultCount` | {count} places found | {count} staðir fundust |
| `search.nearest` | Nearest meeting points | Næstu mótsstaðir |
| `report.thanks` | Thanks! We'll check this meeting point. | Takk! Við förum yfir þennan mótsstað. |

## 9. Testing

- **Unit (domain):** search normalisation (property tests: idempotent, ASCII
  output, examples such as Höfn, Þorlákshöfn, Egilsstaðir, Æðey); season
  checks, including seasons across the new year; activation checklist; status
  changes (draft, active, paused, retiring, retired).
- **API integration:** search ranking for exact, ASCII, alias and misspelt
  queries; nearest points to a place; catalogue changes since a time; rate
  limits on problem reports; pause and retire with and without future trips; legs
  job with a fixed distance table.
- **Adapter:** the `Router` adapter against the routing engine on a small
  extract, run nightly rather than on every PR.
- **End to end:** browse the map and list in both languages, open details,
  search without Icelandic letters, use "Near me" with a mocked position,
  report a problem; operator creates, activates, pauses and retires a point.
- **Manual:** operator confirmation of every launch point; screen reader pass on the
  map, list and details; details opened offline in airplane mode.

## 10. Out of scope

Choosing stops and checking stop order when posting a trip (spec 3), trip
search and results (spec 4), delivering notifications (spec 7), general user
reports and the audit log screen (spec 9), suggestions of meeting points by
users (decision 1), street address search, photos from users, public meeting
point pages on the website (later), weather and road closure warnings (later),
and places reachable only by ferry, such as Vestmannaeyjar, Hrísey and Grímsey.

## Decisions

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Can users suggest meeting points? | No. The operator curates every meeting point (Martin, 2026-11-13). Users can still report a problem with an existing point |
| 2 | Must every meeting point be checked on site before it goes live? | The operator confirms every point before activation, from local knowledge or a visit; a visit is not required (Martin, 2026-11-13). The photo and "where to stand" are still required |
| 3 | Should search find street addresses in the beta? | No. Towns, villages, landmarks and "Near me" are enough to choose a meeting point; revisit after the beta (Martin, 2026-11-13) |
