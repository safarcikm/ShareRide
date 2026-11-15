# Milestone 5 plan: chat and notifications

**Owner:** Martin · **Date:** 2026-11-15 · **Status:** Approved by Martin
(2026-11-15: all three choices in section 3 accepted)

Lets the driver and the passenger reach each other through ShareRide, and
tells them at once when something happens to a booking. It implements
[spec 7](../specs/2026-11-13-chat-and-notifications.md) (chat,
notifications and reminders) for the events that exist after milestone 4:
requests, acceptances, payments, expiries and chat messages. Martin started
it on 2026-11-15, after milestone 4 and the front page.

It builds on milestone 4 (bookings, the test payment provider, deadlines
every minute inside the API), on ADR
[0004](../decisions/0004-backend-modular-monolith.md) (background work in
the same codebase, with a queue in PostgreSQL), on the `SmsSender` port
([ADR 0023](../decisions/0023-sms-with-vonage.md)) and on the ports in
[integrations](../architecture/integrations.md) (`PushSender` through the
Expo push service, `EmailSender` with an EU provider still to choose). One
new ADR chooses the email provider (PR 7, decision 3).

A separate piece of work is reworking the menus, "My rides", sign-up and the
end of booking (the UX proposals of 2026-11-15, PR 46 and after). This plan
stays out of those screens: the Messages tab waits for the new tab bar, the
Settings additions go where its layout puts them, and the prompt to turn on
notifications is a block that the new finish screens can hold.

## 1. Goal

When this milestone is done, on the web and on an Android development build:

- Once Anna's passenger has paid, both open the conversation from the
  booking or the Messages tab and write to each other. "I'm running 10
  minutes late", sent by Anna in Icelandic, reads in English on the
  passenger's phone. The sender sees "Seen" once it is read.
- Anna sends "I'm at the meeting point" to all her passengers at once; each
  gets it in their own conversation, and nobody sees the others.
- Anna's phone shows a push the moment someone asks for a seat, and again
  halfway to the request's deadline if she has not answered. The passenger
  gets "Pay now" when accepted, "10 minutes left to pay", and the
  confirmation. A tap opens the right screen.
- Someone without a phone app gets the same news by email (for the rows of
  spec 7, 3.3 that say so), and an email when a chat message has waited
  unread for 15 minutes, without its text.
- Both get a reminder at 18:00 the evening before and an hour before, and
  can turn trip reminders off in Settings.
- Every notification is recorded per person and channel, sent at most once,
  and retried for up to an hour when a provider fails.

## 2. Scope

| In milestone 5 | Later |
| -------------- | ----- |
| Chat (spec 7, 3.1) and message all passengers (3.2), rules R7.1 to R7.5 | Blocking makes a chat read-only, reporting a message (spec 9) |
| The whole notification catalogue (3.3) and the SMS window (3.4) as domain rules, with a test per row | SMS for last-minute news: all four of its events come from spec 6 (cancellations, departure moves) or the operator (meeting points), so the SMS channel is wired when the first of them exists |
| Delivery (3.7): the outbox, the worker, unique keys, retries, the delivery log kept 90 days | The operator console's view of the log (spec 10) |
| Push through Expo on Android and iPhone builds; email with a provider in the EU; the unread messages email (3.6.3) | Web push (spec 7, out of scope); iPhone push waits for the Apple account, as the iPhone builds do |
| Notifications for the events of spec 5 and the chat: new request, halfway, pay now, 10 minutes to pay, confirmed, declined, expired, withdrawn, window ended unpaid, new message | Departure moved, stops or car changed, cancellations (spec 6); refunds and payouts (spec 13); meeting point moved or paused (spec 2, from the console) |
| Reminders (3.5) and the Trip reminders switch (3.6.1); the prompt to turn on notifications or add an email (3.6.2) | The beta news switch, with beta access (spec 10 and 12); system lines for spec 6's changes |
| Adding and verifying an email in Settings (spec 1, needed for email to reach anyone) | Deleting messages with the account (spec 11); the 12-month deletion runs in the clean-up from this milestone |

## 3. Decisions for Martin

| # | Choice | Decision (accepted) | Why | Alternative |
| - | ------ | -------------- | --- | ----------- |
| 1 | Where conversations live | **A fifth tab, "Messages"**, with the unread count as its badge, added once the new tab bar is in. Each booking and the driver's trip page also open their conversation | Spec 7 (3.1, item 9) asks for a badge on a tab; the approved four tabs (Find, My rides, Offer, Profile) have no place for it, and the UX work confirms a fifth tab fits | No tab: conversations only from each booking and trip, with the unread count on "My rides". One less tab, but a message is harder to find |
| 2 | Where notifications are sent from | **Inside the API process**, every 5 seconds, from our own outbox and job tables in PostgreSQL. A setting (`WORKER=off`) lets a separate worker service take over later without code changes | ADR 0004's queue in PostgreSQL, with no new service to pay for or library to add; staging's API is always on. Writing the event in the same transaction as the booking is plain SQL with our tables | A separate Render background worker now (another always-on service), or the pg-boss library (a new dependency with its own tables and connection, harder to write to in our transactions) |
| 3 | Which email provider | **Mailjet** (French, owned by Sinch), recorded in a new ADR in PR 7. Data is stored in the EU, open and click tracking can be turned off for each message (R7.9 forbids both), and the free plan sends 200 emails a day. It needs a domain of ours for SPF, DKIM and DMARC; until Martin has one, emails go only to the development outbox, and staging sends none | Fits ADR 0007's EEA hosting and R7.9; free at beta volumes | Scaleway Transactional Email (French, EU data, 300 emails a month free; its tracking to be checked). Brevo was ruled out: its transactional tracking can be turned off only for Enterprise customers ([Brevo community](https://community.brevo.com/t/no-way-to-disable-by-option-tracking-in-transactional-e-mail/201)) |

Settings start as values in the domain package, as in milestone 4:
`chat_close_after` 7 days, `reminder_evening_at` 18:00,
`reminder_before_boarding` 60 minutes, `sms_window` 24 hours,
`unread_email_after` 15 minutes (at most once an hour per conversation),
`chat_rate_limit` 10 a minute, `sms_daily_limit` 5, the pay reminder 10
minutes before the payment deadline, retries for up to 60 minutes, the
delivery log kept 90 days and messages 12 months after the trip.

## 4. Design notes

### 4.1 Rules (domain)

Pure functions in `packages/domain/src/chat/` and
`packages/domain/src/notifications/`, with unit tests:

- `chat/settings.ts` and `notifications/settings.ts`: `ChatSettings`
  (`closeAfterDays: 7`, `messageMaxLength: 1000`, `rateLimitPerMinute:
  10`) and `NotificationSettings` (`reminderEveningAt: { hour: 18, minute:
  0 }`, `reminderBeforeMinutes: 60`, `smsWindowHours: 24`, `smsDailyLimit:
  5`, `unreadEmailAfterMinutes: 15`, `unreadEmailEveryMinutes: 60`,
  `payReminderBeforeMinutes: 10`, `retryForMinutes: 60`), with their
  defaults.
- `chat/conversation.ts`: `conversationWindow({ confirmedAt, arrivesAt },
  settings) → { opensAt, closesAt }` (closes 7 days after the trip's last
  planned stop) and `canWrite(window, now)`; closed exactly at `closesAt`.
- `chat/messages.ts`: `quickMessageKeys` (`late` with `lateMinutes` 5, 10,
  15 or 30; `atPoint`, `onMyWay`, `whereAreYou`, `seeYou`, `thanks`),
  `systemLineKeys` (`opened` for now) and `checkMessage(input, settings) →
  Result<MessageBody, MessageProblem>`: problems `empty` (only spaces),
  `too_long` (over 1 000 characters, counted as the booking message is),
  `unknown_quick_message`, `invalid_minutes`. Free text keeps phone
  numbers, emails and links (spec 7, decision 3).
- `notifications/catalogue.ts`: `notificationKinds` with their
  `notificationRules` (push yes or no, email `always`, `fallback` or
  `never`, SMS yes or no), one or more kinds per row of 3.3;
  `notificationsFor(event)` gives each kind and whether it goes to the
  driver or the passenger; `channelsFor(kind, recipient, now, settings)`
  says, per channel, send or skip with the reason (`no_device`,
  `no_email`, `has_push`, `no_phone`, `outside_sms_window`, `sms_limit`).
  SMS goes only to passengers, from 24 hours before boarding until
  boarding, at most 5 a day (`startOfIcelandDay` in `time.ts` starts the
  day).
- `notifications/schedule.ts`: `reminderTimes({ startsAt, since },
  settings)` gives the reminders still to come for a boarding or a
  departure, each `{ which, at }`: 18:00 the day before in
  `Atlantic/Reykjavik` (with `inIceland` and `fromIceland`) and 60 minutes
  before. A reminder whose time has passed at `since` is skipped. Also
  `requestHalfwayAt`, `payReminderAt` (none for a window of 10 minutes or
  less) and `unreadSummaryAt` (15 minutes after the message, an hour after
  the last summary).

Quick messages and system lines are stored as keys with parameters and put
into words by whoever shows them: the app in its language, the worker in
the recipient's (`users.locale`, ADR 0011), both with `@shareride/i18n`.

### 4.2 Chat on the server

- Tables (migration 0007): `conversations` (`booking_id` unique,
  `opened_at`, `closes_at`) and `messages` (`conversation_id`, `sender_id`,
  empty for a system line, `kind` `text`, `quick` or `system`, `body`,
  `key` and `params` for quick and system ones, `client_id`, `sent_at`,
  `read_at`). A message's `client_id` is unique per conversation and sender,
  so a retry stores nothing new. Checks mirror the domain: 1 to 1 000
  characters, the kinds.
- **Opening:** milestone 4 confirms a booking in three places (a free
  instant booking, accepting a free request, a successful payment). They
  call one `confirmBooking(tx, …)` in the bookings module, which sets the
  status, opens the conversation with its first system line
  (`chat.opened`) and, from PR 5, writes `BookingConfirmed` to the outbox,
  all in the same transaction.
- **Who may read and write:** the booking's driver and passenger only
  (R7.3); anyone else gets 404, as for the booking. Writing after
  `closes_at` gets 409 `chat_closed`.
- **Rate limit (R7.5):** sends with different client ids by the same person
  in the last minute, counted in the database so it holds with more than one
  API instance; 429 `too_many_messages` after 10. A message to all
  passengers counts once.
- **Message all passengers (R7.4):** one message per confirmed passenger's
  conversation, with the same client id, in one transaction. A passenger
  confirmed later does not get it.
- **Seen:** reading marks the other person's messages read up to the one
  given. A message shows "Seen" once its `read_at` is set. System lines are
  never unread.
- **Retention:** the hourly clean-up deletes conversations, with their
  messages, 12 months after their trip's planned arrival (privacy register).

Endpoints (`/v1`), shapes in `packages/contracts/src/chat.ts`:

| Method and path | Answers |
| --------------- | ------- |
| `GET /me/conversations` | One row per conversation the person is in: booking, trip date, part, the other person's first name and photo, the last message, the unread count, closed or not; newest message first. Also the total unread, for the badge |
| `GET /bookings/{id}/messages?before=` | Up to 50 messages, newest first; the request message from the booking, the safety tip's place and `closesAt` with the first page |
| `POST /bookings/{id}/messages` | `{ clientId, text }` or `{ clientId, quick: { key, params } }`; 201 the message, 200 the same message on a retry, 409 `chat_closed` or `not_confirmed`, 429 `too_many_messages`, 400 for the checks |
| `POST /bookings/{id}/messages/read` | `{ upTo }`, a message ID; 204 |
| `POST /trips/{id}/messages` | The driver only; the same body; `{ sent }`, the number of conversations it reached |

### 4.3 Chat in the app

- **Conversation** (`src/app/messages/[bookingId].tsx`): the safety tip at
  the top (`chat.safetyTip`), the request message if there was one, then the
  messages, mine on the right, with times and "Seen" under my last read
  one; system lines centred; quick messages as chips above the field (the
  `late` one asks for the minutes), and the field with a 1 000 character
  counter near the limit. While open it fetches new messages every 5
  seconds (3.1, item 10) and marks them read. A message that fails to send
  stays in the list as "Not sent. Tap to try again" and keeps its client id.
  Read-only after closing: `chat.closed` in place of the field.
- **Conversations list** (`src/app/messages/index.tsx`): rows of 3.1, item
  9, with the unread count; an empty state that says chats open once a
  booking is confirmed. The badge's total is fetched when the app comes to
  the front, when a push arrives and, on the web, every minute while the
  page is visible.
- **Entry points:** "Message {driver}" on a confirmed booking's details,
  "Message" by each passenger and "Message all passengers" on the driver's
  trip page (`src/app/drive/trips/[id]/message.tsx`). The Messages tab is
  added to the new tab bar once it merges (decision 1).
- Screen readers: each message is read as one item ("Anna, 08:12: I'm on my
  way. Seen"); new messages are announced while the conversation is open.

### 4.4 Delivery

- Tables (migration 0008): `outbox_events` (`kind`, `payload` with IDs
  only, `created_at`, `processed_at`); `notifications` (`recipient_id`,
  `kind`, `booking_id`, `trip_id`, `unique_key` unique, `created_at`);
  `notification_deliveries` (`notification_id`, `channel`, `status`
  `queued`, `sending`, `sent`, `failed` or `skipped`, `attempts`,
  `next_attempt_at`, `provider_ref`, `reason`, `sent_at`; unique per
  notification and channel); `scheduled_notifications` (`key` unique,
  `kind`, the booking, trip or conversation, `run_at`, `done_at`);
  `push_tokens` (`session_id` unique, `user_id`, `platform`, `token`,
  `updated_at`); `notification_preferences` (`user_id`, `reminders`, `beta_news`, both on by
  default). No message text is stored outside `messages` (R7.9).
- **Events:** booking, payment and chat code writes `BookingRequested`,
  `BookingAccepted`, `BookingConfirmed`, `BookingDeclined`,
  `BookingExpired` (with `unanswered` or `unpaid`), `BookingWithdrawn` and
  `MessageSent` in the same transaction as the change. The domain model's
  event list gains `BookingConfirmed` and `BookingWithdrawn`.
- **The worker** (`apps/api/src/modules/notifications/worker.ts`), every 5
  seconds with `startRepeating`, unless `WORKER=off`:
  1. Takes up to 50 unprocessed events (`FOR UPDATE SKIP LOCKED`) and, in
     the same transaction, turns each into notifications (one per person,
     `unique_key` from the event and the person) and their deliveries, and
     schedules what follows from it (the halfway and pay reminders, the trip
     reminders, the unread email check). A second run, or a second
     instance, finds nothing new to insert.
  2. Turns due scheduled notifications into notifications the same way,
     after checking they still apply: the request is still open, the
     booking is still unpaid or still confirmed, the message still unread,
     reminders still on.
  3. Sends due deliveries: claims each (`sending`, with a two-minute lease),
     renders it in the recipient's language and local time, and calls the
     port. Success stores the provider's reference; a clear failure goes
     back to `queued` with backoff (30 seconds, doubling) until an hour has
     passed, then `failed`. A lease that runs out, because the process
     stopped in the middle of a send, becomes `failed` and is not sent
     again, so nobody gets the same thing twice (R7.6).
- **Channels:** push to every push token of the person whose session has
  not ended; email to the verified address, `always` or as the `fallback`
  when the person has no such push token at the time of sending. A channel
  that cannot be used is stored as `skipped` with the reason (`no_device`,
  `no_email`, `email_off`), so "nobody told me" can be checked.
- **Ports** in `apps/api/src/platform/`: `PushSender.send(messages) →
  tickets` and `receipts(ids)`, `EmailSender.send({ to, subject, text,
  html, idempotencyKey })`. Fakes record what was sent, for tests and for
  the browser journeys. The e2e test API exposes them as the SMS outbox is.
- **Clean-up:** notifications and deliveries go after 90 days, processed
  events after 7, in the hourly clean-up.

### 4.5 Push

- **Server:** the Expo push service over `fetch`, no SDK
  (`https://exp.host/--/api/v2/push/send`, batches of up to 100, with
  `EXPO_ACCESS_TOKEN` when set). A ticket or, 15 minutes later, a receipt
  that says `DeviceNotRegistered` removes the token. `PUT
  /me/sessions/{id}/push-token` (`{ token }` or `{ token: null }`, only for
  the session making the request) stores or removes it; the spec's
  `/me/devices/{id}` path becomes this one, since signed-in devices are
  sessions in the API. Signing out, from one device or all, removes the
  tokens of the sessions it ends.
- **App:** `expo-notifications` (a new runtime dependency: the only way to
  get an Expo push token and handle taps). Permission is asked at the
  prompt (4.7), not at start. Once given, the token is registered at each
  start and when it changes. A tap opens the notification's path (a
  booking, a trip, a conversation), from a cold start too. A push for the
  conversation already open refetches it instead of showing a banner.
- **Limits:** Expo Go cannot receive push since SDK 53, so trying it needs
  the Android development build with Firebase Cloud Messaging credentials
  (section 7). Without the expo.dev project ID the app skips registering
  and says nothing.

### 4.6 Email

- An ADR chooses the provider (decision 3), and `EMAIL_PROVIDER` selects it:
  `mailjet` (refused without its keys), `dev` (the development outbox,
  printed in the API terminal; refused in production) or `none` (deliveries
  `skipped` with `email_off`; staging until there is a domain). Every
  message is sent with tracking off.
- Templates in `apps/api/src/modules/notifications/templates/`: subject,
  plain text and simple HTML without images, in Icelandic and English, with
  a footer that will carry the company's details (spec 13). Links go to the
  web app (`WEB_APP_URL`) without tracking.
- **Adding an email** (spec 1): `PUT /me/email` sends a link valid for 24
  hours; `POST /email-verifications` with its token sets the address as
  verified, signed in or not. "Add an email" sits under "Your account" in
  Settings, where the new Settings layout puts it.
- **Unread messages:** 15 minutes after a message, if it is still unread
  and its reader has no push token, one email "You have unread messages
  about your trip on {date}", at most once an hour per conversation, without
  the text (R7.9).

### 4.7 Reminders and settings

- Reminders are scheduled when a booking is confirmed (passenger) and when
  a trip gets its first confirmed passenger (driver), keyed by booking or
  trip and kind, so a departure move (spec 6) replaces them. At send time a
  reminder is dropped if the booking has ended, reminders are off, or, for
  the driver, nobody is booked any more.
- The texts follow 3.5: time, where to get in, driver and car for the
  passenger; passengers and where each gets in and out for the driver, with
  "Add your number plate" while it is missing. "Directions" opens the
  meeting point page.
- `GET /me/notification-settings` and `PATCH` (`{ reminders }`). Settings
  gets a "Notifications" group between Language and "Your account": the
  Trip reminders switch and `settings.alwaysOn` under it.
- **The prompt (3.6.2):** after booking, posting a trip or being accepted,
  someone with no push token on this device and no verified email is asked
  once per occasion: on a phone "Turn on notifications" (then the system's
  question) or "Add an email"; on the web "Add an email". "Not now" closes
  it. It is one block (`NotificationsPrompt`) that the finish screens of the
  UX work can hold.

## 5. Pull requests and tasks

Tests come first in every task. Each PR updates the docs it touches, runs the
browser journeys, and gets a code review before it opens. Tick tasks as they
merge.

### PR 1: `docs(plans)`: this plan

- [x] This plan, the roadmap and the plans index

### PR 2: `feat(chat)`: chat and notification rules in the domain

- [x] The settings; `chat/conversation.ts` (open at
      confirmation, closed exactly 7 days after arrival);
      `chat/messages.ts` (1 and 1 000 characters, 1 001 refused, only spaces
      refused, every quick message and the four late minutes)
- [x] `notifications/catalogue.ts`: a test per row of 3.3 for who is told
      and on which channel; the SMS window at 24 hours exactly and one
      minute more, a driver never, the sixth SMS of a day refused
- [x] `notifications/schedule.ts`: confirmed at 17:59 and 18:01 the day
      before; confirmed 59 and 61 minutes before boarding; departing just
      after midnight; the halfway, pay and unread email times
- [x] Quick message and system line texts in both languages
      (`packages/i18n`), rendered for each key
- Verify: `pnpm --filter @shareride/domain test`

### PR 3: `feat(chat)`: conversations on the server

- [ ] Contracts, migration 0007 (conversations, messages) with its checks
- [ ] `confirmBooking` shared by the three ways a booking is confirmed;
      each opens one conversation with `chat.opened`
- [ ] The endpoints of 4.2: only the two people (a third gets 404); closed
      at `closes_at` (409); the same client id twice stores one message;
      the eleventh message in a minute refused (429); read up to a message;
      message all reaches each confirmed passenger and nobody else
- [ ] Clean-up after 12 months; privacy register and inventory: messages

### PR 4: `feat(chat)`: chat in the app

- [ ] The conversation, the list, the entry points, message all; Seen,
      quick messages, the safety tip, read-only, "Not sent" with retry
- [ ] The Messages tab with its badge, if the new tab bar has merged (else
      a short follow-up PR once it has)
- [ ] Texts in Icelandic and English (spec 7, section 8, plus new ones)
- Verify: a browser journey with two people: the passenger books and pays,
  both write, a quick message sent in Icelandic reads in English, "Seen"
  appears, at phone and desktop sizes

### PR 5: `feat(notifications)`: outbox, worker and delivery log

- [ ] Migration 0008; events written in the booking, payment and chat
      transactions (a rolled-back booking leaves no event)
- [ ] The worker of 4.4 with fake senders: an event processed twice, and by
      two workers at once, gives one notification per person and channel;
      retries with backoff, then `failed`; a lost lease is not resent;
      `skipped` with its reason
- [ ] Push and email texts for the spec 5 rows and new messages, in both
      languages; the halfway and pay reminders, dropped once answered or
      paid
- [ ] `WORKER=off`; clean-up after 90 days; architecture overview, domain
      model events, privacy register (notification log)

### PR 6: `feat(notifications)`: push

- [ ] Expo push adapter (`fetch`), tickets and receipts, invalid tokens
      removed; `PUT /me/sessions/{id}/push-token`; sign-out removes tokens;
      a token of an ended session is never sent to
- [ ] `expo-notifications` in the app: register, refresh, tap routing (cold
      start too), refetch an open conversation
- [ ] Integrations doc, privacy inventory (push tokens, Expo as a
      processor), spec 7's push token path; the development build runbook
      gets the Firebase step
- Verify: unit and screen tests with Expo's module mocked; Martin's check
  on the Android development build (section 7)

### PR 7: `feat(notifications)`: email

- [ ] The ADR (decision 3); `EmailSender`, the Mailjet adapter over `fetch`
      with tracking off, the development outbox, `EMAIL_PROVIDER` checks in
      the config, a contract test that needs its keys (not in CI)
- [ ] Templates in both languages; fallback only without a push token;
      the unread messages email, at most once an hour per conversation
- [ ] Adding and verifying an email: API, Settings ("Your account") and the
      link's screen
- Verify: a browser journey adds an email, opens the link from the
  development outbox, and gets the "Pay now" email after a request is
  accepted

### PR 8: `feat(notifications)`: reminders and settings

- [ ] Passenger and driver reminders with their texts; dropped when the
      booking ends or reminders are off; replaced by key
- [ ] `GET` and `PATCH /me/notification-settings`; the "Notifications"
      group in Settings
- [ ] `NotificationsPrompt` on the finish screens of booking and posting,
      and when a request is accepted
- Verify: an integration test with a fake clock sends the evening and the
  hour reminders once each; a browser journey turns reminders off

## 6. Review focus

What the spec implies and a person would meet first, each with its test:

1. **The worker runs twice, or on two API instances at once:** each person
   still gets each notification once per channel (PR 5, the same events
   processed by two workers in parallel against PostgreSQL).
2. **A message sent on a poor connection is retried:** it is stored and
   shown once, and a failed one can be sent again without a double (PR 3,
   the same client id; PR 4, the client id kept across retries).
3. **A phone that was signed out, or whose token is no longer valid, never
   shows someone's news on its lock screen:** pushes go only to tokens of
   sessions still signed in, and invalid tokens go (PR 6, sign-out, idle
   sessions and `DeviceNotRegistered`).
4. **A booking confirmed late in the evening, or an hour before:** no
   reminder for a time that has passed, and no reminder after the booking
   has ended or reminders are off (PR 2 at the edges; PR 8 with a fake
   clock).
5. **Someone who is not in the conversation, or a conversation that has
   closed:** nothing can be read or written (PR 3: a third person, the
   driver of another trip, and exactly 7 days after arrival).

## 7. Martin's steps

1. Accept or change the choices in section 3 (done: all accepted on
   2026-11-15).
2. Try each PR on the web as it merges: two browsers (or one private
   window) let two people chat.
3. For push on Android, before PR 6 can be tried: the expo.dev project ID
   (still to come from milestone 2), a Firebase project whose Cloud
   Messaging key (FCM V1) is uploaded to EAS, and an Android development
   build installed on the emulator. The runbook will list each click.
4. For email beyond the development outbox: a domain for ShareRide, a
   Mailjet account with the domain's SPF, DKIM and DMARC records, and its
   keys in Render's secret store. Until then, staging sends no email.

## 8. Risks

- **Push cannot be checked in CI or on the web:** the fake sender covers the
  logic; the real path is checked by hand on the Android build. iPhone push
  waits for the Apple account.
- **No email until there is a domain:** people on the web without an email
  see changes only in the app (counts, the badge, the booking). The prompt
  asks them to add one once there is a sender.
- **Work inside the API process:** sending runs between requests; beta
  volumes are small, and `WORKER=off` with a worker service is the way out.
  Polling every 5 seconds runs only while a conversation is open.
- **Overlap with the UX work:** the Messages tab, the Settings group and the
  prompt wait for, or fit into, the new tab bar, Settings and finish
  screens; that work is told before any of its screens change.

## 9. Definition of done

All eight PRs merged with green CI; Martin has chatted between two accounts
on the web, received a push on the Android development build and opened it,
and seen an email in the development outbox (or in his inbox once there is a
domain); docs, roadmap and CHANGELOG are updated.
