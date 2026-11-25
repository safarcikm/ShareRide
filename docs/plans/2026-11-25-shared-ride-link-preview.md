# Plan: a shared ride's own link preview

**Spec:** [spec 23, 3.10](../specs/2026-11-22-google-analytics-and-search.md#310-a-shared-rides-link-preview)
· **ADR:** [0049](../decisions/0049-draw-link-preview-pictures-with-resvg.md)
· **Date:** 2026-11-25 · **Status:** In progress

Martin, 2026-11-25: "how does it look like on Facebook if you share your
ride (it should look pretty and branded)". He chose a picture of its own
for each ride on a decision card. One PR, `feat(search)`, after
[found for carpool iceland](2026-11-25-found-for-carpool-iceland.md) PR 1
(#240), which changed the same page head. No migration.

## PR: the ride's card

New runtime dependency: `@resvg/resvg-js` 2.6.2 in the API (ADR 0049).

1. **Texts** in both languages: `seo.tripTitle`, `seo.tripDescription`,
   `seo.tripImage`, `seo.tripStops`, `seo.tripMoreStops`,
   `seo.tripFreeSeats`. Nothing about money.
2. **What the card says** (`modules/search/link-preview.ts`):
   `ridePreviewOf(details)` keeps a trip whose part is open, full or
   closed, with its stops' names and times and nothing about the driver;
   `rideCard(ride, locale)` gives the title, description, picture text,
   and the picture's address with `v=` from those texts. Test first:
   `link-preview.test.ts`.
3. **The picture** (`modules/search/preview-picture.ts`): the SVG, 1200 ×
   630, from the front page's scene, the car with its back seat free and
   the logo; the route fitted by measuring it with resvg; the stops that
   fit, then "and N more"; then the PNG. Assets in
   `apps/api/assets/trip-preview/` (the car, Fredoka and Nunito with their
   licence); `export-icons.ts` copies the car. Tests: a long route and
   many stops fit inside the picture; no driver's name; a PNG comes out.
4. **The address** `GET /v1/trips/{id}/preview.png` in the search routes,
   counted by the search limit: the PNG, or 404. Test:
   `search` integration tests with a trip in the database.
5. **The page head:** the web app looks up a trip address's ride through
   the details service (`findRide`, like #240's `findSubject`); `pageHead`
   uses its card for `og:title`, `og:description`, `og:image` and its alt
   text. Tests: `search-engines.test.ts` with a fake finder;
   `web-app` integration through `createApp`.
6. **Docs:** spec 23 3.10 and R23.8, ADR 0049, privacy (what the card
   carries), the changelog.
7. **Check by eye:** draw the cards for a short, a long and a many-stop
   trip in both languages and look at them.

## After merging

Release to production needs Martin's go. Then paste a ride's link into
Facebook's Sharing Debugger to see the card, and share one ride.
