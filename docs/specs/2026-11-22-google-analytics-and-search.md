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
bottom of every screen, above the menu bar on phones:

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
   page title sent is the same pattern (R23.3).
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

| Page | Address |
| ---- | ------- |
| Find, the front page | `/` |
| Meeting points | `/meeting-points` |
| A meeting point | `/meeting-points/<id>`, each active one |
| A place and its nearest points | `/places/<id>`, each place |
| Terms, rules and privacy | `/legal`, `/legal/terms`, `/legal/community-rules`, `/legal/privacy` |
| Cookies | `/cookies` |

Every other address of the web app answers with `X-Robots-Tag: noindex,
nofollow`: trip pages (R4.6, as now), search results and All rides (they
show drivers' first names), people, sign-in and everything behind it. The
console and the API already do or are not pages.

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
   language: the page language, Find's title and description, the
   canonical address and the alternates, so a crawler that does not run the
   app still reads them.
3. **Link previews** are the same for every address: the PuffinRide picture
   (1200 × 630, the puffin pin on green), the name and Find's description in
   the requested language. A trip's link shows no name or photo (R23.7).

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

## 4. Rules

| ID | Rule |
| -- | ---- |
| R23.1 | Nothing from Google loads and nothing is counted on a browser before its visitor accepts. |
| R23.2 | Declining is as easy as accepting: the same size, the same place, one press. |
| R23.3 | Google Analytics receives each screen's pattern only: never an ID, a query, a name, a phone number or an email; no user ID; no advertising features. |
| R23.4 | Turning analytics off stops it at once and removes Google's cookies from the browser. |
| R23.5 | A choice is kept in the browser for 12 months, then asked again. |
| R23.6 | Only production's pages of 3.4 may be indexed; every other address of the web app answers with noindex. |
| R23.7 | Link previews show no person's name or photo. |

## 5. Screens

1. The bar (3.1): on phones a card across the bottom above the menu bar;
   from 900 wide, a card at the bottom right, in the page's width. Tokens of
   the [visual design system](2026-11-13-visual-design-system.md); both
   buttons in the secondary style.
2. The Cookies page (3.2), in the narrow column, as Settings' pages.
3. A row **Cookies** on Terms, rules and privacy (`/legal`).
4. The share picture (3.6), made from the logo's drawing.

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
  `https://*.analytics.google.com` and `https://*.googletagmanager.com`.
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

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `consent.title` | Cookies | Vafrakökur |
| `consent.text` | May we count your visit with Google Analytics? It uses cookies and tells Google which pages you open, never your name. | Megum við telja heimsókn þína með Google Analytics? Það notar vafrakökur og segir Google hvaða síður þú opnar, aldrei nafnið þitt. |
| `consent.accept` | Accept | Samþykkja |
| `consent.decline` | Decline | Hafna |
| `consent.more` | Read more | Nánar |
| `cookies.title` | Cookies | Vafrakökur |
| `cookies.needed` | The website keeps on your device what it needs to work, such as your sign-in, your language and your last searches. That needs no consent and is not sent to anyone else. | Vefurinn geymir í tækinu þínu það sem hann þarf til að virka, svo sem innskráninguna, tungumálið og síðustu leitir þínar. Til þess þarf ekki samþykki og það er ekki sent öðrum. |
| `cookies.analytics` | Count my visits with Google Analytics | Telja heimsóknir mínar með Google Analytics |
| `cookies.analyticsHelp` | Google Analytics sets cookies that last 13 months and tells Google, in the United States, which pages you open, your browser and roughly where you are. We see only totals. You can turn it off at any time. | Google Analytics setur vafrakökur sem gilda í 13 mánuði og segir Google, í Bandaríkjunum, hvaða síður þú opnar, hvaða vafra þú notar og nokkurn veginn hvar þú ert. Við sjáum aðeins samtölur. Þú getur slökkt á því hvenær sem er. |
| `cookies.none` | No visits are counted here, and no cookies are used for analytics. | Hér eru engar heimsóknir taldar og engar vafrakökur notaðar fyrir vefmælingar. |
| `seo.title` | {page} · PuffinRide | {page} · PuffinRide |
| `seo.findTitle` | PuffinRide · Share rides across Iceland | PuffinRide · Samferða um Ísland |
| `seo.findDescription` | Find a ride, or offer the empty seats in your car, between towns in Iceland, and share the cost of the trip. | Finndu far, eða bjóddu laus sæti í bílnum þínum, milli bæja á Íslandi og deildu kostnaðinum við ferðina. |
| `seo.meetingPointsDescription` | The meeting points where PuffinRide drivers and passengers meet, all around Iceland, on the map and by region. | Mótsstaðirnir þar sem bílstjórar og farþegar PuffinRide hittast, um allt Ísland, á korti og eftir landshlutum. |
| `seo.meetingPointDescription` | {name}: a PuffinRide meeting point, where drivers and passengers meet for shared rides. | {name}: mótsstaður PuffinRide, þar sem bílstjórar og farþegar hittast til að verða samferða. |
| `seo.placeTitle` | {place}: nearest meeting points | {place}: næstu mótsstaðir |
| `seo.placeDescription` | The PuffinRide meeting points nearest to {place}, for finding or offering a shared ride. | Næstu mótsstaðir PuffinRide við {place}, til að finna far eða bjóða far. |
| `seo.legalDescription` | PuffinRide's Terms of Service, Community Rules and Privacy Policy. | Notendaskilmálar, samfélagsreglur og persónuverndarstefna PuffinRide. |
| `seo.cookiesDescription` | What the PuffinRide website keeps on your device, and your choice about Google Analytics. | Hvað vefur PuffinRide geymir í tækinu þínu, og val þitt um Google Analytics. |

`seo.placeDescription` in Icelandic puts the place after "við", which takes
the accusative; most place names read well there, but a native speaker
should check (for example "við Selfoss").

## 9. Testing

- **Domain and app units:** a screen's pattern from its route; the stored
  choice and when it is due again; the referrer kept only from another site.
- **API:** robots.txt and the sitemap per environment; the noindex header
  on every address outside 3.4, and on everything off production; the
  filled page per language; the policy with and without the ID; the config.
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

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Google Analytics, or cookieless analytics in the EEA with no banner? | Google Analytics, with the question about cookies (Martin, 2026-11-22, on a decision card; not chosen: a cookieless EEA service such as Plausible, which would count every visit with no banner) |
| 2 | Where? | The website only; the phone apps are not in the stores yet (my call) |
| 3 | What does Google get? | Page views by screen pattern, no IDs or queries, advertising features off, 14 months (R23.3; my call) |
| 4 | How is consent asked? | A bar that does not block, Accept and Decline alike, kept 12 months (R23.2, R23.5; my call) |
| 5 | What may Google index? | A short list of public pages; everything else noindex (R23.6; my call) |
| 6 | Find lists drivers' first names. Index it? | Yes, with the ride list kept out of snippets (recommended; or keep Find out of Google, which loses the main page) |
| 7 | Two languages: how? | `?lang=is` and `?lang=en` addresses with alternates (recommended; or one address, which Google sees in English) |
| 8 | Is Privacy Policy version 3 material? | No: announced without blocking, as nobody has to accept anything new (recommended; or material, and everyone accepts again) |
| 9 | Staging and other copies? | Noindex on every answer, crawling allowed so Google sees it (R23.6; my call) |
| 10 | How is Search Console verified? | A domain property, by a TXT record at ISNIC (my call) |
