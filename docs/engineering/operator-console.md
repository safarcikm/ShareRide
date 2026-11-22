# Operator console: adding to it

**Owner:** Martin · **Last reviewed:** 2026-11-18

The console is the operator's own web app
([ADR 0028](../decisions/0028-operator-console-web-app-and-passkeys.md)).
Each spec adds its operator pages to it. This page says how, so every
section works the same way. Security details are in
[security](security.md#operator-console).

## A console route in the API

1. Define the route in `packages/contracts` with `auth: "operator"` and a
   path under `/admin/v1/<area>`. Its errors include `401
operator_unauthenticated`.
2. Put the handlers in the module that owns the records, in
   `apps/api/src/modules/<area>/admin-routes.ts`, exporting
   `register<Area>AdminRoutes(app, dependencies)`. Pass
   `toOpenApiRoute(route, requireOperator)`; the operator is
   `operatorOf(c)`.
3. Register it in `apps/api/src/app.ts` after `registerAdminRoutes`, with
   the shared `requireOperator`.
4. Every action that changes something calls `recordAudit(tx, entry)` from
   `apps/api/src/modules/admin/audit.ts` inside the transaction that makes
   the change:
   - `operator`: `operatorOf(c)`. The `operator` command, which runs on
     the server, writes `sessionId: null`, `request: null` and the account
     it changes as the operator;
   - `action`: a dotted name, the record's kind first and what happened
     last, such as `meeting_point.activated` or `report.dismissed`;
   - `subjectType` and `subjectId`: the record acted on;
   - `before` and `after`: `changedFields(old, new)` from the domain, for
     records the operator curates. For a person's record, list the field
     names that changed, not their values (spec 9, section 7);
   - `request`: `auditRequestOf(c, clientAddress)`.
     Opening something sensitive, such as a conversation or payment details,
     is an action too.
5. Integration tests sign in with `api.signInOperator()` from
   `apps/api/src/testing.ts` and send its `cookie`. Test that the route
   refuses a request without it and that each action writes its entry.

## Becoming an operator

`pnpm --filter @shareride/api operator add <phone number or user ID>`
gives the role and prints a setup link for the first passkey; the link
opens the console's setup page. `remove` takes the role away and `list`
lists operators. Passkeys are bound to `ADMIN_ORIGIN`, which is
`http://localhost:3000` locally unless you set it.

To work on the console locally, run the API
(`pnpm --filter @shareride/api dev`) with `ADMIN_ORIGIN=http://localhost:5173`
in `.env`, then `pnpm --filter @shareride/admin dev` and open
`http://localhost:5173/admin/`. Vite passes `/admin/v1` on to the API, so
the cookie and the passkeys see one origin. The API serves the built console
at `/admin` itself when `ADMIN_APP_DIR` points at
`apps/admin/dist` (`pnpm --filter @shareride/admin build`), as the image
does.

## The guard

`guardAdminPaths` in `apps/api/src/modules/admin/require-operator.ts` runs
for every request under `/admin/v1`, before any console route, so a route
that forgets `requireOperator` is still closed. Only the routes in
`openAdminRoutes`, matched exactly as `METHOD /path`, skip it: the sign-in
steps that run before there is a session. Add a route there only if it
cannot need a signed-in operator, and say why in the pull request.

`requireOperator` on a route runs the same check again only when the guard
has not; it is there so the OpenAPI document shows the route as signed in.

## The audit log table

Migration `0020_operator_console.sql` ends with hand-written SQL: triggers
that stamp `created_at` from the database clock, refuse updates, refuse
deleting entries younger than 3 years, and refuse `TRUNCATE`. Drizzle does
not know about them. When a later migration changes `audit_log`, check the
triggers still apply, and never drop them.

The console's Audit log page reads it through `GET /admin/v1/audit-log`,
newest first, 50 entries a page. Its action filter matches the start of
the name, so `meeting_point.` finds every meeting point action: name new
actions with the record's kind first. "Only this record" filters by
`subjectType` and `subjectId`, so give every action on a record the same
pair. The page shows `before` and `after` field by field.

## Meeting points

`apps/api/src/modules/meeting-points/admin-routes.ts` holds the console's
meeting point routes (`registerMeetingPointsAdminRoutes`), with the work in
`admin-service.ts`:

- `GET /admin/v1/meeting-points` lists every point, drafts and retired
  ones too, by Icelandic name, with the domain's filters
  (`matchesConsoleFilters`): status, region, type, season this month,
  review overdue, open problem reports and part of a name. Each row has
  its count of open reports (`openIssues`). There are a few hundred points
  at most, so it filters them all in the API.
- `POST /admin/v1/meeting-points` adds a draft; `PUT
/admin/v1/meeting-points/{id}` saves its fields. Both check the fields
  with `validateMeetingPointDraft` and answer `validation_failed` with each
  field and its problem in `details`, which the form shows by its field.
- An edit sends back the `updatedAt` it loaded. If the point was saved
  since, the edit is refused with `meeting_point_changed`, so one copy
  never overwrites a newer one. The comparison is in SQL, to the
  millisecond, as JavaScript dates hold no more.
- Only a draft's spot is edited there (`move_needed` otherwise): moving a
  point in use recomputes its distances and tells the trips that use it
  (R2.10), its own step (below). A retired point is not edited
  (`meeting_point_retired`).
- Audit entries are `meeting_point.created` with the fields, and
  `meeting_point.updated` with only the fields that changed. Saving
  without a change writes nothing.
- `POST /admin/v1/meeting-points/{id}/pause`, `/resume` and `/retire`
  change its status (`nextPointStatus`), each with the `updatedAt` the
  console loaded, and refuse a change the status does not allow with
  `status_change_not_allowed`. A pause takes a reason in both languages
  and an optional end date (`validatePause`). Each point's answer has
  `futureTrips`: the trips still to stop there (published or under way,
  with that stop not removed and still ahead).
- `GET /admin/v1/meeting-points/{id}/activation` gives a point's
  activation checklist (R2.3, the domain's `activationChecklist`): each
  item, whether it is done, from what is saved, and whether it is
  `required`, and `ready`, which counts the required items only. The
  photo is recommended, not required (spec 21, ADR 0036). The last
  item, `legs`, asks for a road within 1 km that reaches a point in
  service, or none in service yet (the leg service's `connects`, one
  search), as activating computes the legs. `POST
/admin/v1/meeting-points/{id}/activate`, with the `updatedAt` the
  console loaded, makes a draft active with its review date, and refuses
  one whose required items are not all done with `activation_not_ready`
  and each of those in `details` (`issue: "not_done"`, the domain's
  `missingForActivation`). The console always asks, as
  the list it shows can be older than what is saved. In one transaction,
  it takes
  the legs lock, then the point's row, checks the checklist again,
  computes the point's legs both ways with every point in service
  (`computeFor`) and writes the audit entry `meeting_point.activated`,
  with the status and review date before and after and how many legs
  there are and are missing. No one is told: a draft has no trips, and
  the app finds the point in its catalogue. With `confirmToday: true`
  (spec 21, 3.5.5), today in Iceland becomes the day confirmed and the
  amenities and season count as reviewed (an earlier review day stays)
  before the checklist is checked; they are saved only if the point
  activates, and the audit entry shows them, with `confirmedToday`.
- "Activate several drafts" on the Meeting points list (spec 21, 3.5.5):
  while the list shows drafts, each draft's card has a tick box. "Confirm
  and activate N points" sends one activate request per ticked draft, one
  after another, each with its `updatedAt` and `confirmToday`, so each
  computes its own legs and writes its own audit entry. A refusal does
  not stop the rest: the panel lists each draft not activated with what
  is still to do, or that it changed since the list was loaded, and the
  list reloads quietly at the end. `network_error` or
  `operator_unauthenticated` stops it, and the rest are listed as not
  activated. While it runs, the filter form and the tick boxes wait;
  leaving the page stops it before the next request. A filter change
  clears the ticks.
- A pause writes one `MeetingPointChanged` event per future trip in the
  same transaction. The notification worker asks that trip's driver to
  choose another stop, and tells each passenger whose accepted or
  confirmed booking gets in or out there, with an SMS within 24 hours of
  boarding (spec 7, 3.4). Each is told once. News of a point back in use
  before it goes out is not sent, nor news to a driver whose trip has
  passed the point or a passenger whose booking no longer stops there. A
  point retired while paused keeps its reason, and its news still goes
  out ("no longer in use"). The trips are not changed or cancelled.
- Publishing a trip and adding a stop read their points `FOR SHARE`, so
  a pause or a retirement under way and the trip wait for each other: the
  pause counts the trip among those to tell, or the trip sees the point
  not offered.
- Not covered yet: a request the driver accepts after the pause is not
  told (search no longer offers the point, but the booking API does not
  refuse it); a point paused, brought back and paused again before the
  first news went out tells its people twice. While an older API version
  still runs during a deploy, it marks `MeetingPointChanged` events done
  without telling anyone, so pause no point during a deploy.
- Audit entries are `meeting_point.paused`, `meeting_point.resumed` and
  `meeting_point.retired`, with the status, the pause and the review date
  before and after, and how many future trips there were.
- `POST /admin/v1/meeting-points/{id}/move`, with the new `position` and
  the `updatedAt` the console loaded, moves a point in service: active,
  paused or retiring (the domain's `canMove`). A draft's spot is edited
  in its form, and a retired point stays where it was
  (`move_not_allowed`). The spot is checked with `validateMove` (in
  Iceland, kept to six decimals, not where the point is: `outside_iceland`,
  `same_place`) and with the leg service's `connects` (`no_road`), each
  as `validation_failed` on `position`. In one transaction it takes the
  legs lock, then the point's row, saves the spot, computes the point's
  legs again both ways (`computeFor`) and, when it moved more than 50 m
  (`pointMovedFar`, R2.10, `moveSettings`), writes one `MeetingPointMoved`
  event per future trip. The answer has the point, the `metres` moved
  and `tripsTold`. The audit entry `meeting_point.moved` has the spot
  before and after, the metres, the legs and missing counts, and the
  trips told.
- The worker tells a move as it tells a pause: the trip's driver once
  (`meeting_point_moved_driver`, push and email), and each passenger whose
  accepted or confirmed booking gets in or out there
  (`meeting_point_moved`, push, email, and the pause's SMS within 24 hours
  of boarding). Nothing goes to a driver whose trip has passed the point,
  or to a passenger whose booking no longer stops there. The trips are not
  changed: the stop is the same point, in its new place. An API version
  from before moves (milestone 8, PR 12b) marks `MeetingPointMoved`
  events done without telling anyone, so move no point while that
  version deploys.
- The API's minute job (`moveMeetingPointsOn`) brings a paused point back
  into use on its end date in Iceland, and retires a retiring point once
  no trip is still to stop there. These follow from an operator's earlier
  action, which has the audit entry, so they write none.

The console's pages are in `apps/admin/src/pages/meeting-points/`:
`list.tsx` (the map and the list, the filters kept in the address),
`form.tsx` (add or edit one) and `form-values.ts`, which turns what was
typed into the API's input and checks it with the same
`validateMeetingPointDraft` before sending. A field's error goes as soon as
the field is changed; the form checks everything again on saving. A browser's time
field cannot hold 24:00, so the form shows a shelter closing at midnight as
00:00 and sends a closing time of 00:00 as 24:00; 00:00 to 00:00 is open
all day. The date
the operator confirmed the point (R2.3) is its `lastCheckedOn`, the "Last
checked" date the app shows.

`status-panel.tsx` is the point's "In use" panel above the form: how many
upcoming trips stop there, a paused point's reason and end date, and the
buttons its status allows (`nextPointStatus`). A draft's panel has its
activation checklist (`activation.tsx`), loaded again when the point is
saved or the photos panel finds a photo changed, by it or elsewhere (its
`onChange`), as the API checks what is saved. Activate always asks the
API: if something is still to do, the list shows what the API found
(unless a newer list is on its way) and says how many items are left,
with the focus on it. A recommended item not done (the photo) says
"Recommended" instead of "To do" and is not counted. Pausing opens a short form
(the reason in both languages, an optional end date) checked with
`validatePause` before it is sent; retiring asks first and says whether the
point retires at once or after its last trip. Bringing a point back needs
no question, as it can be paused again. Moving (`move.tsx`) opens a field
for the new spot, read as a draft's is (`readSpot`), and says how far it
is from the point (`metresMoved`) and whether anyone is told
(`pointMovedFar`, and the upcoming trips), with a link to check it on
OpenStreetMap; it checks the spot with `validateMove` before sending.
After a move the form shows the new spot. What a pause, a move or a retirement does
is read with its button (`aria-describedby`). After a status change the
form keeps what was typed in it but not saved, as a status change leaves
the other fields as they were. A point changed elsewhere since the page
loaded offers the newest copy, as a save does, which replaces what was
typed.

### Photos

A point's photos (spec 2, 3.6.3) are in
`apps/api/src/modules/meeting-points/photos.ts`, with their routes in
`registerMeetingPointPhotoAdminRoutes`:

- `GET /admin/v1/meeting-points/{id}/photos` lists them in order, each
  with a link, its descriptions in both languages, its size and its
  `updatedAt`. `POST` the same path adds one last: the descriptions and
  `file`, the JPEG in base64, as the API takes only JSON. `PUT
.../photos/{photoId}` changes its descriptions with the `updatedAt` it
  loaded (`photo_changed` if it was changed since), `PUT .../photo-order`
  takes every photo's ID once in the new order (`photos_changed` if one
  was added or removed since), and `DELETE .../photos/{photoId}` removes
  one. Each answers with the point's photos as they now are.
- The console resizes each photo to at most 1 600 pixels and writes it as
  a new JPEG with only the picture's own segments, which leaves out
  location, camera and other metadata ([ADR 0029](../decisions/0029-photos-cleaned-in-the-browser-and-checked-by-the-api.md)).
  The API checks the result with the domain's `checkPhotoFile`, which
  takes only the segments on its list: the plain JFIF header without a
  thumbnail, quantisation and Huffman tables, a restart interval, one
  baseline or progressive frame and its scans, each exactly as long as
  its parts, and coded data only after a scan's header. Exif, XMP, ICC
  profiles, comments and anything after the end are refused as
  `metadata`; other forms as `not_jpeg`. At most 2 MB and 1 600 pixels on
  the longer side. A body over 3 MB is refused with 413 before it is read.
- At most five per point (`too_many_photos`), and none for a retired
  point. Changes take the point's row `FOR UPDATE`, so two operators'
  changes to one point's photos go one at a time.
- A new photo's file is stored first, under a random key
  (`meeting-points/<uuid>.jpg`), then its row and audit entry in one
  transaction; if that fails, the file is deleted. Removing deletes the
  row first and the file after the commit, so a failure leaves a file
  no photo points to, never a photo without its file.
- Audit entries are `meeting_point.photo_added` and
  `meeting_point.photo_removed` (its ID, descriptions and size, never the
  file), `meeting_point.photo_described` (only what changed) and
  `meeting_point.photos_ordered` (the IDs before and after).
- The app's `GET /v1/meeting-points/{id}` has the photos in order, each
  with its link, size and descriptions for screen readers.

In the console, a point's page has a Photos panel
(`apps/admin/src/pages/meeting-points/photos-panel.tsx`) under its form:
each photo with its descriptions to change, Move earlier, Move later and
Remove (which asks first), and a form to add one with both descriptions.
A retired point's photos are shown without the buttons, and so are a
point's that another operator retires while the page is open
(`meeting_point_retired`). Each result takes the focus, as the button that
made the change may be gone; after a move the focus stays on the photo
and the result is read out from a live region. Before upload,
`browserPhotos` (`apps/admin/src/photos.ts`) draws the chosen file on a
white canvas at most 1 600 pixels on the longer side, turned the way the
camera held it, and writes a JPEG, at lower quality until it fits in 2 MB. The
domain's `stripPhotoMetadata` then keeps only the picture's own segments,
as Safari's canvas may add an Exif segment, and the console runs
`checkPhotoFile` itself before sending, so a refusal is explained before
the upload. Tests give the console a fake `PhotoBrowser`; the Playwright
journey uploads a real file through Chromium's canvas.

The app shows a point's photos on its details, above "Where to stand",
each the width of the column in its own shape and described for screen
readers in the user's language. A path on the API (the folder storage) is
fetched from the API's address (`photoUrl`). A photo that does not load,
offline or after its link ran out, is replaced by a note with its
description.

The storage (`apps/api/src/platform/photo-storage.ts`) is chosen by
`PHOTO_STORAGE`: `hetzner` (the bucket, `photo-storage-hetzner.ts`), a
`folder` (development, the default; the API serves its files at
`/v1/photo-files/`, and production refuses it, as a deploy would lose
them) or `none` (no photos are taken or shown). Links to the bucket are
signed (AWS Signature V4, with `aws4fetch`) from the start of the hour for
two hours (ADR 0029), so a link lasts at least an hour and stays the same
all hour, and the app's five-minute cache of a point's details always holds
links that work. The console's and the web app's content security policies allow
images from the bucket's origin. `pnpm --filter @shareride/api
test:contract` checks the adapter against the real bucket with its keys
(`photo-storage-hetzner.contract.test.ts`).

### Importing drafts from a file

"Import from a file" on the list (`apps/admin/src/pages/meeting-points/import.tsx`)
adds meeting points as drafts in bulk, for the first corridors (spec 2,
3.6.9). The operator chooses a CSV file and checks it; the console reads
it as UTF-8 and sends its text to `POST /admin/v1/meeting-points/import`
with `save: false`. The API reads it with the domain's
`readMeetingPointImport` and answers with each row as it will be saved,
or its problems by column. "Add N drafts" sends the same text with
`save: true`.

- The first row names the columns, in any order. `name_is`, `latitude`,
  `longitude`, `type`, `region` and `municipality` are needed; `name_en`,
  `aliases`, `where_to_stand_is`, `where_to_stand_en`, `amenities`,
  `season_start` and `season_end` may be left out. Aliases and amenities
  are separated by `|`. Types, regions and amenities are the catalogue's
  names (`fuel-station`, `southern-peninsula`, `step-free`). Shelter hours
  and "Last checked" are added later in each draft's form.
- Cells may be separated by commas, semicolons or tabs, whichever the
  first line with text uses most, as Excel in Icelandic saves with
  semicolons and decimal commas; coordinates take a decimal comma too.
  Excel's `sep=;` first line names the separator and is left out. Quoted
  cells may hold the separator, line breaks and doubled quotes. A byte
  order mark is dropped; a file in another encoding is refused
  (`not_utf8`). Columns with no name and no text, which spreadsheets save
  at the end, are left out; a column with text and no name is refused
  (`unnamed_column`, by its place).
- Names, aliases and the municipality are put on one line (line breaks,
  tabs and control characters become single spaces); where to stand keeps
  its line breaks and loses other control characters.
- Each row is checked as the form checks a draft
  (`validateMeetingPointDraft`). A row whose Icelandic name, compared as
  search compares names, is the name of a point that is not retired, or
  of an earlier row, is a `duplicate`, so importing the same file twice
  adds nothing. A name with no letters or digits, such as `?`, is
  compared as it is, in lower case.
- Rows with problems are skipped; the rest become drafts, inserted one at
  a time in the file's order so each row gets its own ID, in one
  transaction with one audit entry, `meeting_point.imported` (how many
  were added and skipped, and each new point's ID and name). Imports take
  an advisory lock, so two at once cannot add the same name.
- At most 500 rows and 1 MB (`importLimits`). The console refuses a file
  over 1 MB before sending it. The API answers 413 to a body over 2 MB
  before reading it, and `validation_failed` to a text over 1 000 000
  characters. A file that cannot be read gets `validation_failed` with
  each problem in `details`: `file`, `columns.<name>`, `columns.<place>`
  or `lines.<number>`.

```csv
name_is,name_en,aliases,latitude,longitude,type,region,municipality,amenities,season_start,season_end
N1 Borgarnesi,N1 Borgarnes,Hyrnan,64.5383,-21.9206,fuel-station,west,Borgarbyggð,toilets|shop,,
Hof,,"Menningarhúsið Hof",65.6839,-18.0878,other,northeast,Akureyrarbær,,5,9
```

#### The settlement file

`packages/db/src/places/settlement-meeting-points.csv` (spec 21) holds a
point in or near every settlement, 104 rows, for the operator to import
on each server, staging and production alike:

1. In the console, Meeting points, "Import from a file": choose the file
   and check it. On staging the rows named like a sample point (BSÍ,
   Kringlan, Keflavíkurflugvöllur and the other hubs, Staðarskáli) show
   as duplicates and are skipped. "Add N drafts".
2. For each draft: open its spot in maps and move it if needed, and
   check where to stand, the amenities and the season. Grindavík needs a
   check that the town is open.
3. Filter Status: Draft, tick the drafts checked, and "Confirm and
   activate N points": each becomes active, confirmed today. A draft can
   still be activated alone from its page, with the day confirmed set in
   its form.

`settlement-meeting-points.test.ts` reads the file with the console's own
reader and checks that every point joins a road that reaches BSÍ and
back, and that every place of place search reaches a point. To change a
point, change its row: a file already imported adds nothing again, as
its names are duplicates, so a changed point is edited in its form.

### Problem reports

What people send with "Something wrong here?" in the app (spec 2, 3.5;
`apps/api/src/modules/meeting-points/issues.ts`, rules in
`packages/domain/src/meeting-points/issues.ts`):

- `GET /admin/v1/meeting-point-issues` lists the open reports, the oldest
  first, each with its point (ID, Icelandic name, status, last confirmed),
  the reason, the note and when it was sent. Never who sent it. The
  console's page is `/admin/meeting-points/problems`, linked from the list
  of points; the home page counts the open reports.
- An open report is what marks its point for review (R2.9): the list's
  "Only points with an open problem report" filter and a tag on the row
  show it. Resolving it, having checked the point, is the review.
- `POST /admin/v1/meeting-point-issues/{id}/resolve` takes a note of what
  was done (1 to 1 000 characters, `checkIssueResolution`, which the page
  calls too) and `checkedToday`. It removes the link to the person who
  sent it. Their 5 a day (R2.8) still counts it: each report is also a
  rate limit event under a keyed hash of their number, kept 24 hours. With
  `checkedToday`, the point's Last confirmed on becomes today in Iceland
  and its yearly review moves with it, unless it is retired. A report
  resolved already answers 409 `issue_resolved`, and the page takes it off
  the list and says so. The report is locked while it is resolved, so two
  operators at once resolve it once.
- Audit entries, in the same transaction: `meeting_point_issue.resolved`
  (before: open; after: resolved, the point, the reason and the note), and
  with a new date `meeting_point.updated` on the point, with its Last
  confirmed on and review date before and after, as an edit writes.
- "Pause … now" on a report for a point in use opens the point's page with
  `?pause`: its pause form opens at once (spec 2, 3.6.7), and the address
  drops `?pause`.
- The hourly clean-up deletes a resolved report 12 months after it was
  resolved (rule `meeting_point_issues`).

### Distances

The legs between meeting points (spec 2, 3.7;
`apps/api/src/modules/meeting-points/legs.ts`), found by the `Router` on
our road file ([road file](road-file.md), ADR 0031):

- Points in service, which keep legs with each other, are active, paused
  and retiring ones (`keepsLegs`). Legs to a point out of service stay
  until that point's own legs are computed again.
- `GET /admin/v1/legs` says how many points are in service and how many
  of their legs exist, when the newest was computed, on which map data
  (`sources`, with `current` for the map data the API has now), the points
  with no road within 1 km and the first 100 legs missing, by name. The
  console's page is `/admin/meeting-points/distances`, linked from the
  list of points, with the map data's attribution.
- `POST /admin/v1/legs/recompute` (an empty JSON body) computes every leg
  between points in service again, in the request: one search a point,
  a few hundredths of a second each (about 10 seconds for 300 points),
  with other requests let in between. It replaces their legs in one
  transaction and answers with the new status. A point moved meanwhile
  keeps the legs its move computed. A second request while one runs gets
  the same answer. The audit entry is `legs.recomputed`, with the source
  and how many points, legs and missing legs.
- `computeFor` gives one point its legs both ways with every point in
  service, replacing all its old ones, those to points out of service
  too, as they were found from where it was. Activating a point calls it
  inside the activation's transaction, after the point is saved; moving one will too
  (PR 12b). It finds them under the lock, so of two points moved at once,
  the second reads where the first now is. Whoever needs the point's row
  as well takes the legs lock first, as the sample seed does, so neither
  waits for the other for ever.
- One writer of legs at a time: the leg service and the sample seed take
  a transaction lock (`lockLegs` in `@shareride/db`) before they delete
  and insert. The seed writes the sample road graph's legs again on each
  deploy, but keeps road file legs, except a moved sample point's.
- Joining a point to a road looks only at roads whose box is within
  1 km, so 300 points join in about a third of a second.

## Disputes

`apps/api/src/modules/trip-day/admin-routes.ts` holds the console's
dispute routes (`registerDisputeAdminRoutes`), with the work in
`admin.ts` (spec 8, 3.5):

- `GET /admin/v1/disputes` lists the contested reports waiting for a
  decision, oldest first; `?state=decided` the last 50 an operator
  decided, newest first. A report nobody answered settles by itself
  after its 24 hours, so it never waits for the operator.
- `GET /admin/v1/disputes/{id}` gives one report with what the system
  knows: both notes, the answer, every stop's planned time and the
  driver's "I'm here" there, the passenger's "I'm here", and the
  outcomes the operator can choose (`decidableOutcomes`), none once it is
  decided or if nobody contested it.
- `POST /admin/v1/disputes/{id}/decision` with `{ outcome, note }` calls
  `decideDispute` (`decide.ts`), which applies the outcome, tells both
  sides and writes `dispute.decided`, all in one transaction.
- `GET /admin/v1/disputes/{id}/conversation` reads the booking's
  conversation through `readConversationAsOperator` in
  `apps/api/src/modules/chat/operator.ts`. It takes only the record that
  covers the reading (`{ type: "dispute", id }`), finds the booking from
  it and checks that it covers a reading: a dispute only once it was
  contested (`operatorMayRead`), else `not_contested`. In the same
  transaction it writes `conversation.opened` with that record as the
  subject and only the booking's and conversation's IDs, never what was
  said (R9.6); a refused reading writes nothing. Spec 9's reports add
  their own type and rule there. Messages come oldest first, from the
  driver, the passenger or the system, with system lines worded as for
  the driver (`by: "me"` is the driver); a message whose sender was
  erased comes as `erased`, without its text. The trip's changes (spec 8,
  3.5) are those system lines, so the operator sees them in the
  conversation.

The page is `apps/admin/src/pages/disputes/` at `/admin/disputes`: the
list (`?state=decided` for the decided ones) and each report at its ID.
The decision asks once more, naming the outcome, before it is sent, as it
cannot be undone in the app; each outcome shows what it does to the
booking, the money and reliability. The conversation opens only when the
operator presses "Show the conversation", so a report read without it
logs nothing. The console names each system line's driver or passenger
instead of "you".

## Reliability

`apps/api/src/modules/people/admin-routes.ts` holds the console's
reliability routes (`registerReliabilityAdminRoutes`), with the work in
`admin.ts` (spec 8, 3.8; R8.10 and R8.11):

- `GET /admin/v1/reliability/cancellations` lists the trips and bookings
  of the last 12 months whose cancellation does not count only because
  its reason is the weather or a closed road (`excused_by_reason`, saved
  when they are cancelled), newest first, with who cancelled, in which
  role, the route and the time. Those already overruled stay, with
  `overruledAt` and the operator's note. Nobody leaving PuffinRide, nor the
  former member.
- `POST /admin/v1/reliability/cancellations/{kind}/{id}/counts`, with
  `kind` `trip` or `booking` and `{ counts, note }`, changes whether it
  counts (spec 8, section 6). `counts: true` overrules the reason, so it
  counts (`canOverrule` in the domain) and sets `overruled_at`;
  `counts: false` undoes that (`canUndoOverrule`), for a press by
  mistake. The note is needed, up to 500 characters
  (`checkOverruleNote`), and is the operator's only. It writes
  `trip.reason_overruled` or `trip.overrule_undone` (or `booking.…`) with
  the names of the fields changed, never the note. It answers
  `not_found` for anything not on that list, so nobody leaving PuffinRide
  is changed, and `unchanged` when it already counts, or already
  doesn't.
- `GET /admin/v1/reliability/watch` gives the watch level (80%) and the
  people below it, lowest first, with their counts by role. The operator
  decides on a warning or a suspension as a person (3.8.4); nothing here
  suspends anyone.

The page is `apps/admin/src/pages/reliability/` at `/admin/reliability`,
after Appeals in the menu: the cancellations first, each with who cancelled, in which role, the
reason, their note, the times with the year (the list goes back 12
months) and the operator's note. "Overrule" or "Undo the overrule" opens a
note on that card, needed before anything is sent; while it is sent no
other card's note opens, and the result takes the focus. A problem with the
note shows before the focus moves to it, so both are read together. A
change someone else made meanwhile, or a cancellation that left the list,
reloads the list and says so. Undoing replaces the note with the one given
for the undo; the audit log records who made each change and when. The
people below the watch level follow, with their figure and counts by role.

## Reports, actions and appeals

`apps/api/src/modules/moderation/admin-routes.ts` holds the console's
safety routes (`registerModerationAdminRoutes`), with the work in
`console.ts` and the actions themselves in `actions.ts` (spec 9, 3.4 to
3.6):

- `GET /admin/v1/reports` lists the open reports, safety first, then the
  oldest (`queueOrder`), each with `dueAt`, 24 hours after it was filed
  (R9.9); `?state=closed` the last 50 closed, newest first.
- `GET /admin/v1/reports/{id}` gives one report with its records (the
  trip with its driver, the booking, the reported message without its
  words, the reported review with its words, About you for a report about
  a person), the actions taken under
  it, and for each of the two people their rating and reliability figure
  (as their profile counts them, with whether the figure is below the
  watch level; none for the former member, whose records are those of
  everyone who left), their other reports, by and about them, the last 10
  trips they drove or held a seat on, and the actions on them.
- `GET /admin/v1/reports/{id}/conversation` reads the conversation through
  `readConversationAsOperator` with `{ type: "report", id }`: only a
  report about a message covers it (R9.6), else `not_covered`. A message
  PuffinRide removed comes with its words, marked `removed`.
- `POST /admin/v1/reports/{id}/close` with `{ outcome }` closes it and
  tells the reporter in general terms.
- `POST /admin/v1/users/{id}/warning`, `.../suspension` (with `until`,
  null for no end) and `.../reinstatement` (with the `note` the person
  reads); `POST /admin/v1/hidden-content` with the content's kind and ID;
  `POST /admin/v1/trips/{id}/cancellation` with `countsOnReliability`.
  Each takes the rule and the reason the person reads, and the report it
  answers as `reportId`, and answers with the action as the console shows
  it.
- `GET /admin/v1/appeals` lists the appeals waiting, oldest first;
  `?state=answered` the last 50 answered.
  `POST /admin/v1/moderation-actions/{id}/appeal-answer` answers one,
  once and finally; reversing a suspension or a hiding undoes it.

Each action writes its audit entry and the person's notice in its own
transaction, naming the fields it changed, never their values.

The pages are `apps/admin/src/pages/reports/` at `/admin/reports` and
`apps/admin/src/pages/appeals/` at `/admin/appeals`, after Disputes in the
menu. The list shows each report's subject, category, the two people, when
it is due and an Overdue or Safety tag; `?state=closed` the closed ones
with their outcome. A report's page offers only the actions that fit it
(`choicesOf` in `act.tsx`): hiding the trip's note or cancelling the trip
only when the person reported drives it (the report's `trip.driverId`),
hiding the reported message, review or About you while it is shown,
suspending an open account and reinstating a suspended one. A report
about a deleted account or the former member offers none. A refusal
(someone acted meanwhile) loads the report again. Before an action is sent, the
console shows the notice as the person reads it, in their language,
built from the same texts as the app (`statementLines` in `texts.ts`).
Closing a report and answering an appeal ask once more, naming the
outcome, as neither can be undone. The conversation opens only when the
operator presses "Show the conversation", as on a dispute.

## Settings

`apps/api/src/modules/settings/` holds the operator's settings
([ADR 0032](../decisions/0032-operator-settings-list-ranges-and-versions.md);
spec 10, 3.2). The list, with each setting's default and range, is
`settingDefinitions` in `packages/domain/src/settings/catalogue.ts`; adding
one or changing a range needs an ADR (R10.4).

- The values are not stored on their own: they are the defaults with the
  rows of `setting_changes` laid over them (`valuesAt`). Each row is the
  next settings version; version 0 is the defaults. Triggers written by
  hand in the migration refuse updates, deletes and `TRUNCATE`, so the
  history cannot be edited (R10.2). Keep them when a later migration
  changes the table.
- `createSettingsService` gives `current()`, read from the database at
  most every 5 seconds and at once after a change made through it, so
  another process sees a change within 5 seconds; `latest()`, which
  always reads; and `at(version)`, kept in memory, as a version never
  changes. A rule about something new reads `current()`.
- `GET /admin/v1/settings` lists every setting with its value and the
  version. `PATCH /admin/v1/settings/{key}` takes `{ value, reason,
version }` with the version the page loaded: it takes a lock on the
  table, refuses with `settings_changed` if another change came since,
  checks the value and the reason (`checkSettingChange`), writes the next
  version and the audit entry `setting.changed` (the value before; the
  value, the version and the reason after). `GET
/admin/v1/settings/history` pages through the changes, newest first.
- `GET /v1/config` is open to everyone and cached for 5 minutes: what the
  apps need of the settings. Add a value there only when an app shows or
  checks it.
- The console's Settings page (`apps/admin/src/pages/settings/`) shows a
  setting by the texts in its `texts.ts`: add a name, a help sentence and,
  for a new unit, the unit's two texts with each new setting.
- Prices and seats (milestone 11, PR 11): `suggested_rate`,
  `reference_cost_per_km`, `price_step`, `price_level_step` and
  `max_capacity`. One check runs across values (`suggestedFitsCap`):
  `suggested_rate` × (`max_capacity` + 1) is at most
  `reference_cost_per_km`, so 100% is a level even the largest car has; a
  change that breaks it is refused with `suggested_over_cap`, and the page
  says the highest rate the other values allow.
- A published trip keeps the four price values it was published under
  (R10.3): publishing stores the settings version in
  `trips.settings_version`, and every later change to the trip (price
  level, seats, a stop added or removed, the refit to the trip limit)
  prices with that version's values. A draft, a quote and a trip posted
  again use the values as they are now. `max_capacity` is always read as
  it is now; lowering it leaves published trips their seats. A module
  takes its numbers from `packages/domain/src/settings/bundles.ts`
  (`tripSettingsFrom`) through `TripSettingsSource`
  (`modules/settings/trip-settings.ts`), never from
  `defaultTripSettings`; a test that needs fixed numbers passes
  `fixedTripSettings()`.
- `POST /admin/v1/settings/{key}/preview` with `{ value }` checks a value
  as a change would and stores nothing. For the four price values it
  answers what one seat from Reykjavík to Akureyri (388 km, 3 seats)
  costs at 100% and the highest level, as it is and as it would be
  (`pricePreview`); for any other setting `price` is null and the page
  says the effect in words. The page asks 300 ms after the last
  keystroke.
- `GET /v1/config` gives `maxSeats`; the app's steppers and its "at most"
  texts read it (`useMaxSeats`), with the domain's default until the API
  has answered. A trip the driver sees (`MyTrip`) carries its
  `priceSettings`, which the Edit trip screens price with.
- Booking and paying, and Changes and cancellations (milestone 11, PR
  12): `booking_cutoff`, `request_expiry`, `payment_window`,
  `free_cancellation_until`, `major_time_change`, `max_time_change` and
  `reliability_cancellation_window`. A booking records the settings
  version it is made under (`bookings.settings_version`) and keeps that
  version's three cancellation values (`CancellationSettings`: the refund
  cut-off, what counts as a departure moved far, and the window in which a
  cancellation counts), so a paid booking's deal never changes (R10.3).
  The cut-off, the two deadlines and how far a departure can move are
  read as they are now; a deadline is stored when it is set and does not
  move. Modules read them through `RuleSettingsSource`
  (`modules/settings/rule-settings.ts`); the notification worker, which
  has no settings service, reads a booking's version with
  `cancellationSettingsIn`.
- Trip day and reliability (milestone 11, PR 13): `no_show_wait`,
  `trip_completion_delay`, `reliability_period`, `reliability_min_count`
  and `reliability_watch_level`, all read as they are now. The modules
  that use them take `TripDaySettings` and `ReliabilitySettings` as plain
  objects, so the API gives them objects whose fields are the values as
  last read (`liveRuleSettings` in `modules/settings/live.ts`), and reads
  the settings at the start of every request (`readSettingsFirst`, from
  the 5-second cache). The server's trip day job and the clean-up and
  privacy commands read the values from the database when they run.
  `GET /v1/config` gives `reliabilityMonths` for the profile's sentence;
  the console's two reliability lists carry `periodMonths`. The terms of
  service state the wait, the completion delay, the period and the count
  too, so this group has the same note.
- The apps' texts no longer state these numbers: `GET /v1/config` gives
  `freeCancellationMinutes` and `maxMoveMinutes` as they are now, and a
  booking carries its own `cancellationRules`. The terms of service do
  state them, so the page says, on both groups, to publish new terms with
  a change.

## Invite codes

`apps/api/src/modules/beta/` holds the closed beta's invite codes (spec 12,
3.2; R12.1 to R12.3); the rules are in
`packages/domain/src/beta/invites.ts`.

- A code is 8 characters without I, L, O, 0 and 1. What a person types is
  tidied first (`normaliseInviteCode`), so "abcd-2345" works.
- The gate is in sign-in's `verify`, for a number with no account, while
  the setting `invite_code_required` is on. It is off by default, as the
  beta is open (ADR 0035). The text-message code is
  checked first. Then, without `inviteCode` the answer is
  `invite_required` (403) and the text-message code is kept, with no try
  counted, so the app can ask for the invite code and send both. A code
  that is unknown, ended, expired or used up is `invite_invalid` (400),
  one answer for all four, and counts as a wrong try on the text-message
  code: guessing is held to sign-in's 5 tries a code and 5 codes an hour.
  A full beta is `beta_full` (409) and counts no try.
- A good code is used up in the transaction that makes the account, with
  the code's row locked and one advisory lock for every sign-up through
  the gate, so a one-use code makes one account and the cap
  (`beta_max_testers`) is never passed. A tester is an account with
  `users.invite_code_id`; an erased account's place is free again.
- `POST /v1/invites/check` says whether a code would work now, without
  using it, 10 a minute per address block.
- `GET /admin/v1/invite-codes` lists the codes, newest first, with whether
  a code is needed, the testers, the cap and the places left.
  `POST /admin/v1/invite-codes` makes a group code from a name, 1 to 500
  uses and an end at most 12 months ahead; the API picks the code.
  `POST /admin/v1/invite-codes/{id}/end` ends one; accounts made with it
  stay. Audit entries `invite_code.created` and `invite_code.ended`.
- Feedback (spec 12, 3.3; `beta/feedback.ts`): `POST /v1/feedback` takes
  a signed-in person's message, kind and the app's details, with a
  screenshot in base64 from phones (a JPEG without metadata of at most
  1 MB, checked as meeting point photos are), 10 a day; `GET
  /v1/me/feedback` gives back what they sent and the replies, never the
  operator's status. `GET /admin/v1/feedback` lists the newest 100 by
  `status` and `kind` with how many are new; `GET
  /admin/v1/feedback/{id}` is one; `GET
  /admin/v1/feedback/{id}/screenshot` is the picture itself, for an
  `<img>`, never cached; `POST .../status` sets the status and `POST
  .../reply` the one reply, which writes `FeedbackReplied`: the tester
  gets `feedback_replied` by push (only that there is a reply) and email
  (the reply). Audit entries `feedback.screenshot_viewed`,
  `feedback.status_changed` and `feedback.replied` (when, not what). The
  console's Feedback page (`apps/admin/src/pages/feedback/`) lists it by
  status and kind with how many are new, links to the account, shows the
  picture only after "Show the screenshot" (each look is audited), sets
  the status and sends the one reply.
- Switches for emergencies (spec 10, 3.3; R10.5): six settings of the
  group `switches`, first on the Settings page, each changed with a
  reason like any other, with the audit entry `switch.changed`. Off
  refuses only what is new, with 503: `signups_open` a number with no
  account (`signups_paused`; the text-message code is kept),
  `trips_open` publishing and posting again (`trips_paused`),
  `bookings_open` a new booking, request or payment (`bookings_paused`),
  `sms_sending` a sign-in or confirm code (`sms_paused`). `GET
  /v1/config` lists them in `paused` for the app's banners. Turning
  `bookings_open` moves the payment deadlines in the same transaction
  (`bookings/pause.ts`): to the booking cut-off as the pause starts, and
  to the payment window from its end, so no booking runs out while
  nobody can pay. What stores a payment deadline itself, accepting a
  request and moving a departure, reads the switch inside its
  transaction with `pausedHeldIn`, which holds the settings as they are
  until it ends (a row share lock on `setting_changes`, taken first):
  the cached value could be 5 seconds old, and a deadline stored by it
  would be one the turn never moved. The notification worker leaves a paused channel's
  deliveries queued, sends them when it is back on, and skips as
  `paused_too_long` what was queued before that and is more than 60
  minutes old. A switch off for an hour sends every operator
  `switch_still_off` by push and email, naming all that are off, and
  again each day.
- The console's Invite codes page (`apps/admin/src/pages/invite-codes/`)
  shows the places left, a form for a new group code (it works through the
  end of the chosen day) and each code with its uses; ending one asks
  first.
- In the app, `/sign-in/invite` asks a new number for the code after the
  text-message code, which the sign-in flow keeps and sends again with it;
  `/invite/<code>` opens sign-in with the code filled in; `BetaLabel`
  (`apps/mobile/src/beta/config.tsx`) shows while `GET /v1/config` says
  `beta`.
- `pnpm --filter @shareride/api invite add "<name>" <uses> [days]` makes a
  group code on the server, for the first account of a new environment.
  It writes no audit entry and the code has no maker.
- Integration tests and the browser tests' server run with the gate off
  (`fixedSettings`, which only they set); a test about the gate calls
  `api.useStoredInviteSetting()` once its first accounts exist. The
  local seed command (`pnpm --filter @shareride/db seed`, with `APP_ENV`
  local or unset) makes the code `BETA2345`, once; it is public, so the
  seed staging runs on each deploy never makes it.

## Corridors and the search log

Spec 10 (3.4.1 and 3.4.5), built in milestone 11 (PR 8). The weekly
figures (PR 9) are counted from these.

- `corridors` holds a name, its places in order (`place_ids`) and
  `active`. `GET /admin/v1/corridors` lists them by name with every
  place to pick from; `POST` adds one, `PATCH /admin/v1/corridors/{id}`
  changes the name, the places or `active`, sending only what changes.
  The rules are in `packages/domain/src/metrics/corridors.ts`: a name of
  1 to 80 characters and 2 to 12 places, each once. Audit entries
  `corridor.created` and `corridor.changed`. There is no delete: a
  corridor left out of the counting keeps its past weeks.
- `onCorridor` decides whether a search or a trip belongs to one: its two
  ends are two different places of the corridor, where a meeting point
  counts as each place that covers it.
- `search_log` gets a row for each `GET /v1/trips/search` that answered
  (`modules/metrics/search-log.ts`): the two ends, the day searched for,
  the number of trips shown, the platform from the `X-Client-Platform`
  header and the start of the hour. The write happens apart from the
  answer; one that fails is logged as a warning and lost. Nothing in the
  module takes a person, a session or an address, the key is random and
  the table has no `created_at`: keep it so (R10.6). The hourly clean-up
  deletes rows after 14 months (rule `search_log`).
- The console's Corridors page (`apps/admin/src/pages/corridors/`) has a
  card per corridor with Change and Stop counting, and a form for a new
  one whose places are picked in order and can be moved up and down.
- The seed for local development and staging adds the three launch
  corridors from the sample places, once; in production the operator
  adds them with the real places.

## Metrics

Spec 10 (3.4), built in milestone 11 (PR 9).

- The rules are in `packages/domain/src/metrics/`: `weeks.ts` (ISO weeks
  in Iceland time), `weekly.ts` (`metricKeys`, `weekMetrics`, the exit
  criteria and `fewerThanFive`) and `csv.ts`. A figure is a numerator
  and, for a share or a rate, a denominator; the page divides. To add a
  metric, add its key, count it in `weekMetrics`, name it in both
  languages under `admin.metrics.metric.*`, say how it reads in the
  page's `kindOf`, and generate the migration for the table's check.
- `modules/metrics/weekly.ts` reads the records, splits them by corridor
  with `onCorridor`, and replaces the weeks' rows in `weekly_metrics`
  (one per corridor or none, week and metric). A corridor that is not
  counted keeps the rows it had.
- The API counts the current week and the two before it once a night
  after 03:00 (`computeIfDue`, asked every 10 minutes in `server.ts`).
  `pnpm --filter @shareride/api metrics recompute <weeks>` counts up to
  53 weeks again, such as after a corridor is added or changed; on a
  server, `node apps/api/src/metrics-cli.ts recompute <weeks>` in the
  API's shell.
- `GET /admin/v1/metrics?from=2026-W40&to=2026-W47&corridor=<id>` gives
  the stored weeks (the last 8 without a range, at most 53; `metrics`
  is null for a week not counted) and the exit criteria over the last 4
  complete weeks on the active corridors. `GET /admin/v1/metrics.csv`
  takes the same query and gives a file, where a figure about fewer than
  5 people reads `<5`.
- The Metrics page (`apps/admin/src/pages/metrics/`) shows the exit
  criteria, a corridor and week picker, bars per week for one figure in
  the page's own SVG, the table of every figure, and Download CSV.

## Announcements

Spec 10 (3.5; R10.7), built in milestone 11 (PR 10).

- The rules are in `packages/domain/src/beta/announcements.ts`: the
  audiences, `checkAnnouncement` (a title of 1 to 80 and a message of 1
  to 1 000 characters in both languages; a corridor for that audience),
  `receivesAnnouncement` and `announcementPreview` (a push's 140
  characters).
- `modules/beta/announcements.ts` is the service. `announcementReaders`
  asks the database who an audience is now: accounts that are active,
  not waiting to be deleted and without "Beta news" off; for a corridor,
  those with a published trip or a booking whose two ends are two
  different places of it, as the weekly figures count. The reach and the
  worker both use it.
- Routes: `GET` and `POST /admin/v1/announcements`, `PUT .../{id}` (a
  draft only; `already_sent` after), `GET .../{id}/reach`, `POST
  .../{id}/test` and `POST .../{id}/send`. Send sets `sent_at` and
  `reach` and writes `AnnouncementSent` in one transaction; a second
  Send answers 409 `already_sent`. Audit entries: `announcement.created`,
  `.changed`, `.tested` and `.sent`, with the audience and the reach,
  never the texts.
- The worker makes one `announcement` notification per person, keyed
  `announcement:<id>` and the person, so nobody is told twice whatever
  runs twice. It goes by push (the title and the start of the message)
  and by email to a verified address (the whole message, then spec 10's
  footer), in the person's language, and is dropped if they turned
  "Beta news" off before it went out. "Send to me" writes
  `AnnouncementTested`: the operator gets `announcement_test`, marked
  "Test:", with both languages in the email.
- The list shows a sent announcement's stored reach and, from the
  delivery log, how many pushes and emails were delivered; the log is
  kept 90 days, after which the counts read as gone.
- In the app, `GET /v1/me/announcements` gives the announcements sent to
  the person (from their notifications, so also 90 days) for the Beta
  news page (`/settings/beta-news`), which a push opens. `PATCH
  /v1/me/notification-settings` takes `reminders`, `betaNews` or both,
  and leaves alone what is not sent.
- The home page (`apps/admin/src/pages/home.tsx`; spec 10, 3.1.1;
  milestone 11, PR 14) shows what needs the operator today from `GET
  /admin/v1/home`: urgent and other open reports, appeals to answer,
  disputes waiting, open problem reports about meeting points, points
  whose yearly review is overdue, notifications that failed in the last
  24 hours, people below the watch level and new feedback, each a link to
  its list and left out when zero; the switches that are off, by name;
  and the places the beta has left while a code is needed. Each count is
  asked of its own module the way its list is (`HomeSources` in
  `modules/admin/home.ts`, wired in `app.ts`), so a count and its list
  agree. Failed notifications have no page yet, so that line is not a
  link. Held payouts and failed payments join with milestone 15.
- The Announcements page (`apps/admin/src/pages/announcements/`) has the
  drafts with their reach, the form, and what was sent.

## Users, trips and decline rates

`apps/api/src/modules/moderation/people-routes.ts` holds the console's
users and trips routes (`registerPeopleAdminRoutes`), with the work in
`people.ts` (spec 9, 3.5 and 3.4.5). Both it and `console.ts` read people,
reports, actions and stops through `console-reads.ts`, so every page names
them the same way.

- `POST /admin/v1/users/search` with `{ q }` finds people: an ID, an
  email in any case, a phone number (Icelandic without +354 too, as
  `normalisePhoneNumber` reads it) or part of a first name, where `%` and
  `_` match themselves. A POST, so a number or an email never sits in an
  address or a log. At most 50, by first name in Icelandic order, with
  `more` when there were more; never the former member.
- `GET /admin/v1/users/{id}` gives a person's page: the profile with when
  each thing was verified or declared, About you and whether PuffinRide hid
  it, their rating and reliability figure as their profile counts them
  (`figuresOf` in `people/standing.ts`, which the profile uses too, with
  whether the figure is below the watch level), cars, the 20 latest trips
  they drive and bookings they made (a declined request with its reason,
  R5.7), the 20 latest reports by and about them, reviews about them and
  reviews they wrote (every one, with its words, whether it shows yet,
  whether PuffinRide hid it and whether its author is deleting their
  account, and the other person), and actions on them, every note, and
  their decline rate.
- `POST /admin/v1/users/{id}/notes` with `{ text }` adds a note about the
  person, at most 1 000 characters (`checkOperatorNote`). Only operators
  see notes in the console, but the person gets each note's text and date
  in Download my data, never who wrote it (Martin's answer A49), so a note
  keeps to facts. Its audit entry, `user.note_added`, names the note's ID,
  never its words. Erasing the person erases the notes about them; erasing
  an operator keeps the notes they wrote, by the former member.
- `GET /admin/v1/trips` finds trips by `date` (the day they leave in
  Iceland), `place` (part of a stop's name in either language),
  `driverId`, or `id` (a trip's, or a booking's, which finds its trip);
  the latest departure first. With no filter, the trips from today on, the
  soonest first. At most 50, with `more` when there were more. Drafts
  never show, here or on a trip's page.
- `GET /admin/v1/trips/{id}` gives a trip with every stop (removed ones
  marked), the car, and every booking and request on it.
- `GET /admin/v1/decline-rates` lists each driver who answered a request
  made in the last 90 days (`declineRateDays`), the highest share of
  declines first, with the reasons they gave. `requestAnswer` in the
  domain decides what counts: a request accepted or declined by the
  driver; one declined because its trip was cancelled is not an answer.

Suspending and reinstating from a person's page use the moderation routes
above, without a `reportId`.

The pages are `apps/admin/src/pages/users/` at `/admin/users` and
`apps/admin/src/pages/trips/` at `/admin/trips`, after Reliability in the menu.
What the operator types to find a person stays in the page's state, never
in the address. Below the search, each driver's decline rate. A person's
page shows their account, their rating and reliability in the members'
own words (`Figures` in `reports/history.tsx`, which a report's page shows
for each side too), the actions that fit them (`personChoices`:
warn, hide About you, suspend an open account, reinstate a suspended one)
with the same panel as a report's page (`ActPanel` in
`reports/act.tsx`), their notes with a form to add one, and their history,
reviews included, each linking to the other person's page.
A note's form says the person gets their notes in Download my data. The
trips page lists the trips from today on until the operator filters them;
a person's page links to all the trips they drive (`?driverId=`, the only
filter read from the address), and a trip's page links to the driver and
each passenger. A list cut short says so. Only the newest search shows
its answer, and a person's page that fails to load again after an action
keeps what it showed, with what the action said, and offers to try
again.

## A console page

The console is `apps/admin`: React for the web, built with Vite, served by
the API at `/admin` with its own content security policy
([security](security.md#operator-console)). It uses the shared design
tokens from `packages/ui` as CSS variables and the app's fonts and texts.

1. Add the page in `apps/admin/src/pages/<area>.tsx`. `useConsole()` gives
   `t` for texts, `call(route, input)` for the API, `navigate(path)` and
   the signed-in `operator`. A call that finds the session ended sends the
   operator back to sign in by itself.
2. Add one entry to `sections` in `apps/admin/src/sections.ts`: its path
   under `/admin/<area>`, its title key and the page. The menu and the
   router follow; a section owns every path below its own, for its detail
   pages.
3. Put its texts in `packages/i18n/src/messages/en.ts` and `is.ts` under
   `admin.<area>.*`, in both languages.
4. Style it with the classes in `apps/admin/src/styles.css` and the
   `var(--…)` tokens, never raw colours or sizes. Lay it out for a laptop
   first, and check it on a phone. Link to another console page with
   `ConsoleLink` (`apps/admin/src/components/console-link.tsx`), and show
   places with `IcelandMap` (`components/iceland-map.tsx`), our own map
   (ADR 0024).
5. Test it in `apps/admin/src/app.test.tsx` style: render `ConsoleApp`
   against the fake API in `apps/admin/src/testing/fake-api.ts`, signed in,
   and drive it as the operator would.
