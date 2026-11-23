# Spec 27: Passwords, and Face ID or fingerprint (passkeys)

**Owner:** Martin · **Date:** 2026-11-23 · **Status:** Approved (2026-11-23)

Decision records: [ADR 0047](../decisions/0047-member-passwords-hashed-with-scrypt.md)
(passwords) and [ADR 0048](../decisions/0048-member-passkeys-on-the-device-only.md)
(passkeys). This spec builds on [spec 26](2026-11-23-sign-in-without-text-messages.md)
and amends its R26.5 (3.5 here) and [spec 19](2026-11-22-google-and-apple-sign-in.md)'s
Sign-in methods screen (3.6). Related: [ADR 0016](../decisions/0016-own-sign-in-module.md),
[ADR 0028](../decisions/0028-operator-console-web-app-and-passkeys.md) (the
console's passkeys), [security](../engineering/security.md#sign-in-and-sessions),
[privacy and GDPR](../compliance/privacy-gdpr.md).

## 1. Problem and goal

Martin, 2026-11-23, choosing how members sign in: "google, email and
password and then appleid in future and biometrics like fingerprint or Face
ID (can we have that on web?)", and "but no hardware key tho".

After spec 26 a member signs in with Google or with a code by email. Both
need another app open (the inbox, or Google's window). Some people would
rather type a password their browser remembers, and on a phone or laptop
with Face ID, a fingerprint reader or Windows Hello, a glance or a touch is
quicker still.

**Goal:** two more ways in, both optional, on top of spec 26:

1. A **password**, with the account's email as the user name. A forgotten
   password is no problem: the email code still works, and leads to a new
   password.
2. **Face ID or fingerprint**, with a passkey kept on the phone or laptop
   itself (Face ID, Touch ID, an Android fingerprint or face, Windows Hello).
   On the website first: yes, browsers support it on the web. Never a
   separate security key.

**Not changed:** the email code and Google always work, so nobody can be
locked out by a forgotten password or a lost phone. A text message still
only checks a new number (R26.1).

**Not in this spec:** passkeys in the iOS and Android apps (they need the
app builds to declare the domain, decided when the apps ship), Apple
(waits for the developer account), a passkey offered in the email field's
autofill (a later polish), checking passwords against a breach service.

## 2. User stories

- As a member, I type my email and my password, or let my browser fill
  them in, and I am signed in. No email to open.
- As a member on my iPhone or Mac, I press "Face ID or fingerprint" and look
  at my phone, and I am signed in. No email, no password.
- As a newcomer, at the end of sign-up I can set up Face ID or fingerprint,
  or a password, or skip it.
- As a member who forgot my password, I press "Forgot your password?", enter
  the code from my email, and choose a new one.
- As a member, I see my password and my devices under Settings, Sign-in
  methods, and I can change or remove them.
- As a member, if someone adds a password or a device to my account, I get
  an email about it.

## 3. Behaviour

### 3.1 The sign-in screen (step 1)

Spec 26's screen gains a password field and, where the device can, a
button for Face ID or fingerprint:

1. "Continue with Google" (when the server has it), then **"Face ID or
   fingerprint"** on a browser whose device has a built-in authenticator
   (the browser says so: `isUserVerifyingPlatformAuthenticatorAvailable`)
   and when the server has passkeys (`passkeySignIn` in `GET /v1/config`).
2. "or with your email": the email field, then a **password field**
   labelled "Password", with "Show", help "Only if you've set one.
   Otherwise we email you a code.", and "Forgot your password?" under it.
3. The button says "Send code" while the password field is empty and
   "Sign in" once something is typed in it. Browsers and password managers
   fill both fields (`autocomplete` `username` and `current-password`).

### 3.2 Signing in with a password

1. The email and password are checked together. A wrong password, an email
   no account has, and an account without a password all give the same
   answer: "Wrong email or password. Check them, or leave the password
   empty and we'll email you a code." The answer takes as long either way.
2. Limits (R27.4): 10 wrong tries an hour for one email, 30 an hour from
   one network address (an IPv6 address counted by its /64). Then: "Too
   many tries. Use the email code, or try again in 42 minutes." The email
   code is not affected.
3. Then, as after the email code (spec 26, 3.2, item 4): "Keep my account"
   while it waits to be deleted, step 3 while the profile is missing, the
   terms when they changed. A suspended account signs in as it does today.
4. An account's email is its user name. When the email changes (spec 26,
   3.7), the password stays and goes with the new email.

### 3.3 Signing in with Face ID or fingerprint

1. "Face ID or fingerprint" asks the browser for a passkey. The browser
   shows its own sheet (Face ID, Touch ID, the fingerprint reader, Windows
   Hello, or another phone's QR code), then the person is signed in. No
   email is typed.
2. When the browser has no passkey for PuffinRide, or the person cancels,
   nothing changes and the screen stays as it was. A passkey we don't know
   (removed in Settings, or the console's own passkey, which lives on the
   same domain) gives: "This device's sign-in isn't set up for your
   PuffinRide account. Use your email, then set it up again in Settings."
3. Then as 3.2, item 3.

### 3.4 Forgot your password

1. "Forgot your password?" sends the email code to the email in the field
   (spec 26, 3.2), with the same limits. With no email typed, it asks for
   one first: "Type your email, and we'll send you a code."
2. After the code, the person is signed in and sees "Choose a new password"
   (3.5, item 2), with "Not now". The fresh sign-in is the proof (R27.5).

### 3.5 Setting a password

1. In Settings, Sign-in methods (3.6): "Add a password", or "Change
   password" and "Remove password" when there is one.
2. "Choose a password": one field, "New password", with "Show" and help
   "At least 10 characters. A few words you'll remember work well." and
   "Save password". It is typed once: "Show" replaces typing it twice. The
   browser offers to make and save a strong one (`autocomplete`
   `new-password`).
3. The password (R27.2): 10 to 128 characters, not on a public list of
   the 100 000 most used passwords (in any case), and not the account's
   email. No other rules: no
   required digits or symbols. Messages: "Use at least 10 characters.",
   "Use at most 128 characters.", "That password is too common. Add a few
   words.", "Don't use your email as the password."
4. Only an account with a verified email can have a password (it is the
   user name): without one, Settings says "Add an email first. It's your
   user name." with a link to add it.
5. **The proof (R27.5):** adding or changing a password, and setting up
   Face ID or fingerprint, needs a sign-in in the last 10 minutes on this
   device (by any way in), or else a confirm code (spec 26, 3.6). This
   amends R26.5: a sign-in that recent proves the person has a way into the
   account. The confirm form appears in place, as for adding Google.
   Removing a password needs no code: it takes a way in away, not adds one,
   as removing Google does (R19.7).
6. Saved: "Your password is saved." An email goes to the verified email
   (R27.7): "A password was added to your PuffinRide account", or "changed"
   or "removed", and "If that was you, there's nothing to do. If it
   wasn't, sign in with your email code, change or remove your password and
   sign out on all devices under Settings, then tell us under Send feedback
   in the app."
7. Other devices stay signed in. "Sign out on all devices" sits next to it
   in Settings (my call: the password is one way in of several, and the
   person decides).

### 3.6 Face ID or fingerprint in Settings

1. Sign-in methods lists, below the email and Google, **Password** ("Set"
   with the date it was last changed, or "Not set") and **Face ID or
   fingerprint**: one line per device, such as "Safari on iPhone", with
   "Added 23 Nov 2026" and "Last used 24 Nov 2026", and "Remove".
2. "Set up on this device" appears where the browser has a built-in
   authenticator (as 3.1, item 1). It asks for the proof of 3.5, item 5,
   then the browser's own sheet, and saves a passkey kept on the device
   only (R27.6). The device's name comes from the browser (my call: "Chrome
   on Windows", "Safari on Mac"; no field to type a name).
3. A device already set up says so: the browser refuses a second passkey on
   the same device, and the screen says "This device is set up already."
4. At most 10 devices (R27.8): "You have 10 devices set up. Remove one to add
   another."
5. "Remove" asks "Remove Face ID or fingerprint for Safari on iPhone? You can
   still sign in with your email." and removes it. The passkey may stay in
   the device's own password list; it no longer signs in (3.3, item 2).
6. Set up: an email to the verified email (R27.7): "Face ID or fingerprint
   was set up for your PuffinRide account on Safari on iPhone", with the
   same lines as 3.5, item 6.

### 3.7 After sign-up: sign in faster next time

After step 3 (about you), once, for a new account:

```text
Sign in faster next time
[ Use Face ID or fingerprint ]   (where the device has it)
[ Add a password ]
[ Not now ]
Your email code always works too.
```

Either choice runs 3.5 or 3.6 straight away; the fresh sign-in is the
proof. "Not now" goes on to where sign-up goes today. It is shown once:
afterwards, both are in Settings. Members from before find them in
Settings.

### 3.8 The phone apps

The iOS and Android apps get passwords with the same screens (fields with
`textContentType` `password` and `newPassword`, so the phone's keychain
fills them). Face ID or fingerprint is on the website first; the apps follow
when their builds ship, with the domain declared to Apple and Google so the
same passkeys work there (decided then, with its own ADR).

## 4. Rules

| ID    | Rule                                                                                                                                                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R27.1 | A password and Face ID or fingerprint are optional, on top of the email code and Google, which always keep working. A password needs a verified email, which is its user name.                                                     |
| R27.2 | A password has 10 to 128 characters, is not on a public list of the 100 000 most used passwords (in any case), and is not the account's email. No other rules.                                                                       |
| R27.3 | A password is stored only as a scrypt hash (ADR 0047). It is never logged, never sent back, and never in Download my data, which says only whether one is set and when.                                                            |
| R27.4 | A wrong email or password gets one answer, whatever was wrong, in the same time. At most 10 wrong tries an hour for one email and 30 from one network address; then the email code, or waiting.                                    |
| R27.5 | Adding or changing a password, or setting up Face ID or fingerprint, needs a sign-in in the last 10 minutes or a confirm code (amends R26.5). Removing either needs neither.                                                       |
| R27.6 | Face ID or fingerprint is a passkey kept on the device itself: Face ID, Touch ID, an Android fingerprint or face, Windows Hello. Never a separate security key (ADR 0048).                                                         |
| R27.7 | Adding, changing or removing a password, and setting up Face ID or fingerprint, is told by email to the verified email.                                                                                                            |
| R27.8 | At most 10 devices with Face ID or fingerprint per account.                                                                                                                                                                       |

## 5. Data and API

Data (one migration):

- `member_passwords`, new: the account, the scrypt hash in one string with
  its settings (`scrypt$15$8$3$<salt>$<hash>`, ADR 0047), when it was set.
  Deleted with the account; erased at erasure (spec 11).
- `member_passkeys`, new: the account, the credential's ID (unique), its
  public key, its counter, its transports, whether it is synced, the user
  handle the browser keeps (ADR 0048), the device's browser and system
  (such as Safari and iPhone), when it was added and last used. Deleted with the account.
- `member_passkey_challenges`, new: a challenge, what it is for
  (`sign_in` or `register`), whose (registering only), when it expires (5
  minutes). Deleted when used; the hourly clean-up deletes the rest an hour
  after they expire.
- `rate_limit_events`: new scopes for wrong passwords per email and per
  network address, and for passkey sign-in requests per network address.

Endpoints (`/v1`, shapes in `packages/contracts`):

| Endpoint                         | What                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/password`            | New: email, password, device. Signed in with tokens (as `POST /auth/email/verify`), or `credentials_invalid`, `rate_limited`        |
| `POST /auth/passkey/options`     | New: the options for the browser's passkey sheet. Limited per network address                                                       |
| `POST /auth/passkey`             | New: the browser's answer and the device. Signed in with tokens, or `passkey_invalid`                                               |
| `PUT /me/password`               | New: the password, and `code` when R27.5 asks for one. `confirm_required`, `email_required`, `password_invalid` (with the reason)    |
| `DELETE /me/password`            | New                                                                                                                                   |
| `POST /me/passkeys/options`      | New: `code` when R27.5 asks for one. The options for the browser, or `confirm_required`, `too_many`                                 |
| `POST /me/passkeys`              | New: the browser's answer. The device's line, or `passkey_invalid`, `too_many`                                                      |
| `DELETE /me/passkeys/{id}`       | New                                                                                                                                   |
| `GET /me/sign-in-methods`        | Gains `password` (`null`, or when it was set) and `passkeys` (id, name, added, last used)                                           |
| `GET /config`                    | Gains `passkeySignIn`: true when the server knows its website's address (`WEB_APP_URL`), which passkeys are bound to                |

Logs: "signed in with a password" and "signed in with a passkey" with the
user ID; "wrong password" with no email; "password set", "password
removed", "passkey added", "passkey removed" with the user ID. Never an
email, a password, a hash, or a passkey's key.

## 6. Privacy and safety

- **Purpose:** signing in, chosen by the person. Nothing new about them is
  collected: a password's hash, and for a passkey a public key and the
  browser's name. The face or fingerprint never leaves the device; the
  browser only tells us the device checked it.
- **Storage:** a password only as a scrypt hash with its own salt (R27.3); a
  passkey's public key, which signs nothing by itself. Both are deleted with
  the account. Download my data lists whether a password is set and when,
  and each device's name, added and last used.
- **Safety:** a stolen session cannot add a way in after 10 minutes
  without a code (R27.5), and every new way in is told by email (R27.7).
  Wrong passwords are limited per email and per network address (R27.4),
  and the answer never says whether an account has the email. Passkeys
  cannot be phished: the browser gives them only to puffinride.is.
- **Lost phone or forgotten password:** the email code and Google still
  sign in; Settings removes the lost device.

## 7. Texts

English and Icelandic, in `packages/i18n` (Icelandic to be read by a native
speaker):

| Key                         | English                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `auth.password`             | Password                                                                                                  |
| `auth.passwordHelp`         | Only if you've set one. Otherwise we email you a code.                                                    |
| `auth.signIn`               | Sign in                                                                                                   |
| `auth.forgotPassword`       | Forgot your password?                                                                                     |
| `auth.passkey`              | Face ID or fingerprint                                                                                    |
| `error.credentialsInvalid`  | Wrong email or password. Check them, or leave the password empty and we'll email you a code.              |
| `password.title`            | Choose a password                                                                                         |
| `password.help`             | At least 10 characters. A few words you'll remember work well.                                            |
| `password.tooCommon`        | That password is too common. Add a few words.                                                             |
| `signUp.faster.title`       | Sign in faster next time                                                                                  |
| `passkey.setUp`             | Set up on this device                                                                                     |
| `passkey.unknown`           | This device's sign-in isn't set up for your PuffinRide account. Use your email, then set it up again in Settings. |

The rest follow these sections' wording.

## 8. Testing

- **Domain:** the password rules (length in characters, not bytes; the
  common list; the email, in any case), the proof rule of R27.5, the limits'
  numbers, the device name from a browser's user agent.
- **API integration:** a password set with and without the proof; signing
  in with it; the one answer and its limits; the hash's format and a hash
  made with older settings made again at sign-in; the change emails;
  removing it. Passkeys with `@simplewebauthn`'s test answers, as the
  console's are tested: set up with and without the proof, a second one on
  the same device refused, 10 at most, signing in, a removed or unknown
  passkey refused, a challenge used twice or too late refused, the clean-up.
- **App:** the sign-in screen's button that changes, the password screen,
  Sign-in methods' new lines, the step after sign-up, with the fake API.
- **Browser journeys (Playwright):** sign up, add a password at the end,
  sign out, sign in with the password; "Forgot your password?" through the
  email code to a new password; set up Face ID or fingerprint with
  Chromium's virtual authenticator (internal, with user verification), sign
  out, sign in with it, remove it in Settings.
- **Manual (Martin):** on staging, Face ID on an iPhone in Safari, Touch ID
  on a Mac, and a password saved by the browser; then the same on
  production.

## 9. Out of scope

Passkeys in the phone apps (3.8); Apple; a passkey offered in the email
field's autofill; a breach check of passwords against an outside service;
two-step sign-in; signing out other devices when the password changes.

## Decisions

| #   | Question                                   | Decision                                                                                                                                                                                       |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which ways in?                             | Google, the email code and a password; Apple later; Face ID or fingerprint, not a hardware key. Martin, 2026-11-23 13:24                                                                     |
| 2   | Face ID on the web?                        | Yes: passkeys on the website first, the apps when their builds ship (my call: browsers support it now; the apps need their builds)                                                         |
| 3   | How is a password stored?                  | scrypt, built into Node.js, so no new dependency (ADR 0047, my call)                                                                                                                          |
| 4   | How is a password reset?                   | With the email code, which signs in, then a new password; no reset link (my call: one way of proving the inbox, already built)                                                                |
| 5   | One password field or two at the start?    | One field with "Show", and the button changes with it; browsers fill it (my call)                                                                                                            |
| 6   | Proof before adding a way in?              | A sign-in in the last 10 minutes or a confirm code (my call: after sign-up and after "Forgot your password?", a second code would only slow people down)                                      |
| 7   | Sign out other devices on a new password?  | No; "Sign out on all devices" is next to it (my call)                                                                                                                                         |
