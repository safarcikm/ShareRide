# Spec 19: Sign in with Google and Apple

**Owner:** Martin · **Date:** 2026-11-22 · **Status:** Approved
(2026-11-22, by Martin on a decision card); built (2026-11-22); see the [implementation plan](../plans/2026-11-22-google-and-apple-sign-in.md)

Decision record: [ADR 0034](../decisions/0034-google-and-apple-sign-in-through-our-api.md)
(accepted). This spec amends [spec 1](2026-11-13-sign-in-and-profile.md)
3.3 (sign in with Apple or Google), 3.8 (linked sign-in methods) and 6
(the provider endpoint), and replaces section 4.7 of the
[milestone 2 plan](../plans/2026-11-13-milestone-2-hosted-and-connected.md).
Related: [ADR 0010](../decisions/0010-authentication-and-identity.md),
[ADR 0016](../decisions/0016-own-sign-in-module.md),
[security](../engineering/security.md#sign-in-and-sessions),
[privacy and GDPR](../compliance/privacy-gdpr.md).

Amended by [spec 26](2026-11-23-sign-in-without-text-messages.md): the
sign-in screen offers the email in place of the phone number (3.1), the
phone step also finishes an email sign-in and sends its text only for a
waiting sign-in (3.3, R26.2), the confirm code of 3.4 goes by email when the
account has one (R26.7), and R19.3 widens to a new email (R26.5).

## 1. Problem and goal

Martin, 2026-11-22: "I want to be able to log in/create account with google
and Apple ID now", for the beta, which opens to the public with no invite
code.

Today the only way in is a phone number and a code by text message, every
time. Spec 1 always meant Google and Apple to be there as well (3.3), but
nothing was built.

**Goal:** a person can create an account and sign in with Google or Apple on
the web, Android and iPhone. They give and verify a phone number once, at
sign-up; after that Google or Apple is enough, with no text-message code.
The account also gets the verified email address the provider shares.

What does not change: one account per phone number (R1.1), and booking,
posting and chatting need a verified phone number (R1.6). Every account keeps
one, so the safety design, account deletion and the confirm codes of spec 11
work as they do now.

## 2. User stories

- As a newcomer, I tap "Continue with Google", pick my Google account, verify
  my phone number once and write a few words about me. My name and email are
  filled in for me.
- As a member who signed up with Google, I tap "Continue with Google" and am
  signed in, with no code to wait for.
- As a member who signed up with my phone, I add Google or Apple, either from
  Settings or by continuing with Google and giving my own number, and sign in
  with it from then on.
- As a member, I see in Settings which sign-in methods my account has, and
  remove Google or Apple whenever I want.
- As an iPhone user who hides my email from apps, I can use Apple's private
  relay address and still get ShareRide's emails.

## 3. Behaviour

### 3.1 Where the buttons are

1. The sign-in screen (spec 1, screen 2; step 1 of signing up) shows
   "Continue with Google" and "Continue with Apple" first, then "or with
   your phone number" above the phone field.
2. Both buttons show on the web, Android and iPhone. Apple's sign-in works
   in any browser, so Apple is offered on Android too (my call; spec 1's
   story named Apple for iPhone).
3. A button shows only when the server has its provider set up
   (`GET /v1/config`, `signInProviders`). With neither set up, the screen is
   as it is today.
4. The buttons follow Google's and Apple's own rules for their buttons:
   their logo, their colours and their wording ("Continue with Google",
   "Continue with Apple", in Icelandic too). Those colours are the only ones
   on our screens that are not ours; they get their own named tokens in
   [spec 15](2026-11-13-visual-design-system.md), so no screen uses a raw
   colour.

### 3.2 Continue with Google or Apple

1. Tapping a button opens the provider's own sign-in page: in a pop-up window
   on the web, so the page underneath, with a ride kept on the way (spec 16,
   3.5), stays as it was; in the phone's secure browser sheet on Android and
   iPhone. ShareRide never sees the person's Google or Apple password.
2. The person picks an account and agrees to share it. Google asks which
   account every time, so a shared computer does not pick the last one.
3. Back in ShareRide, one of three things happens:
   - **A Google or Apple account ShareRide knows:** the person is signed in,
     with no code, and goes on as after a text-message code: to "Keep my
     account" while it waits to be deleted, to step 3 while the profile is
     missing, to the terms when they changed (spec 1, 3.4).
   - **One it does not know:** "Add your phone number" (3.3).
   - **Cancelled or closed:** back on the sign-in screen, nothing changed and
     no error shown.
4. If the provider answers with an error, or the answer cannot be checked:
   "Google sign-in didn't work. Try again, or use your phone number." Nothing
   about the error goes to the person or into the logs beyond its kind.

### 3.3 Add your phone number (decision 1)

1. The phone number step of today (spec 1, 3.2), with one line on top: "You
   signed in with Google as `ana@example.com`. We text you a code once, so the
   people you ride with can reach you. Next time Google is enough." When
   Apple hid the email: "Apple confirmed it's you. We text you a code once,
   …".
2. The code step as today: 10 minutes, 5 attempts, the same limits and the
   same answer for every number (R1.2 to R1.4).
3. Then, by the number:
   - **No account has it:** the account is made with the number, linked to
     the Google or Apple account. The email goes on the account as verified
     when the provider says it is verified and no other account has it
     (R19.4). Step 3, about you, opens with the first name filled in from the
     provider when it gave one that passes the first name rule; the person
     can change it.
   - **An account has it:** the Google or Apple account is added to that
     account and the person is signed in: "Google is now linked to your
     account. Next time you can continue with Google." Proving the number by
     its code is what signing in with the number needs anyway, so nothing
     else is asked (R19.3). The account's email stays; when it has none, the
     provider's verified email is added (R19.4). If the account already had
     another Google account, the new one takes its place: "Your Google
     account on ShareRide is now `ana@example.com`." (R19.1; this is also what
     happens to Apple accounts if the Apple developer account behind
     ShareRide changes, 3.5).
4. Everything that refuses a phone sign-up refuses this one too, with the
   same messages: new accounts paused (spec 10, 3.3), text messages paused, a
   number blocked after a suspended account was deleted (R11.9), and, should
   the operator turn "Invite code required" on again, the invite code step
   (spec 12, 3.2).
5. The Google or Apple sign-in waits 30 minutes for the phone step. After
   that: "That took too long. Continue with Google again." A text-message
   code that was not used keeps working for its own 10 minutes.

### 3.4 Sign-in methods in Settings

1. Settings, Your account, gains "Sign-in methods": a list of
   - Phone number: the number, as Settings shows it today; it cannot be
     removed (changing it is spec 1, 3.6, not built yet);
   - Google: the Google account's email (or "Linked" without one), with
     "Remove Google", or "Add Google";
   - Apple: the email, or "Email hidden by Apple", with "Remove Apple", or
     "Add Apple".
2. "Add Google" (shown only while no Google account is linked) opens the
   same window as in 3.2, then asks for a code texted to the account's own
   number, as downloading data or deleting the account does (spec 11,
   R11.1), and adds the Google account once the code is right (R19.3). So
   someone who has the app open for a minute cannot add their own Google
   account and come back after "Sign out on all devices". If that Google
   account already belongs to another ShareRide account: "This Google
   account is used by another ShareRide account." The account's own email
   does not change; when it has none, the provider's verified email is
   added (R19.4).
3. "Remove Google" asks "Remove Google? You can still sign in with your phone
   number." Removing it deletes the link at once; sessions stay signed in.

### 3.5 Email from Apple's private relay

When a person hides their email, Apple gives a private relay address
(`…@privaterelay.appleid.com`). It is stored as verified like any other.
Apple forwards mail to it only from senders registered in Apple's developer
portal, with SPF or DKIM on their domain. The sender `hello@skinnar.is`
must be registered there before the email alerts reach Apple users
(Martin's steps, in the plan).

Apple's identifier for a person, and their relay address, belong to the
Apple developer account behind ShareRide. The beta uses Martin's own
account, with the test App ID (`is.shareride.app.preview`), so the store's
App ID stays free for the company (milestone 2 plan, decision 6). When the
company's Apple account takes over, Apple gives each person a new
identifier: their next "Continue with Apple" asks for their phone number
once more, and the new Apple account takes the old one's place (3.3), with
its email when the old relay address was the account's email.

## 4. Rules

| ID    | Rule                                                                                                                                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R19.1 | An account has at most one Google and one Apple account linked; a Google or Apple account is linked to at most one ShareRide account. A new one proven by the phone step takes the place of the one before.                                                                              |
| R19.2 | Every account keeps a verified phone number: a newcomer through Google or Apple verifies one before the account is made (decision 1). R1.1 and R1.6 do not change.                                                                                                                       |
| R19.3 | A Google or Apple account is linked to a ShareRide account only after the person proves that account's phone number with a code: the sign-in code of the phone step, or a confirm code when adding it in Settings. Never because an email address matches, and never on a session alone. |
| R19.4 | ShareRide stores a provider's email only if the provider says it is verified and no other account has it, and never replaces an email the account already has.                                                                                                                           |
| R19.5 | From the provider ShareRide keeps the account's identifier and the email, nothing else: no last name, photo, birthday or language. The first name only fills in step 3's field, for the person to keep or change.                                                                        |
| R19.6 | Signing in with Google or Apple follows the account rules of signing in with a phone number: a suspended person can sign in (spec 9, 3.6.2), an account waiting to be deleted goes to "Keep my account", an erased account's links are gone with it.                                     |
| R19.7 | Google and Apple can always be removed, since the phone number stays.                                                                                                                                                                                                                    |

## 5. Screens

Phone first; on a laptop the same content in the sign-in column (spec 18).

1. **Sign in**, today's screen 2 with the buttons on top:

   ```text
   Sign in or create an account
   [ G  Continue with Google  ]
   [   Continue with Apple   ]
   ───── or with your phone number ─────
   [ Iceland +354 ] [ Phone number      ]
   [ Send the code ]
   ```

2. **Add your phone number**, after a Google or Apple account ShareRide does
   not know:

   ```text
   Add your phone number                    step 1 of 3
   You signed in with Google as ana@example.com. We text you
   a code once, so the people you ride with can reach you.
   Next time Google is enough.
   [ Iceland +354 ] [ Phone number      ]
   [ Send the code ]
   ```

3. **Enter the code** and **About you**: as today; about you with the first
   name filled in.
4. **Sign-in methods**, a new Settings screen:

   ```text
   Sign-in methods
   Phone number    +354 555 1234
   Google          ana@example.com          [ Remove Google ]
   Apple           Not linked                  [ Add Apple ]
   ```

## 6. Data and API

Entities (see the [domain model](../architecture/domain-model.md)):

- `Identity` (spec 1's `AuthIdentity`), table `identities`: user, provider
  (`google` or `apple`), subject (the provider's own identifier for the
  person, which never changes), the email when the provider said it is
  verified (or empty), linked at, last used at. Unique by provider and subject, and by user and
  provider (R19.1).
- `ProviderSignIn`, table `provider_sign_ins`: one sign-in with a provider
  from the tap to its end, short-lived; what it holds is in the
  [plan](../plans/2026-11-22-google-and-apple-sign-in.md#4-design).

Endpoints (`/v1`, shapes in `packages/contracts`), replacing spec 1's
`POST /auth/oauth/{apple,google}`:

| Method and path                                                                                                                    | Purpose                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/oauth/{google,apple}/start`                                                                                             | Opened in the pop-up or browser sheet: sends the person to the provider                                                   |
| `GET /auth/oauth/google/callback`, `POST /auth/oauth/apple/callback`                                                               | Where the provider sends the person back; sends them on to the app with a one-time ticket                                 |
| `POST /auth/oauth/finish`                                                                                                          | The app trades the ticket for a session, or for "add your phone number"                                                   |
| `POST /auth/phone/verify`                                                                                                          | Gains the waiting provider sign-in, to make or link the account                                                           |
| `GET /me/sign-in-methods`, `POST /me/sign-in-methods/prepare`, `POST /me/sign-in-methods`, `DELETE /me/sign-in-methods/{provider}` | List; take the window's ticket and check it can be added, before the confirm code is asked for; add with the code; remove |
| `GET /config`                                                                                                                      | Gains `signInProviders`                                                                                                   |

Events (in the logs, by provider and user ID): `SignInMethodLinked`, `SignInMethodRemoved`.

## 7. Privacy and safety

- **Collected:** from Google or Apple, the account's identifier, its email
  and whether it is verified (R19.5). The first name is held only until
  step 3 shows it; Apple sends it only the first time a person signs in to
  ShareRide.
- **Google and Apple** run their own sign-in page, in its own window, under
  their own privacy policies; they learn that the person signs in to
  ShareRide. ShareRide sends them nothing about the person and loads no
  Google or Apple code on its own pages. They are recipients the privacy
  policy names, not processors working for us.
- **Retention:** links live as long as the account, are in "Download my
  data" (provider, email, linked at) and are erased with the account
  (spec 11). A provider sign-in that waits holds the email and first name for
  at most 30 minutes and is deleted by the hourly clean-up an hour after it
  ended.
- **Logs** carry the provider and the user ID, never the email, the
  provider's identifier or any token.
- **Safety:** someone else's sign-in cannot be finished in a person's
  browser, and a ticket caught on its way back to the app is useless to
  whoever caught it: the app that starts a sign-in holds a secret that
  finishing it needs. The provider's answer is checked against its published
  keys, our client ID, its issuer, its expiry and a fresh nonce. Details in
  ADR 0034 and the plan; the security review of each PR checks them.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key                                     | English                                                                                                                                       | Icelandic (draft)                                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.continueGoogle`                   | Continue with Google                                                                                                                          | Halda áfram með Google                                                                                                                          |
| `auth.continueApple`                    | Continue with Apple                                                                                                                           | Halda áfram með Apple                                                                                                                           |
| `auth.orPhone`                          | or with your phone number                                                                                                                     | eða með símanúmerinu þínu                                                                                                                       |
| `auth.provider.phoneTitle`              | Add your phone number                                                                                                                         | Bættu við símanúmerinu þínu                                                                                                                     |
| `auth.provider.phoneHelp`               | You signed in with {provider} as {email}. We text you a code once, so the people you ride with can reach you. Next time {provider} is enough. | {provider} staðfesti netfangið {email}. Við sendum þér kóða með SMS einu sinni, svo fólkið sem þú ferðast með nái í þig. Næst dugar {provider}. |
| `auth.provider.phoneHelpHidden`         | {provider} confirmed it's you. We text you a code once, so the people you ride with can reach you. Next time {provider} is enough.            | {provider} staðfesti að þetta sért þú. Við sendum þér kóða með SMS einu sinni, svo fólkið sem þú ferðast með nái í þig. Næst dugar {provider}.  |
| `auth.provider.another`                 | Sign in another way                                                                                                                           | Skrá inn á annan hátt                                                                                                                           |
| `auth.provider.linked`                  | {provider} is now linked to your account. Next time you can continue with {provider}.                                                         | {provider} er nú tengt aðganginum þínum. Næst getur þú haldið áfram með {provider}.                                                             |
| `auth.provider.failed`                  | {provider} sign-in didn't work. Try again, or use your phone number.                                                                          | Innskráning með {provider} tókst ekki. Reyndu aftur eða notaðu símanúmerið þitt.                                                                |
| `auth.provider.expired`                 | That took too long. Continue with {provider} again.                                                                                           | Þetta tók of langan tíma. Haltu aftur áfram með {provider}.                                                                                     |
| `auth.provider.inUse`                   | This {provider} account is used by another ShareRide account.                                                                                 | Þessi {provider}-aðgangur er notaður af öðrum ShareRide-aðgangi.                                                                                |
| `auth.provider.inUseRetry`              | This {provider} account is used by another ShareRide account. Try again to go on with your phone number alone.                                | Þessi {provider}-aðgangur er notaður af öðrum ShareRide-aðgangi. Reyndu aftur til að halda áfram með símanúmerinu einu.                         |
| `auth.provider.replaced`                | Your {provider} account on ShareRide is now {email}.                                                                                          | {provider}-aðgangurinn þinn á ShareRide er nú {email}.                                                                                          |
| `auth.provider.replacedHidden`          | Your {provider} account on ShareRide has changed.                                                                                             | {provider}-aðgangurinn þinn á ShareRide hefur breyst.                                                                                           |
| `auth.provider.dismiss`                 | Close the message                                                                                                                             | Loka skilaboðunum                                                                                                                               |
| `auth.provider.returning`               | Signing you in… (phone, for a moment)                                                                                                         | Skrái þig inn…                                                                                                                                  |
| `auth.provider.closeTitle`              | You can close this window (a pop-up left open)                                                                                                | Þú getur lokað þessum glugga                                                                                                                    |
| `auth.provider.closeWindow`             | Then go on in the ShareRide window.                                                                                                           | Haltu svo áfram í ShareRide-glugganum.                                                                                                          |
| `settings.signInMethods`                | Sign-in methods                                                                                                                               | Innskráningarleiðir                                                                                                                             |
| `settings.signInMethods.help`           | Your phone number always signs you in. You can also link other ways to sign in.                                                               | Símanúmerið þitt dugar alltaf til að skrá þig inn. Þú getur líka tengt aðrar innskráningarleiðir.                                               |
| `settings.signInMethods.add`            | Add {provider}                                                                                                                                | Bæta við {provider}                                                                                                                             |
| `settings.signInMethods.remove`         | Remove {provider}                                                                                                                             | Fjarlægja {provider}                                                                                                                            |
| `settings.signInMethods.removeQuestion` | Remove {provider}? You can still sign in with your phone number.                                                                              | Fjarlægja {provider}? Þú getur áfram skráð þig inn með símanúmerinu þínu.                                                                       |
| `settings.signInMethods.notLinked`      | Not linked                                                                                                                                    | Ekki tengt                                                                                                                                      |
| `settings.signInMethods.linked`         | Linked                                                                                                                                        | Tengt                                                                                                                                           |
| `settings.signInMethods.hiddenEmail`    | Email hidden by Apple                                                                                                                         | Netfang falið af Apple                                                                                                                          |
| `settings.signInMethods.confirm`        | To add {provider}, enter the code we text you.                                                                                                | Til að bæta við {provider} skaltu slá inn kóðann sem við sendum þér með SMS.                                                                    |
| `settings.signInMethods.removed`        | {provider} is no longer linked to your account.                                                                                               | {provider} er ekki lengur tengt aðganginum þínum.                                                                                               |
| `settings.signInMethods.alreadyLinked`  | {provider} is already linked to your account.                                                                                                 | {provider} er þegar tengt aðganginum þínum.                                                                                                     |
| `settings.signInMethods.failed`         | Adding {provider} didn't work. Try again.                                                                                                     | Ekki tókst að bæta við {provider}. Reyndu aftur.                                                                                                |
| `settings.signInMethods.expired`        | That took too long. Add {provider} again.                                                                                                     | Þetta tók of langan tíma. Bættu {provider} aftur við.                                                                                           |

## 9. Testing

- **Unit (domain):** what a provider answer leads to (signed in, phone
  needed, linked, refused); the return addresses allowed; the checks on a
  provider's token (issuer, audience, expiry, nonce, a verified email given
  as `true` or `"true"`); the first name taken from a provider.
- **API integration:** tokens signed with a key made in the test and a fake
  token endpoint: a wrong audience, issuer, nonce, state, expiry or app
  secret is refused; a ticket works once; a sign-in that took too long;
  newcomer through the phone step with and without an email that another
  account has; linking to an account that has the number; a new Google
  account taking the old one's place; a Google account of another account;
  adding in Settings only with the confirm code; remove; suspended, waiting to be deleted and erased
  accounts; Download my data, erasure and the clean-up.
- **Browser journeys (Playwright):** with the development provider (a page
  of our own that stands in for Google and Apple): a newcomer continues with
  Google, adds a phone number, gets the first name filled in and finishes
  sign-up; a member continues with Google and is signed in; adding and
  removing Google in Settings.
- **Manual (Martin):** real Google and real Apple on staging, in a laptop's
  browser and a phone's browser; an email to an Apple relay address
  arrives. Inside the iPhone and Android apps once their test builds exist:
  staging takes only the apps' own `shareride://` return address, never
  Expo Go's (my call).

## 10. Out of scope

- Revoking Apple's tokens when an account is deleted, which the App Store
  asks of apps with Sign in with Apple. It is needed before the App Store
  release (milestone 16); it can ask the person to continue with Apple once
  more at deletion, so nothing has to be stored for it now.
- Apple's server notifications (a person stops using Apple with ShareRide,
  or changes their relay email), Apple's own sheet on iPhone instead of the
  browser sheet, changing the phone number (spec 1, 3.6), other providers,
  passkeys for members, Auðkenni (Phase 4).

## Decisions

| #   | Question                                                                 | Decision                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | When does a newcomer through Google or Apple give a phone number?        | At sign-up, before the account is made; later sign-ins need no code (Martin, 2026-11-22, on a decision card; not chosen: before the first booking, ride or chat, as spec 1, 3.3 said) |
| 2   | How do the apps and the web talk to Google and Apple?                    | Through our API, which runs the sign-in in a browser window on every platform ([ADR 0034](../decisions/0034-google-and-apple-sign-in-through-our-api.md); my call)                    |
| 3   | Is Apple offered on Android?                                             | Yes, like on the web (my call)                                                                                                                                                        |
| 4   | Is a Google or Apple account linked to an existing account by its phone? | Yes, once the person proves the number with its code; never by email (R19.3; my call)                                                                                                 |
| 5   | Whose email does the account keep?                                       | Its own; the provider's verified email only fills an empty one (R19.4; my call)                                                                                                       |
| 6   | Can a signed-in person add Google or Apple from Settings without a code? | No: adding asks for a confirm code to the account's number, so a session alone never adds a way back in (R19.3; my call, after the design review)                                     |
| 7   | Which Apple developer account?                                           | Martin's own, with the test App ID, for the beta; when the company's account takes over, people confirm their phone once more (3.5; my call, following milestone 2's decision 6)      |
