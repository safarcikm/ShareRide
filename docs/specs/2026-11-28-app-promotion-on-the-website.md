# Spec 35: The phone apps, shown on the website

**Owner:** Martin · **Date:** 2026-11-28 · **Status:** Proposed
(2026-11-28): Martin asked for it; the choices in the Decisions section are
working choices he can change

Amends: [spec 30](2026-11-26-about-page-and-footer.md) (3.1, About gets a
section on the app, and 3.3, the footer gets the store badges) and
[spec 32](2026-11-27-phone-apps-in-the-stores.md) (3.5, `/app` is a download
link that stays in the browser). Keeps to [spec 31](2026-11-26-one-ride-one-ticket.md)
(one main button, colour means something) and [spec 18](2026-11-18-laptop-layout.md)
(the laptop layout). [ADR 0055](../decisions/0055-show-the-phone-apps-on-the-website-per-store.md)
adds the two console switches.

## 1. Problem and goal

Martin, 2026-11-28: "Should the web version promote the apps somehow? Like
if you're on a phone it should suggest downloading the app, if on notebook
then have mention it has an app?" Then: "Ok you can also predevelop it now
no?"

The iPhone app is on TestFlight and the Android app is on its way to Google
Play (spec 32). Most people will first meet PuffinRide on the website, from
Google, Facebook or a shared ride. The app gives them what the website
cannot: push notifications, so a driver hears about a booking request at
once and a passenger about a change to their ride. Nothing on the website
says the app exists.

**Goal:** a visitor learns that PuffinRide has an app and gets to it in one
tap or one scan, in the way each kind of device does it best, without the
website getting in their way. Built now, and switched on per store from the
console the day that store's page is public, with no new build or release.

**Non-goals:** opening the app on the same screen from a link (spec 32,
3.5, plan PR 7); store pages and their texts (the store kit, `marketing/stores/`);
telling whether a visitor already has the app.

**Anti-goals:** a full-screen "get the app" page or pop-up over the content
(Google ranks such pages lower on phones, and people dislike them); a banner
inside the phone apps; a badge or banner that leads to a store page that is
not public yet; words about payments or fees, or Google sign-in promised on
the iPhone (Martin's marketing rule, spec 32, 3.3).

## 2. User stories

- As a visitor on an iPhone, I see a small strip at the top of Safari that
  says PuffinRide has an app, with Get or Open, and I can close it.
- As a visitor on an Android phone, I see the same kind of strip, with
  Install, and I can close it; once closed it stays closed.
- As a visitor on a laptop, I see the store badges at the end of every
  public page, and on About I can scan a code with my phone to get the app.
- As a member using the app, I never see any of this.
- As Martin, I turn each store on in the console when its page is public,
  and off again if it is taken down.

## 3. Behaviour

### 3.1 How it is usually done

| Device | Usual way | Here |
| ------ | --------- | ---- |
| iPhone, Safari | Apple's Smart App Banner: one tag in the page's head; Safari draws the strip, shows Get or Open, and remembers when it is closed | Yes (3.3) |
| Android, any browser | Chrome no longer has a banner of its own for apps, so sites draw one | Our own strip (3.4) |
| Laptop | The App Store and Google Play badges in the footer and on an About or download page, often with a QR code | Yes (3.5, 3.6) |
| Any | A full-screen "get the app" page before the content | No (anti-goals) |

### 3.2 Two switches

- The console's Settings get a group **Phone apps** with two switches, both
  off: **App Store page is public** and **Google Play page is public**
  ([ADR 0055](../decisions/0055-show-the-phone-apps-on-the-website-per-store.md)).
- Everything in this spec for a store shows only while its switch is on.
  With both off, the website is as it is today.
- `/v1/config` says which are on, so the website follows a change within
  5 minutes (as every setting there). The server reads them for the
  page's head and for `/app` within 5 seconds.

### 3.3 iPhone: Apple's banner

- With the App Store switch on, every page of the website the server
  writes carries Apple's tag in its head:
  `<meta name="apple-itunes-app" content="app-id=6840158626, app-argument=puffinride://<path>">`.
  Safari on an iPhone then shows its banner at the top: the app's icon,
  name and rating, and **View** (or **Get**) to the App Store page, or
  **Open** when the app is installed. Safari decides when to show it and
  remembers when it is closed; other browsers on the iPhone ignore it.
- `app-argument` is the page's path in the app's own address
  (`puffinride://rides/…`), so **Open** lands on the same screen. Only the
  path: never the address's query or fragment.
- Not on the page Google's or Apple's sign-in comes back to
  (`/sign-in/return`), which is a pop-up.
- Safari reads the tag only when a page first loads, so the server writes
  it; the app cannot add it later.

### 3.4 Android: our own strip

On the website in an Android phone's browser, with the Google Play switch
on, a strip across the top of the window, above everything else, which
pushes the page down rather than covering it:

- PuffinRide's logo, **PuffinRide**, and one line: "Notifications about
  your rides, straight to your phone."
- **Install**, a secondary button (R31.1: not the screen's main button),
  which opens PuffinRide's Google Play page. Android opens it in the Play
  Store app.
- A close button (×) at the end, at least a touch target in size.
- Once **Install** or × is pressed, the strip does not come back in that
  browser. The website keeps only when it was closed, in the browser
  (section 7).
- It waits while the question about cookies is open (spec 23, 3.1), so
  the visitor sees one thing at a time, and while signing in or up (as the
  question about cookies does, spec 29, 3.6).
- It does not show in the phone apps, on an iPhone, on a laptop, or on an
  Android tablet's browser wide enough for the top bar.
- Its words are the page's language. On a screen reader it is a region
  named "The PuffinRide app".

### 3.5 The footer

- With either switch on, the footer (spec 30, 3.3) shows the badge of
  each store whose switch is on, the App Store's first.
- On a laptop, under the logo, the name and the tagline, in the footer's
  first group.
- On a phone's browser, centred above the quiet links.
- Each badge is a link to the store's page, which opens outside the
  website, as the Facebook and Instagram links do.

### 3.6 About: the app

With either switch on, About (spec 30, 3.1) gets a section after its
opening paragraphs, before the documents:

- The heading **The PuffinRide app** and one line: "PuffinRide is also an
  app for your phone. It tells you at once when something happens on your
  rides."
- The badges, as in the footer.
- On a laptop (the width with the top bar), a QR code beside the badges,
  with "Or point your phone's camera at the code." The code is
  `https://puffinride.is/app` (3.7). Not on a phone: the phone is the
  camera.
- Under them, small: the stores' trademark lines, which both stores ask
  for where their badge is used ("App Store is a service mark of Apple
  Inc." and "Google Play and the Google Play logo are trademarks of Google
  LLC."), only for the stores shown.
- Not in the phone apps.

### 3.7 `/app`: one address for every phone

- `https://puffinride.is/app` sends an iPhone to the App Store page and an
  Android phone to the Google Play page, while that store's switch is on;
  anything else, or a store that is off, goes to About. The answer is a
  temporary redirect (302), not kept by caches, and varies with the
  browser.
- It is a download link: it stays in the browser when links open the app
  (spec 32, 3.5), and the sitemap does not list it.
- The QR code holds it, and it can go on flyers and posters later.

### 3.8 The badges

- Each store's official badge, as each store gives it, unchanged: Apple's
  black "Download on the App Store", and Google Play's "Get it on Google
  Play", 40 pixels high (Apple's least on screen) with a quarter of that
  between them (Apple's clear space).
- Google Play's badge is in the page's language ("Sækja frá Google Play"
  in Icelandic). Apple's is in English on both, like the App Store page
  itself (spec 32, 3.9).
- Light and dark look alike: both are black with a grey edge, which both
  stores make for any background.
- Each is named for screen readers by its words, in the page's language.
- The Google Play link carries Google's install referrer
  (`utm_source=puffinride.is`, `utm_medium` the place: banner, footer,
  about or qr), so the Play Console counts installs that came from the
  website. It names no one. The App Store's link has none: its campaign
  links need Martin's provider token (section 10).

## 4. Rules

No business rule changes.

| ID | Rule |
| -- | ---- |
| R35.1 | Nothing for a store shows, and `/app` does not send anyone to it, while its switch is off. Both are off by default. |
| R35.2 | Nothing of this spec shows in the phone apps. |
| R35.3 | Nothing covers the page: the strips push it down, and there is no pop-up or full-screen page. |
| R35.4 | The Android strip, once closed or used, stays away in that browser. |
| R35.5 | Store badges are the stores' own artwork, unchanged, at least 40 pixels high. |

## 5. Screens

Pictures in [images/app-promotion/](images/app-promotion/), from the built
website with both switches on:

1. The Android strip on a phone, English, light.
2. The Android strip on a phone, Icelandic, dark.
3. The footer on a phone.
4. The footer on a laptop.
5. About's section on a laptop, with the QR code.
6. About's section on a phone.
7. The console's Phone apps switches.

Apple draws the iPhone banner itself; how it looks is Apple's
([Promoting apps with Smart App Banners](https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners)).

## 6. Data and API

- Settings `app_store_listed` and `google_play_listed`, switches, off,
  group `apps` (ADR 0055). No migration: settings are rows of changes.
- `/v1/config` gets `appStores`: the stores whose switch is on, a list of
  `app_store` and `google_play`; an empty list from an API that does not
  say.
- The domain package gets `app-stores.ts`: each store's page, the store a
  browser's user agent belongs to, and where `/app` sends it. The phone
  apps' "Update PuffinRide" screen reads its store pages from there too.
- The API's web app writes Apple's tag and answers `/app`; it reads the
  switches through the settings service's 5-second cache.
- The badges and the QR code are files the website serves from
  `/stores/` (`apps/mobile/public/stores/`), made by
  `apps/mobile/scripts/app-promotion-images.ts` from the stores' own files,
  kept as downloaded in `apps/mobile/assets/app-promotion/`, and a QR code
  of `https://puffinride.is/app` drawn with `toqr`, the QR encoder Expo's
  own command line uses (a development dependency only).

## 7. Privacy and safety

- New in the browser's storage: `app-banner-closed`, when the Android strip
  was closed or used; nothing else. Kept only in the browser; PuffinRide
  never receives it. Functional storage for what the person asked for, so
  no consent banner (ePrivacy, strictly necessary, **verify**, as the other
  rows). A row in the privacy register.
- Apple's banner sends nothing to PuffinRide; Safari keeps its own memory
  of a closed banner.
- `/app` reads the user agent to choose a store and keeps nothing; it is
  not logged beyond the usual request logs.
- The Google Play referrer names a place on the website, never a person.
- Opening a store page is the visitor's own choice; nothing loads from
  Apple or Google until then (the badges are our own copies).

## 8. Texts

| Key | English | Icelandic |
| --- | ------- | --------- |
| `appPromotion.banner.label` | The PuffinRide app | PuffinRide-appið |
| `appPromotion.banner.line` | Notifications about your rides, straight to your phone. | Tilkynningar um ferðirnar þínar beint í símann. |
| `appPromotion.banner.install` | Install | Sækja |
| `appPromotion.banner.close` | Close | Loka |
| `appPromotion.about.title` | The PuffinRide app | PuffinRide-appið |
| `appPromotion.about.line` | PuffinRide is also an app for your phone. It tells you at once when something happens on your rides. | PuffinRide er líka til sem app í símann. Það lætur þig vita strax þegar eitthvað gerist í ferðunum þínum. |
| `appPromotion.about.scan` | Or point your phone's camera at the code. | Eða beindu myndavél símans að kóðanum. |
| `appPromotion.badge.appStore` | Download on the App Store | Sækja í App Store |
| `appPromotion.badge.googlePlay` | Get it on Google Play | Sækja frá Google Play |
| `appPromotion.trademark.appStore` | App Store is a service mark of Apple Inc. | App Store er þjónustumerki Apple Inc. |
| `appPromotion.trademark.googlePlay` | Google Play and the Google Play logo are trademarks of Google LLC. | Google Play og Google Play-merkið eru vörumerki Google LLC. |
| `admin.settings.group.apps` | Phone apps | Símaöpp |
| `admin.settings.name.app_store_listed` | App Store page is public | App Store-síðan er opin |
| `admin.settings.name.google_play_listed` | Google Play page is public | Google Play-síðan er opin |

The console's help lines say what each switch shows, and to turn it on
only once that store's page is public.

## 9. Testing

- Domain, test first: the store of an iPhone's, an Android phone's, an
  iPad's and a laptop's user agent; where `/app` sends each with each
  switch on and off; the Google Play link with its referrer.
- API: `/v1/config`'s `appStores`; Apple's tag in the page's head only with
  the App Store switch on, with the path in `app-argument` and no query,
  and not on `/sign-in/return`; `/app`'s redirects, not cached.
- Screens (Jest, the website): the footer and About with neither, one and
  both switches on; the QR code only on a laptop; the Android strip only
  on an Android browser, not while the question about cookies is open,
  not on sign-in, and gone for good after × or Install; none of it in the
  phone apps.
- The console: the Phone apps group and its two switches.
- The pictures in section 5, checked by eye in both languages and looks.

## 10. Out of scope, later

- Opening the app on the same screen from any link (spec 32, 3.5, plan PR 7);
  then `app-argument` can be the page's `https` address.
- Hiding the Android strip when the app is installed (Chrome's
  `getInstalledRelatedApps`, which needs the same `assetlinks.json` as PR 7).
- A strip of our own for other browsers on the iPhone (Chrome, Firefox),
  which Apple's banner does not reach.
- App Store campaign links (`pt` and `ct`), from Martin's App Store Connect
  provider token, to count installs from the website there too.
- The app on flyers and posters (`/app` is ready for them).

## Decisions

Working choices, for Martin to change ("accept" keeps them all):

1. One console switch per store, off until its page is public (ADR 0055).
2. iPhone: Apple's own banner only, on every page (3.3).
3. Android: our own strip at the top; once closed or used, it stays away in
   that browser (3.4).
4. Badges in the footer of every public page, on phones and laptops, and a
   section on About with a QR code on laptops (3.5, 3.6).
5. One address, `puffinride.is/app`, for the QR code, sending each phone
   to its store (3.7).
