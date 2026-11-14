# 0024. Our own simple map of Iceland instead of map tiles

- **Status:** Accepted (2026-11-14, by Martin in the project chat: "switch to
  that"; he confirms it by merging the pull request that adds this record)
- **Date:** 2026-11-14
- **Deciders:** Martin
- **Supersedes:** [ADR 0021](0021-map-tiles-from-maptiler.md), and in
  [ADR 0009](0009-maps-and-routing.md) the choice of MapLibre and hosted
  tiles (its precomputed legs stay)
- **Related:** [spec 2](../specs/2026-11-13-meeting-points.md),
  [spec 15](../specs/2026-11-13-visual-design-system.md),
  [milestone 3 plan](../plans/2026-11-14-milestone-3-offer-and-find-rides.md)

## Context

ADR 0009 chose MapLibre with OpenStreetMap vector tiles from a provider, and
ADR 0021 chose MapTiler. Building it in milestone 3 showed what that costs:
an account and a key, a processor that sees each person's network address
and the area they look at (ADR 0007), the MapTiler logo on the free plan,
about $30 a month from the beta, a 1 MB map library on the web, and a native
map that Expo Go cannot load, so phones would need development builds.

ShareRide's maps do not guide anyone. They show where meeting points are and
which way a trip goes. For directions and street detail, people already have
a maps app, and every meeting point has "Open in maps" (spec 2, 3.2).

## Options considered

1. **MapTiler tiles with MapLibre** (ADR 0021). Zoomable and detailed. Needs
   the account, key, contract, cost and native builds above.
2. **Our own Protomaps file with MapLibre** (ADR 0009's fallback). No third
   party, but we host tiles, fonts and a style, and keep the native builds
   and the large library.
3. **Static map images from a provider.** Simple to show, but a third party
   with a key, a cost and people's data again.
4. **Our own simple drawing.** The coastline, glaciers, the Ring Road and
   main roads from Natural Earth (public domain), drawn with
   `react-native-svg`, which the app already uses. No zoom and no street
   detail; Natural Earth's roads are generalised and few.

## Decision

We will draw our own simple map of Iceland in the app, in the look of
spec 15: the coastline, glaciers, the Ring Road and main roads from Natural
Earth, made into a small data file by a script in the repository. Meeting
points are dots, and a trip's route is a line along those roads. The map
shows a part of Iceland but does not zoom. "Open in maps" stays the way to
directions. We use no map tiles, no tile provider and no map library.

## Consequences

- No account, key, contract or cost for maps, and no network address or
  viewed area goes to a map provider. Natural Earth needs no credit.
- The same map works on the web, in Expo Go and in store builds, and adds
  tens of kilobytes, not a megabyte.
- No zooming or streets: a meeting point's exact spot comes from its
  description, photos and "Open in maps".
- Routes follow generalised roads; a stop away from them joins the line
  straight. Like the seat view, the drawing is illustrative.
- Follow-up: the console's pin placement (spec 2, 3.6) needs coordinates
  typed in or a map then; spec 2's clustering and "last viewed area" do not
  apply to a map that does not zoom.

## Revisit when

Testers ask to zoom in or see streets, the console needs to place pins on a
map, or a feature such as road closures needs a detailed map. Then MapTiler
(ADR 0021) or our own tiles (ADR 0009) come back.
