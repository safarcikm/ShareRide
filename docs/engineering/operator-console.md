# Operator console: adding to it

**Owner:** Martin · **Last reviewed:** 2026-11-16

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
  review overdue and part of a name. There are a few hundred points at
  most, so it filters them all in the API.
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
  (R2.10), its own step. A retired point is not edited
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
buttons its status allows (`nextPointStatus`). Pausing opens a short form
(the reason in both languages, an optional end date) checked with
`validatePause` before it is sent; retiring asks first and says whether the
point retires at once or after its last trip. Bringing a point back needs
no question, as it can be paused again. What a pause or a retirement does
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
  `overruledAt` and the operator's note. Nobody leaving ShareRide, nor the
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
  `not_found` for anything not on that list, so nobody leaving ShareRide
  is changed, and `unchanged` when it already counts, or already
  doesn't.
- `GET /admin/v1/reliability/watch` gives the watch level (80%) and the
  people below it, lowest first, with their counts by role. The operator
  decides on a warning or a suspension as a person (3.8.4); nothing here
  suspends anyone.

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
