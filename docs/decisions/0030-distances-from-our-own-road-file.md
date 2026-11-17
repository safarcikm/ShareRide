# 0030. Distances between meeting points from our own road file

- **Status:** Proposed
- **Date:** 2026-11-17
- **Deciders:** Martin
- **Supersedes:** in [ADR 0009](0009-maps-and-routing.md) the routing engine
  (OSRM or Valhalla); its precomputed legs stay
- **Related:** [spec 2, 3.7](../specs/2026-11-13-meeting-points.md);
  [milestone 8 plan](../plans/2026-11-16-milestone-8-operator-console-and-meeting-points.md),
  decision 5 (accepted 2026-11-16)

## Context

Every pair of active meeting points needs a leg: the road distance, which
prices are suggested from, and the typical driving time. ADR 0009 said to
compute legs with an open-source routing engine (OSRM or Valhalla) on the
OpenStreetMap extract of Iceland. Until now, legs came from a hand-made
table of sample roads.

There will be a few hundred meeting points, and legs change only when a
point is activated or moved, or when the map data is updated (every three
months by hand at first). A routing engine is built for many requests a
second; we need a few hundred routes a week. The servers that offer the
map data (Geofabrik, Overpass) refuse connections from the cloud where
Claude works, but GitHub's runners reach them.

## Options considered

1. **A routing engine (OSRM) in its own container on Render.** Exact
   driving profiles and times. About $7 a month for the smallest instance,
   one more service to deploy, watch and update, and tests need the
   container or a fake.
2. **A hosted routing API** (for example OpenRouteService). Nothing to run,
   but a new provider with keys, limits and terms on storing results, and
   meeting point positions leave our servers.
3. **Our own road file.** A script turns the extract into a small file of
   the roads cars may use, kept in the repository; the API finds the
   fastest way on it. Nothing to run or pay for, nothing leaves our
   servers, and tests use the real code. Driving times are estimates from
   speed limits and road classes, not measured traffic.

## Decision

We will compute legs from **our own road file** (option 3), as Martin chose
in the milestone 8 plan (decision 5).

- **Building the file:** a GitHub Actions job, run by hand (and on pull
  requests that change the script), downloads the Iceland extract from
  Geofabrik, checks its checksum, keeps the ways cars may use with
  `osmium-tool`, and runs our script, which writes the road file as an
  artifact. The file is committed with the map data's date. The job only
  reads the repository.
- **What the file holds:** roads by class (motorway to residential and
  living streets, and service roads to places such as airports and fuel
  stations), with their length, one-way direction and a typical speed. It
  leaves out ferries, mountain (F) roads, parking aisles, driveways,
  tracks, and roads closed to cars or private.
- **Driving time:** the lowest of the road's speed limit, a typical speed
  for its class (from 90 km/h on main roads down to 30 on residential
  streets) and 60 km/h on gravel; the time is the length at that speed.
- **Routing:** a meeting point joins the nearest road within 1 km. The API
  finds the fastest way and stores its distance and time. A pair with no
  connection, or a point with no road near it, is listed in the console.
- **The `Router` port** stays, so tests can use a fixed table, and the
  sample road table remains for local data that is not on real roads.

## Consequences

- No routing service, cost or key; positions of meeting points never leave
  our servers; routing is the same code in tests and in production.
- Driving times are rougher than a routing engine's: no turn costs or
  traffic. Distances, which prices use, should be within a few percent of
  real road distances: a test checks Reykjavík to Akureyri against the
  published 390 km, and that other distances move less than 3% from one
  file to the next.
- Updating the map data means running the job and committing its file.
  The repository grows by a few megabytes each time.
- OpenStreetMap's licence (ODbL) applies to the file: the console and the
  docs say "© OpenStreetMap contributors".
- Follow-up: legs for a point when it is activated or moved (PR 12),
  "Recompute all", and the console's legs status.

## Revisit when

Drivers find our times or routes clearly wrong, we need routing on every
request (for example for places that are not meeting points), or keeping
the file up to date by hand becomes a chore.
