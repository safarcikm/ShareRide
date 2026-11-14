# Milestone 2 plan: hosted and connected

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved by Martin
(2026-11-13: all six choices in section 3 accepted)

Implements the second half of the Phase 2 walking skeleton
([roadmap](../strategy/roadmap.md#phase-2-build)): staging in the EEA, real
SMS, error tracking, meeting points on a map, Apple and Google sign-in, a
profile photo, development builds and mobile end-to-end tests. Builds on
milestone 1 ([plan](2026-11-13-milestone-1-phone-sign-in.md)), ADRs
[0004](../decisions/0004-backend-modular-monolith.md),
[0007](../decisions/0007-eea-hosting-and-data-residency.md),
[0009](../decisions/0009-maps-and-routing.md),
[0010](../decisions/0010-authentication-and-identity.md) and
[0016](../decisions/0016-own-sign-in-module.md), and on
[spec 1](../specs/2026-11-13-sign-in-and-profile.md) (sections 3.3 and the
photo) and [spec 2](../specs/2026-11-13-meeting-points.md) (section 3.1).

## 1. Goal

When this milestone is done:

- Every merge to `main` deploys the API, the web app and the hourly clean-up
  to staging in Frankfurt. Migrations run first, then a smoke test.
- Sign-in codes arrive by real SMS on staging. Local development keeps the
  development sender.
- Errors in the app and the API reach Sentry's EU region without personal
  data, and an uptime check alerts Martin's phone.
- Martin runs a development build of the app on his own phone, against
  staging, without his computer.
- Maestro runs the sign-up journey on an Android emulator in CI.
- Anyone can see sample meeting points on a map and in a list, in the app and
  on the web.
- A person can sign in with Google or Apple, and add or remove a profile
  photo.

## 2. Scope

| In milestone 2 | Later |
| -------------- | ----- |
| Staging: API, web app, database and the hourly clean-up | Production environment (before the beta); preview environments per PR; our own domain |
| Real SMS for sign-in codes; an hourly clean-up of the records the privacy inventory limits | A worker with a job queue and outbox for email, push and SMS notifications (spec 7) |
| Error tracking for the app, the API and the clean-up; uptime check | Performance tracing, log search |
| EAS development and preview builds; Maestro on Android in CI | Maestro on iOS in CI (macOS runners use minutes ten times faster); store listings |
| Meeting points: read-only catalogue, map, list by region, summary card, with sample points | Details with photos, filters, offline, place search, problem reports, operator console, legs (the rest of spec 2); the real meeting point list v1 |
| Sign in with Google and Apple; link and unlink them in settings | Adding or changing a phone number on an account (comes with booking, where a phone is first required) |
| Profile photo: add, replace, remove | Operator removal of photos (operator console) |

## 3. Decisions for Martin

Each choice is checked against the ADR 0007 list (EEA region, data
processing agreement, little operations work). Martin accepted all six on
2026-11-13. Choices 1 to 5 are ADRs
[0018](../decisions/0018-hosting-on-render-frankfurt.md),
[0019](../decisions/0019-sms-with-46elks.md),
[0020](../decisions/0020-error-tracking-with-sentry-eu.md),
[0021](../decisions/0021-map-tiles-from-maptiler.md) and
[0022](../decisions/0022-photo-storage-on-hetzner.md), and each provider is
in the [privacy](../compliance/privacy-gdpr.md#providers) list. Choice 6 is an
account, not an architecture decision, so it lives here and in the roadmap. Prices are list prices on 2026-11-13 for staging only.

| # | Choice | Decision (accepted) | Why | Main alternative | Per month |
| - | ------ | -------------- | --- | ---------------- | --------- |
| 1 | Hosting | **Render, Frankfurt**: the API container, a cron job and managed PostgreSQL | PostgreSQL 18 with PostGIS (our schema uses PostgreSQL 18's `uuidv7()`), point-in-time recovery, private network, secret store, a blueprint file in the repository as infrastructure in code | Fly.io in Stockholm is closer, but its managed PostgreSQL stops at version 17; AWS in Stockholm is more work for one person | About $15 ($7 API, $6 database plus storage, about $1 for the hourly clean-up) |
| 2 | SMS | **46elks** (Swedish telecom operator). Changed on 2026-11-14 to **Vonage**, with 46elks as the fallback ([ADR 0023](../decisions/0023-sms-with-vonage.md)); the rest of this row is the original choice | All data in the EU, pay per message, no monthly fee, a small HTTP API | Sinch (also Swedish, larger, more onboarding) as the fallback | Per message; big providers charge about 6 to 7 US cents for Iceland; 46elks's rate to confirm at sign-up |
| 3 | Error tracking and uptime | **Sentry, EU data region** (Frankfurt), free plan | Mature SDKs for Expo and Node.js, scrubbing hooks, one uptime monitor included | GlitchTip (Sentry-compatible); Better Stack for uptime | $0 |
| 4 | Map tiles | **MapTiler** (Swiss) | Switzerland has an EU adequacy decision; OpenStreetMap vector tiles for MapLibre; the free plan covers testing and prototypes | Stadia Maps (United States); our own Protomaps file of Iceland, the ADR 0009 fallback | $0 while building, then $30 (Flex) from the beta, or switch to our own file |
| 5 | Photo storage | **Hetzner Object Storage, Helsinki** (German company) | S3-compatible, EU company, close to Iceland, predictable price | Scaleway in Paris; Cloudflare R2 with EU jurisdiction (United States company) | About €5, including 1 TB of storage and traffic |
| 6 | Apple developer account | **Enrol as an individual now** ($99 a year) and use separate development app IDs; the company's own account takes the store app ID once the company exists | iOS builds on a phone and Sign in with Apple both need a paid account. Staging accounts are test data that can be thrown away, so nothing has to move later | Wait for the company: Sign in with Apple and iOS phone builds slip until then; Android, the iOS simulator and the web carry on | $99 a year |

Staging totals about $20 to $25 a month plus SMS, and $99 a year for Apple.

Accounts are opened by Martin with a shared project email address and moved
to the company once it is registered (Render, Sentry, MapTiler, Expo,
Hetzner and Google Cloud all support this).

## 4. Design notes

### 4.1 Staging

```text
GitHub Actions (main)
  checks, then build the image and smoke-test it
Render, Frankfurt (deploys a commit once its checks pass)
  shareride-staging-api     web service: /v1 and the web app on one origin
  shareride-staging-clean-up  cron job, hourly: same Dockerfile, clean-up entry point
  shareride-staging-db      PostgreSQL 18 with PostGIS, private network only
```

- **One origin for the API and the web app.** `onrender.com` is a public
  suffix, so two of its subdomains are different sites and the `SameSite`
  refresh cookie would not reach the API. The API container serves the
  exported web app at `/` with the `index.html` fallback from milestone 1.
  Revisit when we have our own domain. Render's public traffic passes
  through Cloudflare's network, which ends TLS at its edge, so requests
  (including phone numbers and codes) cross Cloudflare in transit; the
  privacy provider list records it.
- **Infrastructure in code:** `infra/render/render.yaml` describes the
  services, the database and the environment groups. Secrets are generated by
  Render (`AUTH_SECRET`) or pasted into its secret store; none enter the
  repository.
- **Deploys:** Render builds the Dockerfile itself from each commit on `main`
  once the commit's CI checks pass, so no registry or deploy hook is needed;
  CI builds the same image and smoke-tests it first. Migrations and the seed
  run as Render's pre-deploy command, and traffic moves only once
  `/v1/health/ready` answers 200. Uptime checks come with PR 4.
- **Client addresses:** Render sits behind Cloudflare, so the last
  `X-Forwarded-For` entry is a Cloudflare address and the client is the one
  before it, which Cloudflare appended. `TRUST_PROXY=2` takes that entry;
  the runbook has a one-off check that forged headers do not get around the
  per-address limit.
- **Data:** generated only. The seed adds the placeholder legal texts and
  the sample meeting points.
- **Rollback:** redeploy the previous image (migrations are expand-then-
  contract, see [CI/CD](../engineering/ci-cd-and-releases.md)).

### 4.2 SMS and the clean-up

- **Sign-in codes are sent by the API directly**, as in milestone 1, with a
  timeout; if sending fails the person sees "try again". A queued job would
  have to store the number and the code in plain text until sent, and we
  never store either. (This changes the milestone 1 plan's note that SMS
  would move to a queue.)
- The 46elks adapter sits behind the existing `SmsSender` port. It sends
  with `dontlog=message`, so 46elks does not keep the code either. Since
  2026-11-14 Vonage sends instead, with 46elks as the fallback (ADR 0023);
  Vonage keeps the text in its records unless redacted. The
  sender is `ShareRide` (11 letters at most), with no link (Icelandic
  operators filter links). Both texts fit one SMS part (Icelandic letters
  such as ð and þ allow 70 characters per part).
- A contract test calls 46elks with `dryrun=yes`, outside the normal CI run;
  the Vonage one sends a wrong secret, so nothing is sent.
- Against SMS pumping: the country list and limits from milestone 1, a daily
  budget per country, an alert on unusual volume and a kill switch in the
  environment.
- **An hourly clean-up** deletes what the
  [privacy](../compliance/privacy-gdpr.md) inventory limits: expired codes,
  rate-limit events after 24 hours, expired tokens, sessions unused for 60
  days (ended) and sessions ended 30 days ago. It is a short command run as a
  Render cron job from the API image. The worker with a PostgreSQL job queue
  (ADR 0004) arrives with notifications (spec 7), the first work that needs
  a queue; until then a cron job costs less and has nothing to keep running.

### 4.3 Error tracking and uptime

- `@sentry/node` in the API and the clean-up; `@sentry/react-native` in the
  app, including the web.
- No personal data: the SDK's optional data collection off (version 11
  replaced `sendDefaultPii` with `dataCollection`), and a `beforeSend` that
  keeps only the method, URL path, three harmless headers and the user ID,
  and runs the shared `redactDeep` rule (domain package) over everything
  else to remove phone numbers, codes and tokens, with tests. No session
  replay. Tracing stays off for now.
- Releases are named by commit SHA (`RENDER_GIT_COMMIT` on Render). The API
  runs its TypeScript with type stripping, which keeps line and column
  numbers, so its stack traces need no source maps. The web app's source
  maps are uploaded from Render's build with a secret file; the phones'
  with EAS builds (PR 5).
- An uptime monitor checks `/v1/health/ready` every minute and alerts Martin
  through the Sentry app and email.

### 4.4 Development builds and Maestro

- `eas.json` with `development` and `preview` profiles; `app.config.ts`
  gives each variant its own app ID and name (for example "ShareRide Dev"),
  so builds sit side by side. The store app ID is chosen before the first
  store upload (the `com.shareride.app` placeholder may not be free).
- `expo-dev-client`. Expo Go keeps working until the map arrives, which needs
  native code.
- Maestro flows in `apps/mobile/maestro/`: sign up in English, sign out. A
  CI job builds an Android release APK pointed at the test API, starts an
  emulator, runs the flows and keeps screenshots on failure. It runs on pull
  requests that change the app and nightly. iOS flows run on the simulator
  locally.

### 4.5 Meeting points (spec 2, section 3.1)

- `meeting_points` table with what the map and the list need: names in
  Icelandic and English, `geography(Point, 4326)`, region, municipality,
  type, amenities, status and season months. Visibility and "in use now"
  are domain rules.
- About 15 **sample** points on the launch corridors, seeded on local and
  staging only, and named as samples. The real list v1 is a design-track
  item.
- `GET /v1/meeting-points`: public, cached with an `ETag`.
- App: a map with clusters that opens on the whole of Iceland, tapping a
  point opens a summary card, and a list grouped by the eight regions, sorted
  in Icelandic order. The list is the full screen reader alternative.
  `@maplibre/maplibre-react-native` on phones and `maplibre-gl` on the web.
  OpenStreetMap and MapTiler attribution are visible. The map style takes
  the spec 15 colours later.

### 4.6 Profile photo

- `PUT /v1/me/photo` takes a JPEG or PNG body up to 10 MB (the one exception
  to JSON bodies). The API re-encodes it as a square JPEG with `sharp`, which
  drops all metadata (location, camera), and stores it under a random key in
  a private bucket. `DELETE /v1/me/photo` removes it.
- Profiles carry a signed URL that expires after an hour.
- App: `expo-image-picker` (library or camera) with a square crop, and
  `expo-image-manipulator` to resize and turn HEIC into JPEG before upload.
- Account deletion (spec 11) will delete the photo too; the storage port has
  a delete for it.

### 4.7 Google and Apple sign-in (spec 1, section 3.3)

- `POST /v1/auth/oauth/google` and `/apple` take the provider's ID token and
  a nonce. The API checks the signature against the provider's published
  keys, the audience (our client IDs), the issuer, the expiry and the nonce,
  using `jose`.
- New table `identities`: user, provider, subject, email, email verified;
  unique per provider and subject. A new account gets the first name from
  the provider when shared (Apple sends it only the first time, so the app
  passes it on), and the email as verified, including Apple's private relay
  address.
- Settings show connected sign-in methods with link and unlink. The last
  sign-in method cannot be removed.
- Apple appears on iPhone and the web, Google everywhere. That is our
  reading of spec 1, story 2.
- Before a store release: revoke Apple tokens when an account is deleted
  (App Store rule), which needs Apple's authorisation code exchange.

## 5. Pull requests and tasks

Tests come first in every task. Each PR updates the docs it touches and gets
a code review before it opens. Tick tasks as they merge.

### PR 1: `docs(plans)`: this plan and the provider ADRs

- [x] This plan, ADRs 0018 to 0022 (accepted), the integrations table, the
      privacy provider list, the roadmap

### PR 2: `feat(api)`: real SMS and the hourly clean-up

- [x] 46elks adapter with a timeout. Tests against a fake HTTP server: the
      request shape (`dontlog`, sender, form encoding), a refusal or a timeout
      becomes `sms_failed` and is logged without the number
- [x] Config: `SMS_PROVIDER=46elks` with its keys; the kill switch; a daily
      budget per country. Test: the budget refuses with the same reply as a
      limit, and logs a warning
- [x] Contract test with `dryrun=yes`, run by hand with the keys
- [x] Clean-up command (`pnpm --filter @shareride/api clean-up`). Tests:
      each kind of record goes only once past its retention
- Verify: with 46elks keys in `.env`, a real code arrives on a phone (now
  with Vonage keys, ADR 0023)

### PR 3: `feat(infra)`: staging on Render

- [x] `infra/render/render.yaml`; the API image includes the web export and
      serves it with a content security policy. Test: unknown paths outside
      `/v1` return `index.html`, and `/v1` paths keep the API's 404
- [x] Render deploys `main` once CI passes; CI smoke-tests the image
      (`infra/docker/smoke-test.sh`)
- [x] Client addresses behind Render's two proxies (`TRUST_PROXY=2`), with
      a warning in the logs when their entry is missing
- [x] The web app calls the API on its own origin in an exported build
- [x] Runbook `docs/operations/staging.md`: deploy, roll back, read logs,
      restore
- Verify: the staging URL shows the welcome screen and `/v1/health/ready`
  is 200

### PR 4: `feat(observability)`: error tracking and uptime

Split in two, so the server side can be checked on staging first.

- [x] Sentry in the API and the clean-up. Test: an event with a phone number,
      code or token reaches the transport scrubbed
- [x] Releases by commit; `sentry:check` sends a test error; uptime monitor
      and alert routing in the runbook
- [x] PR 4b, `feat(mobile)`: Sentry in the app (web and phones) with the same
      scrubbing (moved to the domain package), an error screen, and the web
      app's source maps uploaded from Render's build. On the web Sentry
      loads separately from the first screen (it is about 320 KB
      compressed); taps, typing, console output and sessions are not
      recorded
- Verify: a test error from staging appears in Sentry with a readable stack

### PR 5: `feat(mobile)`: development builds and Maestro

- [ ] `eas.json`, `app.config.ts` variants, `expo-dev-client`
- [ ] Sentry's Expo plugin, so phone builds upload their source maps and
      native debug files, and `EXPO_PUBLIC_APP_ENV` and
      `EXPO_PUBLIC_SENTRY_DSN` per build profile
- [ ] Sentry's native side: a native crash report does not pass the
      JavaScript scrubbing rule, so check what a test crash from a
      development build carries (Android tap breadcrumbs, the install ID,
      the phone's own breadcrumbs) and turn off or scrub what the privacy
      table does not list
- [ ] Maestro flows and the Android emulator CI job
- [ ] README: install the development build on a phone
- Verify: the Maestro job passes in CI; Martin installs the build

### PR 6: `feat(meeting-points)`: map and list

- [ ] Check first that `@maplibre/maplibre-react-native` builds with Expo
      SDK 58 and React Native 0.88
- [ ] Schema, domain rules (visible, in use now) with tests, sample seed,
      `GET /v1/meeting-points` with integration tests
- [ ] Map, list and summary card with component tests (list grouping and
      order, screen reader labels); a Playwright journey on the web
- Verify: the map and list show the sample points on a phone and the web

### PR 7: `feat(profile)`: profile photo

- [ ] Storage port with a Hetzner adapter and an in-memory fake
- [ ] Photo endpoints. Tests: metadata is gone after upload (a fixture with
      fake GPS data), size and type limits, replace deletes the old file
- [ ] Picker, crop and upload in the profile form; Maestro and Playwright
      steps
- Verify: add, replace and remove a photo on a phone

### PR 8: `feat(auth)`: Google sign-in and linking

- [ ] `identities` table and token checks. Tests with locally signed tokens:
      wrong audience, issuer, nonce or expiry is refused
- [ ] New account, existing account, link and unlink rules
- [ ] Google buttons on phones and the web; settings list
- Verify: sign in with Google on Android, iPhone and the web

### PR 9: `feat(auth)`: Sign in with Apple

- [ ] Apple token checks, name on first sign-in, buttons on iPhone and the
      web
- Verify: sign in with Apple on an iPhone (needs decision 6)

## 6. Martin's steps

In the order the PRs need them. Each step gets exact instructions in the
thread when its PR is ready.

1. Vonage: open an account and add credit (done 2026-11-14; ADR 0023
   replaced 46elks).
2. Render: open an account, connect the GitHub repository, apply the
   blueprint and paste the Vonage key and secret (PR 3).
3. Sentry: open an organisation **in the EU region** (it cannot be changed
   later), send the DSN for the blueprint, and add the uptime monitor
   (PR 4); a token as a Render secret file for the web source maps (PR 4b).
4. Expo account, and the Apple Developer Program if decision 6 is accepted
   (PR 5).
5. MapTiler: account and a key limited to our app IDs and the staging
   address (PR 6).
6. Hetzner: account, a bucket in Helsinki and its keys (PR 7).
7. Google Cloud: a project, the consent screen and three client IDs (PR 8).
8. Sign the data processing agreement where the provider offers one,
   Vonage's included (46elks, the fallback, acts as a controller under
   telecom law, which the inventory records).

## 7. Risks

- **SMS delivery** varies by network. Test on Síminn, Nova and Vodafone
  numbers before the beta; 46elks is the fallback.
- **MapLibre on React Native 0.88** may lag behind; PR 6 checks first and
  can fall back to a list plus the web map until it builds.
- **Sign in with Apple on the web** needs a verified domain, which a
  `onrender.com` address may not satisfy. If so, Apple on the web waits for
  our own domain.
- **GitHub Actions minutes:** the emulator job is the costly one, so it runs
  only for app changes and nightly.

## 8. Definition of done

All nine PRs merged with green CI; staging deploys on every merge; Martin has
signed in on his phone with a development build, received a real SMS, seen
the map, added a photo and signed in with Google and Apple; docs, ADRs,
roadmap and CHANGELOG are updated.
