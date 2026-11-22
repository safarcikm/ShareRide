# Google Analytics and search engines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google finds PuffinRide's public pages in both languages, staging
never shows in Google, and the website counts page views with Google
Analytics for visitors who accept ([spec 23](../specs/2026-11-22-google-analytics-and-search.md)).

**Architecture:** The API already serves the exported web app on its own
origin (`apps/api/src/web-app.ts`). It now fills the page's head per request
(language, title, description, canonical, alternates, link preview), adds
`noindex` outside a short list of public paths and everywhere off
production, and answers `/robots.txt` and `/sitemap.xml` from the active
meeting points and the places. The app sets each public screen's title and
description with `expo-router/head` and honours `?lang=`. Analytics: the
API names a measurement ID in `/v1/config` and opens the Content Security
Policy to Google only then; the app asks, then loads Google's tag from its
own code (no inline script) and sends page views by route pattern.

**Tech Stack:** Hono (API, Vitest), Expo Router and React Native Web (app,
Jest with RNTL 14), Playwright journeys on the web.

**Decisions:** Martin chose Google Analytics with a consent banner on a
decision card (2026-11-22, [ADR 0045](../decisions/0045-google-analytics-on-the-website-after-consent.md)).
Spec 23's decisions 6 to 8 are built as recommended.

## Global Constraints

- Nothing from Google loads before Accept (R23.1); the CSP allows Google
  only when `GOOGLE_ANALYTICS_ID` is set.
- Page views carry the route pattern only (R23.3): never `usePathname()`,
  `location.href` or a query.
- Indexing only where `APP_ENV` is production and `WEB_APP_URL` is set;
  everything else answers `X-Robots-Tag: noindex, nofollow`.
- Trip pages stay noindex (R4.6), with their existing header and tag.
- Every new text in `en.ts` and `is.ts`; tokens only on screens.
- No new dependency: Google's tag is loaded as a script element.

## PR 1: the spec, the ADR and this plan

- [x] Spec 23, ADR 0045, this plan; spec 12 and features point to them.

## PR 2: search engines

- [ ] API: `searchEngines` config (indexable, site origin); `/robots.txt`;
  `/sitemap.xml` (active meeting points, places, both languages, alternates);
  the page's head filled per request and language; noindex outside the
  public list and off production; tests in `web-app.test.ts` and a new
  `search-engines` test.
- [ ] App: `?lang=` read at start on the web (`LanguageProvider`); a
  `PageHead` component (title, description) on Find, meeting points, a
  meeting point, a place, the legal pages; `data-nosnippet` on Find's ride
  list; the share picture `public/share.png` made by `export-icons.ts`.
- [ ] Docs: runbook "Google Search Console"; the privacy register's
  indexing line.

## PR 3: the consent question and Google Analytics

- [ ] Contracts and API: `analytics` in `/v1/config` from
  `GOOGLE_ANALYTICS_ID`; the CSP with Google's addresses only then.
- [ ] App: the stored choice (12 months); the bar; the Cookies page and its
  row on `/legal`; the loader (consent defaults, `send_page_view: false`,
  signals and ad personalisation off, cookies 13 months not extended); page
  views by pattern with the referrer's origin from another site; withdrawal
  (`ga-disable-<ID>`, cookies removed).
- [ ] Privacy Policy version 3 in both languages (minor, announced), the
  draft for the lawyer, the register (Analytics, the choice, Google as a
  provider, withdrawal), the runbook "Turn on Google Analytics".
- [ ] A journey: no request to Google before Accept; patterns only after.

## Martin's steps (after the release)

1. Google Analytics, as `admin@puffinride.is`: a property "PuffinRide",
   a web stream for `https://puffinride.is`, enhanced measurement off, data
   retention 14 months, Google signals off, data sharing off, the data
   processing terms accepted; then the measurement ID in Render
   (`GOOGLE_ANALYTICS_ID` on `puffinride-api`).
2. Search Console: the domain property `puffinride.is`, its TXT record at
   ISNIC DNS Hosting, then the sitemap.
