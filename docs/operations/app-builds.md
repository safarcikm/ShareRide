# App builds runbook

**Owner:** Martin · **Last reviewed:** 2026-11-27

How the phone apps are built and reach the stores' test tracks
([spec 32](../specs/2026-11-27-phone-apps-in-the-stores.md),
[ADR 0051](../decisions/0051-store-apps-in-martins-name-until-the-company.md)).
Builds run in Expo's cloud (EAS Build,
[ADR 0003](../decisions/0003-cross-platform-client-expo.md)), which has its
own Macs, started by the **Build the apps** button in GitHub Actions. The
settings are in [`apps/mobile/eas.json`](../../apps/mobile/eas.json) and
[`apps/mobile/app.json`](../../apps/mobile/app.json).

| Build | For | What it is |
| ----- | --- | ---------- |
| `production` on iPhone | Testers, then the App Store | Signed for the App Store and sent to **TestFlight**, Apple's app for testing. It talks to `https://puffinride.is` |
| `production` on Android | Testers, then Google Play | An app bundle sent to Google Play's **internal testing** as a draft. It talks to `https://puffinride.is` |
| `preview` on Android | The team | An APK file installed straight from its build page, against [staging](staging.md), with push. No Google Play needed |

There is no staging build for the iPhone: testers outside the team use the
production app, and staging never holds a tester's real data (R32.1).

| Setting | Value |
| ------- | ----- |
| App ID | `is.puffinride.app` in both stores, under Martin's own accounts until the company has its own (ADR 0051) |
| expo.dev project | `puffinride`, owner `puffinride.is`; its ID is in `app.json` (`extra.eas.projectId`) |
| Version | `1.0.0` in `app.json`; build numbers counted up by Expo for each build |
| Over-the-air updates | Channel `production` or `preview`, for builds of the same version only ([below](#over-the-air-updates)) |
| Error reports | Off on phones for now: the build has no Sentry DSN until native crash reports are checked against the [privacy table](../compliance/privacy-gdpr.md#providers). Testers' crash reports and feedback reach App Store Connect through TestFlight |

Expo's free plan includes 15 iPhone builds a month, in a slower queue. The
Starter plan ($19 a month) has a faster one if the wait gets in the way.

## Set it up (once)

Martin's steps (spec 32, section 11). Never paste a password, key or token
in a chat; each goes only where its step says.

1. **Apple Developer Program**, as an individual: done 2026-11-27, team ID
   `855RK3C94D`.
2. **expo.dev:** the account `puffinride.is` and the project `puffinride`:
   done 2026-11-27.
3. **Expo's key for GitHub:** a robot with the Developer role on expo.dev,
   its token in the repository's **Settings**, **Secrets and variables**,
   **Actions**, as `EXPO_TOKEN`: done 2026-11-27.
4. **Apple's certificate and keys, from the PC.** Expo can only make them
   while someone signs in to Apple, so this is the one step that needs the
   PC. With the repository up to date (`git pull`, then `pnpm install`):

   ```sh
   cd apps/mobile
   npx eas-cli@27.11.0 login
   npx eas-cli@27.11.0 credentials --platform ios
   ```

   Choose the **production** profile, then sign in with the Apple ID of the
   developer account and the six-digit code Apple shows on the iPhone. Then:

   - **Build Credentials: Manage everything needed to build your
     project**, then **All: Set up all the required credentials**: yes to
     every question, so Expo registers the app ID `is.puffinride.app` and
     makes the distribution certificate and the provisioning profile.
   - **Go back**, **Push Notifications: Manage your Apple Push
     Notifications Key**, **Set up your project to use Push
     Notifications**: yes, a new one. "All" does not make it, and a build
     from GitHub cannot ask.
   - **Go back**, **App Store Connect: Manage your API Key**, **Set up your
     project to use an API Key for EAS Submit**: yes, a new one.

   In the same session, Android's upload key and push key (the Firebase
   file from [Android build with push](#android-build-with-push), step 4):

   ```sh
   npx eas-cli@27.11.0 credentials --platform android
   ```

   - The **production** profile, then **Keystore: Manage everything needed
     to build your project**, **Set up a new keystore**, with the suggested
     name.
   - **Go back**, **Google Service Account**, **Manage your Google Service
     Account Key for Push Notifications (FCM V1)**, **Set up a Google
     Service Account Key for Push Notifications (FCM V1)**, and the full
     path to the Firebase file. Then delete the file from the PC.

   Expo keeps them all; nothing goes in the repository. (The expo.dev
   page for a new Android app identifier asks to upload an upload key, so
   use the command line instead.)
5. **The app in App Store Connect.** At
   [appstoreconnect.apple.com](https://appstoreconnect.apple.com), **Apps**,
   **+**, **New App**: platform iOS, name **PuffinRide** (if it is taken,
   **PuffinRide Iceland**), primary language **English (U.K.)** (the App
   Store has no Icelandic page), bundle ID `is.puffinride.app`, SKU
   `puffinride`, full access. Then **App Information** shows its **Apple
   ID**, a number. Send it to the build thread: it is not a secret, and it
   goes in `eas.json` as `ascAppId`, which builds need to send to
   TestFlight. Done 2026-11-27: PuffinRide's Apple ID is `6840158626`.
6. **Google Play**, once the account is approved: the app in the Play
   Console, and a service account so builds reach internal testing by
   themselves (sent separately, with the account).
7. **Push on Android:** the Firebase project `puffinride`. Its
   `google-services.json` goes on expo.dev, **Project settings**,
   **Environment variables**, as `GOOGLE_SERVICES_JSON`, type **File**,
   visibility **Secret**, environments **production** and **preview**.
   The FCM V1 key: made as in [Android build with push](#android-build-with-push),
   step 4, and given to Expo in step 4 above. The Firebase project's ID is
   `puffinride-b0d56`; the Google sign-in project (`puffinride-515516`) is
   another one.

The organisation `puffinride.is` on Google Cloud blocks service account
keys (`iam.disableServiceAccountKeyCreation`), which both the FCM key and
the Play service account need. Switch the block off for the one project,
make the key, then switch it back on; the key keeps working. The Cloud
Console's role search did not find the role needed, so use **Cloud Shell**
(the **>_** icon at the top right of the Cloud Console), signed in as
`admin@puffinride.is`:

1. Once: give yourself the role Organization Policy Administrator.

   ```sh
   ORG=$(gcloud organizations list --format="value(name.basename())" --limit=1)
   gcloud organizations add-iam-policy-binding "$ORG" --member="user:admin@puffinride.is" --role="roles/orgpolicy.policyAdmin" --condition=None
   ```

2. Find the project's ID (`gcloud projects list`), then set it, for
   example `PROJECT=puffinride-12345`.
3. Switch the block off for that project. Answer **y** if it offers to
   enable an API; "not found" for the second one is fine.

   ```sh
   for c in iam.disableServiceAccountKeyCreation iam.managed.disableServiceAccountKeyCreation; do
     printf 'name: projects/%s/policies/%s\nspec:\n  rules:\n  - enforce: false\n' "$PROJECT" "$c" > off.yaml
     gcloud org-policies set-policy off.yaml
   done
   ```

4. Wait a few minutes, make the key, then switch the block back on:

   ```sh
   for c in iam.disableServiceAccountKeyCreation iam.managed.disableServiceAccountKeyCreation; do gcloud org-policies delete "$c" --project="$PROJECT"; done
   ```

## Build

In GitHub, **Actions**, **Build the apps**, **Run workflow**: branch
**main**, the app (both, android or iphone) and the profile (`production`,
or `preview` for the team's Android file).

1. The phone journeys run first on the same commit, on an emulator and the
   simulator (about 45 minutes). If one fails, nothing is built (R32.3).
2. Then Expo builds. The run's summary links to the builds on expo.dev,
   where they can be followed; each waits in Expo's queue, then builds.
3. A `production` build is sent on by itself: the iPhone build to App
   Store Connect, where Apple processes it in 5 to 10 minutes and emails
   when it is ready; the Android build to Google Play's internal testing,
   as a draft.

Sending a build to testers outside the team or to the public is always
Martin's go (R32.2), in App Store Connect and the Play Console.

The same build can be started from the PC, with the same settings, but it
builds the files on the PC rather than what the journeys checked:
`npx eas-cli@27.11.0 build --platform ios --profile production --auto-submit`.

### Install it on the iPhone

The first time:

1. In App Store Connect, open **Apps**, **PuffinRide**, **TestFlight**.
2. Under **Internal Testing**, make a group named **Team** and add yourself
   and the others on the App Store Connect team. Turn on automatic
   distribution, so each new build reaches them.
3. On the iPhone, install **TestFlight** from the App Store, open the
   invitation email, and install PuffinRide.

Internal testers need no review from Apple. A build expires after 90 days;
a newer build replaces it.

### The first Android build

Google's interface for uploads may refuse an app's very first upload. If
the submission on expo.dev says so, download the `.aab` from the build's
page and upload it once by hand: Play Console, **Test and release**,
**Testing**, **Internal testing**, **Create new release**. Later builds go
up by themselves.

### If it fails

- **Apple asks to accept an agreement:** accept Apple's latest agreement in
  App Store Connect (**Business**), then run the button again.
- **Credentials are missing:** step 4 of the setup has not been done, or
  was done for another profile.
- **The upload failed but the build finished:** from the PC,
  `npx eas-cli@27.11.0 submit --platform ios --profile production --latest`
  (or `android`).
- **Anything else:** send the error from the build's page on expo.dev to
  the build thread. Do not paste keys or certificates.

## Android build with push

Push needs a build of the app: Expo Go cannot receive push. Pushes go
through Expo's push service and Google's Firebase Cloud Messaging
([ADR 0026](../decisions/0026-push-through-expo.md)), so Expo needs a
Firebase project's key.

### Set it up (once)

1. **Firebase project.** At [console.firebase.google.com](https://console.firebase.google.com),
   with the shared project Google account, the project `puffinride`, with
   Google Analytics off.
2. **The Android app in it.** In the project, choose **Add app**, then
   **Android**. Package name: `is.puffinride.app`; nickname: PuffinRide.
   Choose **Register app**, then **Download google-services.json**. Skip the
   remaining steps: Expo does them.
3. **Give the file to Expo, not to the repository**, as setup step 7 says.
   Builds read it through `app.config.ts`; the repository ignores the file,
   so it is never committed.
4. **The push key.** Back in Firebase, open the gear, **Project settings**,
   **Service accounts**, then **Generate new private key** and **Generate
   key** (the organisation policy above blocks it until switched off for
   the project). Give the file to Expo from the PC, as setup step 4 says,
   then delete it: Expo keeps the key, and Firebase can make a new one.
   Once the app identifier `is.puffinride.app` exists on expo.dev, the key
   can also be changed there: **Credentials**, **Android**,
   `is.puffinride.app`, **FCM V1 service account key**.
5. **Recommended: only the API may push.** On expo.dev, in the account's
   settings under [Access tokens](https://expo.dev/settings/access-tokens),
   make a token and add it to Render's environment groups as
   `EXPO_ACCESS_TOKEN` (a secret, never in chat or the repository). Once
   the API has restarted, turn on **Enhanced security for push
   notifications** on the same expo.dev page. In that order: once it is on,
   a push without the token is refused.

### Build and install

Run **Build the apps** with **android** and **preview**. When the build is
done, its page on expo.dev shows **Install** and a QR code:

- **On a phone:** scan the QR code, download the file and allow installing
  apps from that browser when Android asks. A phone with the Google Play
  version installed must remove it first: the two are signed differently.
- **On the emulator** (Android Studio): download the `.apk` and drag it
  onto the emulator's window.

### Try push

1. Sign in on the Android app, and on the web, in another browser, as a
   second person. Book a seat on the other person's trip so the two can
   chat.
2. Allow notifications when the app asks.
3. Close the app on the phone, and send a message from the web. A push
   arrives within about ten seconds; tapping it opens the conversation.
   With the conversation open on the phone, the message appears without a
   push.

If no push arrives, look for `not sent` in the API's logs on Render and
send the line (it carries no tokens or text) to the build thread.

## What a build uses

Settings come from `eas.json` and are not secret: the API's address and
`EXPO_PUBLIC_APP_ENV`, `production` or `staging`. The build also reads
Expo's environment variables on expo.dev for its profile's `environment`
(`production` or `preview`), which hold only `GOOGLE_SERVICES_JSON`; keep
them so, and change `eas.json` instead. Never put a secret in an
`EXPO_PUBLIC_` setting: it is readable inside the app.

Expo stores the Apple distribution certificate, the provisioning profile,
the push key, the App Store Connect API key and the Android upload key in
its credentials service. To withdraw Apple's: remove the key in App Store
Connect (**Users and Access**, **Integrations**) and revoke the certificate
in the Apple Developer account (**Certificates**), then run setup step 4
again.

## Over-the-air updates

Each build asks Expo for a newer version of the app's JavaScript on its
channel (`production` or `preview`) and takes it at the next start. An
update reaches only builds of the same version (`runtimeVersion` follows
`version` in `app.json`), so:

- **A change to native code** (a new Expo package, a change to `app.json`
  or `app.config.ts`) raises the version in `app.json` (`1.0.0` to
  `1.1.0`) and goes through the stores.
- **A fix to the screens or texts** can go as an update to the builds of
  that version. Until a button for updates exists, none is published and
  the builds run what they were built with.

The check sends Expo the phone's network address and a random ID the app
makes on install, never anything about the account (the
[privacy register's providers](../compliance/privacy-gdpr.md#providers)).

## What the apps ask the phone for

The store pages' privacy answers and the reviewers read these from the
built app, so `app.json` keeps them to what the app uses
(`src/__tests__/phone-settings.test.ts`, spec 32, section 1.1):

- Photos and the camera, for a profile photo, with our own reason in
  `app.json` (`expo-image-picker`); no microphone.
- No Face ID (`expo-secure-store` with `faceIDPermission: false`) and no
  motion data (`expo-sensors` with `motionPermission: false`): shaking for
  feedback reads the accelerometer, which iOS gives without asking.
- Android: no drawing over other apps (`SYSTEM_ALERT_WINDOW` blocked); the
  storage permissions stay only for Android 12 and older.
- iPhone only (`supportsTablet: false`), so the App Store asks for no iPad
  screenshots. `expo-system-ui` lets Android follow the phone's dark mode.

Check what a change makes with `npx expo config --type introspect` in
`apps/mobile`: it prints the Info.plist and Android manifest.
