# Spec 7: Chat, notifications and reminders

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved (2026-11-13)

Features: F1 Chat, F2 Notifications, E1 Reminders
([features](../product/features.md)). Related: [spec 5](2026-11-13-booking-and-requests.md)
(booking), [spec 6](2026-11-13-changes-and-cancellations.md) (changes and
cancellations), [spec 13](2026-11-13-payments.md) (receipts and payouts),
[spec 2](2026-11-13-meeting-points.md) (meeting points),
[integrations](../architecture/integrations.md) (push, email and SMS).

## 1. Problem and goal

A shared ride works only if the two people can find each other and hear at
once when something changes. Phone numbers are never shared by the app
(features decision 8), so the chat and the notifications are the only way the
driver and the passenger reach each other through ShareRide.

Goal: one simple chat per booking; every booking and trip event reaches the
right people in their language, by push and email, and by SMS when someone
could otherwise be left waiting at a meeting point; reminders the day before
and an hour before bring people to the right place on time. SMS stays rare to
keep its cost down.

## 2. User stories

- As a passenger with a confirmed seat, I message the driver to say I have a
  large bag.
- As a driver running late, I tap "I'm running 10 minutes late" once and every
  passenger gets it in their own language.
- As a driver, I get a push the moment someone asks for a seat, so I can answer
  before the request expires.
- As a passenger, I get a text message if my trip is cancelled the evening
  before, even if I turned push off.
- As a passenger, the evening before I get a reminder with the time, the
  meeting point and directions to where to stand.
- As a user, I can turn trip reminders off, but I can't miss a cancellation by
  accident.

## 3. Behaviour

### 3.1 Chat (F1)

1. Each booking has one conversation, between the driver and that passenger
   only. It opens when the booking is confirmed (paid, or accepted for a free
   trip; spec 5). Before that, the request message (spec 5) is the only text
   that passes between them; it is shown at the top of the conversation.
2. **Messages** are text only, 1 to 1 000 characters. Quick messages give one
   tap answers: "I'm running {5, 10, 15 or 30} minutes late", "I'm at the
   meeting point", "I'm on my way", "Where are you?", "See you soon", "Thank
   you!". A quick message is stored as a key and shown in the reader's
   language, so a driver writing in Icelandic reaches a passenger reading
   English. Free text is shown as written.
3. **System lines** in the conversation record what happened to the booking:
   confirmed, departure changed from 08:00 to 08:20, stop added, car changed,
   cancelled with the reason (spec 6). They are shown in the reader's language.
4. The sender sees "Seen" once the other person has opened the conversation.
5. A safety tip is pinned at the top: pay only in the app, and ShareRide never
   asks for card details in a chat.
6. Phone numbers, email addresses and links can be sent in the chat, since
   the booking is already paid and people may need to call each other at the
   meeting point (decision 3). Requests and trip notes stay free of them
   (specs 3 and 5).
7. **Closing:** the conversation becomes read-only 7 days after the trip's
   planned arrival, whether the trip happened or was cancelled (decision 2). Both people can still read it until it is deleted with the
   rest of the trip's messages, 12 months after the trip
   ([privacy](../compliance/privacy-gdpr.md)).
8. Reporting a message and blocking a person are spec 9. Blocking makes the
   conversation read-only at once.
9. **Conversations list:** one row per booking, with the trip date, route,
   the other person's first name and photo, the last message and an unread
   count. A badge on the tab shows the total unread.
10. While a conversation is open, the app fetches new messages every 5 seconds
    and as soon as a push for that conversation arrives; otherwise it relies on
    push. A live connection can replace polling later if usage needs it.

### 3.2 Message all passengers (driver)

From the trip or the seat view (spec 6), the driver can send one message to
every confirmed passenger. It is posted as a separate message in each
passenger's own conversation, so passengers never see each other or each
other's replies. Quick messages work here too.

### 3.3 Notifications (F2)

Channels: push to every signed-in device with push turned on; email to the
verified address (spec 1); SMS only as in 3.4. Each notification opens the
right screen in the app (booking, trip, request or conversation).

| Event | Who is told | Push | Email |
| ----- | ----------- | ---- | ----- |
| New request (spec 5) | Driver | Yes | Fallback |
| Request unanswered, halfway to its deadline | Driver | Yes | Fallback |
| Request accepted, or instant booking: pay now | Passenger | Yes | Yes |
| 10 minutes left to pay | Passenger | Yes | No |
| Booking confirmed | Passenger and driver | Yes | Yes; the passenger's email is also the receipt (spec 13) |
| Request declined or expired | Passenger | Yes | Yes |
| Request expired, or withdrawn | Driver | Yes | No |
| Payment window ended unpaid | Passenger and driver | Yes | Fallback |
| Departure moved (spec 6) | Booked passengers | Yes | Yes |
| Stop added or removed, car changed (spec 6) | Booked passengers | Yes | Yes |
| Trip cancelled (spec 6) | Everyone with a booking or request on the trip | Yes | Yes |
| Booking cancelled by the driver | Passenger | Yes | Yes |
| Booking cancelled by the passenger | Driver | Yes | Yes |
| Refund issued (spec 13) | Passenger | No | Yes (refund receipt) |
| Meeting point moved or paused (spec 2) | Driver and passengers who use it on an upcoming trip | Yes | Yes |
| New chat message | The other person | Yes | Summary (3.6) |
| Reminders (3.5) | Passenger and driver | Yes | Fallback for the day-before reminder |
| Payout sent (spec 13) | Driver | No | Yes |

"Fallback" means an email is sent when the person has no device with push
turned on. Changes to seats, price level, booking mode, preferences and the
note send nothing (spec 6). Sign-in codes and account emails are spec 1.

### 3.4 SMS for last-minute news

SMS is only for sign-in codes (spec 1) and for news that could leave someone
waiting at a meeting point (decision 1). It goes only to passengers, and only
within 24 hours of their boarding time, when:

- the trip is cancelled;
- the driver cancels their booking;
- the departure moves by more than 30 minutes;
- their meeting point is moved or paused.

An SMS goes only to the account's verified phone number, in the person's
language, and says only what happened and to open the app. Nobody gets more
than 5 such messages a day.

### 3.5 Reminders (E1)

| Who | When | What |
| --- | ---- | ---- |
| Passenger | 18:00 the day before departure | Date, time and meeting point where they get in, the driver's first name, the car's make, model and colour, and "Directions" |
| Passenger | 60 minutes before their boarding time | The same, shorter |
| Driver | 18:00 the day before | Passengers booked and where each gets in and out; "Add your number plate" if it is missing (spec 3) |
| Driver | 60 minutes before departure | Who gets in where, and the number plate prompt if still missing |

- A reminder is skipped if the booking is confirmed after the time it would
  have been sent, and dropped if the booking ends.
- When the departure moves (spec 6), the reminders move with it.
- "Directions" opens the meeting point page (spec 2) with its photo and "where
  to stand", and from there the phone's map app at the point's location.
- Times are local (`Atlantic/Reykjavik`), as in every notification.

### 3.6 Settings and reaching people

1. Settings (spec 1) has two switches, both on by default: trip reminders,
   and beta news (spec 10).
   Notifications about bookings, trips, payments and messages are always on in
   the app, because other people rely on them. Push can still be turned off in
   the phone's settings; the email fallback then applies.
2. When someone books, posts a trip or is accepted while they have no device
   with push on (for example on the web) and no verified email, the app asks
   them to turn on notifications or add an email. They can skip; they then
   see changes only in the app, plus any SMS from 3.4.
3. **Unread messages by email:** for someone without push, a chat message
   still unread after 15 minutes is summarised by email ("You have unread
   messages about your trip on {date}"), at most once an hour per
   conversation. The email does not include the message text.
4. ShareRide sends no marketing messages in the beta.

### 3.7 Delivery

1. Each domain event (spec 5, 6, 13 and spec 2's meeting point events) is
   written to the outbox in the same transaction as the change. The worker
   turns it into one notification per person and sends it on each channel
   through the `PushSender`, `EmailSender` and `SmsSender` ports.
2. A notification is sent at most once per person and channel, even if the
   worker retries: each has a unique key made from the event and the person.
3. Texts are rendered in the recipient's app language when sent (ADR 0011).
4. A failed send is retried with backoff for up to an hour, then marked
   failed. A push token the push service reports as invalid is removed.
5. The operator console shows, per booking, which notifications were sent,
   on which channel and whether they arrived, so a "nobody told me" complaint
   can be checked (spec 10 for the console).

## 4. Rules

| ID | Rule |
| -- | ---- |
| R7.1 | One conversation per booking, between its driver and passenger only. It opens when the booking is confirmed and becomes read-only 7 days after the trip's planned arrival (decision 2), or at once when either blocks the other. |
| R7.2 | Messages are text, 1 to 1 000 characters, or a quick message key. Quick messages and system lines are shown in the reader's language. |
| R7.3 | Only the two participants can read a conversation. The operator reads it only when a report covers it (spec 9). |
| R7.4 | A driver's message to all passengers is a separate message in each conversation; passengers never see each other. |
| R7.5 | Sending is limited to 10 messages a minute per person. |
| R7.6 | Every event in the catalogue (3.3) reaches each person concerned at most once per channel. |
| R7.7 | Notifications use the recipient's language and local time. |
| R7.8 | Only trip reminders and beta news (spec 10) can be turned off in the app. |
| R7.9 | Notifications never add a phone number, email address, number plate or payment details. A chat message's text appears only in its push, never in an email or SMS. Emails carry no tracking pixels or tracked links. |
| R7.10 | SMS is sent only for sign-in codes and the events in 3.4 (passengers, within 24 hours of boarding), only to a verified phone number, and at most 5 a day per person apart from codes. |
| R7.11 | Reminders follow the trip: they move when the departure moves and are dropped when the booking ends. |

## 5. Screens

1. Conversations list, with unread counts
2. Conversation: messages, system lines, quick messages, safety tip, "Seen",
   read-only state
3. Message all passengers (driver)
4. Notification settings, in Settings (spec 1)
5. Prompt to turn on notifications or add an email
6. Push, email and SMS templates for every row of 3.3 and 3.4, in Icelandic and
   English

Emails are plain and readable without images, with the company's details in
the footer as required for receipts (spec 13).

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)):

- `Conversation`: booking, opened at, closes at.
- `Message`: conversation, sender (empty for a system line), kind (`text`,
  `quick`, `system`), body or key with parameters, client id for safe
  retries, sent at, read at.
- `Notification`: recipient, kind, trip or booking, unique key, created at.
  `NotificationDelivery`: notification, channel (`push`, `email`, `sms`),
  status (`queued`, `sent`, `failed`, `skipped`), attempts, provider
  reference, sent at. Both are kept 90 days.
- `PushToken`: user, signed-in device (spec 1), platform, token, updated at;
  removed at sign-out or when reported invalid.
- `NotificationPreference`: user, reminders on or off, beta news on or off.

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `GET /me/conversations` | Conversations with the last message and unread count |
| `GET /bookings/{id}/messages?before=` | A conversation's messages, newest first, paged |
| `POST /bookings/{id}/messages` | Send a text or quick message, with a client id so a retry never sends twice |
| `POST /bookings/{id}/messages/read` | Mark messages read up to a given one |
| `POST /trips/{id}/messages` | Driver: the same message to every confirmed passenger |
| `PUT /me/devices/{id}/push-token` | Register or refresh the push token of a signed-in device |
| `GET /me/notification-settings`, `PATCH /me/notification-settings` | Read or change the reminders switch |

Domain functions in `packages/domain`: the notification catalogue (event to
recipients and channels, including the SMS window), reminder times for a
booking, when a conversation opens and closes, and message checks. Rendering
and sending live in the worker, behind the ports in
[integrations](../architecture/integrations.md); the email and SMS providers
are chosen in Phase 2 with an ADR each.

Events: `MessageSent`. Reminders are jobs in the queue, keyed by booking and
reminder, and replaced when the trip's time changes.

Settings: `chat_close_after` 7 days, `reminder_evening_at` 18:00,
`reminder_before_boarding` 60 minutes, `sms_window` 24 hours,
`unread_email_after` 15 minutes, `chat_rate_limit` 10 a minute,
`sms_daily_limit` 5.

## 7. Privacy and safety

- Messages are personal data: seen by the two people, by the operator only
  for a report, deleted 12 months after the trip unless part of a report
  ([privacy](../compliance/privacy-gdpr.md)). Deleting an account deletes its
  messages (spec 11).
- Push passes through Expo, Apple and Google, and may show on a locked screen,
  so it carries first names, places and times, but never the details in R7.9.
  The push for a chat message shows its text, which people can hide in the
  phone's settings.
- The notification log keeps who was told what kind of thing, when and on
  which channel, without the text, for 90 days (privacy register:
  notification log).
- Email and SMS providers are processors with a data processing agreement and
  EEA hosting where possible (ADR 0007). Sending domains use SPF, DKIM and
  DMARC ([security](../engineering/security.md)).
- The safety tip and the payment rule (all payments in the app) help against
  scams; spec 9 adds reporting and blocking.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

Icelandic changes the endings of names and places by grammatical case, so the
texts put names and places after a colon or a dot ("label: value") instead of
inside a sentence.

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `chat.title` | Messages | Skilaboð |
| `chat.placeholder` | Write a message | Skrifaðu skilaboð |
| `chat.opened` | Booking confirmed. You can message each other here. | Bókunin er staðfest. Þið getið skrifast á hér. |
| `chat.safetyTip` | Pay only in the app. ShareRide never asks for card details in a chat. | Greiddu aðeins í appinu. ShareRide biður aldrei um kortaupplýsingar í spjalli. |
| `chat.seen` | Seen | Séð |
| `chat.closed` | This chat is closed. You can still read it. | Spjallinu hefur verið lokað. Þú getur enn lesið það. |
| `chat.messageAll` | Message all passengers | Senda öllum farþegum skilaboð |
| `quick.late` | I'm running {minutes} minutes late | Mér seinkar um {minutes} mínútur |
| `quick.atPoint` | I'm at the meeting point | Ég er á mótsstaðnum |
| `quick.onMyWay` | I'm on my way | Ég er á leiðinni |
| `quick.whereAreYou` | Where are you? | Hvar ertu? |
| `quick.seeYou` | See you soon | Sjáumst bráðum |
| `quick.thanks` | Thank you! | Takk fyrir! |
| `notify.newRequest` | New request: {seats, plural, one {# seat} other {# seats}} · {from} – {to} | Ný beiðni: {seats} sæti · {from} – {to} |
| `notify.payNow` | Pay {total} by {time} to confirm your seat | Greiddu {total} fyrir kl. {time} til að staðfesta sætið |
| `notify.payReminder` | 10 minutes left to pay for your seat | 10 mínútur eftir til að greiða fyrir sætið |
| `notify.confirmed` | Booking confirmed: {date} at {time} · {point} | Bókun staðfest: {date} kl. {time} · {point} |
| `reminder.evening` | Tomorrow at {time} · Meeting point: {point} | Á morgun kl. {time} · Mótsstaður: {point} |
| `reminder.hour` | In one hour, at {time} · Meeting point: {point} | Eftir klukkustund, kl. {time} · Mótsstaður: {point} |
| `reminder.driverEvening` | Tomorrow at {time}: {count, plural, one {# passenger} other {# passengers}} | Á morgun kl. {time}: {count, plural, one {# farþegi} other {# farþegar}} |
| `reminder.addPlate` | Add your number plate so passengers can find your car. | Bættu við bílnúmerinu svo farþegarnir finni bílinn. |
| `reminder.directions` | Directions | Leiðarlýsing |
| `settings.notifications` | Notifications | Tilkynningar |
| `settings.reminders` | Trip reminders | Áminningar um ferðir |
| `settings.alwaysOn` | Notifications about bookings, trips, payments and messages are always on, because others rely on them. | Tilkynningar um bókanir, ferðir, greiðslur og skilaboð eru alltaf á, því aðrir treysta á þær. |
| `notifications.turnOn` | Turn on notifications so you hear at once if your trip changes. | Kveiktu á tilkynningum svo þú fáir strax að vita ef ferðin breytist. |
| `notifications.addEmail` | Add an email so we can reach you if your trip changes. | Bættu við netfangi svo við getum látið þig vita ef ferðin breytist. |
| `email.unreadMessages` | You have unread messages about your trip on {date} | Þú átt ólesin skilaboð um ferðina {date} |
| `sms.tripCancelled` | ShareRide: your trip on {date} at {time} is cancelled. Full refund. Details in the app. | ShareRide: Ferðinni {date} kl. {time} hefur verið aflýst. Full endurgreiðsla. Nánar í appinu. |
| `sms.bookingCancelled` | ShareRide: the driver cancelled your booking for {date} at {time}. Full refund. Details in the app. | ShareRide: Bílstjórinn aflýsti bókun þinni {date} kl. {time}. Full endurgreiðsla. Nánar í appinu. |
| `sms.departureMoved` | ShareRide: your trip on {date} now leaves at {time}. Keep it or cancel with a full refund in the app. | ShareRide: Ferðin {date} fer nú kl. {time}. Haltu bókuninni eða afbókaðu með fullri endurgreiðslu í appinu. |
| `sms.meetingPointChanged` | ShareRide: the meeting point for your trip on {date} has changed. Details in the app. | ShareRide: Mótsstaður ferðarinnar {date} hefur breyst. Nánar í appinu. |

## 9. Testing

- **Unit (domain):** every row of the catalogue gives the right people and
  channels; the SMS window at its exact edge; reminder times, including a
  booking confirmed after 18:00 the day before and one confirmed less than an
  hour before boarding; reminders after a departure move; when a conversation
  opens and closes; message length and quick message keys; quick messages
  and system lines rendered in both languages.
- **API integration:** only the two participants can read or write a
  conversation; a read-only conversation refuses new messages; a retried send
  with the same client id is stored once; the rate limit; message all
  passengers reaches each confirmed passenger and nobody else.
- **Worker:** an event processed twice sends once; email fallback when there
  is no push device; an invalid push token is removed; failures are retried
  and then marked failed; the daily SMS limit; reminders replaced on a time
  change and dropped on a cancellation. Fake senders record what was sent.
- **End to end:** booking confirmed, the chat opens and both write; the
  driver cancels the evening before and the passenger gets push, email and
  SMS (fake senders); reminders fire at the right times with a fake clock.
- **Manual:** push on real iOS and Android phones; emails in the common mail
  apps, in both languages; screen reader pass on the conversation screen;
  native speaker review of the Icelandic texts.

## 10. Out of scope

Photos, locations or voice in the chat; automatic translation of free text;
masked phone calls; web push; an in-app notification inbox; live
connections for the chat; marketing messages; review reminders and trip day
(spec 8); reporting and blocking (spec 9); the operator console screens
(spec 10); choosing the email and SMS providers (Phase 2, an ADR each).

## Decisions

Accepted by Martin on 2026-11-13 as recommended.

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Which events also go by SMS? | Only for passengers, and only within 24 hours of their boarding time: trip cancelled, booking cancelled by the driver, departure moved by more than 30 minutes, and their meeting point moved or paused. Everything else goes by push and email |
| 2 | How long does a chat stay open after the trip? | 7 days after the trip's planned arrival, whether it happened or was cancelled, for lost items and settling up. Then read-only |
| 3 | Can people send phone numbers, email addresses and links in the chat? | Yes, once the booking is confirmed. They have already paid in the app and may need to call each other at the meeting point. Requests and trip notes stay free of contact details (specs 3 and 5), and the safety tip stays pinned |
