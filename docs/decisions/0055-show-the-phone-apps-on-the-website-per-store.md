# 0055. Show the phone apps on the website, switched on per store in the console

- **Status:** Accepted (2026-11-28, by Martin in the project thread: "Approved")
- **Date:** 2026-11-28
- **Deciders:** Martin
- **Related:** [spec 35](../specs/2026-11-28-app-promotion-on-the-website.md),
  [spec 32](../specs/2026-11-27-phone-apps-in-the-stores.md),
  [ADR 0032](0032-operator-settings-list-ranges-and-versions.md) (the list of
  settings, which this adds to), [ADR 0051](0051-store-apps-in-martins-name-until-the-company.md),
  [spec 10](../specs/2026-11-13-operator-settings-and-metrics.md) (R10.4)

## Context

The website is to show that PuffinRide has phone apps: Apple's Smart App
Banner on iPhones, a strip of our own on Android phones, the store badges
in the footer and on About, and a QR code (spec 35). It is built before
either store page is public: the iPhone app is on TestFlight, and the
Android app needs a 14-day closed test and Google's review first (spec 32,
3.8). A badge or banner that leads to a store page that is not there yet
is worse than none.

The two stores go public on different days, decided by Apple's and
Google's reviews, not by a release of ours. Martin runs PuffinRide alone.
A release needs a build on Render, whose build minutes are short, and the
phone apps cannot know a store went public without asking a server.

Adding a setting needs an ADR (R10.4, ADR 0032).

## Options considered

1. **Turn it on in code with a release once each store is public.** No
   new setting. But two more releases, each a build, timed to Apple's and
   Google's reviews; and taking a badge down (an app pulled from a store)
   needs another.
2. **Environment variables on Render, one per store.** No console change.
   But changing one restarts the service, the website reads them only
   through the API anyway, and nothing records who changed it or why.
3. **Two console switches, one per store, off by default.** The website
   and the server read them like any setting (`/v1/config` and the
   settings service). Martin turns each on the day its page is public,
   with a reason and a history, and off again if needed. Two more rows in
   a list that is meant to stay short.
4. **Ask the stores whether the page is public** (Apple's lookup API,
   Google Play's page). Automatic, but a new outside call on every check,
   and a store page can be public in some countries and not others.

## Decision

We will add two operator settings, both switches, off by default, in a new
group **Phone apps** (`apps`):

| Setting | Default | Range | Group |
| ------- | ------- | ----- | ----- |
| `app_store_listed` | off | on or off | Phone apps |
| `google_play_listed` | off | on or off | Phone apps |

While a switch is off, nothing on the website shows that store, and `/app`
sends nobody to it (spec 35, R35.1). They read the current values, like
the beta's settings; no trip or booking keeps them.

## Consequences

- Each store's promotion goes live, or away, from the console in seconds,
  with no build and no release.
- The website's code for both stores is in place and tested before either
  store is public, and staging can show it with its own switches.
- Two more settings to keep in the console and the docs.
- Turning a switch on before the store page is public sends people to a
  missing page: the console's help line says so.

## Revisit when

Both apps have been public for a while and are unlikely to be pulled (the
switches could become fixed), or the company's accounts take the apps over
with new store addresses (spec 32, section 10).
