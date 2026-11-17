# Privacy self-service plan

**Owner:** Martin · **Date:** 2026-11-16 · **Status:** Approved; Martin
accepted the three choices in section 3 on 2026-11-16

Lets people download everything ShareRide holds about them, delete their
account from the app, and ask about anything else, and makes every
retention period in the [privacy register](../compliance/privacy-gdpr.md)
run on its own and leave a record. It implements
[spec 11](../specs/2026-11-13-privacy-self-service.md) on top of
milestones 1 to 6. The hourly clean-up, the notification outbox, the
worker, SMS codes and email are in place.

It needs no new service or dependency. It is built alongside milestone 7
(trip day and reviews), the operator console and safety and moderation,
which add tables this plan must export and erase. Section 7 says how the
work fits together.

## 1. Goal

When this is done, on the web and on an Android test build:

- Jón opens Settings, then Privacy, and taps "Download my data". A code
  comes by SMS, he types it, and the screen says the file is being
  prepared. A minute later a push and an email say it is ready. He
  downloads a ZIP with a readable page in Icelandic and a JSON file: his
  account, devices, trips, bookings, payments and conversations, with
  other people by first name only. The file is gone after 7 days.
- Anna wants to leave. "Delete my account" lists her one upcoming booking;
  she cancels it from that screen under the normal rules, confirms with a
  code, and is signed out everywhere. Her profile and trips vanish at once.
  Two days later she signs in, sees "Your account will be deleted on 25
  November" and keeps her account. Had she not, 7 days later her data
  would be erased: her messages show "Message deleted", and the trips and
  payments of the people she rode with still add up.
- Sigga asks "Why do you keep my old trips?" from "Ask about my data".
  Martin sees it with its due date one month later and answers by email.
- Martin can show which retention rule ran when and how many records it
  erased, and can hold a disputed booking's records past their date.

## 2. Scope

| In this plan | Later |
| ------------ | ----- |
| Rules R11.1 to R11.9 in the domain, with a test per rule | The console's pages for privacy requests, holds and retention runs: the console thread adds them over this plan's functions (decision 3) |
| Confirming download and deletion with a fresh SMS code | Photos in the export: none exist yet. They join the ZIP when profile photos come (milestone 2's photo PR) |
| Download my data: built by the worker, ZIP with JSON and a readable page, 7 days, one per 24 hours | Asking the payment provider to close a payout account: payouts don't exist yet (spec 13) |
| Delete my account: what is open, cancelling from there, 7 days to undo, then erasure as in spec 11, 3.5 | Held payouts blocking deletion: they come with spec 13. Open disputes come with milestone 7 |
| Blocked phone numbers for suspended people who delete | Suspensions themselves (spec 9, safety thread) |
| Retention runs recorded per rule, holds, and erasures re-applied after a restore | Usage analytics and the search log: neither exists (spec 12) |
| Ask about my data, answered by email | |
| A catalogue of every table's personal data, checked by a test, so no new table is missed | |

## 3. Decisions for Martin

Martin accepted all three as recommended on 2026-11-16.

| # | Choice | Recommendation | Why | Alternative |
| - | ------ | -------------- | --- | ----------- |
| 1 | Where the export file is kept for its 7 days | **In the database, encrypted by the API**, and downloaded through a one-time link the app opens. Deleted after 7 days by the clean-up | No new service or account is needed, and the file is small (well under a megabyte) until photos exist. The database is already in Frankfurt and backed up | Hetzner Object Storage now ([ADR 0022](../decisions/0022-photo-storage-on-hetzner.md)). It needs your Hetzner account and keys first, and sits almost empty until photos come |
| 2 | Whom trips, bookings and payments are linked to once a person is erased | **One shared "former member"**: everything kept moves to a single anonymous placeholder, and the person's own row is deleted. The same move anonymises trips 3 years after they end | Nobody can link the person's old trips together any more. In a small country a route and a weekday can be enough to tell who someone was. The other people's history, payments and reliability stay the same | Keep the person's own row with every personal field emptied. Simpler, but their trips stay linked by one ID |
| 3 | How the operator answers privacy requests and sets holds before the console exists | **A command**, `pnpm --filter @shareride/api privacy`, as milestone 7 does for disputes. It lists requests by due date and answers them, sets and ends holds, shows the last run of each retention rule, and re-applies erasures after a restore. The console thread adds pages over the same functions | Requests can be answered from the first day, and the deadline of one month (R11.7) never waits for the console. A command cannot be reached from the internet | Wait for the console's pages. Until then nobody could answer a request |

## 4. Design notes

### 4.1 Rules (domain)

In `packages/domain/src/privacy`, free of I/O, with spec 11's values in
`settings.ts`: `exportValidDays` 7, `exportEveryHours` 24,
`deletionWaitDays` 7, `blockedNumberMaxYears` 3, `erasedAccountsKeptDays`
30 (longer than the 7 days of point-in-time recovery), `requestDueMonths`
1, and the register's periods marked **verify**: trips and bookings 3
years after the trip, privacy requests 3 years after the answer,
retention runs 90 days.

- `deletion.ts`: `deletionCheck(open)` sorts what is open into
  `mustSettle` (open disputes, held payouts) and `canCancel` (upcoming
  trips with bookings or requests, upcoming bookings and requests), and
  allows deletion only when both are empty (R11.3).
  `deleteAfter(askedAt)` is 7 days later (R11.8).
- `effects.ts`: spec 11's table 3.5 as data. Each category of personal
  data has one effect on deletion: `erase` (the rows go), `empty` (the
  personal fields go, the row stays), `move` (to the former member) or
  `keep`.
- `retention.ts`: the names of every retention rule, as runs record them,
  and `privacyCutoffs(now)` for the rules this plan adds. The sign-in,
  chat, draft and notification periods stay in their modules.
  `isHeld(holds, subjects, now)` and `validateHold` (R11.6).
- `blockedNumberUntil(suspendedUntil, erasedAt)`: the suspension's end, at
  most 3 years after erasure; a permanent suspension gets the 3 years
  (R11.9).
- `exportAllowed(lastAskedAt, now)` (one per 24 hours) and
  `requestDueAt(receivedAt)`: one calendar month later, the last day of the
  month when it has fewer days.

### 4.2 The personal data catalogue

`packages/db/src/personal-data.ts` lists every table with its export
section (or why it has none, such as `rate_limit_events`: keyed hashes
not linked to a person) and its column effects on deletion from 4.1. A
unit test reads the schema and fails when a table or a column pointing
at `users` is not listed. A new table, from this plan or another thread,
fails CI until it is classified. It lands in PR 2, early, so the other
threads meet it.

### 4.3 Confirming with a fresh code

- `verification_codes.purpose`: `sign_in` (the default) or `confirm`.
  Sign-in reads only sign-in codes and confirming only confirm codes, so
  a code never does the other's job.
- `POST /v1/me/confirm-code` sends a code to the account's own number
  under the sign-in limits, with its own text: "Your ShareRide code to
  confirm: {code}. Never share it."
- Download and delete take `{ code }` and run through
  `auth.withConfirmCode(userId, code, action)`: it checks the code and
  runs the action in one transaction, with the sign-in rules for expiry
  and attempts and the same errors. A wrong code is counted even though
  the action does not run; the code is used up only when the action
  succeeds, so each route checks its other refusals first.
- In the app, `ConfirmWithCode` shows the number's last two digits, the
  code field and "Send a new code" after the wait.

### 4.4 Download my data

- `data_exports`: user, asked at, ready at, failed at, expires at, the
  encrypted file and its size, and the hash of the current download link
  with its expiry.
- `POST /v1/me/export` (with the code) refuses a second request within
  24 hours (`export_too_soon`, 429, with when) and stores the request; a
  new request deletes the earlier file. A job every 10 seconds builds the
  files asked for (3 tries, a 5-minute lease per try), sets each to expire
  7 days later, and sends `data_export_ready` by push and email, the first
  account notice (not about a booking or trip). The texts say it is ready
  and until when, never a link (spec 11, 7).
- `GET /v1/me/export` answers the latest one: `none`, `preparing`,
  `ready`, `expired` or `failed`, with its dates and when the next one
  can be asked for.
- `POST /v1/me/export/link` gives a one-time link valid for 2 minutes.
  `GET /v1/exports/{token}` needs no sign-in, since the link is the key;
  it answers the ZIP once, with `Cache-Control: no-store`; `HEAD` answers
  the headers and leaves the link to use. The app opens
  it in the browser on phones and downloads it on the web, so no new
  package is needed.
- Encryption: AES-256-GCM with a key derived from `AUTH_SECRET` (HKDF,
  info `shareride-data-export-v1`), a fresh IV per file, and the export's
  ID as associated data. A file that cannot be opened is marked failed,
  so the person can ask again at once.
- The file: `shareride-data.json` (`format`, `version` 1, `createdAt`,
  one key per section) and `shareride-data.html`, made from the same data
  in the person's language with inline styles and no scripts or outside
  links: stored codes such as statuses in words, and dates in Iceland's
  time. A small ZIP writer in `apps/api/src/platform/zip.ts` uses
  `node:zlib` (deflate and `crc32`).
- Sections today: account, legal acceptances, settings, devices, email
  waiting to be verified, vehicles, trips posted (stops, times, prices,
  changes, cancellations, passengers by first name), bookings and
  requests (the driver by first name, prices, cancellations, refunds),
  payments, conversations (each message from "you" or a first name),
  notifications of the last 90 days (kind, channel, status, time) and
  privacy requests. Other people's IDs, phone numbers and emails never
  appear (R11.2).

### 4.5 Delete my account

- `users.delete_after`: set while deletion waits. The status stays as it
  was, so undoing a deletion never lifts a suspension. The former member
  of decision 2 is one row with the status `deleted`, made by the
  migration.
- `GET /v1/me/deletion-check` answers 4.1's lists, each item with what the
  app needs to show it and open its cancel screen (milestone 6).
- `POST /v1/me/delete` (with the code) refuses while anything is open
  (`deletion_blocked`, 409). It sets `delete_after`, ends every session,
  and sends `account_deletion_scheduled` by email when there is a verified
  address (spec 11, 3.4.5).
- Hidden at once: search, rides leaving soon, trip details (404), the
  public profile (milestone 7), booking and requests, and messages to
  them all leave out people with `delete_after` set.
- Signing in while it waits works: `me.deletionScheduledFor` is set, and
  the app shows only "Your account will be deleted on {date}" with "Keep
  my account" and "Sign out". `POST /v1/me/delete/cancel` clears it.
  Deleting again meanwhile keeps the first date.
- While it waits, the person takes on nothing new: booking and publishing
  refuse with `account_deletion_pending` (403). Both take the person's row
  lock, as deleting does before its second check, so nothing opens between
  the check and the date being set.

### 4.6 Erasure

The hourly clean-up's `accounts` rule takes each account whose
`delete_after` has passed and that no hold covers. One transaction per
account, with the row locked and the date checked again inside it:

1. Not yet departed trips without bookings are cancelled quietly; drafts
   are deleted.
2. **Erase:** sessions and tokens, push tokens, email links, settings,
   legal acceptances, notifications to them, exports, cars no published
   trip used, and in other threads' tables reviews about them and blocks
   (section 7).
3. **Empty:** the number plate of cars kept for published trips; free text
   they wrote on trips and bookings (notes, request messages, cancel
   notes); the text of messages they sent, which get `erased_at` and read
   "Message deleted".
4. **Move to the former member:** trips, bookings, kept cars, the sender of
   their messages, privacy requests, and in other threads' tables reviews
   they wrote, check-ins, disputes and reports (section 7).
5. A suspended account's number goes to `blocked_numbers` as its keyed
   hash until `blockedNumberUntil`; sign-up refuses that hash with
   `account_unavailable`. The ID goes to `erased_accounts`, and the row is
   deleted.

The migration changes `trips.driver_id` and `vehicles.owner_id` from
`on delete cascade` to `restrict`, so a missed step fails instead of
deleting other people's trips. The app shows "A former member" for a
person with no first name.

After a restore, `privacy reapply-erasures` erases again every ID in
`erased_accounts` that came back, before the services point at the
restored database (runbook, "Restore the database"). With
`PREVIOUS_DATABASE_URL` it first takes from the old database each
deletion date changed there after the restored row's last change (so an
account kept after the restore's point is never erased) and copies its
list of erasures. Accounts whose wait ended before the backup are erased
by the next run anyway. One account that fails to erase is logged and
reported, and does not stop the others.

The former member is hidden wherever a deleting person is: no booking on
a trip left with it, and its conversations are closed both ways. An
erasure cancels every trip of the person's that nobody rode or holds a
seat on, also one that has left its first stop. A driver's cancel note,
copied to the passengers' bookings and chat lines, is emptied with the
trip's own, and so are the notes of milestone 7's reports about the
person's rides. An open report holds a deletion.

### 4.7 Retention runs and holds

- `retention_runs`: rule, ran at, erased, anonymised; never content.
  Every hourly clean-up writes one row per rule, kept 90 days. The
  command shows the last run of each rule.
- New rules: exports after 7 days, accounts (4.6), blocked numbers after
  their date, `erased_accounts` after 30 days, privacy requests 3 years
  after the answer, and trips and bookings 3 years after the trip, moved
  to the former member with free text emptied (first due in 2030).
- `holds`: a subject (`user`, `trip` or `booking`), a reason, an end date
  (both required), who set it, and when it was ended. A held account is
  not erased; a held trip keeps its bookings, conversations and payments;
  a held booking keeps its conversation. Every rule checks holds.
  Setting and ending one goes to the audit log (section 7).
- As built (PR 9): every rule that deletes records about a person, trip
  or booking checks holds; codes, tokens, links and hashes are keys, and an
  export a copy, so they go on time. An account waits while a hold covers
  it, a trip it drove or rode on, or a booking of its own or on its trip;
  a hold on another person on those rides does not stop it.
  Ended holds are deleted 3 years after their end, like the audit entries
  that record them (**verify**), and the console's sign-in records are
  rules of their own (`operator_sessions`, `operator_sign_in`).

### 4.8 Ask about my data

`privacy_requests`: user, kind (`objection`, `restriction`,
`correction`, `question`), text (1 to 2 000 characters), received at, due
at, answered at, answer. `POST /v1/me/privacy-requests` needs a verified
email, since the answer goes by email (`email_required`, 409; the form
offers to add one first). The command lists open requests, nearest due
first, and sends the answer as `privacy_request_answered`.

### 4.9 The app

Settings gains Privacy (`/settings/privacy`): Download my data, Delete my
account, Ask about my data and the privacy policy. Download, delete and
ask each have their own screens under it; the deletion wait has its own
screen after sign-in. Texts are spec 11's, section 8, plus the
notification, error and section titles, in both languages.

## 5. Pull requests and tasks

Tests come first in every task. Each PR updates the docs it touches (the
privacy register, the domain model, the API reference), runs the browser
journeys, and gets a code review before it opens.

### PR 1: `docs(plans)`: this plan

- [ ] This plan and the plans index

### PR 2: `feat(privacy)`: rules in the domain and the personal data catalogue

- [x] `privacy/settings.ts`, `deletion.ts`, `effects.ts`, `retention.ts`
      (every rule listed; today's cutoffs stay with their modules), with
      the tests of 4.1
- [x] `packages/db/src/personal-data.ts` and its schema test (4.2)
- Verify: `pnpm --filter @shareride/domain test`, `pnpm --filter
  @shareride/db test`

### PR 3: `feat(account)`: confirm with a fresh code

- [x] Migration (`purpose`); `POST /me/confirm-code`; `withConfirmCode`;
      the SMS text. `ConfirmWithCode` in the app moved to PR 5, where
      its first screen uses it.
- Verify: integration tests (a confirm code never signs in and a sign-in
  code never confirms; limits shared with sign-in; wrong, expired and too
  many attempts; wrong codes sent at once all counted; an action that
  refuses keeps the code)

### PR 4: `feat(privacy)`: download my data, the API

- [x] `data_exports`; the ZIP writer; the sections of 4.4 and the
      readable page; encryption; the job; the four routes;
      `data_export_ready`, the first account notice; exports deleted after
      7 days
- Verify: integration tests (refused without a fresh code; one per 24
  hours; the file opens and holds exactly the expected sections; a
  three-passenger trip shows the others by first name only; the link works
  once and expires; a file that cannot be opened fails; the ready notice
  has no link); unit tests of the ZIP writer read back and of the page's
  words for every stored code

### PR 5: `feat(privacy)`: Privacy page and Download my data in the app

- [x] `ConfirmWithCode` (from PR 3); Settings, Privacy; the download
      screens (ask, code, preparing, ready, expired) at
      `/settings/privacy/download`, which the ready notice opens: add it
      to the paths a notification may open (`notifications/paths.ts`)
- Verify: screen tests; a browser journey downloads the file and opens
  both files

### PR 6: `feat(privacy)`: delete my account, the API

- [x] Migration (`delete_after`, the former member, `restrict`); the
      check, delete and cancel routes; hiding (4.5); sign-in while waiting;
      `account_deletion_scheduled`; no booking or publishing while waiting;
      check-ins (milestone 7) in the export
- Verify: integration tests (refused without a code or while anything is
  open; signed out everywhere; gone from search, trip details, booking and
  messages at once; undo brings it back as it was, and a suspension stays)

### PR 7: `feat(privacy)`: erasure after 7 days

- [x] The `accounts` rule (4.6); `erased_accounts`; `blocked_numbers` and
      the sign-up refusal; `messages.erased_at`; "Message deleted" and "A
      former member" in the answers and the app's existing screens;
      `privacy reapply-erasures` and the runbook step
- Verify: integration tests (every category of 3.5; the other people's
  trips, bookings, payments and reliability unchanged; a second run
  changes nothing; an undo just before the run wins; a blocked number
  cannot sign up)

### PR 8: `feat(privacy)`: Delete my account in the app

- [x] What is open with Cancel; what happens; confirm with a code; the
      waiting screen with "Keep my account"; "Message deleted" and "A
      former member" (those two came with PR 7)
- Verify: screen tests; a browser journey deletes an account with an
  upcoming booking, cancelling it from the deletion screen

### PR 9: `feat(privacy)`: retention runs and holds

- [x] `retention_runs`, `holds`; the rules of 4.7; holds in every rule;
      the `privacy` command's `runs`, `hold` and `holds` (and `end-hold`).
      Trips and bookings after 3 years moved to PR 9b, and privacy
      requests' rule to PR 10, with their table
- Verify: integration tests (each rule at the edge of its period; a hold
  keeps records past their date and lets go after its end; counts without
  content; twice safe)

### PR 9b: `feat(privacy)`: trips and bookings after 3 years

- [ ] The `trips_and_bookings` rule of 4.7: trips 3 years after they
      arrive, with their bookings, check-ins and reports, moved to the
      former member with free text emptied; held ones wait
- Verify: integration tests (at the edge of the period; the drivers' and
  passengers' other trips unchanged; a hold keeps them; twice safe)

### PR 10: `feat(privacy)`: ask about my data

- [ ] `privacy_requests`, the route, the form, the command's `requests`
      and `answer`, `privacy_request_answered`
- Verify: integration tests (due one month later; needs a verified email);
  a screen test

## 6. Review focus

What the spec implies and a person would meet first, each with its test:

1. **A code meant for one thing used for another:** a sign-in code cannot
   confirm a deletion, and a confirm code cannot sign in (PR 3).
2. **Someone else's data in an export:** a passenger's file never shows the
   other passengers, and the driver's file shows passengers by first name
   only, never an ID, number or email (PR 4).
3. **The people Anna rode with lose their history:** after erasure their
   bookings, payments, reliability and the driver's trip still show and
   add up (PR 7).
4. **Undo pressed just as the erasure runs:** the row lock and the second
   check of the date mean either the undo wins or the erasure does, never
   half of each (PR 7).
5. **An old link or a notification opens a trip of someone deleting their
   account:** it answers "not found", and a booking or message to them is
   refused (PR 6).

## 7. Working alongside the other threads

- **The catalogue (4.2)** is the hook: every new table must say what it
  exports and what deletion does to it. Whoever merges second rebases and
  adds their tables.
- **Milestone 7** adds check-ins, disputes and reviews: check-ins and
  disputes move to the former member, reviews about the person are erased
  and reviews they wrote move, and open disputes feed `mustSettle`.
  Download my data has the disputes they raised or answered, with their
  own note only (spec 8, section 7).
- **Safety and moderation** adds reports, moderation actions, blocks and
  `users.suspended_until`: reports and actions are kept 3 years after
  closure and move, blocks are erased, and a suspended person must still
  be able to sign in to download and delete (R9.10). The `blocks` table
  is in the catalogue (milestone 9, PR 4), with its own export section:
  the blocks the person made, by first name and since, never who blocked
  them.
- **The operator console** adds the audit log and pages: holds are written
  to its audit log, and its pages for requests, holds and runs call this
  plan's functions.
- **Migrations:** each PR rebases on `main` right before merging and
  regenerates its migration if another thread took the number; a merged
  migration is never edited. One deploy is enough before the beta
  ([conventions](../engineering/conventions.md#database)).

## 8. Martin's steps

None to build it. For the lawyer, with the privacy policy: the periods
marked **verify** and what an export must say about other people (spec
11, section 7). Later, on a phone build: the stores' deletion path.

## 9. Risks

- **Each export and deletion costs an SMS.** The sign-in limits apply, so
  it cannot be used to send many.
- **Rotating `AUTH_SECRET`** makes waiting exports unreadable and blocked
  numbers unrecognisable. The runbook says so; exports are rebuilt on
  request.
- **A restore when the old database is lost** misses deletions asked for
  after the backup's time. Point-in-time recovery keeps that gap to
  minutes, and the runbook reads `erased_accounts` from the old database
  whenever it can be reached.
- **Exports grow with photos.** Decision 1 is revisited then.

## 10. Definition of done

Every PR merged with CI green; R11.1 to R11.9 each have a test; the
privacy register, domain model, API reference and runbook say what the
code does; texts in Icelandic and English; the browser journeys download
a file and delete an account.
