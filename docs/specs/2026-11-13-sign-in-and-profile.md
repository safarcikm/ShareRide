# Spec 1: Sign in, profile, settings and legal acceptance

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved (2026-11-13)

Features: A1 Sign up and sign in, A2 Profile, A4 Settings, A6 Terms, privacy
policy and community rules ([features](../product/features.md)).
Related decisions: [ADR 0010](../decisions/0010-authentication-and-identity.md)
(proposed), [ADR 0011](../decisions/0011-localization.md) (proposed),
[privacy and GDPR](../compliance/privacy-gdpr.md).

## 1. Problem and goal

People share cars with strangers, so every user needs a reachable phone number
and a recognisable profile. Sign-up must still take under a minute, work for
residents and visitors alike, and collect as little personal data as possible.

Goal: a person can create an account with a phone number (or Apple or Google
plus a phone number), accept the terms, set up a short profile, choose the
language, and stay signed in securely on their devices.

## 2. User stories

- As a new user, I sign up with my phone number and a code by SMS, so I don't
  need another password.
- As an iPhone or Android user, I can use Sign in with Apple or Google instead,
  and confirm my phone number once.
- As a visitor with a foreign number, I can sign up without an Icelandic ID.
- As a user, I set my first name, a photo, a short bio and the languages I
  speak, so others know who they travel with.
- As a user, I see other people's public profiles before I travel with them.
- As a user, I choose Icelandic or English, and see my signed-in devices and
  sign out of any of them.
- As the operator, I know which version of the terms each user accepted and
  when.

## 3. Behaviour

### 3.1 First launch

1. The app opens in the phone's language if it is Icelandic or English;
   otherwise English. A language switch is on the welcome screen.
2. Without an account, a person can browse meeting points and search trips
   (decision 1). Booking, posting a trip and chat need an account.
3. During the beta, sign-up asks for an invite code first (spec 12).

### 3.2 Sign up or sign in with a phone number

1. Enter a phone number. The country defaults to Iceland (+354); a country
   picker allows other supported countries (decision 3).
2. The app sends a 6-digit code by SMS. The screen does not reveal whether an
   account already exists for that number.
3. Enter the code. The code is valid for 10 minutes and allows 5 attempts. A new
   code can be requested after 30 seconds, at most 5 times per hour per number.
4. If the number is new, continue to 3.4 (terms) and 3.5 (profile). If it
   belongs to an account, the user is signed in.

Errors: wrong code (attempts left shown), expired code, too many attempts
(wait time shown), unsupported country, SMS not delivered (offer resend and a
help link), and a number blocked after a suspended account was deleted
([spec 11](2026-11-13-privacy-self-service.md#decisions)), which is refused
with a link to the community rules.

### 3.3 Sign in with Apple or Google

1. Tap "Continue with Apple" or "Continue with Google".
2. New account: the first name is prefilled from the provider if shared; the
   email (including Apple's private relay address) is stored as verified.
3. Before the first booking, trip or chat, the user adds and verifies a phone
   number as in 3.2.
4. One person, one account: if the phone number already belongs to another
   account, the user is asked to sign in to that account and link the provider
   from its settings.

### 3.4 Terms and age

1. The user confirms "I am 18 or older" (decision 2) and accepts the Terms
   of Service and the Community Rules. The Privacy Policy is linked and must
   be shown, but it is information, not something to "accept".
2. Each acceptance is stored with document, version, time and language.
3. When a document changes materially, the next app start shows the change
   summary and asks for acceptance before booking, posting or chatting. Minor
   changes are announced without blocking.

### 3.5 Create and edit a profile

| Field | Rules | Visible to |
| ----- | ----- | ---------- |
| First name | Required, 1 to 30 characters, letters, spaces, hyphens and apostrophes | Everyone |
| Photo | Optional for passengers, required for drivers before their first trip (decision 4); JPEG, PNG or HEIC up to 10 MB; cropped square; location and camera data removed | Everyone |
| About you | Optional, up to 300 characters | Everyone |
| Languages spoken | Optional, choose from a list | Everyone |
| Email | Optional but encouraged (decision 5); verified by a link | Only the user and the operator |
| Phone number | Required, verified | Only the user and the operator |

Public profile shows: first name, photo, about, languages, badges (phone
verified, email verified, later licence and Auðkenni), member since, rating and
reliability (from spec 8). Never the last name, phone number or email.

The operator can remove a photo or bio that breaks the community rules; the
user is told why.

### 3.6 Change phone number

Enter the new number and verify it with a code; the old number stops working
for sign-in. If the user has lost access to the old number, they sign in with
a linked Apple, Google or verified email account and then verify the new
number. Otherwise they contact support.

### 3.7 Sessions and devices

- Users stay signed in. Access tokens are short-lived; refresh tokens rotate on
  every use and expire after 60 days without use.
- Reusing an old refresh token signs out that device's whole session family
  (protects against stolen tokens).
- Settings lists signed-in devices (device name, app version, last active,
  approximate country). The user can sign out one device or all devices.

### 3.8 Settings

Language; notification choices (filled in by spec 7); blocked users (filled in
by spec 9); signed-in devices; linked sign-in methods (Apple, Google); email;
phone number; legal documents; delete account (spec 11); sign out.

## 4. Rules

| ID | Rule |
| -- | ---- |
| R1.1 | One account per phone number. Numbers are stored in E.164 format. |
| R1.2 | A code is 6 digits, single use, valid 10 minutes, 5 attempts. |
| R1.3 | Sending limits: one code per 30 seconds per number, 5 per hour per number, plus per-IP and per-country-prefix limits with an alert to the operator when exceeded. |
| R1.4 | Responses to "send code" are the same whether or not an account exists. |
| R1.5 | Only numbers from supported countries receive codes (decision 3). |
| R1.6 | Booking, posting and chatting require a verified phone number and acceptance of the current material versions of the Terms and Community Rules. |
| R1.7 | Users must confirm they are 18 or older. |
| R1.8 | Profile text and photos follow the community rules; the operator can remove them. |

## 5. Screens

Phone first, then wide screen (web) with the same content in a centred column.

1. Welcome: value statement, language switch, "Continue with phone", Apple,
   Google, "Browse trips"
2. Phone number entry with country picker
3. Code entry with resend timer
4. Terms and age confirmation
5. Create profile: first name, photo, about, languages (skip allowed for the
   optional fields)
6. My profile and edit profile
7. Public profile (as others see it)
8. Settings, devices, linked sign-in methods, legal documents

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)): `User`
(adds `email_verified_at`, `phone_verified_at`, `age_confirmed_at`),
`AuthIdentity` (provider, subject), `Session` (device, created, last active,
refresh family), `VerificationCode` (hashed code, expiry, attempts),
`LegalDocument` (type, version, material flag, text per language, published
at), `LegalAcceptance` (user, document, version, accepted at, locale).

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `POST /auth/phone/start` | Send a code |
| `POST /auth/phone/verify` | Verify a code; sign in or create the account |
| `POST /auth/oauth/{apple,google}` | Sign in with a provider token |
| `POST /auth/refresh` | Rotate tokens |
| `POST /auth/sign-out` | Sign out this device, or all devices |
| `GET /me`, `PATCH /me` | Read and update my account and profile |
| `PUT /me/photo`, `DELETE /me/photo` | Upload or remove my photo |
| `GET /me/sessions`, `DELETE /me/sessions/{id}` | List and end sessions |
| `GET /users/{id}` | Public profile |
| `GET /legal/{type}/current` | Current document in my language |
| `POST /me/legal-acceptances` | Record acceptance |

The auth library chosen in ADR 0010 may provide some of these routes; this spec
defines the behaviour they must have.

Events: `UserRegistered`, `PhoneVerified`, `EmailVerified`, `LegalAccepted`,
`ProfileUpdated`, `SessionRevoked`.

## 7. Privacy and safety

- Collected: phone number, first name, optional photo, bio, languages, email,
  age confirmation (a yes, not a birth date), legal acceptances, session
  metadata. Nothing else.
- The SMS provider receives the phone number and the code only (processor
  under a data processing agreement, EEA region).
- Phone numbers and codes never appear in logs; logs carry a user ID or a
  hashed number.
- Photos are stored in EEA object storage with metadata removed.
- Rate limits and identical responses protect against number enumeration and
  SMS fraud.
- Retention: account data for the life of the account; verification codes
  deleted after use or expiry; sessions deleted 30 days after ending.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `auth.phone.title` | What's your phone number? | Hvert er símanúmerið þitt? |
| `auth.phone.help` | We'll text you a 6-digit code. | Við sendum þér 6 stafa kóða með SMS. |
| `auth.code.title` | Enter the code | Sláðu inn kóðann |
| `auth.code.resend` | Send a new code | Senda nýjan kóða |
| `auth.continueApple` | Continue with Apple | Halda áfram með Apple |
| `auth.continueGoogle` | Continue with Google | Halda áfram með Google |
| `legal.ageConfirm` | I am 18 or older | Ég er 18 ára eða eldri |
| `legal.accept` | I accept the Terms of Service and the Community Rules | Ég samþykki notendaskilmála og samfélagsreglur |
| `profile.firstName` | First name | Fornafn |
| `profile.about` | About you | Um þig |
| `profile.languages` | Languages you speak | Tungumál sem þú talar |
| `settings.language` | Language | Tungumál |
| `settings.signOutAll` | Sign out on all devices | Skrá út á öllum tækjum |

## 9. Testing

- **Unit (domain):** phone number normalisation and country support; code
  expiry, attempt counting and resend timing; legal acceptance rules (which
  versions block which actions).
- **API integration:** sign-up and sign-in with phone; identical responses for
  known and unknown numbers; rate limits; refresh rotation and reuse
  detection; provider sign-in then phone verification; one account per number;
  acceptance required after a material change.
- **End to end:** sign up in Icelandic and in English on iOS, Android and web;
  sign out of all devices; change phone number.
- **Manual:** Sign in with Apple and Google on real devices; screen reader pass
  on every screen.

## 10. Out of scope

Driver setup and licence confirmation (spec 3), invite codes (spec 12),
notification settings detail (spec 7), blocking (spec 9), ratings and
reliability on profiles (spec 8), data export and account deletion (spec 11),
Auðkenni verification (Phase 4), passkeys (later).

## Decisions

Accepted by Martin on 2026-11-13 as recommended.

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Can people browse meeting points and search trips without an account? | Yes. Sign-in is needed only to book, post or chat |
| 2 | Age check: tick "I am 18 or older", or enter a date of birth? | Tick box in the beta, so no birth date is collected; revisit before public launch |
| 3 | Which phone numbers can sign up? | Iceland, the EEA, the UK, the US and Canada at first; others on request |
| 4 | Is a profile photo required? | Optional for passengers, required for drivers before their first trip (spec 3) |
| 5 | Is email required? | Optional but encouraged, for receipts and account recovery |
