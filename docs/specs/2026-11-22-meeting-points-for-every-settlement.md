# Spec 21: A meeting point for every settlement

**Owner:** Martin · **Date:** 2026-11-22 · **Status:** Approved (2026-11-22)

Features: B1 Meeting point catalogue, B2 Place search
([features](../product/features.md)). Builds on
[spec 2](2026-11-13-meeting-points.md), whose rule R2.3 it changes through
[ADR 0036](../decisions/0036-meeting-points-go-live-before-their-photo.md).
Plan: [a meeting point for every settlement](../plans/2026-11-22-meeting-points-for-every-settlement.md).

## 1. Problem and goal

On 2026-11-22 Martin opened the beta to the public and asked for a
meeting point in every settlement in Iceland. Until now the only points
were 29 sample ones on three corridors, on staging, and production had no
towns for place search at all.

Goal: every settlement in Iceland that people live in and can drive to is
a town in place search, and has a meeting point of its own or a nearby
one. The points arrive in the operator console as drafts, ready for the
operator to check and activate, and can go live before they have a photo.

Later the same day Martin asked for the usual tourist spots too, such as
the stops on the Golden Circle (3.6): the main sights get a point in their
visitor car park and are landmarks in place search, for visitors without
a car (the "Visitor" of the [vision](../product/vision.md)).

## 2. User stories

- As a passenger in Hvammstangi, I type my village and find the meeting
  point there, so I can look for rides from home.
- As a driver from Egilsstaðir, I can start my trip where I live, not
  only on the three launch corridors.
- As the operator, I load all the points at once, check each spot and its
  text in the console, and activate it without travelling there first.
- As a visitor without a car, I type "Gullfoss" and find a ride that
  stops in its car park.

## 3. Behaviour

### 3.1 Which settlements

1. The list is Statistics Iceland's settlements (byggðakjarnar, places
   with at least 50 people) on 1 January 2026, table MAN030101: 118 of
   them.
2. Left out: the 5 with nobody registered in 2026 (Hjalteyri, Kristnes,
   Eiðar, Skógar, Rauðalækur), and the 3 islands reached only by ferry
   (Vestmannaeyjar, Hrísey, Grímsey), which spec 2 leaves out. That leaves
   110, 9 of them in the capital area.
3. Each one's centre is its place node in OpenStreetMap, and its
   municipality the 2026 municipality whose boundary it is in. The region
   follows the municipality's number (its first digit is the region), so
   Höfn is in the South with Hornafjörður.

### 3.2 Towns for place search

1. Every one of the 110 is a place: a town from 1,000 people, otherwise a
   village, as spec 4 counts them (10 km and 5 km). The places the sample
   data had keep their key, name, spot, kind and reach, so searches there
   find what they found before, and the launch corridors keep their
   places. The landmarks stay (Þingvellir, Geysir and the others).
2. A place's name is the one people use, with the other forms as aliases:
   "Höfn" with "Höfn í Hornafirði", "Vík" with "Vík í Mýrdal", and the two
   Reykholts as "Reykholt í Borgarfirði" and "Reykholt í Biskupstungum".
3. Places are reference data, not personal data, so every environment
   loads them on each deploy: production too, unlike the sample meeting
   points. A place that is there is updated; none is deleted, so a
   corridor never loses one.
4. Álftanes, like the other capital area towns, covers the points in its
   municipality (Garðabær) instead of a radius.

### 3.3 A spot in each settlement

Each point follows the meeting point guide's criteria
([meeting points](../product/meeting-points.md)): public, lit, off the
road, easy to find. In order:

1. A fuel station where Strætó stops (within 150 m of a stop in Strætó's
   timetable data).
2. Another fuel station, N1 and Olís before Orkan, ÓB and Atlantsolía,
   since they more often have a shop.
3. A Strætó stop.
4. Then the car park of a shop, a sports centre or pool, a church or a
   community hall.

Within 1.5 km of the centre, or 2.5 km in a town of 1,000 or more. Some are
picked by hand: Fitjar in Njarðvík (Strætó's stop for the airport), Hof
in Akureyri (where the buses to Reykjavík leave), the N1 at Kaupvangur in
Egilsstaðir, and the church in Hafnir.

14 small settlements have no public spot of their own and lie within a few
kilometres of a bigger neighbour, so their place reaches the neighbour's
point instead: Mosfellsdalur, Innnes, Hauganes, Lónsbakki, Öngulsstaðir,
Brúnahlíð, Veigastaðir, Sólberg, Vogar við Mývatn, Nesjahverfi,
Tjarnabyggð, Árbæjarhverfi, Gljúfurárholt and Vellir. Nesjahverfi's place
reaches 8 km, to Höfn; the others keep their 5 km.

The capital area gets the hubs of the meeting point guide (BSÍ, Hlemmur,
Kringlan, Ártún, Mjódd, Olís Norðlingaholti, Smáralind, Fjörður, N1
Mosfellsbæ), plus Garðatorg, Eiðistorg, the pool on Álftanes and
Esjuskálinn on Kjalarnes. Three more are on the corridors and not in a
settlement: Keflavík Airport, Staðarskáli and Landeyjahöfn, the mainland
port for Vestmannaeyjar.

That makes 104 points: 96 settlements with their own, 14 sharing, the 13
capital area hubs counted in the 96, and the 3 corridor stops.

### 3.4 Names and texts

1. A point's name starts with its settlement, so a search for the village
   finds it first: "Hvammstangi – N1", "Hólar í Hjaltadal – kirkjan"
   ("Hólar í Hjaltadal – church" in English). The capital area hubs keep
   the names the sample points use.
2. Where to stand, in both languages, says the spot without naming the
   shop in a declined form: "Á planinu við N1, fyrir framan verslunina." /
   "On the N1 forecourt, in front of the shop." At a station without a
   known shop: "til hliðar við dælurnar" / "to the side of the pumps".
   Where Strætó stops: "Strætó stoppar hér." / "Strætó buses stop here."
3. Amenities are only what the map data shows: parking at every car park
   and forecourt, and a shop with shelter where a shop is at the spot.
   Toilets and step-free access wait for the operator. Every point is in
   use all year until the operator says otherwise.

### 3.5 Loading and going live

1. The points are a file in the console's import format
   (`packages/db/src/places/settlement-meeting-points.csv`): the operator
   uploads it on the Meeting points page, Import (spec 2, 3.6.9), and the
   rows become drafts. That keeps rule R2.1 (only the operator creates
   points) and the audit log.
2. On staging, the rows named like a sample point (BSÍ, Kringlan,
   Keflavíkurflugvöllur and the other capital area hubs, and Staðarskáli)
   show as duplicates and are left out; the sample points are already
   there.
3. Before activating a point, the operator opens its spot in maps, moves
   it if needed, and checks its text, amenities and season, then sets the
   day it was confirmed (spec 2, decision 2). Grindavík needs a check that
   the town is open.
4. A photo is recommended, not required (ADR 0036). The checklist shows
   it as "Recommended" until there is one.
5. Several at once (decision 5): with drafts in the list, the Meeting
   points page shows "Activate several drafts". The operator ticks each
   draft they have checked (or "Select every draft shown", which follows
   the filters) and presses "Confirm and activate N points". Each ticked
   draft is activated in turn, as if activated alone: today becomes the
   day it was confirmed, its amenities and season count as reviewed, its
   legs are computed and it gets its own audit entry. None of that is
   saved for a draft that cannot be activated: one still missing
   something else (such as where to stand), or one changed since the
   list was loaded, is listed under "Not activated" with the reason, and
   the others go ahead. If the API cannot be reached or the sign-in has
   ended, it stops and lists the rest as not activated. While it works,
   the filters and tick boxes wait; leaving the page stops it, and the
   drafts not reached yet stay drafts. The list then reloads, and the
   panel stays to say how it went, even with no draft left. Other
   filters start again with nothing ticked.

### 3.6 The main sights

1. **Which sights:** 32 that visitors stop at on ordinary roads (decision
   7). The Golden Circle: Þingvellir (Hakið), Geysir, Gullfoss, Kerið. The
   South coast: Seljalandsfoss, Skógafoss, Sólheimajökull, Dyrhólaey,
   Reynisfjara, Fjaðrárgljúfur, Skaftafell, Fjallsárlón, Jökulsárlón (also
   for Diamond Beach). Reykjanes: the Blue Lagoon. The West and
   Snæfellsnes: Glymur, Deildartunguhver, Hraunfossar, Kirkjufellsfoss,
   Búðir, Arnarstapi, Djúpalónssandur. The Westfjords: Dynjandi,
   Látrabjarg. The North: Hvítserkur, Goðafoss, Dimmuborgir, the Mývatn
   Nature Baths, Hverir, Dettifoss, Ásbyrgi. The East: Stuðlagil,
   Hengifoss.
2. **Left out:** the highlands (Landmannalaugar, Þórsmörk, Hveravellir),
   as legs skip mountain roads (spec 2) and they need a 4x4; Reykjavík's
   sights, which BSÍ and Hlemmur serve; businesses such as Friðheimar and
   the Secret Lagoon, whose villages have a point; and Seltún in
   Krýsuvík, which lies in Hafnarfjörður, so its point would show in
   every search for the capital area.
3. **The spot:** the sight's visitor car park in OpenStreetMap, the one by
   its visitor centre or path, even where parking is paid (decision 6).
   At Dyrhólaey it is the lower car park (Lágey), not the steep road up to
   the lighthouse; at Dettifoss the west one, on the paved road 862; at
   Stuðlagil the car park nearest the canyon.
4. **The point:** type car park, amenities only parking, named after the
   sight ("Gullfoss", "Þingvellir – Hakið") with its English name where it
   differs ("Mývatn Nature Baths") and other names as aliases ("Diamond
   Beach", "Strokkur"). Where to stand says which car park, and where the
   map shows a fee it adds "Bílastæðið er gjaldskylt." / "Parking here is
   paid." so a driver knows before stopping. Every point is in use all
   year, except Látrabjarg, May to September, as its road is not kept
   open in winter.
5. **Place search:** each sight is a landmark place (5 km reach), at its
   car park; the seven landmarks there already (Þingvellir, Geysir,
   Gullfoss, Seljalandsfoss, Skógafoss, Reynisfjara and the Blue Lagoon)
   keep their keys and spots.
6. **Loading:** a second import file,
   `packages/db/src/places/sight-meeting-points.csv`, imported and
   activated as in 3.5. Its names clash with no settlement point, so the
   two files can be imported in either order.

## 4. Rules

| ID | Rule |
| -- | ---- |
| R2.3 (changed) | A point can be activated only with: a name, location, type, region and municipality; "where to stand" in Icelandic and English; amenities and season reviewed; the date the operator confirmed it (decision 2); computed legs. A photo with descriptions is recommended, not required (ADR 0036). |

## 5. Screens

In the console's activation checklist, the photo item reads
"Recommended" when there is none, instead of "To do", and is not counted
in "things still to do". The app's meeting point details already show no
photo block for a point without photos.

The console's Meeting points list gains a panel above the list while it
shows drafts, and after a run (3.5.5): a tick box on each draft's card, "Select every
draft shown", "Clear the selection" and "Confirm and activate N points".
While it works it says "Activating 3 of 10…"; then "N points activated."
and the list of those not activated, each with its reason. Pressing the
button with nothing ticked says to tick the checked drafts first.

## 6. Data and API

- `packages/db/src/places/places.ts`: the places, with each settlement's
  number at Statistics Iceland and its 2026 population.
  `seedPlaces` adds or updates them; the migration command runs it after
  the migrations in every environment, and the sample seed runs it too.
  A place keeps the ID the sample place had.
- `GET /admin/v1/meeting-points/{id}/activation`: each item gains
  `required`. `ready` and `POST .../activate` look at the required items
  only, and `activation_not_ready` names only those.
- `POST /admin/v1/meeting-points/{id}/activate` takes an optional
  `confirmToday` (3.5.5): today, in Iceland, becomes the day confirmed,
  and the amenities and season count as reviewed (an earlier review day
  is kept), before the checklist is checked. They are saved only if the
  point activates, and the audit entry `meeting_point.activated` shows
  them before and after, with `confirmedToday: true`. The console sends
  one request per ticked draft, one after another.
- No migration.
- `packages/db/src/places/sight-meeting-points.csv`: the 32 sights' points
  (3.6), in the same import format. `landmarkPlaces` gains the 25 sights
  that were not places, seeded in every environment as the others are.

## 7. Privacy and safety

- No personal data: settlements, shops and stops are public places.
- Sources: Statistics Iceland (free to reuse with the source named);
  OpenStreetMap (ODbL, "© OpenStreetMap contributors", as for our road
  file), for positions; Strætó's timetable data only to tell whether
  Strætó stops at a spot. Every position is OpenStreetMap's.
- Safety rests on the operator's check before activation, which stays
  required, and on precise "where to stand" texts while there is no
  photo.

## 8. Texts

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `admin.activation.recommended` | Recommended | Mælt með |
| `admin.activateSeveral.title` | Activate several drafts | Virkja nokkur drög |
| `admin.activateSeveral.activate` | Confirm and activate N points | Staðfesta og virkja N mótsstaði |
| `admin.activateSeveral.activated` | N points activated. | N mótsstaðir virkjaðir. |
| `admin.activateSeveral.notActivated` | Not activated | Ekki virkjaðir |

The panel's other texts (the intro, tick boxes, progress and reasons) are
in `packages/i18n` under `admin.activateSeveral`.

The texts in the import file are for the operator to check; a native
speaker reviews them with the app's texts (milestone 16).

## 9. Testing

- **Unit (domain):** the checklist is ready without a photo when every
  required item is done; not ready when another item is missing.
- **Unit (data):** every row of the import file reads without a problem
  through the console's own import reader, under its row limit, with no
  name twice; every point joins a road of the road file within 1 km and
  reaches Reykjavík by road; every place reaches at least one point; the
  places have unique keys and cover all 110 settlements; the sample keys
  are still there.
- **Unit (sights' file):** every row reads without a problem through the
  console's reader after the settlement file, so no name clashes; every
  point is a car park with where to stand in both languages, says in both
  languages whether parking is paid, and joins a road within 1 km that
  reaches BSÍ; every landmark place reaches a point; only Látrabjarg has
  a season.
- **API integration:** activating a draft with no photo works; the
  checklist says `photos` is not required. With `confirmToday`, a draft
  with no reviews and no day confirmed activates with today for all
  three and the audit entry shows them; one missing where to stand is
  refused and nothing is saved.
- **Console:** the photo item shows "Recommended" and the activate button
  is enabled without a photo. Activating several: the ticked drafts are
  activated one by one with `confirmToday`, a refused one is listed with
  what is still to do, and the list reloads; select all and clear; the
  panel is hidden without drafts.

## 10. Out of scope

The highlands and the other sights of 3.6.2, more than one point at a
sight, and the parking fees' amounts, which change. Photos of the new points, more than one point in the bigger towns outside
the capital area, the ferry islands, replacing staging's sample points
with the real ones, and a console filter for active points without a
photo (ADR 0036, follow-up).

## Decisions

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Can a point go live before it has a photo? | Yes, the photo can follow (Martin, 2026-11-22, on a decision card; ADR 0036) |
| 2 | Which list counts as every settlement? | Statistics Iceland's byggðakjarnar with people in 2026, without the ferry islands (Claude's call, stated to Martin 2026-11-22) |
| 3 | A point in each, or a neighbour's for the tiniest? | A neighbour's for the 14 with no public spot (Claude's call, for Martin to correct) |
| 4 | Seed the points, or import them in the console? | Import in the console, as drafts, so the operator creates them (R2.1) and the audit log has them (Claude's call) |
| 5 | Activate the 104 drafts one by one, or several at once? | Several at once: tick the checked drafts in the list, each confirmed today with its own audit entry (Martin, 2026-11-22, on a decision card) |
| 6 | Where does the point go at a sight with paid parking? | In the sight's car park, and where to stand says parking is paid (Martin, 2026-11-22, on a decision card) |
| 7 | Which sights, and in season when? | The 32 of 3.6.1, all year but Látrabjarg, May to September (Claude's call, for Martin to correct) |
