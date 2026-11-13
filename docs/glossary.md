# Glossary

The shared vocabulary for product, code and conversation. Use these words in
code identifiers, UI text keys, docs and issues. Icelandic terms are proposals
to be confirmed by a native speaker before they appear in the app.

| Term (code name) | Icelandic (proposed) | Meaning |
| ---------------- | -------------------- | ------- |
| Meeting point (`MeetingPoint`) | Mótsstaður | A curated, public place where passengers board or leave a trip |
| Leg (`Leg`) | Leggur | A precomputed connection between two meeting points, with road distance and typical driving time |
| Trip (`Trip`) | Ferð | One journey a driver offers, on a date and time, through an ordered list of stops |
| Stop (`TripStop`) | Viðkomustaður | A meeting point on a specific trip, with its planned time and position |
| Segment (`Segment`) | Áfangi | The stretch between two consecutive stops of a trip; it has its own price |
| Capacity (`capacity`) | Sætaframboð | Number of seats the driver offers on a trip |
| Occupancy (`occupancy`) | Sætanýting | Seats held by bookings on a given segment |
| Booking (`Booking`) | Bókun | A passenger's reservation of seats from a boarding stop to an alighting stop |
| Boarding stop / alighting stop | Brottfararstaður / komustaður | Where a passenger gets in and out |
| Booking mode (`BookingMode`) | Bókunarháttur | Instant booking, or request and driver approval |
| Driver (`Driver`) | Ökumaður | A user offering a trip |
| Passenger (`Passenger`) | Farþegi | A user booking seats |
| Operator | Rekstraraðili | The person or company running ShareRide; uses the admin console |
| Suggested price | Ráðlagt verð | Price per segment proposed by the app from distance and rate |
| Price cap | Hámarksverð | Highest price a segment may have (cost-sharing limit) |
| Price level (`priceLevel`) | Verðstig | The one percentage of the suggested prices a driver chooses for a whole trip, from 0% (free) up to the cap |
| Cost-sharing | Kostnaðarskipting | Passengers contribute to the cost of a trip the driver makes anyway, without profit |
| Reliability | Áreiðanleiki | Share of trips and bookings a user completed rather than cancelled |
| Kennitala | Kennitala | Icelandic national identification number; never required to use the app |
| Auðkenni | Auðkenni | Icelandic electronic ID (rafræn skilríki) provider, used for optional verification |
| Vegagerðin | Vegagerðin | Icelandic Road and Coastal Administration; source of road conditions and closures |
| Veðurstofa Íslands | Veðurstofa Íslands | Icelandic Met Office; source of weather warnings |
| Samgöngustofa | Samgöngustofa | Icelandic Transport Authority |
| Persónuvernd | Persónuvernd | Icelandic Data Protection Authority |
| ADR | | Architecture Decision Record: a short document recording one decision and why |
| Spec | | A feature design agreed before building, stored in `docs/specs/` |
| Plan | | Step-by-step implementation plan for a spec, stored in `docs/plans/` |
