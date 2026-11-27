# Plan: The Android and iPhone apps in the stores

**Goal:** both phone apps built, run and checked in CI, store-ready against
`puffinride.is`, with push, links that open the app and the store pages, so
Martin can send them to testers and then the stores on his go.

**Architecture:** one Expo codebase (ADR 0003). GitHub Actions builds an
Android release build for an emulator and an iPhone release build for the
simulator, starts the test API on the same machine and runs Maestro
journeys. Store builds stay in Expo's cloud (EAS Build and Submit), started
from a workflow button.

**Spec:** [spec 32](../specs/2026-11-27-phone-apps-in-the-stores.md);
[ADR 0051](../decisions/0051-store-apps-in-martins-name-until-the-company.md).

## Global constraints

- Store builds talk only to `https://puffinride.is` (R32.1); anything that
  lets a build talk to plain `http` exists only in the CI build (Task 1).
- No build to testers outside the team or to the public without Martin's go
  (R32.2). Claude never presses Submit for review or promotes a track.
- Screenshots and review accounts hold the seed's sample data only (R32.6).
- Every new text in `packages/i18n/src/messages/en.ts` and `is.ts`.
- Node 26 and pnpm 12, as `.nvmrc` and `package.json` pin them; Expo
  packages added with `npx expo install`.
- A new runtime dependency is justified in its PR.

## Review focus

1. **The CI-only `http` allowance reaching a store build.** Task 1's config
   test: without `E2E_CLEARTEXT=1`, `app.config.ts` adds no cleartext
   setting.
2. **Version compare of "Update PuffinRide".** `1.0.10` is newer than
   `1.0.9`; a missing, empty or garbled oldest version never blocks anyone
   (Task 4's domain tests).
3. **An iPhone member with only Google and no verified email.** Spec 19
   keeps the provider's email only when verified, so such a member has no
   way in on the iPhone. Task 5's screen test: the sign-in screen on iOS
   says to sign in on the website or Android once and add an email.
4. **App links taking over what must stay in the browser.** `/admin`,
   `/v1`, download links and the sign-in return stay out of both files
   (Task 6's API tests).
5. **A store profile pointing at staging.** Task 3's config test pins
   `production` to `https://puffinride.is` and `EXPO_PUBLIC_APP_ENV`
   `production`.

## PR 1: the spec, the ADR and this plan (`docs(apps)`, #279)

- [x] Spec 32, ADR 0051, the roadmap's lines, the indexes.
- [x] This plan.

## PR 2: both apps run in CI (`ci(mobile)`)

### Task 1: a build that reaches the test API

**Files:** `apps/mobile/app.config.ts`,
`apps/mobile/src/__tests__/phone-builds.test.ts` (new),
`apps/api/src/e2e-server.ts`.

- [ ] Test first: `phone-builds.test.ts` loads `app.config.ts` with and
  without `E2E_CLEARTEXT=1`; only with it does the Android manifest change
  allow cleartext, and only to the test API.
- [ ] `app.config.ts`: when `E2E_CLEARTEXT` is `1`, a config plugin
  (`withAndroidManifest` from `expo/config-plugins`, no new package) sets
  `usesCleartextTraffic`. The iPhone simulator reaches `localhost` through
  App Transport Security's local networking exception; check it in the
  prebuilt `Info.plist`.
- [ ] `e2e-server.ts`: `GET /e2e/latest-code?to=<email or +354 number>`
  answers `{ "code": "123456" }` from the newest outbox entry for that
  address, for Maestro, which cannot read the outbox file. Test with the
  e2e server's other routes, if they have tests; otherwise by the journey.

### Task 2: the journeys and the workflow

**Files:** `apps/mobile/maestro/` (new: `config.yaml`, `sign-up.yaml`,
`find-and-book.yaml`, `message-and-sign-out.yaml`,
`scripts/latest-code.js`), `.github/workflows/phone-apps.yml` (new),
`docs/engineering/ci-cd-and-releases.md`,
`docs/engineering/testing-strategy.md`, `CLAUDE.md` (the command).

- [ ] Journeys in English, then the same sign-up in Icelandic with the
  phone's language set to Icelandic: sign up with an email code and a phone
  code, Find, open a sample ride, book a seat, open its messages, send one,
  sign out. `takeScreenshot` on every screen. Selectors by `testID` where
  the web journeys use them, by text otherwise.
- [ ] `phone-apps.yml`, on pull requests that touch `apps/mobile/**`,
  `packages/**`, `apps/api/**` or the workflow, and by hand:
  - **Android** (`ubuntu-latest`): PostgreSQL 18 with PostGIS as a service,
    the test API on port 3001, `expo prebuild --platform android`,
    `./gradlew assembleRelease` with `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001`
    and `E2E_CLEARTEXT=1`, an emulator started from the runner's SDK (an
    emulator action tried first hung after the journeys), Maestro (pinned
    version), the journeys.
  - **iPhone** (`macos-latest`): PostgreSQL 18 and PostGIS from Homebrew
    (Postgres.app if Homebrew's PostGIS lacks 18), the test API,
    `expo prebuild --platform ios`, `pod install`, `xcodebuild` Release for
    the simulator without signing, `xcrun simctl install`, the journeys
    with `EXPO_PUBLIC_API_URL=http://localhost:3001`.
  - Both upload the screenshots and Maestro's report as artifacts, also
    when a journey fails.
- [ ] Docs: the end-to-end row in CI/CD and releases, how to run one
  journey locally, the actions and Maestro named in the PR description.
- Verify: both jobs green on the PR; screenshots attached to the thread.

## PR 3 and on: what the phone runs show (`fix(mobile)`)

- [x] `expo-system-ui` for Android's dark mode; test:
  `phone-settings.test.ts`.
- [x] Permission texts: `expo-secure-store` with `faceIDPermission: false`;
  `expo-sensors` with `motionPermission: false` (the shake reads only the
  accelerometer, whose iOS module never asks for motion permission).
- [x] `android.blockedPermissions`: `android.permission.SYSTEM_ALERT_WINDOW`.
- [x] `ios.supportsTablet: false`.
- [x] The status bar (the phone's clock and battery) takes the app's light
  or dark look, with `expo-status-bar` at the root: on Android it was
  white over the light sky of Find. Test: `status-bar.test.tsx`.
- [x] Each problem the screenshots show, with a Maestro step or a screen
  test that fails first. One PR per kind of problem. The first green runs
  (2026-11-27, both phones, all six journeys) showed only the status bar
  above. Their screens: [iPhone](../specs/images/phone-apps/first-run-iphone.jpg)
  and [Android](../specs/images/phone-apps/first-run-android.jpg).

## PR 4: store-ready settings (`feat(mobile)`)

### Task 3: the production profile and the button

**Files:** `apps/mobile/eas.json`, `apps/mobile/app.json`,
`apps/mobile/src/__tests__/iphone-builds.test.ts` (renamed
`store-builds.test.ts`), `.github/workflows/build-apps.yml` (new),
`docs/operations/app-builds.md`.

- [x] Tests first: `production` builds for the store with
  `EXPO_PUBLIC_API_URL` `https://puffinride.is`, `EXPO_PUBLIC_APP_ENV`
  `production`, Expo's `production` environment and auto-incremented build
  numbers; `ios.bundleIdentifier` and `android.package` are
  `is.puffinride.app`; `version` `1.0.0`; `submit.production` sends iOS to
  TestFlight and Android to the `internal` track as a draft.
- [x] `submit.production.ios.ascAppId`, once Martin has made the app in App
  Store Connect (runbook, setup step 5): EAS Submit needs it with an API
  key. PuffinRide's Apple ID is `6840158626` (2026-11-27).
- [x] `preview` stays as the team's staging Android APK only; the
  `.preview` iPhone app ID goes.
- [x] Over-the-air updates: `expo-updates` (`npx expo install`), channels
  `production` and `preview`, `runtimeVersion` from the app version. The
  update's URL comes with the expo.dev project ID. Version 58.0.22, as
  58.0.23 was a day old and pnpm waits for a release to age.
- [x] `build-apps.yml`: a `workflow_dispatch` button with platform (both,
  Android, iPhone) and profile; it needs the phone journeys green on the
  same commit (R32.3), then runs `eas build --non-interactive --no-wait
  --auto-submit` with `EXPO_TOKEN` from the repository's secrets. The
  journeys run first in the same run (`phone-apps.yml` as a called
  workflow), as a squash merge makes a commit on `main` no pull request
  ran; production builds come from `main` only.
- [x] The runbook: Martin's steps of spec 32, section 11, with links, in
  place of the preview-only setup. Apple's certificate needs one run of
  `eas credentials` on the PC: EAS makes it only while someone is signed
  in to Apple, never in a `--non-interactive` build.

## PR 5: "Update PuffinRide" (`feat(app-version)`)

### Task 4: the oldest version the API serves

**Files:** `packages/domain/src/app-version.ts` (new) and its test,
`packages/contracts` (the config schema), `apps/api` (config route and
its test), `apps/mobile/src/app/_layout.tsx`,
`apps/mobile/src/app-version/update-screen.tsx` (new),
`apps/mobile/src/__tests__/update-app.test.tsx` (new), `packages/i18n`,
`docs/engineering/conventions.md`.

- [x] Domain, test first: `isOlderThan(version: string, oldest: string |
  null): boolean`; numbers compared part by part; `null`, empty or not
  `x.y.z` never blocks.
- [x] `/v1/config` gets `oldestAppVersion: string | null` from the setting
  `OLDEST_APP_VERSION`.
- [x] The app, on iOS and Android only, shows the update screen of spec
  32, section 5, with the store links
  (`itms-apps://apps.apple.com/app/id6840158626` for the App Store;
  `market://details?id=is.puffinride.app`
  with the `https://play.google.com/...` fallback).
- [x] Conventions: a field or route an app reads stays until no supported
  version reads it.

## PR 6: the iPhone without Google (`feat(auth)`)

### Task 5: providers per platform

**Files:** `packages/domain/src/auth/sign-in-providers.ts` and its test,
`apps/mobile/src/sign-in/provider-buttons.tsx`, the Sign-in methods
screen, `apps/mobile/src/__tests__/provider-sign-in.test.tsx`.

- [x] Tell the "Make sign-in easiest" thread first: it is changing the same
  screens. (Not needed: it had finished, merged and released, on
  2026-11-27 before this PR.)
- [x] Domain, test first: `providersOffered(enabled: SignInProvider[],
  platform: "ios" | "android" | "web"): SignInProvider[]` drops `google`
  on `ios` unless `apple` is enabled too (R32.5).
- [x] Screens: sign-in and step 1 without the Google button on iOS;
  Sign-in methods lists a linked Google with Remove but no Add on iOS; the
  Review focus 3 note. The app reads the platform through
  `apps/mobile/src/sign-in/platform.ts`, so screen tests choose it (Jest
  runs as iOS): `iphone-sign-in.test.tsx` for the iPhone, `passkey.test.tsx`
  as the website. On iOS, step 1's line for members who joined with their
  number says "your email" without "or Google".

## PR 7: links that open the app (`feat(app-links)`)

### Task 6: the two files and the app's side

**Files:** `packages/domain/src/app-links.ts` (new: the path patterns),
`apps/api/src/web-app.ts` (or a new route file) and tests,
`apps/mobile/app.config.ts`, `infra/render/render.yaml` (the two settings,
not secret), `docs/operations/production.md`.

- [ ] Test first: with `APPLE_TEAM_ID` and `ANDROID_CERT_SHA256` set, the
  API answers both `.well-known` files as `application/json` with no
  redirect, for the paths of spec 32, 3.5 and none of `/admin`, `/v1`,
  downloads or `sign-in/return`; without them, 404.
- [ ] `app.config.ts`: `ios.associatedDomains` `applinks:puffinride.is`,
  Android intent filters with `autoVerify` for the same paths.
- Waits for Martin's Apple team ID and the Play app signing fingerprint.

## PR 8: the store kit and the deletion page (`feat(stores)`)

- [ ] `/delete-account` on the website (spec 32, section 5), in the
  sitemap, linked from About; test first in `about.test.tsx`'s style and
  the server's `search-engines.test.ts`.
- [ ] `marketing/stores/`: the store texts (Google Play in Icelandic and
  English, the App Store in English), the screenshots from PR 2's runs at
  each store's sizes, the Google Play feature graphic and icon (script
  committed), the privacy label and data safety answers from the privacy
  register, the age rating answers, the reviewers' notes.
- [ ] Privacy register: Google Play, the App Store and testers' details;
  a new privacy policy version (ADR 0043) before testers outside the team.

## Martin's steps, then releases

Spec 32, section 11. Then, on his go each time: a build to TestFlight and
internal testing; the closed test with 12 testers for 14 days; Google's
production access; the App Store review; the staged release.
