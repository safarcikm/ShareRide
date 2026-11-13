# 0009. Maps with MapLibre and OpenStreetMap; precomputed routing

- **Status:** Proposed
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [integrations](../architecture/integrations.md),
  [ADR 0006](0006-meeting-points-and-segment-pricing.md)

## Context

The app shows meeting points and trip routes on a map, suggests prices from
road distances, and later matches weather warnings and road closures to
routes. Map costs can grow with users, and some providers restrict caching,
storing results or mixing their data with other maps.

Because trips go between a few hundred known meeting points, routing does not
need to run on every request: distances between meeting points can be
computed once and stored.

## Options considered

1. **Google Maps Platform.** Familiar and polished; per-request pricing and
   terms that limit storing results; strong lock-in.
2. **Mapbox.** High quality and flexible; usage-based pricing; proprietary
   SDKs since v2.
3. **MapLibre (open source renderer) with OpenStreetMap-based vector tiles**
   from a tile provider or self-hosted, and an open-source routing engine
   (Valhalla or OSRM) on the Iceland OpenStreetMap extract.

## Decision

- Render maps with **MapLibre** (native SDKs in the app through a React Native
  wrapper, MapLibre GL JS on the web).
- Use **OpenStreetMap-based vector tiles** from a hosted provider at first,
  with self-hosted tiles (for example a Protomaps file of Iceland) as the
  fallback if costs or terms change.
- Compute **legs** (distance and duration between meeting points) offline with
  an open-source routing engine on the Iceland extract, store them in the
  database, and refresh them when meeting points change or the map data
  updates.
- Show OpenStreetMap attribution as its licence requires.

## Consequences

- Predictable and low map costs; no lock-in to one vendor.
- Prices and searches never wait on a routing API.
- We must run the routing step ourselves (a script or a small container, only
  when legs need refreshing).
- Map styling is our responsibility; the design system defines a style.
- OpenStreetMap coverage of Iceland's main roads is good; meeting point
  locations are verified by the operator anyway.

## Revisit when

We need live turn-by-turn navigation or traffic-aware times, which are out of
scope today.
