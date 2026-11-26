# Glossary

The shared vocabulary for product, code and conversation. Use these words in
code identifiers, UI text keys, docs and issues. Icelandic terms are proposals
to be confirmed by a native speaker before they appear in the app.

| Term (code name) | Icelandic (proposed) | Meaning |
| ---------------- | -------------------- | ------- |
| Meeting point (`MeetingPoint`) | Mótsstaður | A curated, public place where passengers board or leave a trip |
| Leg (`Leg`) | Leggur | A precomputed connection between two meeting points, with road distance and typical driving time |
| Trip (`Trip`) | Ferð | One journey a driver offers, on a date and time, through an ordered list of stops. A member reads **ride** for it in English ("Offer a ride", "Your ride is published"): `trip` is the word of the code, the text keys, the docs, the operator console and the legal documents, and of "Trip day" ([spec 31](specs/2026-11-26-one-ride-one-ticket.md), 3.4). Icelandic says "far" for finding and offering one ("Finna far", "Bjóða far") and "ferð" for the ride itself |
| Stop (`TripStop`) | Viðkomustaður | A meeting point on a specific trip, with its planned time and position |
| Segment (`Segment`) | Áfangi | The stretch between two consecutive stops of a trip; it has its own price |
| Capacity (`capacity`) | Sætaframboð | Number of seats the driver offers on a trip |
| Occupancy (`occupancy`) | Sætanýting | Seats held by bookings on a given segment |
| Booking (`Booking`) | Bókun | A passenger's reservation of seats from a boarding stop to an alighting stop |
| Boarding stop / alighting stop | Brottfararstaður / komustaður | Where a passenger gets in and out |
| Booking mode (`BookingMode`) | Bókunarháttur | Instant booking, or request and driver approval |
| Driver (`Driver`) | Ökumaður | A user offering a trip |
| Passenger (`Passenger`) | Farþegi | A user booking seats |
| Operator | Rekstraraðili | The person or company running PuffinRide; uses the admin console |
| Suggested price | Ráðlagt verð | Price per segment proposed by the app from distance and rate |
| Price cap | Hámarksverð | Highest price a segment may have (cost-sharing limit) |
| Trip limit (`tripLimit`) | Hámark ferðar | The most a whole trip may bring its driver: what a full car pays at the price caps. Everything the trip's bookings pay the driver counts against it ([spec 17](specs/2026-11-17-trip-earnings-limit.md)) |
| Payment window (`paymentWindow`) | Greiðslufrestur | Time a passenger has to pay after a booking is accepted |
| Refund (`Refund`) | Endurgreiðsla | Money returned to a passenger, for example after a free cancellation |
| Payout (`Payout`) | Útborgun | Money paid to a driver for a completed trip |
| Price level (`priceLevel`) | Verðstig | The one percentage of the suggested prices a driver chooses for a whole trip, from 0% (free) up to the cap |
| Cost-sharing | Kostnaðarskipting | Passengers contribute to the cost of a trip the driver makes anyway, without profit |
| Reliability | Áreiðanleiki | Share of trips and bookings a user completed rather than cancelled |
| Tester | Prófari | Anyone with an account during the beta, which is open to everyone (ADR 0035). While the operator requires invite codes, an account made with one, and the settings cap how many there can be |
| Invite code (`InviteCode`) | Boðskóði | A group code that lets a set number of new accounts in while the beta is closed, until a date |
| Feedback (`Feedback`) | Ábending | What a tester sends from the app about a problem or an idea; the operator can reply once |
| Setting (`SettingKey`) | Stilling | A value the operator can change in the console within a fixed range, with a reason; each change is a new settings version |
| Settings version | Útgáfa stillinga | The number of the last change to the settings. A published trip keeps its version's price values, and a booking its version's cancellation values |
| Switch | Rofi | A setting that is on or off, for emergencies: off pauses what is new (sign-ups, trips, bookings, a notification channel) and changes nothing that exists |
| Corridor (`Corridor`) | Leið | A named, ordered list of places the beta opens on; the weekly figures are counted for each |
| Weekly figures | Vikutölur | Searches, requests, bookings, seat fill and cancellations per corridor and week, and the beta's exit criteria built on them |
| Announcement (`Announcement`) | Tilkynning | News about the beta the operator writes in both languages and sends once to an audience; people can turn it off with "Beta news" |
| Kennitala | Kennitala | Icelandic national identification number; never required to use the app |
| Auðkenni | Auðkenni | Icelandic electronic ID (rafræn skilríki) provider, used for optional verification |
| Vegagerðin | Vegagerðin | Icelandic Road and Coastal Administration; source of road conditions and closures |
| Veðurstofa Íslands | Veðurstofa Íslands | Icelandic Met Office; source of weather warnings |
| Samgöngustofa | Samgöngustofa | Icelandic Transport Authority |
| Persónuvernd | Persónuvernd | Icelandic Data Protection Authority |
| ADR | | Architecture Decision Record: a short document recording one decision and why |
| Spec | | A feature design agreed before building, stored in `docs/specs/` |
| Plan | | Step-by-step implementation plan for a spec, stored in `docs/plans/` |
