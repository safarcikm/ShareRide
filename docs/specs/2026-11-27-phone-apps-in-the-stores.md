# Spec 32: The Android and iPhone apps in the stores

**Owner:** Martin · **Date:** 2026-11-27 · **Status:** Proposed
(2026-11-27): Martin asked for it and chose whose name the store accounts
are in (section 12, "Both personal now, move later"); the other choices are
working choices he can change. Amended by
[spec 37](2026-11-28-sign-in-with-apple-in-the-stores.md) (3.3 and section
10: Sign in with Apple on the phones, 2026-11-28)

Amends: [spec 19](2026-11-22-google-and-apple-sign-in.md) (Google on the
iPhone, 3.3), the [roadmap](../strategy/roadmap.md) (the store release moves
up from Phase 4), the [app builds runbook](../operations/app-builds.md) and
[CI/CD and releases](../engineering/ci-cd-and-releases.md). Builds on
[ADR 0003](../decisions/0003-cross-platform-client-expo.md) (Expo, EAS
Build and EAS Submit) and [ADR 0026](../decisions/0026-push-through-expo.md)
(push through Expo). [ADR 0051](../decisions/0051-store-apps-in-martins-name-until-the-company.md)
records the store accounts and the phone checks.

## 1. Problem and goal

Martin, 2026-11-27: "Ok can we build the apps for google and iPhone as next
steps?"

PuffinRide is open to everyone on the website. The app's code has always
been one codebase for the web, Android and the iPhone (ADR 0003), and every
screen is there on phones too. But no phone build has ever been made: the
screens were only checked in browsers, the build settings still point at
staging and a test app ID, and push, which the website cannot have, has
never reached a real phone. People look for an app in the store, and a
driver hears about a new booking request at once only through push.

**Goal:** PuffinRide in Google Play and the App Store, talking to
`puffinride.is`, with push, checked on phones before anyone outside the team
installs it, and released only on Martin's go.

**Non-goals:** a different app or design for phones; iPad layouts; card
payments (milestone 15); Face ID or fingerprint in the apps and Sign in with
Apple (section 10).

**Anti-goals:** a store build that has not been run as a real app; a tester's
real data on staging; a store page that promises payments or fees (Martin,
marketing); an app update that leaves older installed versions broken.

### 1.1 Where the code is today

Checked on `main` at `0fe4ae0`, 2026-11-27:

| Area | Today | Needed |
| ---- | ----- | ------ |
| Native projects | `expo prebuild` makes both cleanly (Expo 58, React Native 0.88, Android target API 36, which Google Play asks for) | Run both as real apps and fix what only shows there |
| Build settings | `eas.json` has only `preview`, against staging; the iPhone app ID is `is.puffinride.app.preview`; no expo.dev project ID | A `production` profile against `puffinride.is`; `is.puffinride.app` on both |
| Android dark mode | `userInterfaceStyle: automatic` does nothing on Android without `expo-system-ui` | Add it |
| Permission texts | `expo-secure-store` adds a generic Face ID text and `expo-sensors` a generic motion text, in English only. The apps use no Face ID, and shake to send feedback reads the accelerometer, which iOS gives without asking (to check on the simulator) | Remove both, or give each a real reason in both languages |
| Android permissions | `SYSTEM_ALERT_WINDOW` in the release manifest | Block it |
| iPad | `supportsTablet: true`, so the App Store asks for iPad screenshots and Apple reviews it on an iPad | iPhone only for now (3.1) |
| Links in emails | No `apple-app-site-association` or `assetlinks.json`, so a link opens the browser | Serve both, so links open the app (3.5) |
| Sign-in | Google on phones goes through the browser sheet back to `puffinride://sign-in/return`, which the API accepts | Apple's rule on Google sign-in (3.3) |
| Push | Built (milestone 5); needs the expo.dev project ID, a Firebase project and Apple's key | Martin's accounts (section 11) |
| Older versions | The website is always the newest; phones update late | A way to ask for an update (3.6) |

## 2. User stories

- As a passenger, I find PuffinRide in Google Play or the App Store, install
  it and book a seat, in Icelandic or English.
- As a driver, my phone tells me at once when someone asks to book.
- As a member who joined on the website, I sign in on my phone and find my
  rides, messages and profile as I left them.
- As a member, a link in an email from PuffinRide opens the app on the right
  screen.
- As a member with an old version, the app tells me to update rather than
  failing.
- As Martin, I press one button to build the apps, and decide when testers
  and then everyone get them.

## 3. Behaviour

### 3.1 The apps

- One app in each store, named **PuffinRide**, app ID `is.puffinride.app`
  on both. It talks to `https://puffinride.is`. The `.preview` iPhone ID is
  dropped: no build was ever made with it.
- **iPhone only** on Apple's side (my call): an iPad runs the iPhone app in
  its frame. iPad layouts, their screenshots and their review come later.
- **Android phones and tablets**, with the phone layout.
- The same screens, texts and rules as the website, in Icelandic and English,
  chosen as on the website.
- Version **1.0.0** for the first store release; build numbers counted by
  Expo.
- Store builds never talk to staging, and staging never holds a tester's
  real data: testers outside the team use the production app.

### 3.2 What is different on a phone

Already built, and checked for the first time on real builds:

- Push for every notice that has one; email stays the fallback as today.
- Shake to send feedback; a profile photo from the camera or the library;
  Download my data opens in the phone's browser; Share uses the phone's
  share sheet.

Different by design:

- No Google Analytics and no consent bar (they are the website's, ADR
  0045). The apps track nobody, so the stores' tracking questions are all no
  and the iPhone never asks to track.
- No website footer; About is in Profile (spec 30).
- No Face ID or fingerprint yet (spec 27, 3.8).
- Error reports stay off in the apps for now; the stores' own crash
  reports (Play Console, App Store Connect) show crashes.

### 3.3 Sign-in on the phones

- Email code and password on both. The password fields use the phone's
  keychain (spec 27, 3.8).
- **Android:** Google too, as on the website.
- **iPhone:** Google only together with Sign in with Apple (R32.5).
  Apple's guideline 4.8 asks an app that offers Google sign-in to offer an
  equal choice that keeps the email private, such as Sign in with Apple; an
  app with only its own sign-in is exempt. Martin turned Sign in with Apple
  on, on his own Apple team, on 2026-11-28, so the iPhone offers Apple and
  Google, and Android Apple too ([spec 37](2026-11-28-sign-in-with-apple-in-the-stores.md)).
  Until then the plan was no Google on the iPhone until the company's Apple
  account (my call), and the app still behaves so whenever the API has
  Google without Apple: members who joined with Google sign in on the
  iPhone with an email code to their Google address, which Google vouched
  for; Sign-in methods lists a linked Google and can remove it, but does not
  offer to add one; and the sign-in screen says, under the email field, that
  a member who joined with Google signs in with the email code, and on the
  website once to add an email if that fails.

### 3.4 Push

- Through Expo (ADR 0026): Google's Firebase Cloud Messaging for Android,
  with a Firebase project for production; Apple's push service for the
  iPhone, with the key Expo makes from Martin's Apple account.
- The app asks at the moments milestone 5 built. Production's API gets an
  Expo access token, so only it can send pushes to PuffinRide's phones.

### 3.5 Links that open the app

- A link to a ride, a booking, a trip, a conversation, a notice or a
  profile page opens the app when it is installed, on the same screen; the
  console (`/admin`), the API (`/v1`) and download links stay in the browser.
  An address the app does not have shows its not-found page (spec 31).
- Without the app, the same link opens the website, as today.

### 3.6 Older versions

- An app older than the oldest version the API still serves shows one
  screen, "Update PuffinRide", with a button to its store page, and nothing
  else.
- The API keeps working for every version at or above it: a change that
  removes or renames a field or route an app reads waits until no supported
  version reads it (a rule in the conventions, as the two-deploy rule is).
- Small fixes reach phones as over-the-air updates through Expo (EAS
  Update, as [CI/CD and releases](../engineering/ci-cd-and-releases.md)
  plans); a change to native code goes through the stores.

### 3.7 Builds and checks

- **On every pull request that changes the app:** the bundles as today,
  plus, new, an Android build run on an emulator and an iPhone build run on
  the simulator in GitHub Actions, free because the repository is public.
  Maestro journeys go through sign-up, Find, a booking, a message and
  sign-out against the test API, and save screenshots of each screen.
- **Store builds:** in Expo's cloud (EAS Build), started with a **Build the
  apps** button in GitHub Actions, as Release to production is (my call:
  Martin's PC is not needed; the command still works from it). It needs an
  Expo access token as a GitHub secret.
- **To the stores' test tracks:** EAS Submit sends each build to TestFlight
  and to Google Play's internal testing. Promoting a build to testers or to
  the public is always Martin's go.

### 3.8 Testing before the public release

- **Android:** internal testing for the team at once. With a personal Google
  Play account, Google also asks for a closed test with at least 12 testers
  who keep it for 14 days in a row before the app can go public; Google's
  review then takes about a week (checked 2026-11-27).
- **iPhone:** TestFlight, for the team at once, and for up to 10 000 testers
  by link after a short review by Apple.
- Then the App Store review (usually a day or two) and the Google Play
  release, staged to a share of phones first (CI/CD and releases).

### 3.9 Store pages

- **Name** PuffinRide; category **Travel**; for people 18 and over.
- **Texts:** Google Play in Icelandic and English. The App Store offers no
  Icelandic for store texts, so its page is in English (United Kingdom, the
  Iceland store's language), and so are its screenshots.
- **Screenshots** from the emulator and simulator runs, with the sample
  data only, never real people: six to eight screens per store, the sizes
  each store asks for. A feature graphic and an icon for Google Play, from
  the PuffinRide look.
- **Links:** privacy policy `https://puffinride.is/legal/privacy`; support
  `https://puffinride.is/about`; marketing `https://puffinride.is`.
- **Privacy answers** (Apple's privacy labels, Google's data safety form)
  from the [privacy register](../compliance/privacy-gdpr.md); a public page
  on the website, in both languages, says how to delete an account, as
  Google Play asks.
- **Age rating** answers: people chat and have profiles (user-generated
  content with reporting and blocking, spec 9); no ads, no gambling, no
  location tracking.
- **Notes for the reviewers:** a review account on production with a
  password, already through the phone check; how paying the driver in person
  works; where Report, Block and Delete my account are.
- **Countries:** every country both stores allow without a local licence,
  because visitors download from their own country's store (my call).
- Nothing on a store page mentions payments or fees (Martin's marketing
  rule).

### 3.10 Order of the work

Each step is a pull request or a few; the plan gives the details once this
spec is approved.

1. The emulator and simulator journeys in GitHub Actions (3.7). They need
   no account, so they start first.
2. The fixes those runs show, with the settings of 1.1.
3. Store-ready settings: the production profile, the app ID, the Build the
   apps button, over-the-air updates, and "Update PuffinRide" (3.6).
4. The iPhone without Google (3.3), with the sign-in thread's work.
5. Links that open the app (3.5), once the accounts give the team ID and
   the signing keys.
6. The store kit (3.9) and the account deletion page; the privacy register
   and the new privacy policy version (section 7).
7. Martin's go: test builds, testers, then the public release.

## 4. Rules

| ID | Rule |
| -- | ---- |
| R32.1 | Store builds talk only to `puffinride.is`. Staging builds stay with the team and never carry a tester's real data. |
| R32.2 | No build goes to testers outside the team, or to the public, without Martin's go. |
| R32.3 | A build goes to the stores only after the emulator and simulator journeys passed on the same code. |
| R32.4 | The API serves every app version at or above the oldest supported one; below it, the app shows only "Update PuffinRide". |
| R32.5 | The iPhone app offers Google sign-in only together with Sign in with Apple. |
| R32.6 | Store screenshots and review accounts hold sample data only. |

## 5. Screens

- **Update PuffinRide:** the puffin, the title "Update PuffinRide", one line
  ("This version no longer works. The new one is waiting in the store."),
  and one main button, "Open the App Store" or "Open Google Play". No tab
  bar, no way past it. As built:
  [iPhone, English](images/phone-apps/update-puffinride-iphone-en.png) and
  [Android, Icelandic, dark](images/phone-apps/update-puffinride-android-is-dark.png).
- **Sign-in on the iPhone:** the sign-in screen and step 1 without the
  Google button; everything else as on Android and the website.
- **Account deletion page** on the website (`/delete-account`, public, both
  languages, one column): how to delete an account in the app or on the
  website, what is erased, what is kept and for how long (from spec 11), and
  the contact address.
- Every other screen as it is.

## 6. Data and API

- `/v1/config` gets the oldest supported app version, from a setting (the
  first store release's version until a change needs more).
- The API serves `/.well-known/apple-app-site-association` and
  `/.well-known/assetlinks.json` from two settings: the Apple team ID, and
  the SHA-256 fingerprints of the Android signing keys (Google Play's and
  the upload key's). Without the settings, neither file is served.
- The app's config declares `applinks:puffinride.is` on the iPhone and
  verified `https://puffinride.is` links on Android, for the paths of 3.5.
- No new tables.

## 7. Privacy and safety

- New in the privacy register's providers: Google Play and the App Store
  (separate controllers for downloads, ratings and their own crash reports),
  and testers' details in TestFlight and Google Play testing. Firebase Cloud
  Messaging and Apple's push service are already Expo's sub-processors
  (ADR 0026).
- The privacy policy gets a new version naming them (ADR 0043), before the
  first build reaches testers outside the team.
- The apps add no analytics or tracking.
- Reporting, blocking and deleting an account work in the apps as on the
  website, which both stores ask of apps where people meet and chat.

## 8. Texts

New keys in `packages/i18n` (both languages): the "Update PuffinRide"
screen and its buttons, any permission reason the phones still ask for, and
the account deletion page. Store texts live in the repository (3.9) in both
languages.

## 9. Testing

- The emulator and simulator journeys of 3.7, on every pull request that
  changes the app, with screenshots kept for each run.
- VoiceOver and TalkBack labels on the journeys' screens, and the largest
  text size on a small phone, as spec 31 asks of the website.
- Unit and screen tests for "Update PuffinRide" and the iPhone's sign-in
  without Google; API tests for the two `.well-known` files and the config
  field.
- Manual (Martin): install from TestFlight and Google Play internal
  testing, sign in, get a push, open a link from an email.

## 10. Out of scope, later

- ~~Sign in with Apple, and revoking Apple's tokens at account deletion
  (spec 19, section 10).~~ Both came before the store release:
  [spec 37](2026-11-28-sign-in-with-apple-in-the-stores.md).
- Face ID or fingerprint in the apps (spec 27, 3.8, with its own ADR).
- iPad layouts.
- Error reports from the apps (Sentry on phones), after a privacy check.
- Moving the apps to the company's accounts, with a new version of the
  Terms and the privacy policy.

## 11. Martin's steps

In the order of what they unblock:

1. **Choose whose name the accounts are in** (section 12): done,
   personal now.
2. **Google Play Console:** a personal account (25 US dollars once), the
   ID check, and the check on an Android phone with the Play Console app.
3. **Apple Developer Program:** as an individual, 99 US dollars a year,
   from the Apple Developer app on the iPhone.
4. **expo.dev:** an account and the project `puffinride`; send the project ID
   (not a secret) and add an Expo access token as a GitHub secret.
5. **Firebase:** a project for production push (the runbook's steps).
6. **The stores' keys for Expo:** an App Store Connect API key and a Google
   Play service account, added in expo.dev, so builds reach the test tracks
   by themselves.
7. **Trader status** for the EU in both stores. A trader's name, address,
   phone and email show on the store page in EU countries; the address and
   email are already public in the Terms.
8. **Testers:** 12 Android testers who keep the app for 14 days in a row
   (the personal account's closed test).
9. **A review account** on production for the reviewers.
10. **Go** for each step to testers and to the public.

## 12. Decision for Martin

Whose name the store accounts are in, until the ehf. exists. **Martin
chose "Both personal now, move later"** on a decision card, 2026-11-27
([ADR 0051](../decisions/0051-store-apps-in-martins-name-until-the-company.md)).
The options were:

| Option | What happens |
| ------ | ------------ |
| **Both personal now, move later** (recommended) | Martin's name shows as the seller, as it already stands as the operator in the Terms. Test builds within days of the accounts. Both stores let an app move to another account later with its users and reviews. |
| Google personal, Apple waits | Android starts now; the iPhone app waits for the ehf., its D-U-N-S number and Apple's check of the company, likely 4 to 8 weeks. |
| Both wait for the ehf. | The company's name from the first day and no 12-tester test on Google Play, but nothing installable until the ehf., the D-U-N-S number and both stores' company checks. |

Sign in with Apple waits for the company's account either way (3.3): an
app's Sign in with Apple users get new identifiers when the app moves to
another account, so starting it on a personal account means moving them
later. (Martin turned it on on his own team on 2026-11-28 all the same:
[spec 37](2026-11-28-sign-in-with-apple-in-the-stores.md).)

## 13. Decisions

| # | Question | Answer |
| - | -------- | ------ |
| 1 | Whose name are the accounts in? | Martin's own now, moved to the company's later (Martin, 2026-11-27, ADR 0051) |
| 2 | Which devices? | Android phones and tablets; iPhone only (my call) |
| 3 | Google sign-in on the iPhone? | Not until Sign in with Apple (my call); both since 2026-11-28, when Martin turned Apple on (spec 37) |
| 4 | Which server do store builds use? | Production only (R32.1) |
| 5 | Where are builds started? | A button in GitHub Actions; the PC still works (my call) |
| 6 | How are the apps checked before the stores? | Emulator and simulator journeys in GitHub Actions (my call) |
| 7 | Store page languages? | Google Play in Icelandic and English; the App Store in English, which is all it offers for Iceland |
| 8 | Over-the-air updates? | Yes, through EAS Update, as CI/CD and releases plans |
| 9 | Which countries? | Every country both stores allow without a local licence (my call) |
