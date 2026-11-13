# Meeting points

**Owner:** Martin · **Last reviewed:** 2026-11-13

Meeting points are the backbone of ShareRide. Every trip is built from them, so
their quality decides whether the app feels safe and easy. They are curated by
the operator, not typed in freely by drivers.

## Why fixed meeting points

- **Safety:** public, lit, known places instead of private addresses or road
  shoulders.
- **Simplicity:** drivers pick from a list; passengers know exactly where to
  wait.
- **Search that works:** trips that share meeting points can be matched
  reliably, including partial routes.
- **Fair pricing:** distances between meeting points are known in advance, so
  suggested prices and caps are consistent.
- **Legal position:** fixed points along the driver's own route support the
  cost-sharing model (no door-to-door service).

## Selection criteria

A good meeting point meets all of the **required** criteria and as many of the
**preferred** ones as possible.

Required

- Legal and safe to stop for a few minutes, off the main carriageway
- Easy to find: a named place such as a gas station, bus hub, shopping centre,
  airport or ferry terminal
- Reachable by car all year, or marked as seasonal
- Lit after dark

Preferred

- Indoor shelter or a shop open at common departure times
- Public transport connection (Strætó)
- Toilets
- Parking for a few minutes, or for a full day for park-and-ride
- Step-free access
- On or very close to a main route, so drivers don't detour

## Data kept for each meeting point

| Field | Notes |
| ----- | ----- |
| Name | Icelandic name, plus English name where different |
| Search aliases | ASCII spelling and common variants, e.g. "Hofn" for "Höfn" |
| Location | Coordinates (WGS 84), plus the exact pickup spot description |
| Region and municipality | For filtering and route pages |
| Type | Gas station, bus hub, shopping centre, airport, ferry terminal, parking, other |
| Amenities | Shelter, toilets, shop, lighting, parking, step-free |
| Opening hours of shelter | Where relevant |
| Season | All year, or the months it is usable |
| Photo and directions | Where to stand, which entrance |
| Status | Draft, active, inactive (inactive points stay on past trips) |

## The meeting-point network

Distances and typical driving times between meeting points are precomputed
once with a routing engine and stored as **legs**. A leg exists between two
meeting points that a driver can travel between directly along a sensible
route. Trips are chains of legs. This gives instant price suggestions and
lets us check that a trip's stop order makes geographic sense.

## Launch corridors (proposal, open question Q6)

Start where demand and driver supply are highest. Example meeting points per
corridor; the final list is drafted in Phase 1 and checked on site.

| Corridor | Example meeting points |
| -------- | ---------------------- |
| Capital area hubs | BSÍ bus terminal, Mjódd bus hub, Kringlan, Smáralind, Ártúnshöfði, Hafnarfjörður (Fjörður), Mosfellsbær |
| Reykjavík – Selfoss | Hveragerði, Selfoss |
| Reykjavík – Keflavík Airport | Reykjanesbær, Keflavík Airport (KEF) |
| Reykjavík – Akranes – Borgarnes | Akranes, Borgarnes |
| Reykjavík – Akureyri (Route 1 north) | Borgarnes, Bifröst, Staðarskáli, Blönduós, Varmahlíð, Akureyri |
| South coast | Selfoss, Hella, Hvolsvöllur, Vík |

Later corridors: Snæfellsnes, the Westfjords, Mývatn and Húsavík, the East
(Egilsstaðir, Seyðisfjörður ferry), the South-East (Kirkjubæjarklaustur,
Skaftafell, Höfn), Golden Circle, and ferry ports (Landeyjahöfn, Stykkishólmur).

## Governance

- Only the operator can activate a meeting point.
- Anyone can suggest one from the app; suggestions go to the admin queue.
- Each active point is reviewed once a year, and after any report about it.
- A point is never deleted, only made inactive, so past trips stay readable.
