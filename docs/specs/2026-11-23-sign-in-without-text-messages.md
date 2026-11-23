# Spec 26: Sign in with email or Google; a text message only checks the number

**Owner:** Martin · **Date:** 2026-11-23 · **Status:** Proposed

Decision record: [ADR 0046](../decisions/0046-sign-in-by-email-code-and-text-only-to-check-the-number.md)
(proposed). This spec amends [spec 1](2026-11-13-sign-in-and-profile.md)
(3.2, 3.6, 3.8, R1.2 to R1.5), [spec 11](2026-11-13-privacy-self-service.md)
(R11.1), [spec 19](2026-11-22-google-and-apple-sign-in.md) (3.1, 3.3, 3.4,
R19.3, R19.7) and [spec 7](2026-11-13-chat-and-notifications.md) (R7.10).
Related: [ADR 0016](../decisions/0016-own-sign-in-module.md),
[ADR 0023](../decisions/0023-sms-with-vonage.md),
[ADR 0027](../decisions/0027-email-through-mailjet.md),
[security](../engineering/security.md#sign-in-and-sessions),
[privacy and GDPR](../compliance/privacy-gdpr.md).

## 1. Problem and goal

Martin, 2026-11-23, the day after PuffinRide opened to the public: "we can
send an sms to authorize the number but not for log in, that would bankrupt
me".

Today a person who signs in with their phone number gets a text message
every time, and so does every confirm code (downloading data, deleting the
account, adding Google). Each text costs money; email costs almost nothing.
A sign-up form that sends texts to any number is also what SMS fraud
("SMS pumping") looks for.

**Goal:** a text message goes out only to check a phone number: once, when
an account is made (and, once it is built, when the number changes).
Signing in uses Google (and Apple, once it is set up) or a 6-digit code by
email. No text can be sent without a proven email or Google account first,
and all texts together have a ceiling, so abuse cannot run up the bill.

**Not changed:** every account keeps a verified phone number (R1.1, R1.6,
R19.2), so the people you ride with can still reach you. Members stay signed
in for 60 days after they last used PuffinRide (ADR 0016), so most rarely
see a code at all.

**Not in this spec:** passwords (Martin asked on 2026-11-23; see decision
2), passkeys for members, changing the phone number (spec 1, 3.6, still not
built), Apple (waits for the developer account).

## 2. User stories

- As a newcomer, I type my email, enter the code it gets, give my phone
  number once with a code by text, and write a few words about me.
- As a member, I type my email and enter the code, or continue with Google,
  and I am signed in. No text message.
- As a member who joined with my phone number before this change, I type my
  email (or continue with Google) and give the same number once more; my
  account gets the email, and next time the email is enough.
- As a member who lost access to my email, I sign in with a new email and
  my own number's code; the new email takes the old one's place, and the old
  address is told.
- As a member confirming something sensitive (my data, deleting my account,
  adding Google, changing my email), I get the code by email.

## 3. Behaviour

### 3.1 The sign-in screen (step 1)

1. Spec 19's screen, with the email in place of the phone number:
   "Continue with Google" (when the server has it), then "or with your
   email", an email field and "Send code".
2. Under it, one line for members from before: "Joined with your phone
   number? Use your email or Google, then the same number. It's added to
   your account."
3. A server that sends no email (`EMAIL_PROVIDER=none`, such as a laptop
   without settings) says so in `GET /v1/config` (`emailSignIn: false`):
   the screen then shows Google alone and the line "Sign-in by email is not
   available on this server." (My call: a missing email setting must not
   quietly fall back to texts.)

### 3.2 The email code

1. "Enter the code we emailed to `ana@example.com`", with "Send a new code"
   after 30 seconds and "Change email". The code is checked as soon as six
   digits are in, as the text-message code is today.
2. The email: subject "123456 is your PuffinRide code" (the code in the
   subject, so a phone's notification shows it), and a body with the code,
   "It works for 10 minutes. If you didn't ask for it, you can ignore this
   email." In the person's app language, in the branded layout of
   [spec 24](2026-11-22-branded-emails.md).
3. The code follows R1.2: 6 digits, single use, 10 minutes, 5 attempts.
   Limits in R26.4. The answer to "Send code" is the same whether or not an
   account has the email.
4. Then, by the email:
   - **An account has it as its verified email:** the person is signed in
     and goes on as after a text-message code today: "Keep my account"
     while it waits to be deleted, step 3 while the profile is missing, the
     terms when they changed.
   - **No account has it:** "Add your phone number" (3.3).

### 3.3 Add your phone number (step 2)

1. Spec 19's phone step, with the email's line on top: "Signed in as
   `ana@example.com`. We text you a code once, so the people you ride with
   can reach you. Next time your email is enough." After Google, spec 19's
   lines stay.
2. The text-message code: as today (R1.2), under the limits of R26.2 and
   R26.3.
3. Then, by the number:
   - **No account has it:** the account is made with the number and the
     email, both verified, and step 3 opens.
   - **An account has it:** the person is signed in to that account.
     - The account has no email: this one becomes its email. "Next time,
       sign in with `ana@example.com`."
     - The account has another email: the new one takes its place, "Your
       sign-in email is now `ana@example.com`.", and the old address gets an
       email saying so (R26.6). This is also how a person who lost their
       email gets back in.
     - The account has this email already, waiting for its link: it is
       verified now.
     - Another account took the email in the meantime (a race): signed in,
       the email is left as it was.
4. Everything that refuses a sign-up today refuses this one too, with the
   same messages: new accounts paused, texts paused (shown on this step
   only, since step 1 sends no text: "We can't send text messages right
   now, so adding a phone number is paused for a short while."), a number
   blocked after a suspended account was deleted (R11.9), and the invite
   code while "Invite code required" is on. When the waiting sign-in runs
   out (item 5), or the Google account turns out to be another member's,
   the person goes back to step 1, which says why.
5. The email sign-in waits 30 minutes for the phone step, as Google's does.
   After that: "That took too long. Start again with your email."

### 3.4 Google and Apple

Unchanged (spec 19, 3.2 and 3.3), except that the phone step now asks for
the text only with the waiting sign-in, under R26.2 and R26.3.

### 3.5 Limits on text messages

Besides R1.3's limits per number (one per 30 seconds, 5 an hour), per network
address (10 an hour) and per country calling code (Iceland 500 an hour and
2 000 a day; any other country 50 an hour and 100 a day):

1. A text code goes only with a waiting email, Google or Apple sign-in
   (R26.2), at most 3 for one waiting sign-in, whatever the numbers. Trying
   many numbers needs many proven email addresses.
2. All sign-in texts together: at most 300 an hour and 1 000 a day (R26.3).
   Past that, the phone step says "Too many codes were asked for. Try again
   later.", and the API logs an error, so the operator hears of it through
   Sentry. (My call on the numbers: far above the first months' sign-ups,
   and about 15 000 kr a day at most; easy to change.)
3. The console's "Text messages" switch (spec 10, 3.3) still stops every
   text but the console's recovery code. Signing in with an email or Google
   goes on; only the phone step, and confirm codes to an account without an
   email, wait. Its help line in the console says so.

### 3.6 Confirm codes by email

1. Downloading data, deleting the account (spec 11, R11.1), adding Google or
   Apple (spec 19, 3.4) and changing the email (3.7) ask for a confirm code
   as today. It goes by email to the account's verified email; only an
   account without one gets it by text.
2. The form says where it went: "We emailed a code to `an•••@gmail.com`." or,
   as today, "We sent a code by text message to your number ending in 34."
   Adding Google or Apple says "To add Google, enter the code we send you."
3. The rules do not change: 10 minutes, 5 attempts, the account's own
   limits.

### 3.7 Changing the email in Settings

The email now signs in, so a new email is a new way into the account, like
Google (R19.3 becomes R26.5):

1. "Change email" in Settings first asks for a confirm code (3.6), then sends
   the link to the new address as today (spec 1, 3.5). The address changes
   when the link is opened, and the old address gets the email of R26.6.
2. Within 30 minutes of the account being made, no code is asked: that is
   spec 20's email at sign-up, which now shows only for the rare account
   without one (Google with an email another account has).

### 3.8 Sign-in methods in Settings

Spec 19's screen lists the email too, with "Change", and its help line
becomes "You sign in with your email or Google. Your phone number gets you
back in if you lose your email." Google and Apple can still always be
removed (R19.7): the number and any email get the person back in (3.3).

### 3.9 Members from before

No data changes. Signed-in members stay signed in. A member with a verified
email signs in with it; one without signs in once through 3.3 (one text), and
has an email from then on.

### 3.10 Other text messages, unchanged

Not sign-in, each with its own cap: the passengers' last-minute changes
(R7.10, at most 5 a day per person), the operator's safety alerts (R9.9) and
the console's recovery code and its notice (spec 22).

## 4. Rules

| ID    | Rule                                                                                                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R26.1 | A person signs in with Google or Apple, or with a code sent to an account's verified email. A phone number alone never signs in; its text code only finishes a waiting email, Google or Apple sign-in (3.3).                                              |
| R26.2 | The app's text codes go only in the phone step of a waiting sign-in, at most 3 for one waiting sign-in, and as confirm codes to an account without a verified email (3.6). Spec 22's console recovery code is unchanged.                                 |
| R26.3 | All sign-in and confirm texts together: at most 300 an hour and 1 000 a day, on top of R1.3. Reaching it is logged as an error.                                                                                                                       |
| R26.4 | An email code follows R1.2. At most one per 30 seconds and 5 an hour per address, 20 an hour per network address; the answer is the same whether or not an account has the email.                                                                       |
| R26.5 | A new way into an account (Google, Apple or a new email) is added only after a code to a way the account already has: the phone step's text code, or a confirm code. The one exception is an email added within 30 minutes of the account being made. |
| R26.6 | When an account's verified email changes, the old address is told by email, with the new address partly hidden. An address never verified is not told.                                                                                                |
| R26.7 | Confirm codes go to the account's verified email, and by text only to an account without one.                                                                                                                                                         |

## 5. Screens

Phone first; on a laptop the same content in the sign-in column (spec 18).

1. **Sign in** (step 1):

   ```text
   Sign in or create an account
   [ G  Continue with Google  ]
   ─────── or with your email ───────
   [ Email                          ]
   [ Send code ]
   We email you a 6-digit code.
   Joined with your phone number? Use your email or Google,
   then the same number. It's added to your account.
   ```

2. **Email code** (still step 1):

   ```text
   Enter the code
   We emailed a 6-digit code to ana@example.com.
   [ 6-digit code ]
   [ Sign in ]
   Send a new code in 0:25
   Change email
   ```

3. **Add your phone number** (step 2): spec 19's screen, with the email's
   line. Then today's text code screen, and step 3, about you.

## 6. Data and API

Data (migration `0062`):

- `verification_codes`: a new purpose, `email_sign_in`, whose key is the
  email's keyed hash instead of the number's (the column `phone_hash` holds
  either). Confirm codes keep the number's hash as their key, whichever way
  they go, so a code sent by email or by text is the same code.
- `email_sign_ins`, new: one email sign-in proven by its code and waiting for
  the phone step: the email, the waiting sign-in's hash (`sr_pe_…`), expires
  30 minutes after the code. Taken and deleted by the phone step; the hourly
  clean-up deletes the rest an hour after they expired.
- `rate_limit_events`: new scopes for the email, its network address, the
  waiting sign-in and all texts together. Keys stay keyed hashes.

Endpoints (`/v1`, shapes in `packages/contracts`):

| Method and path                                   | Change                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /auth/email/start`                          | New: sends the email code. `202` with `resendAfterSeconds`; `email_invalid`, `rate_limited`, `email_failed`, `email_unavailable`                                              |
| `POST /auth/email/verify`                         | New: `signedIn` with tokens, or `phoneNeeded` with the waiting sign-in (`provider: "email"`); the code errors of today                                                         |
| `POST /auth/phone/start`, `POST /auth/phone/verify` | `pendingSignIn` is required (`sr_ps_…` or `sr_pe_…`); a waiting sign-in that is gone gives `provider_expired`. The verify answer gains `emailLink` (`created`, `added`, `replaced`, `in_use`) |
| `POST /me/confirm-code`                           | The answer gains `channel` (`email` or `sms`) and `sentTo` (the email partly hidden, or the number's last two digits)                                                           |
| `PUT /me/email`                                   | Takes `code`, a confirm code, required unless the account was made in the last 30 minutes (3.7)                                                                                |
| `GET /config`                                     | Gains `emailSignIn`                                                                                                                                                            |

Logs: "code emailed" (with its purpose) and "email sign-in waiting for the
phone step", with no address; "sign-in email at the phone step" with the
user ID and the outcome; "email change notice sent" with the user ID; "ceiling
on all sign-in texts reached" as an error.

## 7. Privacy and safety

- **Purpose:** the email, already collected for the account and its
  notices, now also signs in. Nothing new is collected. Fewer numbers go to
  the SMS provider.
- **Storage:** email codes only as a keyed hash; a waiting email sign-in
  holds the address for at most 30 minutes and is deleted an hour after it
  ends. Logs never carry an address, a number or a code.
- **Safety:** whoever controls a member's inbox can sign in as them, as
  with Google; the email-change notice (R26.6) and "Sign out on all devices"
  answer that. Whoever controls a member's number can still get in, with a
  new email and the old address told (3.3), which is no more than signing in
  with the number allowed before. A session alone never adds a way in
  (R26.5).
- **Abuse:** sending texts needs a proven inbox first, and R26.2 and R26.3
  cap what a flood of inboxes can cost.

## 8. Texts

English and Icelandic, in `packages/i18n` (Icelandic to be read by a native
speaker):

| Key                          | English                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.orEmail`               | or with your email                                                                                                                            |
| `auth.email.label`           | Email                                                                                                                                         |
| `auth.email.help`            | We email you a 6-digit code.                                                                                                                  |
| `auth.email.before`          | Joined with your phone number? Use your email or Google, then the same number. It's added to your account.                                   |
| `auth.email.unavailable`     | Sign-in by email is not available on this server.                                                                                             |
| `auth.emailCode.help`        | We emailed a 6-digit code to {email}.                                                                                                         |
| `auth.emailCode.change`      | Change email                                                                                                                                  |
| `auth.email.phoneHelp`       | Signed in as {email}. We text you a code once, so the people you ride with can reach you. Next time your email is enough.                     |
| `auth.email.expired`         | That took too long. Start again with your email.                                                                                              |
| `auth.email.added`           | Next time, sign in with {email}.                                                                                                              |
| `auth.email.replaced`        | Your sign-in email is now {email}.                                                                                                            |
| `email.signInCodeSubject`    | {code} is your PuffinRide code                                                                                                                |
| `email.signInCodeBody`       | Your code is {code}. It works for 10 minutes. If you didn't ask for it, you can ignore this email.                                            |
| `email.confirmCodeSubject`   | {code} is your PuffinRide code to confirm                                                                                                     |
| `email.confirmCodeBody`      | Enter {code} in PuffinRide to confirm the change you asked for. It works for 10 minutes. Never share it. If you didn't ask for it, sign in and check your account. |
| `email.emailChangedSubject`  | Your PuffinRide sign-in email changed                                                                                                         |
| `email.emailChangedBody`     | Your PuffinRide account now signs in with {email}. If this wasn't you, sign in with this address and your phone number to get your account back, then tell us under Send feedback in the app. (Replies to hello@ are refused, ADR 0039.) |
| `confirm.sentToEmail`        | We emailed a code to {email}.                                                                                                                 |
| `settings.signInMethods.confirm` | To add {provider}, enter the code we send you.                                                                                            |
| `error.sms_paused`           | We can't send text messages right now, so adding a phone number is paused for a short while. Try again later.                                 |

## 9. Testing

- **Unit (domain):** the new limits; which way a confirm code goes; hiding
  part of an email; the outcome of an email at the phone step (made, added,
  replaced, in use).
- **API integration:** email code start and verify (unknown and known
  email, wrong, expired, too many tries, limits, a suspended account, one
  waiting to be deleted); the phone step refused without a waiting sign-in;
  3 texts per waiting sign-in; the ceiling on all texts; a new account with
  email and number; an old account getting its first email; an email
  replaced, with the notice to the old address; the race on an email;
  confirm codes by email and by text; changing the email with and without a
  code; the clean-up.
- **App:** the sign-in screens with the fake API; the confirm form's line.
- **Browser journeys (Playwright):** sign up with email and number; sign in
  again on another device with the email code alone, no text; a lost email
  replaced through the phone step, with the old address told; changing the
  email in Settings; confirm codes by email; every journey that signs in now
  uses the email. A member from before (number only) has its API and screen
  tests: the journeys' database has no such member.
- **Manual (Martin):** on staging and then production, a code email arrives
  in Gmail and in another inbox, with the code in the subject.

## 10. Out of scope

Passwords; passkeys for members; changing the phone number (spec 1, 3.6);
Apple (waits for the developer account); a magic link instead of a code.

## Decisions

| #   | Question                                     | Decision                                                                                                                                                                                                                              |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What replaces the text code at sign-in?      | Google, or a code by email (Martin's decision card, 2026-11-23; recommended). Not chosen: Google only; email and password; email code plus passkeys                                                                                     |
| 2   | Passwords?                                   | Not now: a password still needs an email code to reset it, more screens, and a password store to guard; it can be added on top of the email later (my recommendation, 2026-11-23)                                                        |
| 3   | A code or a link in the email?               | A code: it works when the email is read on another device or browser than the app, and it matches the text-message step (my call)                                                                                                     |
| 4   | Which comes first at sign-up?                | The email, then the number: no text can be sent before an inbox is proven (my call)                                                                                                                                                   |
| 5   | A number's account with another email?       | The new email takes its place, and the old address is told: proving the number is what signing in needed before, and it is the way back for a lost inbox (my call)                                                                     |
| 6   | The numbers of R26.3?                        | 300 an hour and 1 000 a day (my call; change in `packages/domain`)                                                                                                                                                                    |
