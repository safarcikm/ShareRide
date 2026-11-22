# Profile photos plan

- **Status:** Approved 2026-11-22 (Martin: the design in the project thread,
  and "the app cleans, the API checks" on a decision card,
  [ADR 0033](../decisions/0033-profile-photos-made-in-the-app-and-checked-by-the-api.md))
- **Covers:** [milestone 13](../strategy/roadmap.md), first item:
  profile photos, required for drivers before they publish. This is
  [spec 1](../specs/2026-11-13-sign-in-and-profile.md) 3.5 (the photo),
  [spec 3](../specs/2026-11-13-post-a-trip.md) R3.1 (the photo to publish),
  [spec 4](../specs/2026-11-13-search-and-trip-details.md) 3.4 and 3.6 (the
  driver's photo), [spec 9](../specs/2026-11-13-safety-and-moderation.md)
  3.4.3 (hiding a profile photo) and
  [spec 11](../specs/2026-11-13-privacy-self-service.md) (export and
  erasure). It replaces milestone 2's PR 7
  ([plan 4.6](2026-11-13-milestone-2-hosted-and-connected.md#46-profile-photo)),
  written before ADR 0029.
- **Branch:** `claude/project-thread-ycisy3`, one PR at a time.

## 1. Goal

When this plan is done:

- A member adds, changes or removes a square profile photo in Profile. On
  a phone they pick it from the library or take one, and crop it. On the
  web they pick a file, and the app crops it to the centre.
- The photo shows wherever the coloured first letter shows today: trip
  pages and search results (to anyone, as spec 4 says), bookings,
  requests, chat, the trip day, reviews and public profiles.
- While photo storage is on, a driver cannot publish a trip without a
  photo (R3.1). The last step of the trip form offers "Add a photo" next
  to the car and the licence. Trips already published stay up.
- The operator can hide a photo from the console, with a statement of
  reasons, and the person can appeal (spec 9).
- The photo is in "Download my data", and its file leaves the bucket
  within a minute of being replaced, removed or erased with the account.
- Martin has a bucket on staging, and both meeting point and profile
  photos work there.

## 2. Scope

| In this plan | Later |
| ------------ | ----- |
| Add, replace and remove a profile photo; crop square | Filters, zoom or rotation beyond the phone's own crop screen |
| The photo beside names in the app and the console | In emails and push (they carry no pictures) |
| The photo required to publish while storage is on | Asking existing drivers with published trips for a photo |
| Hide a photo from the console, with appeal | Automatic checks of what a photo shows |
| Export and erasure of the photo | A photo from Google or Apple sign-in (never imported, ADR 0033) |
| Meeting point photos on staging, through the same bucket | Changing rule R2.3 for meeting points (the settlements thread) |

## 3. Decisions

| # | Decision | Who |
| - | -------- | --- |
| 1 | The app cleans the photo and the API checks it (ADR 0033) | Martin, decision card, 2026-11-22 |
| 2 | Visitors see the driver's photo on trip pages and results, as spec 4 and the privacy policy draft already say | Spec 4 (accepted) |
| 3 | The photo is required to publish only while photo storage is on, so posting keeps working on a server without a bucket | Claude's call, said in the thread |
| 4 | Sign-up stays three steps without a photo (spec 16, 3.5). The photo is asked for in Profile and at the trip form's last step | Claude's call |
| 5 | The list of people I blocked keeps the first letter, not the photo | Claude's call: there is no reason to show it |

## 4. Design notes

### 4.1 Rules (domain)

- `checkProfilePhoto(bytes)` in `packages/domain/src/people/photo.ts`: runs
  `checkPhotoFile` (ADR 0029), then asks for a square of 256 to 640
  pixels and at most 512 KB. It returns `{ edge }` or one of `not_jpeg`,
  `metadata`, `too_large`, `not_square` and `too_small`.
  `profilePhotoLimits` holds the numbers, shared by the app.
- `driverReadiness` takes `photosOn`. The photo item blocks only when it is
  true, and the constant `photoRequiredToPublish` goes. A photo the
  operator hid counts as no photo.
- `hideableContent` gains `photo` (PR 5).

### 4.2 Data

Migration `0056_profile_photos`:

- `users.photo_key` (text, unique, null) and `users.photo_hidden_at`
  (timestamptz, null). There is a check that a hidden photo exists.
- `photo_files_to_delete`: `key` (text, primary key), `delete_after`
  (timestamptz), `created_at`. Each row is a file in the bucket that nobody
  has any more, or not yet. It is catalogued in `personal-data.ts` as not
  about a person: a random key, with no link to anyone.

Keys are `profile-photos/<uuid>.jpg`. `photoKeyPattern` takes both
folders.

### 4.3 Storage

- The `PhotoStorage` port gains `read(key)`, for the export. Hetzner does
  a signed GET. The folder storage already reads, and the fake keeps
  files in memory.
- The deletion queue: removing a photo, replacing it, and erasing an
  account each add the old key with `delete_after = now()` in the same
  transaction. After the commit the API tries to delete the file at once,
  and removes the row when that works.
- An upload first queues its own new key with `delete_after` 15 minutes
  ahead, then stores the file, then sets `users.photo_key` and removes
  that row in one transaction. A crash between the upload and the commit
  leaves a queued file, never an untracked one.
- The job `photo-files` runs in the API every minute while storage is on.
  It deletes due rows' files (`for update skip locked`, 50 at a time) and
  logs failures. Each try waits for the next minute. The hourly clean-up
  needs no bucket keys, because the erasure only queues.

### 4.4 API

- `PUT /v1/me/photo`, body `{ photo: <base64 JPEG> }` with a 1 MB body
  limit. It answers 200 with `Me`. Errors, as for meeting point photos:
  400 `validation_failed` with the issue on `photo`, 413 over the limit,
  503 `photo_storage_off` or `photo_storage_unavailable`.
- `DELETE /v1/me/photo` answers 200 with `Me`. Removing no photo is fine.
- `Me.photo`: `{ url, hidden }` or null. I see my own photo while it is
  hidden, with a note.
- `GET /v1/driving/readiness`: `photo` is done when there is a photo that
  is not hidden, and blocking while storage is on.
- Publishing refuses `driver_not_ready` as today. Readiness now includes
  the photo.
- People: `photo` (a link, or null) joins `driver` on trip details,
  search results and the rides leaving soon, `driver` and `passenger` on
  bookings, and the public profile. It is null when there is no photo,
  when it is hidden, for a former member, and for someone leaving
  ShareRide. One helper builds it: `photoLinkOf(storage, now)` in
  `apps/api/src/modules/people/photos.ts`.
- Console: the user page and the report's person show the photo, also
  while it is hidden, marked as hidden (PR 5).

### 4.5 Privacy

- Export: the account section gains `photo` (`profile/photo.jpg`, or null)
  and `photoHiddenAt`. The ZIP holds the file, read from storage when the
  export is built. With storage off the file is left out and the section
  says so.
- Erasure queues the key (4.3). `privacy-gdpr.md` and the privacy policy
  draft already name Hetzner and the photo. The Hetzner row stays "To
  sign" until Martin signs the data processing agreement.
- No photo in logs, Sentry or the audit log, only `photoKey` presence. The
  audit log records a hide as `user.photo_hidden` with the user, never the
  file.

### 4.6 The app

- New runtime dependencies: `expo-image-picker`, which opens the photo
  library, the camera or the browser's file chooser with a square crop on
  phones, and `expo-image-manipulator`, which resizes, centre-crops on the
  web and writes a JPEG. Both are Expo's own, installed with
  `npx expo install`, and justified in the PR.
- `apps/mobile/src/profile/photo-picker.ts` is a port (`choose(source)`
  gives the cleaned bytes or null), so screen tests use a fake. The real
  one runs `stripPhotoMetadata`, then `checkProfilePhoto`, before sending.
- `Avatar` takes `photo?: string | null`. It shows the picture in its
  circle and falls back to the letter if the picture fails to load.
  Screen readers still skip it.
- Profile: the avatar at the top with "Add a photo", or "Change photo" and
  "Remove photo". While hidden it shows "ShareRide hid your photo because
  it broke the Community Rules. Add another one."
- Trip form step 5: "Profile photo, with Add a photo" joins Your car and
  Driving licence in "Things before you publish" (spec 16, 3.6, item 4).
- Every screen with an `Avatar` passes the person's `photo`.

## 5. Pull requests and tasks

### PR 1: `docs(plans)`: this plan and ADR 0033

- [ ] Plan, ADR 0033, both indexes, spec 1 photo row (the app makes a
      640 px square JPEG), spec 16 3.6 item 5, roadmap M13 link

### PR 2: `feat(profile)`: store a profile photo

- [x] Domain: `checkProfilePhoto` (tests: square, sizes, an iPhone-shaped
      file with Exif and ICC refused until stripped), `driverReadiness`
      with `photosOn`
- [x] Migration 0056, schema, `personal-data.ts`, domain model doc
- [x] Storage: profile key folder, `read(key)` on the port and adapters
      (Hetzner test with a fake fetch)
- [x] Photo service and routes: put, remove, queue, job. Integration tests:
      replace queues the old key, remove, a refused file is never stored,
      storage failure answers 503 and leaves the old photo, the crash gap
      (queued new key), the job deletes due rows only
- [x] `Me.photo`, readiness with the photo. Publishing is refused without
      one from PR 4b, once the app can add a photo (`photosOn`)
- [x] Erasure queues the key. Export holds the photo file
- Verify: `pnpm check --force`, integration tests for account, driving,
  privacy and trips

### PR 3: `feat(people)`: photos beside names

- [x] Contracts: `photo` on the people listed in 4.4 (`personPhotoSchema`;
      chats, the review screen and trip day read the booking's people)
- [x] API: trip details, search, rides leaving soon, bookings, public
      profile, through `photoLinkOf`. Tests: hidden, former member and
      leaving are null; visitors get the driver's photo
- Verify: integration tests for search, bookings and people

### PR 4a: `feat(mobile)`: add, change and remove a photo

Split from the first PR 4 so the app shows photos before they are
required: each half is smaller to review.

- [x] Dependencies, the picker (`profile/photo-picker.ts`, one maker for
      phones and the web, tested against fakes of both Expo packages)
- [x] `Avatar` with a photo, and every screen that has one
- [x] Profile photo controls and the hidden note
- [x] Texts in English and Icelandic, and the iOS camera and photos
      permission texts in both
- [x] Screen tests with the fake picker. A web journey adds a photo from a
      file, sees it on Profile and removes it
- [x] The API's folder photos may be shown from another origin, as the web
      app in development and the journeys run on another port
- Verify: `pnpm check`, `e2e:web`

### PR 4b: `feat(driving)`: a photo before posting a ride

- [ ] Flip `photosOn` in the driving service. The API tests that publish,
      and the journeys that post a ride, give their driver a photo
- [ ] The trip form's missing item: "Profile photo, with Add a photo"
- Verify: `pnpm check`, `e2e:web`, a look on the web at phone and laptop
  widths

### PR 5: `feat(moderation)`: hide a profile photo

- [ ] `photo` in `hideableContent`, the hide action, the statement texts,
      and appeal reversal (only while the hidden photo is still the
      person's)
- [ ] Console: the photo on the user page and the report, with Hide photo
- Verify: moderation integration tests, console tests

### PR 6: `docs(operations)`: photos on staging

- [ ] Runbook "Turn on photos" covers profile photos and the minute job,
      roadmap tick, plan as built, features list
- Verify: markdownlint

## 6. Working alongside the other threads

- The settlements thread owns rule R2.3 and meeting point activation. This
  plan does not touch `activation.ts`.
- The Google and Apple sign-in thread changes sign-in and `Me`. Both add
  to `Me`, and whoever merges second merges main in. Migrations: the first
  to go green takes the next number, and the other renumbers.
- The email thread changes notifications. The hide statement in PR 5 uses
  the existing `content_hidden` notice.

## 7. Martin's steps

1. In the Hetzner Console, create the bucket for staging: location
   Nuremberg, private (runbook, "Turn on photos"; ADR 0036, as Helsinki
   was not offered). Done 2026-11-22.
2. Generate S3 credentials. Put them and the bucket's details in the
   staging API's environment in Render.
3. Sign Hetzner's data processing agreement.
4. Check: add a meeting point photo in the console and a profile photo in
   the app.

## 8. Risks

- A phone writes a JPEG the check refuses. The app's tests carry iPhone-,
  Android- and Safari-shaped files, and the app reports a refused file to
  Sentry with the issue only, never the picture.
- Upload volume: one file per person, so there is no rate limit in this
  plan. If the bucket's traffic grows oddly, add one.
- Signed links change every hour, so images download again hourly. That
  is fine at our size.

## 9. Definition of done

As in CLAUDE.md, plus: a photo added on the web shows on another account's
view of the trip, and its file is gone from the bucket within a minute of
removing it.
