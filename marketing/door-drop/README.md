# What a flyer to every home costs

Made 2026-11-28 for Martin: "how much would it cost to deliver a flyer to
every house". It prices the A5 launch flyer (printed on both sides, see
[Printing the flyer](../launch-ads/ad-texts.md#printing-the-flyer)) through a
letterbox: printing, getting it to Iceland, and delivery. Prices were read
on 28 November 2026 and are without VAT unless a line says otherwise. Euros
are turned into krónur at the European Central Bank's rate of 137.20 kr.
for one euro (27 November 2026).

## The answer

| Where | Homes | Cost, all in | Per home |
| ----- | ----: | -----------: | -------: |
| Capital area only | about 92,000 | **4 to 6 million kr.** | 41 to 66 kr. |
| Capital area and the towns on Route 1 | about 110,000 | **10 to 13 million kr.** | about 100 kr. |
| Every home in Iceland | about 145,000 | **23 to 25 million kr.** | about 165 kr. |
| Every home, all through Pósturinn | about 145,000 | **about 53 million kr.** | about 370 kr. |
| Only the towns on Route 1 | about 18,000 | **about 6.6 million kr.** | about 370 kr. |

"All in" is printing, freight to Iceland, import VAT on the print, and
delivery with VAT where it applies. The spread in the first three rows is
Póstdreifing's price, which it gives only as a quote (see below).

**Why a home in the capital area costs six to nine times less:** only there does
anyone still carry unaddressed advertising door to door. Pósturinn
stopped on 1 January 2024. Everywhere else the only way into every
letterbox is Pósturinn's unaddressed letter, at the price of a letter.

## How many homes

From Statistics Iceland's population on 1 January 2026, at two ratios: the
census's 2.65 people per household (2021), and Pósturinn's own count of
135,684 homes it delivers letters to (December 2023), which is 2.83 people
per home. The lower number is closer to the letterboxes a carrier walks to.

| Area | People | Homes |
| ---- | -----: | ----: |
| All Iceland | 394,324 | 139,400 to 148,800 |
| Capital area | 251,912 | 89,100 to 95,100 |
| Outside the capital area | 142,412 | 50,400 to 53,700 |
| Towns on Route 1, outside the capital area | 49,719 | 17,600 to 18,800 |
| of which Akureyri | 20,467 | 7,200 to 7,700 |
| Larger towns off Route 1 (Reykjanesbær and around, Akranes, Vestmannaeyjar, Ísafjörður, Sauðárkrókur, Húsavík, Þorlákshöfn) | 51,907 | 18,400 to 19,600 |

The towns on Route 1 counted here are Borgarnes, Bifröst, Blönduós,
Varmahlíð, Akureyri, Reykjahlíð, Egilsstaðir, Fellabær, Reyðarfjörður,
Fáskrúðsfjörður, Stöðvarfjörður, Breiðdalsvík, Djúpivogur, Höfn (just off
the road), Kirkjubæjarklaustur, Vík, Hvolsvöllur, Hella, Selfoss and
Hveragerði. Run `python3 marketing/door-drop/src/households.py` to count
them again from the open data (it takes a year, such as `2027`).

The estimate plans for 145,000 homes in all, 92,000 in the capital area,
52,000 outside it and 18,000 in the Route 1 towns.

## Delivery

### Capital area: Póstdreifing

Póstdreifing, which also carries Morgunblaðið, takes unaddressed advertising
(*fjölpóstur*) to homes in postcodes 101 to 113, 170, 200 to 221, 225 and
270: Reykjavík without Kjalarnes, Seltjarnarnes, Kópavogur, Garðabær,
Hafnarfjörður and Mosfellsbær. It is delivered on Thursdays between 21:00
and 07:00. It is booked ahead, and the flyers go to its centre at
Hádegismóar 2, 110 Reykjavík, 2 to 3 working days before. It reaches
other towns only with newspapers and addressed mail, not with fjölpóstur.

- **Price:** by quote only ("we make you an offer"), set by quantity,
  weight and day. The A5 flyer weighs 3.6 g on 115 g paper (5.3 g on
  170 g), so it is in the lightest class, 0 to 25 g.
- **For planning, 30 to 50 kr. a home.** This is my assumption, not
  their price. The last public price for door-to-door unaddressed mail in
  Iceland was 37 to 45 kr. a copy: what Pósturinn charged a free paper in
  East Iceland until the end of 2023 (RÚV). 92,000 homes at 30 to 50 kr.
  is 2.8 to 4.6 million kr., or 3.4 to 5.7 million kr. with 24% VAT.
- Homes with an "Afþakka fjölpóst" sticker are skipped.

### Everywhere: Pósturinn's unaddressed letter

Pósturinn no longer carries fjölpóstur (since 1 January 2024; it had
already stopped in the capital area, Reykjanes, Selfoss and Akranes on
1 May 2020). What it offers instead is *almenn bréf ónafnamerkt*:
letters with no name or address that go to every home and workplace in
the postcodes you choose.

- **Price:** the ordinary letter price, **365 kr. for 0 to 50 g** (price
  list from 1 August 2026, shown without VAT). A volume discount by
  quantity and weight is given, but its scale is not published, and only
  for machine-sortable letters that meet the packing rules. Ask how much,
  and ask whether a bare A5 card counts as machine-sortable and whether
  VAT is added.
- **Rules:** all the same size and weight, the same way up in trays,
  sorted by postcode, no stamps, posted at Stórhöfði 32 or a post office.
  Delivered 2 to 5 working days after posting. More letters than homes in
  a postcode come back to you.
- 52,000 homes outside the capital area at 365 kr. is about 19 million
  kr.; the 18,000 homes in the Route 1 towns, about 6.6 million kr.; all
  145,000 homes, about 53 million kr. A discount would lower these.

### Cheaper ways outside the capital area

There is no free newspaper left to slip a flyer into across the country:
Fréttablaðið was carried until 31 March 2023 and is gone. Local papers
still reach some towns:

- **Akureyri and Eyjafjörður:** Dagskráin is printed in 11,000 copies and
  goes to homes and businesses in Akureyri, Dalvík, Ólafsfjörður, Hrísey,
  Grímsey, Svalbarðseyri, Grenivík, Hauganes, Árskógsströnd and
  Hjalteyri, every Wednesday. A full page costs **56,000 kr. plus VAT**
  (2026 price list). The flyer's front would fit as a page ad. Ask them
  for the price of a loose insert.
- **South Iceland:** Dagskráin is no longer delivered to homes since
  Pósturinn stopped; it is picked up from boxes and shops from Hveragerði
  to Skaftárhreppur. An ad there reaches readers, not letterboxes.
- **East Iceland:** Dagskráin Austurlands hired its own carriers and leaves
  copies in shops for people in the countryside (RÚV, January 2024).
- Flyers in a stand at the N1, Olís and Orkan stations that are meeting
  points, and on shop noticeboards, cost only the print.

## Printing

Online printer Sprint24 (Rotostampa, Italy), A5, colour on both sides,
matt coated paper, its cheapest "Promo" speed (8 to 11 working days),
delivered to Iceland. Ordered by noon on Monday 30 November 2026, it would
arrive 14 to 17 December 2026.

| Quantity | Paper | Print | Freight to Iceland | Together | In krónur | With 24% import VAT |
| -------: | ----- | ----: | -----------------: | -------: | --------: | ------------------: |
| 20,000 | 115 g | €253 | €132 (71 kg) | €385 | 52,800 kr. | 65,500 kr. |
| 30,000 | 115 g | €371 | €222 (107 kg) | €593 | 81,400 kr. | 100,900 kr. |
| 50,000 | 115 g | €606 | €384 (179 kg) | €990 | 135,800 kr. | 168,400 kr. |
| 100,000 | 115 g | €1,194 | €789 (358 kg) | €1,983 | 272,100 kr. | 337,400 kr. |
| 100,000 | 170 g | €1,637 | €1,176 (530 kg) | €2,813 | 385,900 kr. | 478,600 kr. |
| 150,000 | 115 g | €1,800 | €1,173 | €2,973 | 407,900 kr. | 505,800 kr. |

The 150,000 row is the 100,000 and 50,000 orders together. Add the
carrier's customs clearance fee, which the printer does not show. Printed
matter carries no customs duty, but import VAT is 24%; it comes back only
once PuffinRide is registered for VAT.

- **Paper:** 115 g is fine for a letterbox and saves about 140,000 kr.
  (with VAT) on 100,000 flyers against the 170 g our print notes suggest
  for noticeboards. Keep 170 g for the few that go on noticeboards.
- **Icelandic printers** (Prentmet Oddi, Litróf, Svansprent) do not
  publish prices for runs this size. Ask two of them for a quote; the
  table above is the price to beat. A printer here saves the freight, the
  clearance and a week, and can deliver straight to Póstdreifing or
  Pósturinn.

## How each total is made

| Scenario | Print (with VAT) | Póstdreifing, 92,000 homes (with VAT) | Pósturinn at 365 kr. | Total |
| -------- | ---------------: | ------------------------------------: | -------------------: | ----: |
| Capital area only | 100,000: 337,400 | 3.42 to 5.70 m | none | 3.8 to 6.0 m kr. |
| Capital area and Route 1 towns | 100,000 + 20,000: 402,900 | 3.42 to 5.70 m | 18,000: 6.57 m | 10.4 to 12.7 m kr. |
| Every home | 150,000: 505,800 | 3.42 to 5.70 m | 52,000: 18.98 m | 22.9 to 25.2 m kr. |
| Every home through Pósturinn | 150,000: 505,800 | none | 145,000: 52.93 m | 53.4 m kr. |
| Route 1 towns only | 20,000: 65,500 | none | 18,000: 6.57 m | 6.6 m kr. |

## Before any flyer goes through a letterbox

1. **A sender line.** Both Póstdreifing and Pósturinn require the name of
   the company or the person responsible on every piece. The flyer shows
   only PuffinRide and puffinride.is today. Martin's choice: his own name
   now, or wait for the ehf. planned for early 2027.
2. **A tagged QR code per area.** The flyer's QR code says
   `utm_source=flyer&utm_medium=qr`. A door-drop print would use, for
   example, `utm_medium=door_drop&utm_content=capital-area`, so Google
   Analytics shows what each area brought. The generator in
   `launch-ads/src/` draws it in a minute.
3. **Try one area first.** About 10,000 homes in a few capital postcodes
   would cost roughly 0.4 to 0.7 million kr. (my estimate, at the
   planning price above) and show how many people scan before the full
   run.
4. The flyer says nothing about payments or fees, and it must stay that
   way (Martin's rule for marketing).

## Asking Póstdreifing for a quote

To `sala@postdreifing.is` or 585 8300. A text Martin can send:

> Góðan dag. Við erum að kynna PuffinRide (puffinride.is), samferðavef
> fyrir Ísland, og viljum fá tilboð í dreifingu fjölpósts á öll heimili á
> höfuðborgarsvæðinu (um 92.000 eintök), og til samanburðar á um 10.000
> heimili í nokkrum póstnúmerum. Prentgripurinn er A5 einblöðungur,
> prentaður báðum megin, um 4 g. Hvert yrði verðið á eintak, hvaða
> fimmtudaga er laust í janúar og febrúar, og hversu mörg heimili eru í
> hverju póstnúmeri? Með kveðju, Martin

## Sources

All read on 28 November 2026.

- Statistics Iceland: [households in the 2021 census](https://statice.is/publications/news-archive/census/households-income-and-vehicle-ownership/) (130,849 households, 2.65 people each; release 19 April 2023), [population on 1 January 2026](https://old.statice.is/publications/news-archive/inhabitants/population-1-january-2026/) (394,324; release 12 March 2026), and the open tables MAN02005 (municipalities) and MAN030102 (localities) at [px.hagstofa.is](https://px.hagstofa.is/pxen/pxweb/en/Ibuar/Ibuar__mannfjoldi__2_byggdir__sveitarfelog/MAN02005.px).
- Íslandspóstur, [comment to Alþingi's transport committee](https://www.althingi.is/altext/erindi/154/154-1159.pdf), 11 December 2023: 135,684 homes and 18,292 workplaces in letter delivery; Fréttablaðið carried until 31 March 2023.
- Pósturinn, [price list](https://posturinn.is/verd/) valid from 1 August 2026, and [terms](https://posturinn.is/posturinn/upplysingar/vidskiptaskilmalar/), "Bréf innanlands", "Almenn bréf ónafnamerkt".
- Póstdreifing, [terms](https://www.postdreifing.is/adstod/vikdskiptaskilmalar/) (fjölpóstur area, days, weights) and [front page with the price list](https://www.postdreifing.is/) (letter prices from 1 January 2026; fjölpóstur by quote).
- Vísir, [Pósturinn stops fjölpóstur in the south-west](https://www.visir.is/g/2020905496d), 29 January 2020; [Dreifingu fjölpósts hætt](https://www.visir.is/g/20242512349d/dreifingu-fjolposts-haett), 9 January 2024; [bulk mail price list merged into letters](https://www.visir.is/g/20232497285d/verd-skra-fyrir-magnpost-logd-nidur), 1 December 2023.
- Skagafjörður council, [minutes of 15 November 2023](https://www.skagafjordur.is/is/fundargerdir/malsnumer/2311001F): Pósturinn stops all fjölpóstur on 1 January 2024.
- RÚV, [up to 600% dearer after Pósturinn stops fjölpóstur](https://www.ruv.is/frettir/innlent/2024-01-11-akvordun-um-ad-haetta-dreifingu-fjolposts-skilar-ser-i-allt-ad-600-prosent-verdhaekkun-401563), 11 January 2024: 37 to 45 kr. a copy before, about 280 kr. after.
- Dagskráin (South), [distribution](https://www.dfs.is/dreifing/).
- Dagskráin and Vikublaðið (Akureyri), [2026 advertising prices](https://www.vikubladid.is/static/files/Auglysingar/2026_auglysingaverd_staerdir.pdf).
- Sprint24, [A5 flyers](https://sprint24.net/online-printing/flyers-a5/), prices with delivery to Iceland.
- European Central Bank, [reference rates](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml), 27 November 2026: 137.20 kr. for €1.
