# 0034. A meeting point can go live before it has a photo

- **Status:** Accepted (2026-11-22, by Martin on a decision card in the
  project thread)
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Changes:** rule R2.3 of [spec 2](../specs/2026-11-13-meeting-points.md#4-rules):
  a photo is recommended, no longer required, to activate a point
- **Related:** [spec 19](../specs/2026-11-22-meeting-points-for-every-settlement.md),
  [ADR 0022](0022-photo-storage-on-hetzner.md),
  [ADR 0029](0029-photos-cleaned-in-the-browser-and-checked-by-the-api.md)

## Context

Spec 2 asked for at least one photo, described in both languages, before
a meeting point could be activated (R2.3), so passengers can see where to
wait. Spec 2 (decision 2) already lets the operator confirm a point from
local knowledge, without a visit.

On 2026-11-22 Martin opened the beta to the public and asked for a meeting
point in every settlement of Iceland: about 110 places from Reykjanes to
Vopnafjörður (spec 19). One person cannot photograph them all before the
beta. Photo storage on Hetzner (ADR 0022) is not yet set up on staging or
production either. With the photo required, nearly every point would stay
a draft, and most of the country would have nowhere to meet.

Each point already has a written "where to stand" in both languages, its
type and amenities, and "Open in maps", which hands its exact spot to the
phone's maps app, with street-level imagery where the maps app has it.

## Options considered

1. **Keep the photo required.** The safest for finding the spot in the
   dark. But points go live only as fast as one person can travel to
   them: the beta opens with three corridors and drafts everywhere else.
2. **A photo is recommended, not required.** A point the operator has
   confirmed goes live with its "where to stand" and map link, and gets a
   photo later. Coverage from the start; a passenger at a new place may
   have only words and a map to go by.
3. **Photos from elsewhere** (Street View captures, Wikimedia Commons).
   Licences forbid most of it, and a picture of the village is not a
   picture of where to stand.

## Decision

We will let a point be activated without a photo. The activation
checklist still shows the photo item, as recommended rather than
required, so the operator sees what is missing. Every other item of R2.3
stays required, including the operator's confirmation and the road
connection.

## Consequences

- The real meeting points can go live as soon as the operator has
  checked their spot and text in the console.
- A passenger may arrive at an unfamiliar place with no picture of it.
  "Where to stand" has to be precise, and the operator adds photos over
  time, starting with the busiest points and those that are hard to find.
- Nothing in the app changes: its details screen already shows no photo
  block when a point has none.
- Follow-up: a "no photo yet" filter in the console's list, when the
  number of points makes it worth it.

## Revisit when

Testers report trouble finding a point that has no photo, or most active
points have a photo and the rest can wait.
