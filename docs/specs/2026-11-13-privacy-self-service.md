# Spec 11: Privacy self-service

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Draft for review

Feature: A5 Export and delete my data ([features](../product/features.md)),
and the privacy rights and retention rules behind it. Related:
[privacy and GDPR](../compliance/privacy-gdpr.md) (data inventory, retention,
rights), [spec 1](2026-11-13-sign-in-and-profile.md) (account, settings),
[spec 9](2026-11-13-safety-and-moderation.md) (suspensions, reports),
[spec 13](2026-11-13-payments.md) (payment records).

## 1. Problem and goal

People share their phone number, travel plans and messages with ShareRide.
The GDPR gives them the right to see that data, take it with them, correct it
and have it erased, and Apple and Google require deletion inside the app.
Martin runs the service alone, so these rights must work without him doing
anything by hand, and old data must disappear on schedule.

Goal: "Download my data" and "Delete my account" in the app, working on their
own; a simple way to ask anything else about one's data; and scheduled jobs
that enforce every retention period in the privacy register.

## 2. User stories

- As a user, I download everything ShareRide holds about me in a file I can
  read and a file a computer can read.
- As a user, I delete my account from the app without writing to anyone.
- As a user who deleted my account by mistake, I can still undo it for a
  short while.
- As a driver, I know I will still be paid for a trip I already drove, even if
  I delete my account.
- As the operator, I never have to delete data by hand, and I can show which
  retention rules ran last night.

## 3. Behaviour

### 3.1 Privacy settings

Settings (spec 1) has a Privacy page with: Download my data; Delete my
account; the privacy policy; consents (usage analytics, spec 12; optional
identity verification, later); and "Ask about my data". Beta news and trip
reminders stay under Notifications (spec 7).

### 3.2 Download my data

1. The user taps "Download my data" and confirms with a fresh code by SMS
   (re-verification for sensitive actions, as in
   [security](../engineering/security.md)).
2. The file is built in the background, usually within minutes. The user is
   told by push and email when it is ready, and downloads it from the app
   while signed in. It is available for 7 days, then deleted. One export can
   be made per 24 hours.
3. **The file** is a ZIP with a machine-readable JSON file and a readable
   summary page in the user's language, plus their photos. It holds:
   - account, profile, settings, consents and the legal versions accepted;
   - signed-in devices;
   - vehicles;
   - trips posted, with stops, times, prices and changes;
   - bookings and requests, with prices, cancellations and refunds;
   - payments, refunds, receipts and payouts (amounts and references; never
     card numbers, which ShareRide never has);
   - conversations they took part in, with the other person shown by first
     name only;
   - reviews written and received, with authors by first name;
   - check-ins, disputes they raised or answered, and reliability records;
   - reports they filed and their outcomes;
   - warnings, suspensions and their statements of reasons, and operator
     notes about them;
   - blocks they made;
   - notifications sent to them in the last 90 days (kind, channel, time).
4. Never included: who reported them, or anything else that would reveal
   another person's report or personal data beyond a first name.

### 3.3 Correct my data

Profile, vehicles, email and phone number are edited in the app (specs 1 and
3). A wrong no-show or driver absence is contested through spec 8. Anything
else goes through "Ask about my data" (3.6).

### 3.4 Delete my account

1. **Before deleting:** the app lists anything still open: upcoming trips with
   bookings or requests, upcoming bookings and requests, open disputes and
   held payouts. Trips and bookings can be cancelled from this screen under
   the normal rules (spec 6). Open disputes and held payouts must be settled
   first; the screen says so and links to them. Payouts already due are
   still paid.
2. **Confirm:** the screen explains what is deleted and what is kept (3.5),
   and the user confirms with a fresh code by SMS.
3. **Right away:** the user is signed out of every device; their profile,
   trips and reviews disappear from the app; nobody can book with them or
   message them.
4. Whether there is a waiting period before the data is erased: question 1.
5. A confirmation goes to their verified email, if any, and that address is
   then erased with the rest.

### 3.5 What is erased and what is kept

| Data | On deletion |
| ---- | ----------- |
| Profile: first name, photo, bio, languages; email; settings | Erased |
| Phone number | Erased, except as decided in question 2 |
| Signed-in devices, push tokens, notification log, consents | Erased |
| Vehicles | Erased |
| Messages they sent | Erased; the other person sees "Message deleted" |
| Reviews they received | Erased with the profile |
| Reviews they wrote | Kept, shown as written by "A former member" (spec 8) |
| Trips and bookings | Kept without the person: linked to an anonymous placeholder, so the other people's history, payouts and statistics stay right |
| Payments, receipts, payouts, ledger | Kept as bookkeeping law requires (privacy register), linked to the placeholder |
| Reports, moderation actions and appeals about them | Kept 3 years after closure for safety (privacy register) |
| Audit log | Kept; it holds IDs, not personal data |
| Payout account at the payment provider | ShareRide asks the provider to close it; the provider keeps what its own legal duties require |

Database backups age out on their normal schedule; a restore from backup
repeats every erasure made since (3.7).

### 3.6 Ask about my data

A short form for anything else: objecting to a use, asking to restrict one,
asking a question, or correcting something not editable in the app. It lands
in the console as a privacy request with a due date one month later (the
GDPR deadline), and the answer is sent by email. Requests nearing their due
date appear on the console home (spec 10).

### 3.7 Retention jobs

1. A daily job enforces every retention period in the privacy register, for
   example: messages 12 months after the trip; notification log 90 days;
   search log 14 months; technical logs 30 days; exports 7 days; trips and
   bookings anonymised after their period; reports 3 years after closure.
2. Each run records, per rule, how many records it erased or anonymised and
   when, but no content. The console shows the last run of each rule.
3. A **hold** keeps specific records past their date while a dispute,
   chargeback or legal claim needs them. The operator sets it with a reason
   and an end date, and it is in the audit log.
4. A list of erased accounts (IDs only) is kept so a restore from backup can
   erase them again before the system goes live.

## 4. Rules

| ID | Rule |
| -- | ---- |
| R11.1 | Download and deletion work in the app without the operator, after a fresh SMS code. |
| R11.2 | An export contains the user's own data and only the first name of anyone else, never who reported them; it is deleted after 7 days. |
| R11.3 | An account cannot be deleted while it has an open dispute or a held payout; open trips and bookings are cancelled first under the normal rules. |
| R11.4 | On deletion, personal data is erased or anonymised as in 3.5; records the law or safety requires are kept for their period only. |
| R11.5 | Every retention period in the privacy register is enforced by a scheduled job, and each run is recorded without content. |
| R11.6 | A hold on records needs a reason and an end date, and is audited. |
| R11.7 | Privacy requests are answered within one month. |
| R11.8 | The waiting period and phone number handling follow questions 1 and 2. |

## 5. Screens

1. Settings, Privacy page
2. Download my data: request, preparing, ready, expired
3. Delete my account: what is open, what happens, confirm with a code
4. "Account deletion scheduled" and undo, if question 1 is yes
5. Ask about my data
6. Console: privacy requests with due dates; holds; retention runs

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)):

- `DataExport`: user, requested at, ready at, file location, expires at.
- `User` (existing): `status` gains a `deletion_scheduled` state if question 1
  is yes, with `delete_after`; a deleted user becomes an anonymous
  placeholder with no personal fields.
- `ErasedAccount`: former user ID and erased at, for re-applying erasures
  after a restore.
- `PrivacyRequest`: user, kind (objection, restriction, correction,
  question), text, received at, due at, answered at, answer.
- `RetentionRun`: rule, run at, records erased, records anonymised.
- `Hold`: records covered, reason, set by, ends at.

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `POST /me/export` | Ask for an export (after re-verification) |
| `GET /me/export` | Its status and download link |
| `GET /me/deletion-check` | What is still open before deletion |
| `POST /me/delete` | Delete the account (after re-verification) |
| `POST /me/delete/cancel` | Undo during the waiting period, if question 1 is yes |
| `POST /me/privacy-requests` | Ask about my data |

Console endpoints under `/admin/v1`: privacy requests and answers, holds, and
retention runs.

Domain functions in `packages/domain`: what is open before deletion, what each
category does on deletion, and which records each retention rule covers.

Events: `DataExportRequested`, `DataExportReady`, `AccountDeletionRequested`,
`AccountDeleted`, `PrivacyRequestReceived`, `RetentionRunCompleted`.

## 7. Privacy and safety

- Exports are stored encrypted in the EEA, reachable only by the signed-in
  owner, and deleted after 7 days. The download link is never sent by email
  or SMS, only the news that the file is ready.
- Re-verification by SMS code protects against someone using an unlocked or
  stolen phone.
- Kept records (payments, reports, audit) are listed with their legal basis
  and period in the privacy register; the privacy policy explains them in
  plain words.
- The retention periods marked **verify** in the privacy register, and what
  an export must include about other people, go to the lawyer with the
  privacy policy.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `privacy.title` | Privacy | Persónuvernd |
| `privacy.download` | Download my data | Sækja gögnin mín |
| `privacy.preparing` | We're preparing your file. We'll let you know when it's ready. | Við erum að útbúa skrána. Við látum þig vita þegar hún er tilbúin. |
| `privacy.ready` | Your file is ready. You can download it until {date}. | Skráin er tilbúin. Þú getur sótt hana til {date}. |
| `privacy.delete` | Delete my account | Eyða aðganginum mínum |
| `privacy.deleteOpen` | Before you can delete your account, these need to be settled: | Áður en þú getur eytt aðganginum þarf að ljúka þessu: |
| `privacy.deleteExplain` | Your profile, photos, messages and contact details will be erased. Payment records are kept as the law requires, and reviews you wrote stay as written by a former member. | Prófílnum, myndum, skilaboðum og samskiptaupplýsingum þínum verður eytt. Greiðsluupplýsingar eru geymdar eins og lög krefjast, og umsagnir sem þú skrifaðir standa áfram sem skrifaðar af fyrrverandi notanda. |
| `privacy.deleteConfirm` | Delete my account | Eyða aðganginum |
| `privacy.ask` | Ask about my data | Spyrja um gögnin mín |
| `privacy.askThanks` | Thank you. We'll answer by email within a month. | Takk. Við svörum með tölvupósti innan mánaðar. |
| `chat.messageDeleted` | Message deleted | Skilaboðum eytt |

## 9. Testing

- **Unit (domain):** what blocks deletion and what can be cancelled from the
  deletion screen; the effect on every category in 3.5; which records each
  retention rule covers at the edge of its period; holds keep records past
  their date.
- **API integration:** export and deletion refuse without a fresh code; an
  export holds exactly the expected categories and no other person's data
  beyond first names; after deletion, the account cannot sign in, its
  profile and trips are gone from search, its messages show as deleted, and
  its trips, bookings and payments still add up for the other people and
  the ledger; only one export per 24 hours.
- **Retention job:** runs twice safely; erases or anonymises exactly the
  records past their date; records counts without content; respects holds.
- **Restore drill:** after restoring a backup, the erased accounts list is
  applied again before the system goes live.
- **End to end:** download my data and open both files; delete an account
  with an upcoming booking, cancelling it from the deletion screen.
- **Manual:** the summary page and texts in both languages; the store
  reviewers' deletion path on iOS and Android.

## 10. Out of scope

Data portability straight to another service; letting other people's data be
exported on request; a self-service correction form for trips and payments;
the privacy policy text itself (lawyer, before the beta); usage analytics
consent (spec 12).

## Questions for Martin

| # | Question | Recommendation |
| - | -------- | -------------- |
| 1 | Should deletion wait a few days before the data is erased? | Yes, 7 days. The account is closed and hidden at once, and erased after 7 days unless the person signs in and undoes it. This protects against mistakes and a stolen phone, and app stores accept it when the app says so |
| 2 | Can someone who is suspended delete their account and sign up again with the same phone number? | No. For a suspended account we keep only a one-way fingerprint (hash) of the phone number until the suspension ends, at most 3 years, so the number cannot sign up again. Everything else is erased as usual |
