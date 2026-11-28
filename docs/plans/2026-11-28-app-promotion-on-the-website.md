# Plan: The phone apps, shown on the website

**Spec:** [spec 35](../specs/2026-11-28-app-promotion-on-the-website.md) ·
**ADR:** [0055](../decisions/0055-show-the-phone-apps-on-the-website-per-store.md) ·
**Date:** 2026-11-28

**Goal:** Apple's banner, an Android strip of our own, store badges in the
footer and on About, a QR code and `/app`, all behind two console switches
that start off, so Martin turns each store on when its page is public.

## Global constraints

- One pull request (`feat(apps)`): the spec, the ADR, this plan and the
  code, so Render builds once. Both switches off, so merging changes
  nothing anyone sees.
- Test first for every task. Texts in English and Icelandic. Tokens, never
  raw sizes or colours (the badges' and QR code's own artwork aside).
- Nothing in the phone apps (R35.2): every screen part checks the website.

## Task 1: the stores in the domain

**Files:** `packages/domain/src/app-stores.ts` (new) and its test,
`packages/domain/src/index.ts`, `packages/domain/src/settings/catalogue.ts`,
`apps/mobile/src/app-version/update-screen.tsx`.

- [x] `appStores`, `storePage(store, medium?)` (Google Play's with the
  install referrer), `storeOfUserAgent(userAgent)`, `appLinkTarget(userAgent,
  listed)`, `appStoresListed(values)`.
- [x] Settings `app_store_listed`, `google_play_listed`, switches, off,
  group `apps`.
- [x] "Update PuffinRide" reads the store pages' web addresses from here.

## Task 2: the API

**Files:** `packages/contracts/src/settings.ts`, `apps/api/src/modules/settings/routes.ts`,
`apps/api/src/web-app.ts`, `apps/api/src/search-engines.ts`, `apps/api/src/app.ts`,
their tests.

- [x] `/v1/config` gives `appStores`.
- [x] The page's head gets Apple's tag with the App Store switch on, with
  `app-argument` from the path, not on `/sign-in/return`.
- [x] `/app` redirects by user agent (302, `no-store`, `Vary: User-Agent`).

## Task 3: the images

**Files:** `apps/mobile/scripts/app-promotion-images.ts` (new),
`apps/mobile/assets/app-promotion/` (new: the stores' files as downloaded),
`apps/mobile/public/stores/` (new: what the website serves).

- [x] The script copies Apple's SVG as it is, takes Google Play's empty
  margin off its PNGs, and draws the QR code of `https://puffinride.is/app`
  with `toqr` (a development dependency; Expo's command line uses it).

## Task 4: the website

**Files:** `apps/mobile/src/app-promotion/` (new: badges, QR code, the
Android strip, `useAppStores`), `apps/mobile/src/components/site-footer.tsx`,
`apps/mobile/src/app/about.tsx`, `apps/mobile/src/app/_layout.tsx`,
`apps/mobile/src/beta/config.tsx`, `packages/i18n`, `packages/ui` (sizes),
screen tests.

- [x] Badges in the footer and on About with either switch on.
- [x] About's section, the QR code on a laptop, the trademark lines.
- [x] The Android strip: Android browser, narrow, Google Play on, not
  closed, not while the cookies question shows or signing in; gone for good
  after × or Install (`app-banner-closed`).

## Task 5: the console and docs

**Files:** `apps/admin/src/pages/settings/texts.ts`, `packages/i18n`,
`docs/compliance/privacy-gdpr.md`, `docs/operations/production.md` (when
to turn each switch on), `CHANGELOG.md`, the pictures in
`docs/specs/images/app-promotion/`.

- [x] The Phone apps group and its help lines.
- [x] The privacy register row for `app-banner-closed`.
- [x] Martin's step in the runbook: turn a switch on the day its store page
  is public (staging has its own switches).
