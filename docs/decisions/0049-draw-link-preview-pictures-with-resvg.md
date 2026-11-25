# 0049. Draw link preview pictures on the server with resvg

- **Status:** Proposed
- **Date:** 2026-11-25
- **Deciders:** Martin
- **Related:** [spec 23, 3.10](../specs/2026-11-22-google-analytics-and-search.md#310-a-shared-rides-link-preview),
  [ADR 0004](0004-backend-modular-monolith.md),
  [visual design system](../specs/2026-11-13-visual-design-system.md)

## Context

When a driver shares a ride on Facebook, in Messenger or in another app,
the app shows a card with a picture that it reads from the page's
`og:image`. Until now every PuffinRide address gave the same picture, so a
ride's card did not say which ride it was. Martin asked for a branded card
for each shared ride (2026-11-25): the route, the day and the time drawn in
our look. Facebook and the other apps accept PNG or JPEG, not SVG.

So the API must make a picture per ride on request. It runs TypeScript on
Node.js on Render, with no build step, in a slim Docker image; it already
serves the web app on the same origin. The pictures are few (one per ride
shared, read once by each site that shows the card) but must look like the
rest of PuffinRide: the app's fonts and drawings.

## Options considered

1. **resvg (`@resvg/resvg-js`).** We write the picture as SVG and resvg
   turns it into a PNG, with the fonts we give it. Prebuilt for Linux,
   macOS and Windows as Node-API modules, no install script, no system
   libraries; MPL-2.0. Draws in a few milliseconds and measures text, so
   long names can be fitted. A native module per platform (about 2 MB);
   no layout engine, so we place things ourselves.
2. **A headless browser on the server** (Chromium through Playwright), as
   `scripts/export-icons.ts` does at build time. Draws HTML and CSS, so the
   most freedom; but some 300 MB in the image, slow to start, and much
   memory on a small Render instance.
3. **satori with resvg.** Lays out JSX with flexbox, then resvg. Easier
   layout, but two libraries instead of one, and its own subset of CSS.
4. **An outside image service** (an image CDN or a hosted "OG image"
   service). Nothing to run, but a new processor that receives trips'
   routes and times, a cost, and our look in someone else's templates.
5. **No picture per ride**: the ride's route and time in the card's title
   only, with the general picture. Nothing new to run; Martin chose the
   picture over it.

## Decision

We will draw a ride's link preview picture in the API as SVG and turn it
into a PNG with `@resvg/resvg-js`, with the app's fonts and a copy of the
front page's car kept in `apps/api/assets/trip-preview/`, because it is
one small library that runs everywhere we do, fast enough to draw on
request, and keeps the picture in our own code and look.

## Consequences

- A shared ride shows its route, day and time on Facebook and elsewhere,
  in the reader's language, without a person's name or photo (R23.8).
- A new kind of dependency: a native module in the API. Dependabot keeps it
  current; it must keep prebuilt binaries for Linux x64 (Render, CI) and
  for Windows and macOS (development).
- Drawing costs a few milliseconds of CPU per picture. The search limit
  counts each request and the picture may be cached for an hour.
- The fonts (SIL Open Font License, licence beside them) and the car are
  copies; `node scripts/export-icons.ts` in `apps/mobile` copies the car
  again when it changes.
- The same tool can draw other pictures later, such as a meeting point's
  card, without a new decision.

## Revisit when

resvg stops shipping Node-API binaries for a platform we run on, pictures
need layout that is hard to place by hand, or drawing on request shows up
in the API's CPU or memory on Render.
