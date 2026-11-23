# Spec 25: An email to the operator when new members join

**Owner:** Martin · **Date:** 2026-11-23 · **Status:** Approved
(2026-11-23): Martin asked for it and chose the timing of 3.3 on a decision
card; the rest are working choices he can change

Features: H5, beta metrics ([features](../product/features.md)). Adds an
operator notice to the notification catalogue of
[spec 7](2026-11-13-chat-and-notifications.md), next to the alerts of
[spec 9](2026-11-13-safety-and-moderation.md) (R9.9) and
[spec 10, 3.3](2026-11-13-operator-settings-and-metrics.md). No ADR: no new
service, dependency or business rule; email goes through Mailjet
([ADR 0027](../decisions/0027-email-through-mailjet.md)) as every other email.

## 1. Problem and goal

Martin, 2026-11-23, with production open to the public since the day before:
"can i get notifications if we get new users?"

The console counts many things, but nothing tells the operator that someone
joined. In the first weeks every new member matters, and Martin wants to
know soon after it happens.

**Goal:** an operator who asks for it gets an email soon after someone
finishes signing up, and a busy hour (a flyer that takes off) still sends one
email, not dozens.

## 2. User stories

- As the operator, I turn on "Email me when new members join" in the console,
  and the email comes to my own address.
- As the operator, I hear about the first new member within a minute or two.
- As the operator, when many join at once I get one email an hour that says
  how many, not one email each.
- As a member, my name, number and email are not sent to anyone when I join.

## 3. Behaviour

### 3.1 Turning it on

The console gets a page **Emails to you** (`/admin/emails`), in the menu just
above Passkeys. It is the operator's own: each operator chooses for
themselves, and a choice changes nothing for anyone else (R25.1). It holds one
choice for now:

- A checkbox **Email me when new members join**, off at first, with the hint
  "Soon after someone finishes signing up. Anyone who joins in the hour after
  that comes in the next email, so at most one an hour. How many, never who."
- Under it, where the emails go: "Emails go to {address}." When the account
  has no confirmed email address: "Your account has no confirmed email
  address, so nothing can be sent. Add one in PuffinRide under Settings."

Ticking or unticking saves at once and says **Saved.** A save that fails
says so, and the box shows what is stored.

### 3.2 Who counts as new

A member is new when they finish signing up: the moment they confirm they are
18 or older and accept the terms (`age_confirmed_at`, spec 1). Someone who
typed their code but never finished is not counted yet, and is counted when
they finish. An account deleted since is not counted (R25.2).

### 3.3 When the email goes

For each operator who turned it on (R25.3):

1. The email covers everyone who joined since the operator's last email
   about new members, or since they turned it on, whichever is later.
2. It goes as soon as at least one new member is found, except within an hour
   of the last one: then it waits until the hour is over, and covers
   everyone who joined in the meantime.
3. Nobody new, no email.

So the first member after a quiet spell is told within a minute (the worker
looks every few seconds), and a busy day sends at most one email an hour.
Turning it off stops emails not yet sent; turning it on again starts counting
from then.

### 3.4 What the email says

Only how many, since when, and how many members there are now (R25.4):

- Subject: "2 new members on PuffinRide" ("A new member on PuffinRide" for
  one).
- Body: "Since 23 November at 14:02, 2 people have finished signing up.
  PuffinRide has 37 members now."
- Button: **Open the console**, to `/admin`.
- Footer: "You get this email because you turned on emails about new members
  in the PuffinRide console. Turn them off there, under Emails to you."

By email only: no push and no text message (R25.5). It follows the console's
email switch like other news (spec 10, 3.3): while email sending is off it
waits.

## 4. Rules

- **R25.1** The email about new members is a choice of each operator, off by
  default, kept with their notification settings.
- **R25.2** A new member is an account that finished signing up (confirmed
  the age and accepted the terms) and has not been deleted.
- **R25.3** At most one email about new members an hour to each operator,
  sent as soon as there is someone new and the hour since the last one is
  over; each covers everyone since the last one, or since it was turned on.
- **R25.4** The email says how many joined, since when, and the number of
  members, never who: no name, number, email or ID (as R9.9 for reports).
- **R25.5** By email only, to the operator's confirmed address.

## 5. Screens

**Emails to you** is a console page in the narrow column, like Passkeys: the
title, a line "Only for you: each operator chooses their own.", then the
checkbox with its hint and the line about the address. Phone and laptop look
the same.

## 6. Data and API

- `notification_preferences.new_members_since` (timestamptz, empty for off):
  when the operator turned it on. Migration 0061, which also adds the kind
  `new_members` to the checks.
- Notification kind `new_members`, an operator notice: email always, no push,
  no SMS. Its period is worked out when it is sent: from the later of
  `new_members_since` and the operator's previous `new_members` notification,
  to its own creation.
- The rule of 3.3 in the domain: `newMembersPeriod` in
  `packages/domain/src/notifications/new-members.ts`.
- `GET /admin/v1/me/emails` and `PUT /admin/v1/me/emails`
  (`{ newMembers: boolean }`), both answering `{ newMembers, address }`.

## 7. Privacy and safety

- The email holds counts and a time, no personal data about the new members
  (R25.4). The notification log keeps, as for every notification, the
  recipient, the kind and the delivery, no text.
- The operator's choice and when they made it are their own notification
  settings: in the privacy register's row, in Download my data
  (`newMemberEmailsSince`), erased with the account.
- An account that loses the operator role gets no more of these emails, even
  ones already waiting.

## 8. Texts

| Key | English | Icelandic |
| --- | ------- | --------- |
| `notify.newMembers` | A new member on PuffinRide; 2 new members on PuffinRide | 1 nýr notandi á PuffinRide; 2 nýir notendur á PuffinRide |
| `notify.newMembersBody` | Since {when}, 2 people have finished signing up. PuffinRide has 37 members now. | Frá {when} hafa 2 lokið skráningu. Alls eru 37 notendur á PuffinRide. |
| `notify.newMembersOpen` | Open the console | Opna stjórnborðið |
| `notify.newMembersFooter` | You get this email because you turned on emails about new members in the PuffinRide console. Turn them off there, under Emails to you. | Þú færð þennan póst því þú kveiktir á pósti um nýja notendur í stjórnborði PuffinRide. Þú slekkur á honum þar, undir Tölvupóstur til þín. |
| `admin.emails.title` | Emails to you | Tölvupóstur til þín |

Counts use the plural forms of each language: Icelandic takes the singular
after 1, 21, 31 and so on ("21 nýr notandi").

The rest of the page's words are in `packages/i18n` under `admin.emails.*`,
in both languages.

## 9. Testing

- Domain: `newMembersPeriod` for the first email, within the hour, after the
  hour, and a choice made after the last email.
- API, against the database: nothing while off; the first email within a run
  of someone finishing; nobody counted who has not finished; a second member
  within the hour waits, then both come in one email after it; nobody new, no
  email; turned off, a waiting email is not sent; no role, no email; no
  confirmed address, skipped as `no_email`; the routes save and answer.
- Console: the page is in the menu, ticks and saves, says where the email
  goes, warns without an address, and says when a save fails.

## 10. Out of scope

- Who joined: a list of the newest members in the console's Users page could
  follow if wanted; the email itself never names anyone.
- Push or text messages for this, a daily summary, or other operator emails.
