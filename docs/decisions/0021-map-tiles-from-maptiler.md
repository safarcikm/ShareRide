# 0021. Map tiles from MapTiler

- **Status:** Accepted (2026-11-13, by Martin, with the milestone 2 plan)
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [ADR 0009](0009-maps-and-routing.md),
  [spec 2](../specs/2026-11-13-meeting-points.md),
  [milestone 2 plan](../plans/2026-11-13-milestone-2-hosted-and-connected.md)

## Context

ADR 0009 chose MapLibre with OpenStreetMap vector tiles from a hosted
provider at first, and our own tile file as the fallback. Every map view
sends the person's address and the area they look at to the tile provider,
so the provider counts as a processor of personal data (ADR 0007).

## Options considered

1. **MapTiler.** A Swiss company (Switzerland has an EU adequacy decision);
   OpenStreetMap vector tiles and styles made for MapLibre. The free plan is
   for testing and prototypes; the Flex plan costs $30 a month.
2. **Stadia Maps.** Good MapLibre support and prices, but a United States
   company.
3. **Our own Protomaps file of Iceland** in our object storage. No third
   party and almost no cost, but we host the style, fonts and icons, and keep
   the file current.

## Decision

We will use **MapTiler** tiles with MapLibre: the free plan while we build,
then a paid plan from the beta. If cost or terms become a problem, we move
to our own Protomaps file as ADR 0009 allows.

## Consequences

- No map hosting work during the build.
- The API key ships in the app, so it is limited to our app IDs and web
  address.
- From the beta, the map costs about $30 a month.
- MapTiler and OpenStreetMap attribution are shown on every map.

## Revisit when

Map sessions exceed the plan, prices change, or a self-hosted file would
save more than the work it takes.
