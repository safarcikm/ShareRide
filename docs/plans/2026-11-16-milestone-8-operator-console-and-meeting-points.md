# Milestone 8 plan: the operator console and meeting points

**Owner:** Martin · **Date:** 2026-11-16 · **Status:** In progress; the
choices in section 3 accepted by Martin on 2026-11-16 as recommended

Gives Martin his own web console, open only to the operator, signed in
with a passkey, where every action is written to an audit log. Its first
pages manage meeting points: create, edit, check, activate, pause, retire
and move them, add photos, import drafts in bulk, answer problem reports
and compute the distances between them. It implements the console's frame
from [spec 10, 3.1](../specs/2026-11-13-operator-settings-and-metrics.md#31-console-home-and-layout),
the audit log of [spec 9, 3.8](../specs/2026-11-13-safety-and-moderation.md#38-audit-log-h3)
and [spec 2's](../specs/2026-11-13-meeting-points.md) H1 (3.5 to 3.7).

Later milestones add their pages to the same console: reports, users,
trips and bookings (spec 9, built in parallel by the safety and
moderation thread), disputes and the watch list (spec 8), settings,
metrics and announcements (spec 10), payments (spec 13). So the frame is
built to be extended: a section is a page file and one line in a list,
and a module's console routes are one file behind one guard (4.3).

Today the operator has no way in: the meeting points are sample data from
a seed, milestone 7 decides disputes through a command, and the `roles`
column on `users` exists but nothing reads it.

## 1. Goal

When this milestone is done, on a laptop and on a phone:

- Martin runs one command on the server. It gives his account the
  operator role and prints a link that works once, for 30 minutes. He
  opens it on his laptop and saves a passkey with the fingerprint reader.
  From then on he signs in at `/admin` with the passkey alone. He adds his
  phone as a second passkey from the console.
- He creates a meeting point, "N1 Borgarnes": names, type, region and
  municipality, where to stand in Icelandic and English, amenities,
  shelter hours and season. He pastes the coordinates from his maps app,
  sees the dot on the map of Iceland, and opens them in maps to check the
  spot. He adds two photos with descriptions in both languages.
- The activation checklist shows what is missing. When all of it is
  ticked, he activates the point. Its distances to every other active
  point are computed in seconds, and drivers can choose it.
- Road works close the car park at Olís Norðlingaholt. He pauses it until
  Friday with a reason in both languages. Drivers of upcoming trips that
  use it are asked to choose another stop, and their passengers are told.
- A passenger reports that a bus shelter has gone. The report is on the
  console's home page the next morning. He fixes the point's description
  and resolves the report, which updates "Last checked".
- He imports 40 points for the Selfoss corridor from a CSV file as
  drafts, then checks and activates them one by one.
- The audit log shows each of these steps: who, what, on which record,
  when, from which device and address, and the values before and after.

## 2. Scope

| In milestone 8 | Later |
| -------------- | ----- |
| The console as its own small web app at `/admin`, in Icelandic and English, light and dark, on a laptop and a phone (decision 1) | Its own address, such as `admin.shareride.is`, once there is a domain (milestone 12) |
| The operator role, passkey sign-in and operator sessions (decision 2) | More than one operator role (spec 10, out of scope) |
| The audit log, written in the same transaction as each action, and its page with filters | The privacy register's retention clean-up of old entries comes with spec 11's retention runs |
| The console's home with "Today" counts; this milestone adds problem reports and reviews due | The other counts come with their specs (reports, disputes, payouts, failed notifications) |
| Meeting points: list and map, create, edit, the activation checklist, activate, pause, retire, move, yearly review | Places (towns and landmarks) stay sample data; the real list comes with the real meeting points before the beta (milestone 16) |
| Photos of meeting points (decision 4) | Profile photos (milestone 13) reuse the same storage |
| Import drafts from a CSV file | Export |
| "Something wrong here?" in the app and the console's queue of problem reports (spec 2, 3.5) | General reports about people, trips and messages (spec 9) |
| Distances for real meeting points, "Recompute all" and the legs status (decision 5) | Updating the map data on a schedule: every three months by hand until then |

## 3. Decisions for Martin

| # | Choice | Recommendation | Why | Alternative |
| - | ------ | -------------- | --- | ----------- |
| 1 | What the console is built with ([ADR 0003](../decisions/0003-cross-platform-client-expo.md) left it open) | **Its own small web app**, `apps/admin`: React for the web, built with Vite, served by the API at `/admin`. It uses the app's colours, fonts and texts, moved to a shared package ([ADR 0017](../decisions/0017-visual-design-system.md) planned this) | Tables, forms and file uploads are what browsers do best. No operator code ships inside the phone apps or the public web app, and the console gets its own stricter security headers. It does not touch the app's screens, which other threads are changing | Web-only screens inside the Expo app. Quicker for the first page, since its parts exist, but the console's code ships to every phone, and dense tables are awkward with the app's parts |
| 2 | How the operator signs in | **A passkey only.** A command on the server gives an account the operator role and prints a link that works once, for 30 minutes, to save the first passkey; more passkeys are added from inside the console. Console sessions are separate from the app's: they end after 30 minutes without use and 12 hours after signing in | A passkey cannot be phished or guessed and needs no SMS. The command needs access to the server, which the operator has and an attacker should not. Losing every passkey means running the command again | Phone code and then a passkey at every sign-in. Two steps and an SMS each time, with no real gain, because the passkey is the strong part |
| 3 | How a meeting point is placed, since our map does not zoom ([ADR 0024](../decisions/0024-own-simple-map-of-iceland.md)) | **Paste the coordinates** or a link from Google Maps, Apple Maps or OpenStreetMap; the console reads the numbers, shows the dot on our map of Iceland, and opens the spot in maps to check it | No new service, key or cost, and the operator already uses a maps app to find the spot | A zoomable map in the console only, with MapTiler tiles ([ADR 0021](../decisions/0021-map-tiles-from-maptiler.md)): the free plan is for testing, the paid one $30 a month, plus a key, a new provider to list, and a map library in the console |
| 4 | Photos of meeting points (needed to activate one, rule R2.3) | **In this milestone**, stored in Hetzner Object Storage as [ADR 0022](../decisions/0022-photo-storage-on-hetzner.md) decided, and on the server's disk in development and tests. The browser removes location and camera data before upload | The console is then complete for meeting points, and profile photos (milestone 13) reuse the same storage. Martin opens the Hetzner bucket (about €5 a month) before activating real points | Photos with profile photos in milestone 13. Nothing to set up now, but real points stay drafts until then |
| 5 | How distances between real meeting points are computed ([ADR 0009](../decisions/0009-maps-and-routing.md) said a routing engine) | **Our own road file.** A script turns the OpenStreetMap extract of Iceland into a small file of the roads cars may use, without ferries and mountain (F) roads, kept in the repository. The API finds the shortest way on it when a point is activated or moved, in seconds. The script runs again when the map data is updated | No service to run or pay for, nothing leaves our servers, and tests use the same code. The roads come from OpenStreetMap, as with a routing engine | A routing engine (OSRM) in its own container on Render, as ADR 0009 imagined: more exact driving times, but from $7 a month for the smallest instance and one more service to keep running |

Accepted by Martin on 2026-11-16: all five as recommended.

Decisions 1 and 2 are recorded in
[ADR 0028](../decisions/0028-operator-console-web-app-and-passkeys.md);
decision 5 gets its own ADR with its PR, refining ADR 0009.

## 4. Design notes

### 4.1 Operator sign-in (decision 2)

- **Role:** `users.roles` contains `operator`. The role is given and taken
  away only by the `operator` command in the API's package, which also
  ends the account's console sessions when it takes the role away. A
  suspended account can never use the console.
- **Setup link:** `operator add <user ID or phone number>` gives the role
  and prints `/admin/setup#<token>`. The token is 256 random bits, kept
  only as a hash, works once and expires after 30 minutes. It sits after
  `#` so it never reaches a server log. A new link replaces any earlier
  one.
- **Passkeys:** WebAuthn with discoverable credentials and user
  verification required, through `@simplewebauthn/server` on the API (ADR
  0016: we never write the cryptography ourselves). The relying party is
  the console's host name, from `ADMIN_ORIGIN` (in development
  `http://localhost:3000`). `operator_passkeys` holds the public key, the
  counter, a name the operator gives it and when it was last used. The
  last passkey cannot be removed from the console.
- **Sessions:** `operator_sessions`, separate from the app's sessions. A
  cookie `sr_operator` with `HttpOnly`, `Secure` (outside development),
  `SameSite=Strict` and `Path=/admin/v1`, holding 256 random bits stored as
  a hash. A session ends 30 minutes after its last use and 12 hours after
  sign-in; signing out ends it at once. The app's bearer tokens never open
  the console, and the operator cookie never opens the app's API.
- **Guard:** `requireOperator` on every `/admin/v1` route except the
  sign-in and setup routes: a live session, the role still held, the
  account not suspended. It sets `c.var.operator`.
- **Limits:** sign-in and setup attempts are limited per address, like the
  app's sign-in. Failures are logged without the token.

### 4.2 Audit log

- `audit_log`: `id`, `at`, `operator_user_id`, `operator_session_id`,
  `action` (a dotted name such as `meeting_point.activated`),
  `subject_type`, `subject_id`, `before` and `after` (JSON), the network
  address and the device (browser and system from the user agent).
- `recordAudit(tx, entry)` in `apps/api/src/modules/admin/audit.ts` is
  called inside the same transaction as the change, so an action and its
  entry are saved together or not at all.
- **Append-only:** a database trigger refuses every `UPDATE`, and every
  `DELETE` of an entry younger than 3 years (spec 9, section 7). There is
  no route that changes it.
- **No copies of personal data** (spec 9, section 7): `before` and `after`
  hold IDs and the changed fields of operator-curated records, such as a
  meeting point's name or status. A change to a person's record stores
  the field names and IDs, not the values. Sign-in, sign-out and passkey
  changes are entries too.
- `GET /admin/v1/audit-log` with filters (action, subject, operator, from
  and to), newest first, by cursor.

### 4.3 The console app (decision 1)

- `apps/admin`: React for the web, built with Vite, tests with Vitest and
  Testing Library. The API serves its build at `/admin` from the same
  origin, so the session cookie is first-party; the app's own web
  pages keep their paths.
- Its content security policy allows only its own scripts, styles, fonts
  and API, and the photo storage's host for images.
- **Shared look:** the design tokens and the map of Iceland's data and
  projection move from `apps/mobile` to a new `packages/ui`, as ADR 0017
  planned; the app's old files re-export them, so no screen changes. The
  console turns the tokens into CSS variables, light and dark, and uses
  the same fonts.
- **Texts** in `packages/i18n` under `admin.*`, in both languages, with
  the same checks as the app's. The console follows the operator's
  account language and has a switch.
- **Extending it:** `apps/admin/src/sections.ts` lists each section: its
  path, its menu text and its page. A module's console routes live in its
  own `admin-routes.ts`, exporting `register<Area>AdminRoutes`, mounted
  under `/admin/v1` behind `requireOperator`. The home page's "Today"
  counts come from a list each module adds to. `docs/engineering` gains a
  short "Add a console page" note.
- **Layout:** a menu on the left on a laptop, a menu button on a phone;
  pages are lists with filters, details, and forms (spec 10, 3.1).

### 4.4 Meeting points

- **Rules in the domain** (`packages/domain/src/meeting-points`):
  - `activationChecklist(point, photos, legs)`: each item of R2.3 with
    whether it passes: name, location, type, region and municipality;
    where to stand in both languages; at least one photo with
    descriptions in both languages; amenities and season reviewed; the
    date the operator confirmed it; computed legs.
  - `nextPointStatus(status, change, futureTrips)`: active to paused and
    back, active to retiring (with future trips) or retired (without),
    retiring to retired after the last future trip; a draft or a paused
    point retires at once, so a paused point never comes back into use
    for its trips. Retired is final (R2.2). Draft to active (checklist
    passes) comes with activation in PR 12.
  - `parseCoordinates(text)`: decimal degrees, degrees and minutes, and
    links from Google Maps, Apple Maps and OpenStreetMap; refuses a spot
    outside Iceland's bounds.
  - `movedFar(before, after)`: more than 50 m (R2.10, a setting).
  - `reviewDue(point)`: a year after the last check (R2.9).
- **Columns added** to `meeting_points`: shelter hours (a week of opening
  and closing times) and the shelter note in both languages, the date the
  operator confirmed the point, and when the amenities and season were
  reviewed. `meeting_point_photos`: storage key, descriptions in both
  languages, order.
- **Pause:** a reason in both languages and an optional end date; at the
  end date a minute job makes the point active again. Each driver of a
  future trip that uses it is asked to choose another stop, and that
  trip's booked passengers are told (spec 6's stop changes; new
  notification kinds in spec 7's catalogue, with SMS only to passengers
  within 24 hours of boarding, as spec 7 decided).
- **Retire:** at once without future trips; otherwise `retiring`, which is
  no longer offered for new trips, and retired by the minute job after its
  last future trip.
- **Move:** more than 50 m recomputes its legs and tells the participants
  of future trips about the new location.
- **Sample points** stay marked "Sample" in the console and cannot be
  mixed with real ones in a corridor import.

### 4.5 Photos (decision 4)

- A `PhotoStorage` port with two adapters: the server's disk (development
  and tests) and Hetzner Object Storage (S3-compatible, Helsinki), chosen
  by `PHOTO_STORAGE`. The library for signing S3 requests is named and
  justified in that PR.
- The console resizes each photo in the browser to at most 1 600 pixels
  and saves it as a new JPEG, which leaves out location, camera and other
  metadata. The API accepts only JPEG without metadata segments, at most
  2 MB, and up to 5 per point.
- The app's meeting point details show the photos with their descriptions
  for screen readers (spec 2, 3.2).

### 4.6 Import

- A CSV file with one point per row and fixed columns (names, aliases,
  latitude and longitude, type, region, municipality, where to stand in
  both languages, amenities, season). The console shows each row as it
  will be saved, with the problems of each, before saving. Rows with
  problems are skipped; the rest become drafts in one transaction and one
  audit entry.

### 4.7 Problem reports (spec 2, 3.5)

- "Something wrong here?" on the app's meeting point details: a reason
  and a note of up to 300 characters, for people with a verified phone,
  at most 5 a day (R2.8). It marks the point for review.
- The console's queue: open reports with the point, the reason and the
  note. Resolving needs a note, can set "Last checked" or pause the point
  at once. Resolving removes the link to the person; the report is
  deleted 12 months later (spec 2, section 7).

### 4.8 Distances (decision 5)

- A script in `packages/db` reads the OpenStreetMap extract of Iceland
  (Geofabrik) and writes the roads cars may use, without ferries, mountain
  (F) roads and private roads, as a small compressed file with the map
  data's date. A test checks known distances against the file, such as
  Reykjavík to Selfoss.
- When a point is activated or moved, the API joins it to the nearest
  road and finds the shortest way to and from every other active point,
  with the driving time from each road's class and speed limit. Pairs
  with no road connection are listed. "Recompute all" does every pair in
  a job.
- The console shows when legs were computed, the map data's date and any
  pairs without a connection.
- The `Router` port stays, so tests can still use a fixed table.

## 5. Pull requests and tasks

Tests come first in every task. Each PR updates the docs it touches,
gets a code review before it opens, and a security review when it
touches sign-in or the guard. Migrations are generated on top of the
latest `main` right before merging, because other threads add theirs in
parallel.

### PR 1: `docs(plans)`: this plan

- [x] This plan, ADR 0028, the roadmap's milestone 8 and the plans index

### PR 2: `feat(admin)`: the operator role, sessions, guard and audit log

- [ ] `operator_sessions`, `audit_log` with its trigger, `requireOperator`,
      `recordAudit`, `GET /admin/v1/me`, sign-out; a test helper that
      signs in an operator without a passkey, for other modules' tests
- Verify: integration tests (no session, an ended session, a session
  whose account lost the role or was suspended, and an app token are all
  refused; the trigger refuses an update and a young delete)

### PR 3: `feat(admin)`: passkey sign-in and the operator command

- [ ] `operator_passkeys`, `operator_setup_links`; the `operator` command
      (add, remove, list); setup, sign-in, add and remove a passkey;
      limits; audit entries
- Verify: integration tests with a software authenticator (a used or
  expired link refused, a wrong origin refused, a counter that goes back
  refused, the last passkey kept); `/security-review`

### PR 4: `feat(admin)`: the console app

- [ ] `packages/ui` with the tokens and map data; `apps/admin` with
      setup, sign-in, the layout, the sections list, home, passkeys and
      sign-out; served at `/admin` with its own security headers; texts
- Verify: component tests; a browser journey with Playwright's virtual
  authenticator: set up, sign out, sign in, add a second passkey;
  the mobile app's tests unchanged

### PR 5: `feat(admin)`: the audit log page

- [ ] `GET /admin/v1/audit-log` and its page with filters
- Verify: integration test for the filters and the cursor; component test

### PR 6: `feat(meeting-points)`: list, create and edit in the console

- [ ] Migration; `parseCoordinates`; the list with filters and the map;
      create and edit drafts with every field; audit entries
- Verify: domain tests for each coordinate form; integration tests; a
  browser journey creates a draft and edits it

### PR 7: `feat(meeting-points)`: pause, back in use and retire

Activating needs photos (PR 8) and computed distances (PR 11), and moving
recomputes distances, so both come in PR 12. PR 7 is in two parts.

- [x] 7a, the API: `nextPointStatus`, `validatePause`, `reviewDueOn`; the
      routes, the minute job's resume and retire steps, the notifications
- [x] 7b, the console: pause, back in use and retire on a point's page
- Verify: domain tests per status change; integration tests (pause with
  future trips notifies each driver and passenger once; retire with and
  without future trips; the minute job); a browser journey (7b)

### PR 8: `feat(meeting-points)`: photos

- [ ] `PhotoStorage` with the disk and Hetzner adapters; upload, order,
      descriptions, remove; photos on the app's details
- Verify: integration tests (a file with metadata, a sixth photo, a file
  that is not a JPEG are refused); the Hetzner adapter's contract test,
  run by hand with keys like the SMS ones

### PR 9: `feat(meeting-points)`: import drafts from a CSV file

- [ ] Parse and check rows, the preview, saving in one transaction
- Verify: domain tests for each column's problems; integration test

### PR 10: `feat(meeting-points)`: problem reports

- [ ] `meeting_point_issues`; "Something wrong here?" in the app; the
      queue, resolving and the home count; the 12-month deletion in the
      clean-up job
- Verify: integration tests (verified phone only, 5 a day, the link to
  the person removed on resolving); screen test; browser journey

### PR 11: `feat(meeting-points)`: distances for real meeting points

- [ ] ADR for decision 5; the road file script and the file; legs on
      activation and move; "Recompute all"; the legs status page
- Verify: known distances within 3% of the road authority's figures;
  every sample point still gets its legs

### PR 12: `feat(meeting-points)`: activate and move

- [ ] `activationChecklist`, `movedFar`; activate and move with their
      legs, and the notifications of a move
- Verify: domain tests; integration tests (a move under and over 50 m);
  a browser journey

## 6. Review focus

1. **Anyone but the operator reaching `/admin/v1`:** an app token, an
   ended or expired session, a removed role, a suspended account (PR 2).
2. **A copied setup link or a phished sign-in:** the link works once,
   for 30 minutes, after `#`; a passkey answers only to our own origin
   (PR 3).
3. **An action saved without its audit entry, or the reverse:** both in
   one transaction (PR 2, and a test in each later PR).
4. **Pausing a point a trip uses tomorrow:** the trip is not changed or
   cancelled; its driver and passengers are told once (PR 7).
5. **A photo that gives away where the operator stood or a face:** the
   browser re-encodes it, the API refuses metadata, and the operator
   blurs faces and plates before upload (PR 8).

## 7. Martin's steps

1. Accept or change the choices in section 3.
2. After PR 4 merges: run the command locally (or on staging once it is
   set up) and save a passkey.
3. Before activating real points: open the Hetzner bucket and put its
   keys in Render (decision 4; runbook in PR 8).

## 8. Risks

- **One origin for the app and the console** until there is a domain: a
  script injected into the public web app could call the console's API
  while Martin is signed in to it. The strict content security policy and
  React's escaping make that unlikely; milestone 12 moves the console to
  its own host name.
- **Passkeys are tied to a host name:** moving the console to its own
  domain means saving the passkeys again, with a new setup link.
- **Parallel threads:** the safety thread builds its console pages on PRs
  2 to 4, so those go first and are announced when they merge.

## 9. Definition of done

All PRs merged with green CI; a screen reader pass on the console's
sign-in, list and form pages; Martin has signed in with a passkey and
created, activated and paused a meeting point locally or on staging;
docs, roadmap and CHANGELOG are updated.
