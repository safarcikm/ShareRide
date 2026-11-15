# App builds runbook

**Owner:** Martin · **Last reviewed:** 2026-11-15

How the phone apps are built and reach the team's phones. Builds run in
Expo's cloud (EAS Build, [ADR 0003](../decisions/0003-cross-platform-client-expo.md)),
which has its own Macs, so a Windows PC is enough. The settings are in
[`apps/mobile/eas.json`](../../apps/mobile/eas.json) and
[`apps/mobile/app.json`](../../apps/mobile/app.json).

The iPhone comes first. An Android build to install by hand comes with push
([below](#android-build-with-push)); Google Play and development builds
follow ([milestone 2 plan](../plans/2026-11-13-milestone-2-hosted-and-connected.md#pr-5b-featmobile-development-builds-android-and-maestro)).

| Build | For | What it is |
| ----- | --- | ---------- |
| `preview` on iPhone | The team | The app on its own, signed for the App Store and sent to **TestFlight**, Apple's app for testing. It talks to [staging](staging.md) and needs no computer once installed |
| `preview-apk` on Android | The team | The same app as an APK file, installed straight from its build page on a phone or the emulator, with push. No Google Play account needed |

| Setting | Value |
| ------- | ----- |
| App ID (bundle identifier) | `is.shareride.app.preview`, under Martin's own Apple account ([plan, decision 6](../plans/2026-11-13-milestone-2-hosted-and-connected.md#3-decisions-for-martin)). The store app ID comes with the company's account |
| API | `https://shareride-staging-api.onrender.com`, the address in the staging runbook. If Render gave staging another address, change `EXPO_PUBLIC_API_URL` in `eas.json` first |
| Build number | Counted up by Expo for each build; the version (`0.1.0`) is in `app.json` |
| Error reports | Off on phones for now: the build has no Sentry DSN until native crash reports are checked against the [privacy table](../compliance/privacy-gdpr.md#providers). Testers' crash reports and feedback reach App Store Connect through TestFlight |

Expo's free plan includes 15 iPhone builds a month, in a slower queue. The
Starter plan ($19 a month) has a faster one if the wait gets in the way.

## Set it up (once)

Martin's steps, with the shared project email address.

1. **Apple Developer Program.** On the iPhone, install the Apple Developer
   app and sign in with the Apple ID (two-factor sign-in must be on). Tap
   **Account**, then **Enroll**, as an individual with the legal name and a
   passport for the photo check. It costs $99 a year. Approval can take a
   few days.
2. **Expo.** Create an account at expo.dev. Choose **Create a project**,
   name it `shareride` (the slug must be `shareride`), and send the
   project ID to the build thread. It is not a secret; it goes in `app.json`
   as `extra.eas.projectId`, so builds know their project.
3. **The PC.** Follow the README's [one-time setup](../../README.md#one-time-setup)
   (Git, Node.js 26, pnpm 12, the repository, `pnpm install`), then install
   Expo's command-line tool and sign in:

   ```sh
   npm install --global eas-cli@27
   eas login
   ```

## Build and send to TestFlight

Pull the latest `main` first (`git pull`), so the build has the project ID.
Then, in the repository folder:

```sh
cd apps/mobile
eas build --platform ios --profile preview --auto-submit
```

The first time, the command asks some questions:

- **Sign in to Apple:** the Apple ID of the developer account, then the
  six-digit code Apple shows on the iPhone.
- **Distribution certificate and provisioning profile:** answer yes to let
  Expo make them. Expo keeps them, so later builds ask nothing.
- **App Store Connect API key** (for the upload to TestFlight): answer yes
  to let Expo make one.

Right after the build is queued, the command also creates the app in App
Store Connect, named **ShareRide Preview** (`appName` in `eas.json`). The
name ShareRide stays free for the company's store app; on the phone the app
is still called ShareRide. If the name is taken, it adds a few random
letters, such as `ShareRide Preview (a1b2c3)`, which can be changed in App
Store Connect. It also creates an internal TestFlight group, **Team
(Expo)**, which gets every new build by itself, and adds the account's
admins to it.

The terminal shows a link to the build's page on expo.dev, where it can be
followed. The build waits in the queue, builds and uploads to App Store
Connect. Apple then processes it, often in 5 to 10 minutes, and sends an
email when it is ready.

Later builds are the same command, without the questions.

### Install it on the iPhone

The first time:

1. In [App Store Connect](https://appstoreconnect.apple.com), open
   **Apps**, then **ShareRide Preview**, then **TestFlight**.
2. Under **Internal Testing**, open **Team (Expo)** and check that you are
   listed. Add other people on the App Store Connect team there; do not make
   a second group.
3. On the iPhone, install **TestFlight** from the App Store, open the
   invitation email, and install ShareRide.

Internal testers need no review from Apple. A build expires after 90 days;
a newer build replaces it.

### If it fails

- **Apple asks to accept an agreement:** a new developer account must accept
  Apple's latest agreement first. Accept it in the Apple Developer account
  or in App Store Connect (**Business**), then run the command again.
- **The upload failed but the build finished:** send it again with
  `eas submit --platform ios --profile preview --latest`.
- **Anything else:** send the error from the build page on expo.dev to the
  build thread. Do not paste keys or certificates.

## Android build with push

Push needs a build of the app: Expo Go cannot receive push. Pushes go
through Expo's push service and Google's Firebase Cloud Messaging
([ADR 0026](../decisions/0026-push-through-expo.md)), so Expo needs a
Firebase project's key. Do this once the Expo project ID is in `app.json`
(step 2 above) and the PC is set up (step 3).

### Set it up (once)

1. **Firebase project.** At [console.firebase.google.com](https://console.firebase.google.com),
   with the shared project Google account, choose **Create a project**,
   name it `shareride-staging`, and turn Google Analytics off.
2. **The Android app in it.** In the project, choose **Add app**, then
   **Android**. Package name: `com.shareride.app`; nickname: ShareRide.
   Choose **Register app**, then **Download google-services.json**. Skip the
   remaining steps: Expo does them.
3. **Give the file to Expo, not to the repository.** On
   [expo.dev](https://expo.dev), open the `shareride` project, then
   **Project settings**, **Environment variables**, **Add Variables**. Name
   `GOOGLE_SERVICES_JSON`, the file as its value, environment **preview**
   only, visibility **Secret**. Builds read it through `app.config.ts`;
   the repository ignores the file, so it is never committed.
4. **The push key.** Back in Firebase, open the gear, **Project settings**,
   **Service accounts**, then **Generate new private key** and **Generate
   key**. On expo.dev, open **Credentials**, **Android**, add the
   application identifier `com.shareride.app`, then under **Service
   credentials**, **FCM V1 service account key**, choose **Add a service
   account key**, upload the downloaded file and **Save**. Then delete the
   file from the PC: Expo keeps the key, and Firebase can make a new one.
5. **Recommended: only the API may push.** On expo.dev, in the account's
   settings under [Access tokens](https://expo.dev/settings/access-tokens),
   make a token and add it to Render's `shareride-staging` environment
   group as `EXPO_ACCESS_TOKEN` (a secret, never in chat or the
   repository). Once staging has restarted, turn on **Enhanced security
   for push notifications** on the same expo.dev page. In that order: once
   it is on, a push without the token is refused.

### Build and install

```sh
cd apps/mobile
eas build --platform android --profile preview-apk
```

The first time, answer yes when it offers to make an Android keystore;
Expo keeps it, so later builds ask nothing. When the build is done, its
page on expo.dev shows **Install** and a QR code:

- **On a phone:** scan the QR code, download the file and allow installing
  apps from that browser when Android asks.
- **On the emulator** (Android Studio): download the `.apk` and drag it
  onto the emulator's window.

### Try push

1. Sign in on the Android app with one phone number, and on the web, in
   another browser, with a second one. Book a seat on the other person's
   trip so the two can chat.
2. Until the app asks for notifications itself (milestone 5, PR 8), allow
   them by hand: Android **Settings**, **Apps**, **ShareRide**,
   **Notifications**, on. Then close ShareRide fully (swipe it away from
   recent apps) and open it again, so it registers the phone.
3. Close the app on the phone, and send a message from the web. A push
   arrives within about ten seconds; tapping it opens the conversation.
   With the conversation open on the phone, the message appears without a
   push.

If no push arrives, look for `not sent` in staging's logs on Render and
send the line (it carries no tokens or text) to the build thread.

## What a build uses

Settings come from `eas.json` and are not secret: the staging address and
`EXPO_PUBLIC_APP_ENV=staging`. The build also reads Expo's **preview**
environment variables on expo.dev (`environment` in `eas.json`), which hold
only `GOOGLE_SERVICES_JSON`; keep them so, and change `eas.json` instead. Without that line, an
App Store build would read Expo's production variables. Never put a secret
in an `EXPO_PUBLIC_` setting: it is readable inside the app.

Expo stores the Apple distribution certificate, the provisioning profile and
the App Store Connect API key in its credentials service. To withdraw them:
remove the key in App Store Connect (**Users and Access**, **Integrations**)
and revoke the certificate in the Apple Developer account
(**Certificates**); the next build makes new ones.
