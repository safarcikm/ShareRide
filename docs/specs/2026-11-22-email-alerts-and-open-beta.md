# Email alerts for web members, and an open beta

**Status:** Approved (2026-11-22) · **Owner:** Martin ·
**Decision:** [ADR 0035](../decisions/0035-open-web-beta-reached-by-email.md) ·
**Changes:** [spec 1](2026-11-13-sign-in-and-profile.md) (decision 5),
[spec 7](2026-11-13-chat-and-notifications.md) (3.3, 3.5),
[spec 8](2026-11-13-trip-day-reviews-and-reliability.md) (3.9),
[spec 12](2026-11-13-beta-access-and-feedback.md) (3.1, 3.2) ·
**Plan:** [email alerts and open beta](../plans/2026-11-22-email-alerts-and-open-beta.md)

## 1. Problem and goal

The beta starts on the web, before the phone apps are in the stores, and a
browser gets no push (milestone 5). Three notifications matter most on a
trip and reach a web member only if they come by email:

- the reminder an hour before the trip;
- "New request" for the driver;
- "How was your trip?" after the trip, which asks for the review.

Today the first and the last are push only, email is optional at sign-up,
and a link in an email opened in a browser that is not signed in lands on
Find and stays there after signing in. Martin also decided (2026-11-22)
that the beta is open to everyone, with no invite code.

Goal: every web member gets these by email, each email's link opens the
screen it is about, also after signing in, and anyone can create an
account. Once the phone apps exist, a member with push gets push instead.

## 2. User stories

- As a passenger on the web, I get an email an hour before my ride with the
  time, the meeting point and "Directions".
- As a driver on the web, I get an email when someone asks for a seat, and
  an hour before I leave with who gets in where.
- As a passenger, the "How was your trip?" email's link opens the rating
  screen, even on a phone where I have not signed in yet.
- As someone who heard about ShareRide, I can create an account without
  an invite code.

## 3. Behaviour

### 3.1 Which notifications go by email

These become **email as a fallback**: sent when the person has no device
with push on, the rule spec 7 already uses for the evening reminder and a
new request (Martin: "to email ... and then as an app notification when we
have it").

| Kind | Who | Before | Now |
| ---- | --- | ------ | --- |
| `reminder_hour`, `reminder_hour_driver` | Passenger, driver | Push | Push, email as fallback |
| `rate_trip`, `rate_trip_driver` | Passenger, driver | Push | Push, email as fallback |
| `request_new` | Driver | Push, email as fallback | No change |

1. Both follow the Trip reminders switch, as now (spec 7, 3.6; spec 8,
   3.7.6). An hour reminder that can no longer be sent in time is dropped,
   as now (`reminderStillTimely`).
2. "How was your trip?" keeps its two moments: when the trip completes,
   and once more after 3 days to those who have not reviewed (spec 8,
   3.7.6). So a web member gets at most two such emails per booking.
3. **Where the links lead.** The passenger's "How was your trip?" opens the
   rating screen of that booking (`/bookings/<id>/rate`), with the link
   "Rate the driver"; the push opens the same screen. The driver's opens
   the trip, where each passenger has "Rate your passenger", with the link
   "Rate your passengers". The hour reminder keeps "Directions" (the
   meeting point) for the passenger and the trip for the driver.
4. Nothing else changes: the other push-only kinds (`pay_reminder`,
   `checked_in`, `review_visible`, `report_closed`, `report_filed`) stay as
   they are.

### 3.2 A link opened before signing in

1. When someone opens a link to a screen that needs an account (a booking,
   the driver's trip, a conversation, a profile) and is not signed in, or
   has sign-up steps left, the app keeps that address on the device and
   opens Sign in.
2. Once they are signed in and the account is ready, the app opens the
   kept address, once. A booking or an offer to drive chosen after the link
   was opened goes first, as now (`navigation/kept-choice.ts`).
3. As for the other kept choices, only the address is kept, in the app's
   own storage, for one hour.
4. A link to someone else's booking or trip shows what it shows today when
   it is not yours ("not found"). A link that is not one of the app's own
   member screens is never kept.

### 3.3 An email at sign-up on the web

1. On the web, step 3 of signing up ("About you", spec 16, 3.5) asks for an
   email when the account has no verified email and no link sent yet. It is
   required there. Google and Apple sign-ups bring a verified email
   (milestone 13), so they are not asked.
2. Pressing the step's button sends the confirmation link (as Settings,
   Email, does today) before the profile is saved; the account is created
   whether or not the link has been opened yet. Until it is opened nothing
   is emailed, and the finish screens still ask to confirm it (spec 7,
   3.6 item 2).
3. If this server sends no email at all (`email_unavailable`, for instance
   local development without a provider), sign-up goes on without it. Any
   other failure shows its error and keeps the answers, like a failed save.
4. The phone apps do not ask: they have push, and email stays optional
   there (spec 1, decision 5).
5. Web members who joined before this are not asked again; the finish
   screens keep asking them.

### 3.4 The beta without invite codes

1. The setting "Invite code required" (`invite_code_required`) is **off by
   default**. With it off, anyone can create an account, and
   `beta_max_testers` does not apply (R12.1, R12.3 as built).
2. The switch stays in the console, so the operator can close sign-ups to
   invited people again if needed, and invite codes keep working when it
   is on. `signups_open` still stops all new accounts in an emergency.
3. The waitlist and emailed personal codes (spec 12, 3.1 and 3.2.1) are
   dropped; group codes stay for the switch.
4. The small "Beta" label stays for everyone until public launch: it no
   longer follows the invite switch.
5. Feedback retention counts from when the switch was last turned off
   (privacy register). Off by default is not a change, so feedback is kept
   as now until the launch, which needs its own end-of-beta moment.

## 4. Rules

| ID | Rule |
| -- | ---- |
| R20.1 | The hour reminder and "How was your trip?" go by email when the person has no device with push on, and only to a verified address. |
| R20.2 | On the web, creating an account asks for an email unless the account already has a verified one or a link waiting. |
| R20.3 | A link to a member screen opened before signing in opens that screen once signing in is done, within an hour. |
| R12.1 (changed) | Creating an account needs a valid invite code only while the operator has "Invite code required" on; it is off by default. |

## 5. Screens

- **Emails:** as every notification email today (subject, words, one link,
  footer; plan 4.6 of milestone 5), with the link words above.
- **About you on the web:** an Email field after the first name, with the
  help "We email you about your rides: requests, reminders and how your
  trip went." and the field error of Settings, Email.

## 6. Data and API

- `packages/domain/src/notifications/catalogue.ts`: the four kinds' email
  rule. No migration: the kinds exist.
- `packages/domain/src/settings/catalogue.ts`: `invite_code_required`
  defaults to 0. `GET /v1/config` answers `beta: true` until launch.
- No new endpoint and no new column: sign-up uses `PUT /v1/me/email`.

## 7. Privacy and safety

- Email is now collected from every web member. Its purpose and retention
  stay as in the privacy register (spec 1); the register's row says it is
  asked at sign-up on the web.
- The reminder emails say what the push says: first names, times, places
  and the car, never a phone number, an email or a number plate (R7.9).
- The kept link is a path such as `/bookings/<id>/rate`, with no name.

## 8. Texts

| Key | English | Icelandic |
| --- | ------- | --------- |
| `review.ratePassengers` | Rate your passengers | Gefðu farþegunum einkunn |
| `onboarding.emailHelp` | We email you about your rides: requests, reminders and how your trip went. | Við sendum þér tölvupóst um ferðirnar þínar: beiðnir, áminningar og hvernig ferðin gekk. |

## 9. Testing

- Domain: the four kinds' channels with and without push; the invite
  setting's default.
- Worker (integration): the hour reminder and both review prompts emailed to
  a web member with a verified email, not emailed to one with push, and not
  sent with Trip reminders off; the passenger's link is the rating screen.
- App: the kept link (kept, taken once, too old, not a member screen); About
  you on the web asks for the email and sends the link before saving.
- Web journey: a trip completes, the passenger opens "How was your trip?"
  from the email in a browser that is not signed in, signs in, lands on the
  rating screen and sends a review.

## 10. Out of scope

- Push on the web (web push).
- Asking existing members for an email.
- Removing invite codes from the code: they stay behind the switch.
- The end-of-beta moment for feedback retention (launch work).
