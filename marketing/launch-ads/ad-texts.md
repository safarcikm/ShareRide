# PuffinRide launch ads: texts, links and how to use the files

Made 2026-11-22 for the open beta, updated the same evening: the rounded
Beetle-style puffin car (the same car as the site) and no word about payments
or fees (Martin's call). Every claim matches the app on puffinride.is today:
open to everyone, 104 meeting points live, the driver's profile shown before
booking, chat after booking, Icelandic and English. The only money words left
are "share the cost" in the drivers' ad, which keeps PuffinRide cost sharing
rather than a taxi.

**Before you pay for ads:** have a native speaker read the Icelandic once.

## What is in this folder

| File | Use |
| ---- | --- |
| `social/puffinride-<idea>-<is or en>-square-1080x1080.png` | Facebook feed, Marketplace, right column, Messenger inbox, carousel |
| `social/puffinride-<idea>-<is or en>-feed-1080x1350.png` | Facebook and Instagram feeds (4:5, takes the most room on a phone) |
| `social/puffinride-<idea>-<is or en>-story-1080x1920.png` | Facebook and Instagram Stories and Reels. Words stay out of the top 270 px and the bottom 340 px, where Meta puts its own buttons |
| `social/puffinride-facebook-cover-1640x624.png` | Cover picture of the PuffinRide Facebook Page. The words stay in the middle, which phones show |
| `flyer/puffinride-flyer-a5-print-cmyk.pdf` | **Send this one to the printer.** A5, two sides, CMYK, 3 mm bleed |
| `flyer/puffinride-flyer-a5-print-rgb.pdf` | The same in RGB, for a printer that asks for RGB |
| `flyer/puffinride-flyer-a4-two-per-page-home.pdf` | Home or office printer: two flyers per A4 page, cut down the dashed line |
| `flyer/preview-a5-1.png`, `preview-a5-2.png` | Pictures of the two sides |
| `puffinride-ads-overview.png` | All 18 ads on one page |
| `src/` | The drawings and texts the pictures are made from |

The three ideas (`<idea>` in the file names):

- **ride**: "Vantar þig far?" / "Need a ride?" for passengers.
- **drive**: "Ertu að keyra hvort sem er?" / "Driving there anyway?" for drivers.
- **part**: "Alla leið eða bara hluta hennar" / "All the way, or just part of it": meeting points and booking part of a trip.

In Meta Ads Manager, one ad can hold all three sizes: upload the feed, square
and story picture of the same idea and language, and Meta picks the right one
for each place. Run the Icelandic and English ads as separate ads (or use the
ad's "Languages" option) so each person sees one language.

## Ad texts

Meta shows about the first 125 characters of the main text before "See more",
so the point comes first.

### ride (passengers)

#### Íslenska

- Main text: Vantar þig far milli bæja? Á PuffinRide finnur þú laust sæti í bíl sem fer þína leið. Yfir 100 mótsstaðir um allt land og þú sérð hver keyrir áður en þú bókar.
- Headline: Finndu far á puffinride.is
- Description: Samferða um Ísland
- Button: Frekari upplýsingar (Learn more)

#### English

- Main text: Need a ride between towns? PuffinRide finds you a free seat in a car that's already going your way. 100+ meeting points around Iceland, and you see who's driving before you book.
- Headline: Find a ride at puffinride.is
- Description: Shared rides across Iceland
- Button: Learn more

### drive (drivers)

#### Íslenska

- Main text: Ertu að keyra hvort sem er? Bjóddu lausu sætin í bílnum og deildu kostnaðinum við ferðina. Þú velur leiðina og mótsstaðina og spjallar við farþegana fyrir ferðina.
- Headline: Bjóddu far á puffinride.is
- Description: Bjóddu lausu sætin
- Button: Skrá mig (Sign up)

#### English

- Main text: Driving there anyway? Offer the empty seats in your car and share the cost of the trip. You choose the route and the meeting points, and chat with your passengers before you go.
- Headline: Offer a ride at puffinride.is
- Description: Offer your empty seats
- Button: Sign up

### part (part of the way)

#### Íslenska

- Main text: Ferðir á PuffinRide stoppa á mótsstöðum á leiðinni, svo þú getur farið alla leið eða bara hluta hennar. Til dæmis frá Selfossi á Hellu í bíl sem er á leið til Víkur.
- Headline: Alla leið eða bara hluta hennar
- Description: Yfir 100 mótsstaðir
- Button: Frekari upplýsingar (Learn more)

#### English

- Main text: Trips on PuffinRide stop at meeting points along the way, so you can ride the whole way or just part of it. Like Selfoss to Hella in a car that's heading to Vík.
- Headline: Ride all the way, or just part of it
- Description: 100+ meeting points
- Button: Learn more

## Tagged links

Each link tells Google Analytics where a visit came from (once Google
Analytics is live on puffinride.is, PR #223). There is no Meta Pixel (your
choice, 2026-11-22).

| Where | Link |
| ----- | ---- |
| Meta ads (all of them) | Website URL `https://puffinride.is/`, and under "URL parameters": `utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign=launch&utm_content={{ad.name}}` |
| Flyer QR code (already in the PDFs) | `https://puffinride.is/?utm_source=flyer&utm_medium=qr&utm_campaign=launch` |
| Posts on the PuffinRide Facebook Page | `https://puffinride.is/?utm_source=facebook&utm_medium=social&utm_campaign=launch` |
| Posts in Facebook groups | `https://puffinride.is/?utm_source=facebook_groups&utm_medium=social&utm_campaign=launch` |
| Instagram bio | `https://puffinride.is/?utm_source=instagram&utm_medium=social&utm_campaign=bio` |
| Messenger and other chats | `https://puffinride.is/?utm_source=messenger&utm_medium=share&utm_campaign=launch` |

`{{site_source_name}}` becomes fb, ig, msg or an (Audience Network), and
`{{ad.name}}` the ad's name in Ads Manager, so name each ad like its picture,
for example `ride-is`.

## Facebook Page and Instagram profile

| Field | Facebook Page | Instagram |
| ----- | ------------- | --------- |
| Name | PuffinRide | PuffinRide |
| Username | @puffinride | puffinride (or puffinride.is if taken) |
| Category | Transportation service, Website | Business, Transportation service |
| Picture | `design/puffinride/puffinride-gmail-profile-1024.png` | same |
| Cover | `social/puffinride-facebook-cover-1640x624.png` | none |
| Website | `https://puffinride.is/?utm_source=facebook&utm_medium=social&utm_campaign=page` | `https://puffinride.is/?utm_source=instagram&utm_medium=social&utm_campaign=bio` |
| Email | `admin@puffinride.is` | `admin@puffinride.is` |
| Button | Sign up, to the website | none |

Facebook bio (97 of 101 characters):

> Samferða um Ísland. Finndu far eða bjóddu far. Shared rides across Iceland: find or offer a ride.

Instagram bio (139 of 150 characters):

> Samferða um Ísland · Shared rides across Iceland
> Finndu far eða bjóddu far · Find or offer a ride
> Yfir 100 mótsstaðir · 100+ meeting points

### Make them yourself (about 15 minutes)

Facebook asks for a video selfie when a new browser creates a Page, so do this
in the browser you normally use for Facebook, on the laptop (the pictures are in
`Pictures\PuffinRide`).

1. If Facebook shows "Confirm your identity", finish it first (the Facebook app
   on your phone works too).
2. Go to **Pages** and check there is no half-made PuffinRide Page. If there is,
   open it instead of making a second one.
3. **Create a Page**: name PuffinRide, category Transport service, paste the
   Facebook bio above, Create Page.
4. Add the profile picture (`puffinride-profile-picture.png`) and the cover
   (`puffinride-facebook-cover.png`). Skip "invite friends" for now.
5. **Edit Page details** (or Settings > Page setup): website (the tagged link in
   the table), email `admin@puffinride.is`, username `puffinride`. Then
   **Add button**: Sign up, to Website, with the same link.
6. **Instagram**: in the Page's settings, open **Linked accounts** > Instagram >
   Connect, and choose to create a new account (or sign up in the Instagram app
   with `admin@puffinride.is` first). Username `puffinride`, professional
   account, type Business, category Transport service, the same profile
   picture, the Instagram bio above and the Instagram link from the table.
7. Later, for ads: the business portfolio and ad account in the next section.

## Run it in Meta Ads Manager

1. **Set up once.** At business.facebook.com, signed in as `admin@puffinride.is`,
   create a business portfolio "PuffinRide". Make or add the PuffinRide
   Facebook Page: profile picture `design/puffinride/puffinride-gmail-profile-1024.png`,
   cover `social/puffinride-facebook-cover-1640x624.png`, website
   puffinride.is. Connect the Instagram account under Settings > Instagram
   accounts. Create an ad account in **ISK** with time zone **Reykjavík** (it
   can't be changed later) and add a card for Meta's billing.
2. **Campaign.** Ads Manager > Create > objective **Traffic**. Special ad
   categories: none. Name it "Launch".
3. **Ad sets: one per language.** "IS": Iceland, people living there, 18+,
   Languages: Icelandic. "EN": Iceland, 18+, Languages: English (All).
   Conversion location: Website. Performance goal: **link clicks** (landing
   page views need a Meta Pixel, which we don't have). Placements: Advantage+
   (automatic). Budget: about 1,000 kr a day per ad set for the first week.
4. **Ads: one per idea**, three in each ad set (ride, drive, part), named
   `ride-is`, `drive-is`, `part-is` (and `-en`). In each ad: single image,
   upload the feed picture, then under "Customize by placement" give Stories
   and Reels the story picture and the right column, search and Marketplace
   the square one. Paste the main text, headline and description above,
   button Learn more (drive: Sign up). Website URL `https://puffinride.is/`
   and the URL parameters from "Tagged links".
5. **Publish.** Meta reviews ads, usually within a day. If it asks who
   benefits from and who pays for the ads, enter PuffinRide and your name.
6. **After 3 to 4 days**, compare the cost per link click of each ad, pause
   the weakest, and move its budget to the best. Google Analytics shows the
   visits per ad by `utm_content` once it is live.

## Posts for your own Page and groups

Pair a post with the feed picture of the same idea. The Page needs the cover
picture and the app icon (`design/puffinride/puffinride-gmail-profile-1024.png` in project files)
as its profile picture.

### Launch post, both languages in one post

> PuffinRide er opið öllum! Nýr vefur fyrir samferðir um Ísland: bílstjórar
> bjóða lausu sætin í bílnum og farþegar bóka sæti alla leið eða bara hluta
> hennar. Ferðir stoppa á yfir 100 mótsstöðum um allt land. Prófaðu og
> segðu okkur hvað þér finnst: puffinride.is
>
> PuffinRide is open to everyone! A new site for shared rides across Iceland:
> drivers offer the empty seats in their car, and passengers book a seat for
> the whole trip or just part of it. Trips stop at 100+ meeting points around
> Iceland. Try it and tell us what you think: puffinride.is

### Short message to send to friends in Messenger

> Ég fann PuffinRide, samferðir um Ísland. Kannski er einhver að keyra sömu
> leið og þú: puffinride.is
>
> Found PuffinRide, shared rides across Iceland. Someone may be driving your
> way: puffinride.is

When the link is shared, Facebook and Messenger show the PuffinRide picture
and title from PR #223.

## Printing the flyer

- Ask the printer for: **A5 (148 × 210 mm), printed on both sides (4/4),
  3 mm bleed**, and send `puffinride-flyer-a5-print-cmyk.pdf`. The pages are
  154 × 216 mm with the cut line (TrimBox) set at A5.
- Everything is vector drawings and embedded fonts, so it prints sharp at
  300 dpi or more. Words and QR codes stay at least 5 mm inside the cut.
- Paper: 170 g silk or matt takes a pen and feels sturdy on a noticeboard.
- The QR codes are 35 mm (front) and 30 mm (back) and were checked to scan
  from the 300 dpi print file. Scan one from the printer's proof before the
  full run.
- Lupine purple and glacier blue print a little duller in CMYK than on
  screen; that is normal.
- At home: print `puffinride-flyer-a4-two-per-page-home.pdf` double-sided,
  "flip on short edge", at "actual size" (not "fit to page"), then cut down
  the dashed line.

Places that fit: noticeboards in Bónus, Krónan and Nettó, swimming pools,
libraries, schools and universities (FSu, MA, VMA, HÍ, HR, Háskólinn á
Akureyri), and the N1, Olís and Orkan stations that are meeting points. Ask
before putting one up.

## Change the texts and rebuild

Texts are in `src/texts.py` (ads) and `src/flyer.py` (flyer); drawings in
`src/parts.py`, `src/puffins.py` and `src/icons.py`. The car is
`src/car-beetle.svg`, a copy of the site's car
(`puffinride-look/car/puffin-beetle-draft.svg`): copy it again when that one
changes. With Python 3 (packages
`segno` and `pikepdf`), Node.js with Playwright, and Ghostscript:

```sh
sh src/build_all.sh python3 /tmp/puffinride-build ./
```
