# Spec 23: Google Analytics with consent, and finding PuffinRide on Google

**Owner:** Martin · **Date:** 2026-11-22 · **Status:** Proposed (Martin
asked for both on 2026-11-22 and chose Google Analytics with a consent
banner on a decision card; decisions 6 to 8 are recommendations)

Features: J3 Usage analytics with consent, and the public website
([features](../product/features.md)). Changes
[spec 12, 3.4](2026-11-13-beta-access-and-feedback.md#34-usage-analytics-j3)
(no analytics in the beta) through
[ADR 0045](../decisions/0045-google-analytics-on-the-website-after-consent.md).
Keeps [spec 4, R4.6](2026-11-13-search-and-trip-details.md#4-rules) (trip
pages never indexed). Related: [privacy and GDPR](../compliance/privacy-gdpr.md),
[ADR 0007](../decisions/0007-eea-hosting-and-data-residency.md),
[ADR 0043](../decisions/0043-legal-documents-published-from-the-repository.md),
[production runbook](../operations/production.md).

## 1. Problem and goal

Martin, 2026-11-22: "Can we add google analytics and make it googalbe".

PuffinRide is live at `puffinride.is` as an open beta. We cannot see how many
people visit the website or which screens they use, and Google knows little
about the site: every address answers with the same page called
"PuffinRide", there is no sitemap, and a shared link shows no preview.
Staging answers on its own address and could end up in Google too.

**Goals:**

1. Google Analytics counts visits to the website from people who say yes,
   and nothing from Google loads before they do.
2. Google finds the public pages (Find, the meeting points, the places, the
   legal texts) in Icelandic and in English, with a good title and
   description each, and a shared link shows a preview.
3. Staging and every other copy never show in Google, and nor do trip pages,
   search results or anything behind sign-in.

## 2. User stories

- As a visitor, I see a short question at the bottom of the page the first
  time, press Accept or Decline, and the question goes away.
- As a visitor who declined, nothing about my visit goes to Google.
- As a visitor who accepted, I can change my mind on the Cookies page, and
  Google's cookies are removed from my browser.
- As Martin, I see in Google Analytics how many people visit, from where
  they came and which screens they open.
- As someone searching Google for "samferða Selfoss" or "rideshare Iceland",
  I find PuffinRide's Find page or a meeting point page in my language.
- As someone sharing a ride on Facebook or Messenger, the link shows the
  PuffinRide picture and name, never the driver's name.

## 3. Behaviour

### 3.1 The question about cookies

On the website, when the site has Google Analytics turned on (production
with its measurement ID set, section 6), the first visit shows a bar at the
bottom of every screen, above the menu bar on phones, except the Cookies
page, which asks with its switch:

> **Cookies**
> May we count your visit with Google Analytics? It uses cookies and tells
> Google which pages you open, never your name.
> [Accept] [Decline] · Read more

1. **Accept** and **Decline** are the same size and look, side by side
   (R23.2). Neither is preselected.
2. The bar does not block the page: people can use the site without
   answering. Until they answer, nothing from Google loads and nothing is
   counted (R23.1).
3. **Accept** loads Google Analytics and counts the screen open now. The bar
   goes.
4. **Decline** loads nothing. The bar goes.
5. **Read more** opens the Cookies page (3.2).
6. The choice is kept in this browser with its date, not on the server and
   not with the account, so it works signed out too. After 12 months the
   bar asks again (R23.5).
7. The phone apps show no bar: they have no analytics (decision 2).
8. Screen readers find the bar as a region named "Cookies"; it does not take
   the focus or trap it.

### 3.2 The Cookies page

`/cookies`, open to everyone, linked from Terms, rules and privacy
(`/legal`) and from the bar's Read more.

1. Says what the site keeps on the device to work (signing in, the
   language, the last searches and the like): needed, so no choice.
2. On the website with analytics on: a switch **Count my visits with Google
   Analytics**, with what it sets and sends, and that we see only totals.
   On means accepted, as with Accept; off means declined.
3. Turning it off stops counting at once, removes Google's cookies (`_ga`
   and `_ga_<ID>`) from the browser and keeps Decline (R23.4).
4. In the phone apps, and on a site without analytics, it says that no
   visits are counted and shows no switch.
5. A link to the Privacy Policy.

### 3.3 What Google Analytics receives

1. **Page views only**, one for each screen opened, named by the screen's
   pattern, such as `/trips/[id]` or `/meeting-points/[id]`, never its
   address: no IDs, no query (places and dates searched), no anchor. The
   page title sent is the same pattern (R23.3). The one exception is the
   campaign tags of our own ads' and flyers' links (`utm_source`,
   `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, with plain
   values of letters, digits, dots, dashes and underscores), kept on the
   first screen of a visit, so Google Analytics can say which ad or flyer
   brought it.
2. The referring site, only when it is another site, as its origin.
3. What Google Analytics collects itself: browser, system, screen size,
   language and an approximate location from the network address, which
   Google says it does not store (**verify**).
4. **Not sent:** the user ID, the account, names, phone numbers, emails,
   what is typed, or events from forms. Advertising features are off:
   Google signals, ad personalisation and sharing with other Google
   products. Enhanced measurement is off, so Google records no page change
   by itself (it would send the real address).
5. Google keeps the data **14 months** (the property's retention setting).
   Its cookies last **13 months** and a visit does not extend them.

### 3.4 What Google may index

Only production's public pages that hold no person's data (R23.6):

| Page                           | Address                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| Find, the front page           | `/`                                                                  |
| Carpool in Iceland (3.9)       | `/carpool-iceland`                                                   |
| Meeting points                 | `/meeting-points`                                                    |
| A meeting point                | `/meeting-points/<id>`, each active one                              |
| A place and its nearest points | `/places/<id>`, each place                                           |
| Terms, rules and privacy       | `/legal`, `/legal/terms`, `/legal/community-rules`, `/legal/privacy` |
| Cookies                        | `/cookies`                                                           |

Every other address of the web app answers with `X-Robots-Tag: noindex,
nofollow`: trip pages (R4.6, as now), search results and All rides (they
show drivers' first names), people, sign-in and everything behind it. The
console and the API already do or are not pages. The site's icons and the
link preview picture (`/favicon.ico`, `/icon-192.png`,
`/apple-touch-icon.png`, `/share.png`) carry no noindex on production
either (added 2026-11-23): Google shows a site's icon in its results only
when it may read the icon file (3.6, item 5).

Find lists the rides leaving soon with drivers' first names. Its list is
marked `data-nosnippet`, so Google does not quote it in results
(decision 6).

### 3.5 Two languages

Each indexable page has an Icelandic address with `?lang=is` and an English
one with `?lang=en`. Opening such an address shows the site in that
language for the visit, before the saved choice and the device's (a choice
the person makes still wins and is saved, as now). The plain address keeps
following the saved choice or the device.

Each page names both as alternates (`hreflang="is"`, `hreflang="en"`, and the
plain address as `x-default`), with itself as canonical, and the sitemap
lists both (decision 7).

### 3.6 Titles, descriptions and link previews

1. Each indexable screen sets its title, `<page> · PuffinRide`, and a
   description, in the language shown (section 8).
2. The first answer from the server already carries, for the requested
   language: the page language, the page's own title and description, the
   canonical address and the alternates, so a crawler that does not run the
   app still reads them. Changed 2026-11-25 (3.9): before, every address
   carried Find's title, and Google showed a meeting point under Find's
   title. The server now takes a meeting point's and a place's name from the
   database, and the titles from the same function the app's screens use
   (`pageText` in the i18n package); other pages keep Find's. A meeting
   point's title calls it a carpool meeting point ("Hlemmur: carpool meeting
   point · PuffinRide"). A meeting point or place address that the sitemap
   does not list (unknown, not active, or a sample) answers with
   `X-Robots-Tag: noindex, nofollow`.
3. The words people search for a shared ride with (added 2026-11-23, on
   Martin's word): carpool, ride share and lift in English; samferða, far,
   samakstur and deila bíl in Icelandic. They are in Find's title and
   description, in the meeting point and place pages' texts, on Find's
   page itself (its title and the line under it, spec 16, 3.2) and in a
   `keywords` tag on every page, in the language shown. Google does not
   read the `keywords` tag; the words that count are the ones in the
   title, the description and on the page. The visible texts say
   "carpool", not "rideshare", which reads as a taxi app.
4. **Link previews** are the same for every address: the PuffinRide picture
   (1200 × 630: the two puffins in their car over the logo and the name, in the middle so a square crop keeps them), the name and Find's description in
   the requested language. Facebook and Messenger ask for the preview in
   the reader's language (`X-Facebook-Locale` or `fb_locale`), so an
   Icelandic reader sees it in Icelandic. A trip's link shows no name or
   photo (R23.7). Changed 2026-11-25: a ride's link has a preview of its
   own, with its route, day and time (3.10).
5. **Icons** (added 2026-11-23): besides Expo's `/favicon.ico` (16, 32 and
   48 pixels), every page links `/icon-192.png`, 192 pixels, a multiple of
   48 as Google asks for to show the icon beside a result, and
   `/apple-touch-icon.png` for a phone's home screen. The server writes
   these links into the page without the app's head mark, so the app keeps
   them. `node scripts/export-icons.ts` makes both from the logo drawings.
   Changed 2026-11-25, on Martin's word: Google shows a site's icon in a
   round frame, and our rounded square left its corners empty. The tab
   icon, `/favicon.ico` and `/icon-192.png` are now a disc, the moss square
   cut to a circle, so the frame shows a full circle. The home screen icon
   stays a full square, as phones cut it to shape themselves.

6. **Links search engines follow** (added 2026-11-25, 3.9): every way
   from one public page to another is a real link, an `<a href>` on the
   web: Find's "See the meeting points", the meeting points in the list and
   on the map's list, and a place's nearest meeting points. A plain click
   opens the screen within the app as before; a click with a modifier key
   or the middle button is the browser's (a new tab). Search engines find
   pages through links; until now they had only the sitemap.
7. **The site's name** (added 2026-11-25, on Martin's word): Google showed
   "puffinride.is" above our results. The front page's first answer now
   carries WebSite structured data, `{"@type": "WebSite", "name":
   "PuffinRide", "url": "https://puffinride.is/"}`, which Google reads from
   a site's home page to name it, beside the title and `og:site_name` that
   already say PuffinRide. It is not marked for the app's head, so the app
   keeps it. Google changes the name and the icon at its next crawl of the
   front page, which can take days to weeks.

### 3.7 robots.txt and the sitemap

- `/robots.txt` on production allows everything except `/admin` and names
  the sitemap. Anywhere else it allows crawling, and every answer carries
  `X-Robots-Tag: noindex, nofollow`, so a copy Google finds is dropped
  rather than listed without its content.
- `/sitemap.xml` on production lists each page of 3.4 in both languages,
  with its alternates. Elsewhere it is not found.

### 3.8 Google Search Console

Martin adds `puffinride.is` as a **domain property** in Search Console as
`admin@puffinride.is`, verified with the TXT record Google gives, added at
ISNIC DNS Hosting, then submits `https://puffinride.is/sitemap.xml`. No code;
the steps are in the [production runbook](../operations/production.md).

### 3.9 Found when people search for carpooling in Iceland

Added 2026-11-25. Martin: "still cant find our web on google when i type
carpool iceland".

What we found on 2026-11-25, three days after the launch: Google has the
site (Search Console: the front page crawled that night, 8 showings in
results, no problem reported), but for "carpool iceland" PuffinRide is on
page 3, behind sites that have been there for years, two with the words in
their address. On our side: every page told Google Find's title (3.6, item
2); our pages had almost no links Google could follow, so the 560 meeting
point and place pages were reachable only through the sitemap (3.6, item
6); and no page was about carpooling in Iceland: Find has one line of it.

**The Carpool in Iceland page.** A public page at `/carpool-iceland`, in
both languages like the others (3.5), which says in words what PuffinRide
is and how carpooling with it works, for people who search for it:

1. Its title and description name what people search for: "Carpool in
   Iceland: find or offer a ride · PuffinRide", "Samferða um Ísland: finndu
   far eða bjóddu far · PuffinRide".
2. The page: the title "Carpool in Iceland" / "Samferða um Ísland", a line
   that says what PuffinRide is, then "Find a ride" (to Find) and "Offer a
   ride" (Offer), then short sections: how it works (find, book, meet,
   offer), meeting points (with a link to them), well-travelled roads in
   words (Reykjavík to Akureyri, Selfoss, Borgarnes, Vík, Egilsstaðir, and
   from Keflavík Airport), trust (a checked phone number, drivers' photos,
   reviews after each trip, a link to the community rules) and a few
   questions: is it a taxi (no: drivers share a trip they are making
   anyway), what samferða means, and is it in English.
3. Nothing about money: no prices, payments or fees (Martin's rule for
   marketing texts).
4. Find links to it ("How carpooling works") beside "See the meeting
   points", so Google finds it from the front page.
5. Search engines that do not run the app read its text too: the server
   writes the page's sections into the first answer's `<noscript>`, from
   the same texts the screen shows.
6. It is in the sitemap and in the list of 3.4.

**Outside the code** (Martin): links from other sites are what lift a
young site for a phrase others have held for years: a post in the Facebook
carpool groups, Reddit's Iceland travel groups when someone asks, a line in
Hitchwiki's Iceland page and travel guides' "getting around" pages, the
Icelandic listings (Já.is). Search Console: ask Google to index the new
page once it is live. Expect weeks, not days.

**Samferða** (added 2026-11-26, Martin: searches for "samferða",
"samferda" and "samferda iceland" should lead to us too). Samferða is an
everyday Icelandic word, "travelling together", and the Icelandic titles
already use it (Find: "Samferða um Ísland: far og samakstur"; this page:
"Samferða um Ísland"). It is also the name of a carpool site that has
been around for years, and its name stays theirs: we use the word as the
language does, never as if we were that site, and do not name it. The
page's questions now say what samferða means, with its spelling without
ð (samferda) in English for visitors who type it without Icelandic
letters, so an English reader searching for the word finds a page that
explains it.

### 3.10 A shared ride's link preview

Added 2026-11-25. Martin: "how does it look like on Facebook if you share
your ride (it should look pretty and branded)". Until now a ride's link
showed the same card as every other address (3.6, item 4): the puffins,
the name and Find's description, with nothing to say which ride it was. Martin
chose "Own picture for each ride" on a decision card, over the ride in the
title only (the same picture) and no change.

1. **Which links.** A trip page's address, `/trips/<id>` with the part's
   `from` and `to` as the app's Share button gives it (spec 4, 3.7), whose
   part has not left and is not cancelled (state open, full or closed).
   Any other trip address (unknown, a draft, cancelled, left, a week past
   its last stop) keeps the general preview.
2. **What it shows**, in the language asked for (3.6, item 4):
   - title: the part's route and when it leaves, "Reykjavík → Akureyri ·
     fös. 28. nóv. kl. 09:00" / "Reykjavík → Akureyri · Fri 28 Nov at
     09:00";
   - description: "Far á PuffinRide, samferða um Ísland. Sjáðu ferðina og
     bókaðu sæti." / "A shared ride on PuffinRide, carpooling across
     Iceland. See the trip and book a seat.";
   - a picture of its own, 1200 × 630: the PuffinRide name at the top, the
     route in large letters, the day and time ("Föstudagur 28. nóvember kl.
     09:00"), the meeting points on the way (as many as fit, then "and 2
     more"), and the front page's Iceland scene below: a pin at each end and
     the puffin driver in the yellow car, its back seat free, with a "Free
     seats" tag while the part can be booked (state open). A long route
     shrinks to fit, then breaks before the arrow.
3. **Nothing else.** It shows only what the trip page shows anyone with the
   link (R4.6): the route, its meeting points, the day and the time. Never
   a name, a photo, the car or its number plate, a price, or how many seats
   are free, which would also go stale in Facebook's copy (R23.7, R23.8).
4. **The picture's address:** `/v1/trips/<id>/preview.png?fromStop=…&toStop=…&lang=is`,
   with `v=` from what it shows and the drawing's own version, so a trip
   whose time changed, or a new look, gets a new address the next time a
   site reads the link. The address always draws the trip as it is now;
   `v` only makes it new. It is a file, not in the OpenAPI document. It
   answers 404 where item 1 gives the general preview, and may be kept an
   hour (`Cache-Control: public, max-age=3600`). The API keeps the last
   100 pictures it drew, draws at most two at once (503 `busy` beyond
   that, with `Retry-After`), and counts picture requests per address on
   their own: 120 a minute, 2,000 an hour. When the trip cannot be read,
   the page keeps the general card and the app still loads.
5. **How it is drawn:** on the server, as an SVG turned into a PNG with
   resvg ([ADR 0049](../decisions/0049-draw-link-preview-pictures-with-resvg.md)),
   with the app's fonts (Fredoka and Nunito, SIL Open Font License) and a
   copy of the front page's car, kept in `apps/api/assets/trip-preview/`
   because the API's image holds no `apps/mobile`. `node
   scripts/export-icons.ts` in `apps/mobile` copies the car again after it
   changes. Letters are never joined: resvg cannot turn ligatures off and
   draws Fredoka's "fl" like "ƀ", so a zero-width non-joiner follows each
   "f" before a letter (Keflavík, Hafnarfjörður).
6. **Facebook keeps what it read.** A card already posted keeps the old
   time if the driver moves it; the trip page shows the change. Facebook's
   Sharing Debugger reads a link again on request.

## 4. Rules

| ID    | Rule                                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R23.1 | Nothing from Google loads and nothing is counted on a browser before its visitor accepts.                                                                                                |
| R23.2 | Declining is as easy as accepting: the same size, the same place, one press.                                                                                                             |
| R23.3 | Google Analytics receives each screen's pattern only: never an ID, a query (except our own campaign tags, 3.3), a name, a phone number or an email; no user ID; no advertising features. |
| R23.4 | Turning analytics off stops it at once and removes Google's cookies from the browser.                                                                                                    |
| R23.5 | A choice is kept in the browser for 12 months, then asked again.                                                                                                                         |
| R23.6 | Only production's pages of 3.4 may be indexed; every other address of the web app answers with noindex.                                                                                  |
| R23.7 | Link previews show no person's name or photo.                                                                                                                                            |
| R23.8 | A ride's link preview shows its route, meeting points, day and time only: no name, photo, car, number plate, price or seat count.                                                         |

## 5. Screens

1. The bar (3.1): on phones a card across the bottom above the menu bar;
   from 900 wide, a card at the bottom right, in the page's width. Tokens of
   the [visual design system](2026-11-13-visual-design-system.md); both
   buttons in the secondary style.
2. The Cookies page (3.2), in the narrow column, as Settings' pages.
3. A row **Cookies** on Terms, rules and privacy (`/legal`).
4. The share picture (3.6), made from the front page's puffins in their car and the logo.

## 6. Data and API

- **API settings:** `GOOGLE_ANALYTICS_ID` (a measurement ID, `G-` and
  letters and digits; not a secret). Unset, the site has no analytics.
  Indexing is on only where `APP_ENV` is production and `WEB_APP_URL` is
  set; that address is the canonical origin.
- **`GET /v1/config`** gains `analytics`: `{ "googleMeasurementId":
"G-…" }` or `null`.
- **The web app's Content Security Policy** allows Google's addresses only
  when the ID is set: scripts from `https://*.googletagmanager.com`; images
  and connections to `https://*.google-analytics.com`,
  `https://*.analytics.google.com` and `https://*.googletagmanager.com`,
  and connections to `https://*.google.com` too, as Google's current list
  has it.
- **The page:** the server fills the exported `index.html` per request
  (3.6, item 2) and adds the noindex header (3.4).
- **`GET /robots.txt`** and **`GET /sitemap.xml`** (3.7), from the active
  meeting points and the places.
- **In the browser:** the choice and its date under the key
  `analytics-consent`. No table, no migration.

## 7. Privacy and safety

- Google Analytics is a new processor that keeps data in the United States,
  under the EU-US Data Privacy Framework (ADR 0045). The register gets an
  Analytics row and a provider row; the consent choice gets its row.
- Consent is the legal basis, both for the cookies (the ePrivacy rules in
  the Electronic Communications Act, **verify**) and for the processing.
  It is asked before anything loads, as easy to refuse as to give, and as
  easy to withdraw (R23.1, R23.2, R23.4).
- No personal data goes in the events (R23.3): screens by pattern, so a
  trip's, booking's or person's ID never reaches Google.
- The Privacy Policy becomes version 3 in both languages: the summary, the
  providers, data outside the EEA and storage on the device. It is a minor
  change, announced without blocking (decision 8), as nothing changes for
  someone who does not accept.
- Indexing: trip pages, results and people stay out (R4.6, R23.6); Find's
  ride list is kept out of snippets; previews never name anyone (R23.7).
- A ride's preview (3.10) carries what its trip page already shows anyone
  with the link, and nothing about a person (R23.8). Facebook and other
  sites keep a copy of the card; that is why it leaves out the seat count
  and why nobody is named.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key                            | English                                                                                                                                                                                                      | Icelandic (draft)                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consent.title`                | Cookies                                                                                                                                                                                                      | Vafrakökur                                                                                                                                                                                                                          |
| `consent.text`                 | May we count your visit with Google Analytics? It uses cookies and tells Google which pages you open, never your name.                                                                                       | Megum við telja heimsókn þína með Google Analytics? Það notar vafrakökur og segir Google hvaða síður þú opnar, aldrei nafnið þitt.                                                                                                  |
| `consent.accept`               | Accept                                                                                                                                                                                                       | Samþykkja                                                                                                                                                                                                                           |
| `consent.decline`              | Decline                                                                                                                                                                                                      | Hafna                                                                                                                                                                                                                               |
| `consent.more`                 | Read more                                                                                                                                                                                                    | Nánar                                                                                                                                                                                                                               |
| `cookies.title`                | Cookies                                                                                                                                                                                                      | Vafrakökur                                                                                                                                                                                                                          |
| `cookies.needed`               | The website keeps on your device what it needs to work, such as your sign-in, your language and your last searches. That needs no consent and is not sent to anyone else.                                    | Vefurinn geymir í tækinu þínu það sem hann þarf til að virka, svo sem innskráninguna, tungumálið og síðustu leitir þínar. Til þess þarf ekki samþykki og það er ekki sent öðrum.                                                    |
| `cookies.analytics`            | Count my visits with Google Analytics                                                                                                                                                                        | Telja heimsóknir mínar með Google Analytics                                                                                                                                                                                         |
| `cookies.analyticsHelp`        | Google Analytics sets cookies that last 13 months and tells Google, in the United States, which pages you open, your browser and roughly where you are. We see only totals. You can turn it off at any time. | Google Analytics setur vafrakökur sem gilda í 13 mánuði og segir Google, í Bandaríkjunum, hvaða síður þú opnar, hvaða vafra þú notar og nokkurn veginn hvar þú ert. Við sjáum aðeins samtölur. Þú getur slökkt á því hvenær sem er. |
| `cookies.none`                 | No visits are counted here, and no cookies are used for analytics.                                                                                                                                           | Hér eru engar heimsóknir taldar og engar vafrakökur notaðar fyrir vefmælingar.                                                                                                                                                      |
| `seo.title`                    | {page} · PuffinRide                                                                                                                                                                                          | {page} · PuffinRide                                                                                                                                                                                                                 |
| `seo.findTitle`                | PuffinRide · Carpool and shared rides across Iceland                                                                                                                                                         | PuffinRide · Samferða um Ísland: far og samakstur                                                                                                                                                                                   |
| `seo.findDescription`          | Carpool and ride share between towns in Iceland: find a lift, or offer the empty seats in your car, and share the cost of the trip.                                                                          | Verum samferða milli bæja á Íslandi: finndu far eða bjóddu laus sæti í bílnum þínum. Samakstur þar sem við deilum bíl og kostnaðinum við ferðina.                                                                                   |
| `seo.keywords`                 | carpool, carpooling, ride share, rideshare, shared rides, lift, rides in Iceland, share a car, Reykjavík, Akureyri                                                                                           | samferða, far, fá far, bjóða far, samakstur, deila bíl, ferðir milli bæja, Ísland, Reykjavík, Akureyri                                                                                                                              |
| `seo.meetingPointsDescription` | The meeting points where PuffinRide drivers and passengers meet to carpool, all around Iceland, on the map and by region.                                                                                    | Mótsstaðirnir þar sem bílstjórar og farþegar PuffinRide hittast til samaksturs, um allt Ísland, á korti og eftir landshlutum.                                                                                                       |
| `seo.meetingPointDescription`  | {name}: a PuffinRide meeting point, where drivers and passengers meet to carpool.                                                                                                                            | {name}: mótsstaður PuffinRide fyrir samakstur, þar sem bílstjórar og farþegar hittast til að verða samferða.                                                                                                                        |
| `seo.placeTitle`               | {place}: nearest carpool meeting points                                                                                                                                                                      | {place}: næstu mótsstaðir fyrir samakstur                                                                                                                                                                                           |
| `seo.placeDescription`         | The PuffinRide carpool meeting points nearest to {place}, for finding or offering a shared ride.                                                                                                             | Næstu mótsstaðir PuffinRide við {place}, til að finna far eða bjóða far í samakstri.                                                                                                                                                |
| `seo.legalDescription`         | PuffinRide's Terms of Service, Community Rules and Privacy Policy.                                                                                                                                           | Notendaskilmálar, samfélagsreglur og persónuverndarstefna PuffinRide.                                                                                                                                                               |
| `seo.shareImage`               | Two PuffinRide puffins driving in a little car                                                                                                                                                               | Tveir lundar PuffinRide á ferð í litlum bíl                                                                                                                                                                                         |
| `seo.cookiesDescription`       | What the PuffinRide website keeps on your device, and your choice about Google Analytics.                                                                                                                    | Hvað vefur PuffinRide geymir í tækinu þínu, og val þitt um Google Analytics.                                                                                                                                                        |
| `seo.tripTitle`                | {route} · {when}                                                                                                                                                                                             | {route} · {when}                                                                                                                                                                                                                    |
| `seo.tripDescription`          | A shared ride on PuffinRide, carpooling across Iceland. See the trip and book a seat.                                                                                                                       | Far á PuffinRide, samferða um Ísland. Sjáðu ferðina og bókaðu sæti.                                                                                                                                                                 |
| `seo.tripImage`                | {route}, {when}, on PuffinRide                                                                                                                                                                               | {route}, {when}, á PuffinRide                                                                                                                                                                                                       |
| `seo.tripStops`                | Stops on the way: {stops}                                                                                                                                                                                    | Mótsstaðir á leiðinni: {stops}                                                                                                                                                                                                      |
| `seo.tripMoreStops`            | {stops} and {count} more                                                                                                                                                                                     | {stops} og {count} til viðbótar                                                                                                                                                                                                     |
| `seo.tripFreeSeats`            | Free seats                                                                                                                                                                                                   | Laus sæti                                                                                                                                                                                                                           |

`seo.placeDescription` in Icelandic puts the place after "við", which takes
the accusative; most place names read well there, but a native speaker
should check (for example "við Selfoss").

## 9. Testing

- **Domain and app units:** a screen's pattern from its route; the stored
  choice and when it is due again; the referrer kept only from another site.
- **API:** robots.txt and the sitemap per environment; the noindex header
  on every address outside 3.4, and on everything off production; the
  filled page per language; the policy with and without the ID; the config.
- **A ride's preview (3.10):** its texts and picture for a part, in both
  languages; a long route and many stops still fit; nothing about a person
  in the tags or the picture; the general preview for a cancelled, left or
  unknown trip; the picture answers a PNG, and 404 where there is none.
- **Screens:** the bar shows only on the web with analytics on and no
  choice; Accept adds Google's script and a page view by pattern; Decline
  adds nothing; the Cookies switch withdraws and removes the cookies; the
  `lang` address shows that language.
- **Journey (Playwright):** with a test ID, no request to Google before
  Accept; after it, the script is asked for and page views carry patterns
  only; after Decline, none.

## 10. Out of scope

Analytics in the phone apps; product events beyond page views (a search, a
booking, a trip posted), each to be listed when wanted; Google Ads and
remarketing; route pages for search engines, such as "Reykjavík to
Akureyri" (spec 4, later); rendering pages on the server; Google Tag
Manager; Bing's own tools (Bing reads the sitemap from robots.txt).

## Decisions

| #   | Question                                                             | Decision                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Google Analytics, or cookieless analytics in the EEA with no banner? | Google Analytics, with the question about cookies (Martin, 2026-11-22, on a decision card; not chosen: a cookieless EEA service such as Plausible, which would count every visit with no banner) |
| 2   | Where?                                                               | The website only; the phone apps are not in the stores yet (my call)                                                                                                                             |
| 3   | What does Google get?                                                | Page views by screen pattern, no IDs or queries, advertising features off, 14 months (R23.3; my call)                                                                                            |
| 4   | How is consent asked?                                                | A bar that does not block, Accept and Decline alike, kept 12 months (R23.2, R23.5; my call)                                                                                                      |
| 5   | What may Google index?                                               | A short list of public pages; everything else noindex (R23.6; my call)                                                                                                                           |
| 6   | Find lists drivers' first names. Index it?                           | Yes, with the ride list kept out of snippets (recommended; or keep Find out of Google, which loses the main page)                                                                                |
| 7   | Two languages: how?                                                  | `?lang=is` and `?lang=en` addresses with alternates (recommended; or one address, which Google sees in English)                                                                                  |
| 8   | Is Privacy Policy version 3 material?                                | No: announced without blocking, as nobody has to accept anything new (recommended; or material, and everyone accepts again)                                                                      |
| 9   | Staging and other copies?                                            | Noindex on every answer, crawling allowed so Google sees it (R23.6; my call)                                                                                                                     |
| 10  | How is Search Console verified?                                      | A domain property, by a TXT record at ISNIC (my call)                                                                                                                                            |
| 11  | How does a shared ride look on Facebook?                             | Its own card: the route, day, time and stops drawn in our look, no person (3.10; Martin, 2026-11-25, on a decision card; not chosen: the route in the title only, or no change)                   |
