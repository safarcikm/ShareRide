# Road file

Legs between meeting points (spec 2, 3.7) come from our own road file,
`packages/db/src/roads/iceland-roads.json.gz`, not from a routing engine
([ADR 0031](../decisions/0031-distances-from-our-own-road-file.md)).

## What is in it

The roads cars may use in Iceland, from OpenStreetMap: motorways to
residential and living streets, their links, and service roads to places
such as airports and fuel stations. Left out are mountain (F) roads,
parking aisles, driveways, tracks, ferries, roads closed to cars or
private, one-way roads into or out of a dead end, and small networks joined
to nothing else (under 2 km of road in all). So from every road in the
file, cars can drive to every other road of its network.

The file is gzipped JSON (format 1, read by `readRoadFile` in
`packages/domain/src/roads/road-file.ts`):

- `mapDate`: when the OpenStreetMap data was taken, and `source`, the
  attribution the licence asks for: "© OpenStreetMap contributors".
- `nodes`: junctions and road ends, as longitude and latitude in
  hundred-thousandths of a degree, each pair the difference from the one
  before.
- `edges`: each road between two nodes, with its length in metres, a typical
  speed, whether it is one-way, and the points of its shape, kept within
  10 m of the road.

The typical speed is the lowest of: the road's speed limit, a speed for its
class (90 km/h on motorways, trunk and primary roads, 80 secondary, 70
tertiary, 60 unclassified, 50 links, 30 residential, 20 service roads, 10
living streets), and 60 km/h on gravel and other unpaved surfaces.

## How legs are found

A meeting point joins the nearest road within 1 km (`joinRoad`). From there,
`legsFrom` finds the fastest way to each other point, one-way roads only
their way, and gives its distance and time. A point that joins a road
within a metre of a junction counts as at the junction, so it may set off
or arrive from any road there. A point with no road near it, or a pair
with no road between them, gets no leg.

## Updating the map data

At least every three months, or when roads change:

1. On GitHub, open **Actions**, choose **Road file** and **Run workflow** on
   `main`. The job downloads the Iceland extract from Geofabrik, checks its
   checksum, keeps the roads with `osmium-tool`, and runs
   `packages/db/src/roads/build-cli.ts`. Its log shows how many roads and
   nodes the file has, and how many it left out. It then checks the known
   distances on the new file (`iceland-roads.test.ts`).
2. Download the `road-file` artifact and put its `iceland-roads.json.gz` in
   `packages/db/src/roads/`, on a branch.
3. Run `pnpm --filter @shareride/db test`: the known distances must still
   hold. Open a pull request with the file.

Claude's cloud cannot reach Geofabrik, which is why the job does the
download. A pull request that changes the builder, the file format or the
distance test runs the job too.
