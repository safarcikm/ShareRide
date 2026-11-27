# Spec 30: An About page, and a footer on the website

**Owner:** Martin · **Date:** 2026-11-26 · **Status:** Accepted (Martin, 2026-11-27)
(2026-11-26): Martin asked for it; the choices in the Decisions section are
working choices he can change

Amends: [spec 16, 3.4](2026-11-15-one-home-and-simpler-flows.md) (item 2,
the page "Terms, rules and privacy" in Profile, which this page takes the
place of), [spec 23](2026-11-22-google-analytics-and-search.md) (3.4, the
public pages, and 3.7, the sitemap) and [spec 18](2026-11-18-laptop-layout.md)
(3.2, the kinds of wide screen: the footer under the page). No ADR: no new
service, dependency or business rule. The texts the page shows about who
runs PuffinRide are the published Terms' own ([ADR 0043](../decisions/0043-legal-documents-published-from-the-repository.md)).

## 1. Problem and goal

Martin, 2026-11-26: "Shouldnt we have some subpage for about where all the
tncs will be and maybe a footer?"

Today the Terms of Service, the Community Rules, the Privacy Policy and
Cookies are on a page called "Terms, rules and privacy", reached only from
Profile. Nothing says who runs PuffinRide or how to reach us, except deep
in the Terms. A visitor who lands on the front page or on a shared ride
from Google or Facebook, and wants to know who is behind the site before
signing up, has nowhere obvious to look. Most websites answer that in a
footer at the end of every page, with an About page behind it.

Iceland's Act 30/2002 on electronic commerce, article 6, also asks a
service provider to give "easy and permanent access" to its name, address,
email and, where it has them, its kennitala, VAT number and register
([English translation](https://www.stjornarradid.is/media/atvinnuvegaraduneyti-media/media/Acrobat/Act-No-30-2002-on-Electronic-Commerce-and-other-Electronic-Services.pdf),
checked 2026-11-26). A page one click from every public page is that
access; the Terms alone are not easy to find.

**Goal:** from any public page of the website, one click opens a page that
says what PuffinRide is, who runs it, how to reach us, and every legal
text; and the end of each public page links to the same.

## 2. User stories

- As a visitor from Google, I scroll to the end of the front page and find
  who runs PuffinRide and how to write to them.
- As a member, I open the Terms or the Privacy Policy from Profile or from
  the end of any public page.
- As someone asked to check us out by a friend, I follow PuffinRide on
  Facebook or Instagram from the website.
- As a search engine, I find About and the legal pages linked from every
  public page.

## 3. Behaviour

### 3.1 The About page

At `/about`, open to everyone, signed in or not, in both languages. One
column (spec 18, 3.2), as the legal documents are:

1. **About PuffinRide** (title), and what PuffinRide is in two sentences:
   carpooling across Iceland, drivers offering the empty seats on a trip
   they make anyway, passengers booking all of it or part, between meeting
   points. That it is an open beta. A link, "How carpooling works", to
   Carpool in Iceland (spec 23, 3.9).
2. **Terms and policies:** a card of four rows, as the old page had: Terms
   of Service, Community Rules, Privacy Policy and Cookies.
3. **Who runs PuffinRide:** "PuffinRide is run by Martin Safarcik, Skinnar,
   851 Hella, Iceland.", the words of the published Terms (section 1.1).
   When the company is registered, a new version of the Terms names it, and
   this line changes in the same pull request (ADR 0043, Consequences).
4. **Contact us:** a line inviting questions and ideas, the address
   `admin@puffinride.is` as a link that opens an email to it, and
   "PuffinRide on Facebook", a link to our Page (spec 28, 3.6), and
   "PuffinRide on Instagram", a link to @puffinride.is
   (`https://www.instagram.com/puffinride.is/`, Martin, 2026-11-26). Both
   open in a new tab on the website and in the browser in the apps.

`admin@puffinride.is` is the address the Terms, the Privacy Policy and the
Facebook Page give. `hello@puffinride.is` only sends: it refuses mail by
design (ADR 0039, spec 24).

Back goes to the previous screen, or to Profile when the page was opened
on its own.

### 3.2 It takes the place of "Terms, rules and privacy"

1. Profile's row "Terms, rules and privacy" becomes **About PuffinRide**,
   signed in and signed out, and opens `/about`.
2. `/legal` opens `/about`: in the app it is a redirect, and the server
   answers the address with a permanent redirect (301) to `/about`, the
   language in the address kept, so a saved or indexed link still works.
3. The documents stay at `/legal/terms`, `/legal/community-rules` and
   `/legal/privacy`, and Cookies at `/cookies`; their Back, opened on their
   own, goes to `/about`.

### 3.3 The footer

1. **Where.** On the website only, at the end of every **public page**: the
   pages anyone can open without an account. These are Find, About, Carpool
   in Iceland, the meeting points, a meeting point, a place, All rides,
   search results, a trip, the three documents and Cookies. Not on signing
   in, forms and their steps, My rides, Offer, Messages, Profile, Settings
   or a conversation: those already have the menu, and Profile has About
   (3.2). Not in the phone apps, which have About in Profile.
2. **Where on the page.** After the page's content, at the end of the
   scroll, never fixed on the screen. On a page shorter than the window it
   sits at the window's bottom edge. A bar at the bottom of the screen, such
   as Book on a trip, stays over it, as it stays over the content.
3. **Wide screens (900 and wider).** Under a `border` line as wide as the
   page, in the page's own colour, lined up with the page as the top bar's
   content is (spec 18, 3.3), four groups side by side. (A band of its own
   colour across the window was tried; where the browser keeps room for its
   scrollbar, as on Windows, it stopped short of the window's edges, so the
   footer keeps the page's colour.)
   - the logo and **PuffinRide**, with "Carpooling across Iceland" under it;
   - **PuffinRide:** About PuffinRide, Carpool in Iceland, Meeting points;
   - **Terms:** Terms of Service, Community Rules, Privacy Policy, Cookies;
   - **Contact:** `admin@puffinride.is`, PuffinRide on Facebook and
     PuffinRide on Instagram.
4. **Phones' browsers (under 900).** Quiet: no band colour, a `border` line
   above, the same links in small text, wrapping, centred, without the
   group headings: About PuffinRide, Carpool in Iceland, Meeting points,
   Terms of Service, Community Rules, Privacy Policy, Cookies, then the
   email address, Facebook and Instagram. Each link is at least a touch
   target high.
5. Every link to a page of the app is a real `<a href>` (spec 23, 3.6,
   item 6). The email is a `mailto:` link; Facebook and Instagram open in a
   new tab with `rel="noopener"`, and nothing from them loads before one is clicked
   (R28.3).
6. For screen readers the footer is the page's `contentinfo` landmark
   (`<footer>`), after the main content in reading and Tab order; each
   group's heading is not a heading of the page, so the page's own heading
   order stays.

### 3.4 Search engines

1. `/about` is a public page (spec 23, 3.4): indexable on production, in
   the sitemap in place of `/legal`, with its own title, "About PuffinRide ·
   PuffinRide", and description, from `pageText`, in the server's first
   answer and on the screen.
2. Its words are in the first answer's `<noscript>`, as Carpool in
   Iceland's are, for search engines that do not run the app.
3. No money words on the page or in its description (Martin's rule for
   marketing texts, 2026-11-22; the test of spec 23, 3.9).

## 4. Rules

- **R30.1** Every public page of the website links to About, the Terms of
  Service, the Community Rules, the Privacy Policy and Cookies from its end.
- **R30.2** About names who runs PuffinRide as the published Terms do, and
  gives an address that receives mail (`admin@puffinride.is`).
- **R30.3** No money, payment or fee words on About or in the footer.

## 5. Screens

```text
Wide (1440), end of the front page
      ─────────────────────────────────────────────────────────────── (page wide)
 [pin] PuffinRide             PuffinRide          Terms                Contact
 Carpooling across Iceland    About PuffinRide    Terms of Service     admin@puffinride.is
                              Carpool in Iceland  Community Rules      PuffinRide on Facebook
                              Meeting points      Privacy Policy       PuffinRide on Instagram
                                                  Cookies

Phone's browser (390), end of the page
 ─────────────────────────────────────
   About PuffinRide · Carpool in Iceland
     Meeting points · Terms of Service
   Community Rules · Privacy Policy
              Cookies
  admin@puffinride.is · Facebook · Instagram

About (one column)
 ← Back
        About PuffinRide
 PuffinRide is carpooling across Iceland. …
 PuffinRide is in an open beta. …
 How carpooling works
 Terms and policies
 ┌─────────────────────────────┐
 │ Terms of Service          › │
 │ Community Rules           › │
 │ Privacy Policy            › │
 │ Cookies                   › │
 └─────────────────────────────┘
 Who runs PuffinRide
 PuffinRide is run by Martin Safarcik, Skinnar, 851 Hella, Iceland.
 Contact us
 Questions or ideas? Write to us, in English or Icelandic.
 admin@puffinride.is
 PuffinRide on Facebook
 PuffinRide on Instagram
```

## 6. Data and API

No new data or endpoint. The server: `/about` in the public pages and the
sitemap, `/legal` answered with a 301 to `/about`, About's title,
description and `<noscript>` words in the first answer. The page's texts,
its documents and our contact address are in one place, `aboutPage` in
`packages/i18n/src/seo.ts`, for the page, the footer and the server, as
`carpoolPage` is. The Facebook Page's and Instagram's addresses stay in
their own place (`apps/mobile/src/sharing/links.ts`, spec 28, 3.6).

## 7. Privacy and safety

- About shows Martin's name and the address of Skinnar, which the
  published Terms and Privacy Policy already show to everyone. No other
  personal data. Martin chose to be named as the operator until the company
  is registered (ADR 0043).
- No Facebook or Instagram script, pixel or widget: each is a plain link
  (R28.3).
- The footer adds no cookie, no tracking and no call to the API.

## 8. Texts

| Key | English | Icelandic |
| --- | ------- | --------- |
| `about.title` | About PuffinRide | Um PuffinRide |
| `about.intro` | PuffinRide is carpooling across Iceland. Drivers who are making a trip anyway offer the empty seats in their car, and passengers book a seat for the whole way or part of it, from one meeting point to another. | PuffinRide er samakstur um allt Ísland. Bílstjórar sem eru hvort sem er á leiðinni bjóða laus sæti í bílnum sínum og farþegar bóka sæti alla leiðina eða hluta hennar, frá einum mótsstað til annars. |
| `about.beta` | PuffinRide is in an open beta: anyone aged 18 or over can join, and we are still making it better. | PuffinRide er í opinni prófun: allir 18 ára og eldri geta verið með og við erum enn að bæta það. |
| `about.documents` | Terms and policies | Skilmálar og reglur |
| `about.operatorTitle` | Who runs PuffinRide | Hver rekur PuffinRide |
| `about.operator` | PuffinRide is run by Martin Safarcik, Skinnar, 851 Hella, Iceland. | PuffinRide er rekið af Martin Safarcik, Skinnar, 851 Hella, Íslandi. |
| `about.contactTitle` | Contact us | Hafðu samband |
| `about.contact` | Questions or ideas? Write to us, in English or Icelandic. | Spurningar eða hugmyndir? Skrifaðu okkur, á íslensku eða ensku. |
| `about.facebook` | PuffinRide on Facebook | PuffinRide á Facebook |
| `about.instagram` | PuffinRide on Instagram | PuffinRide á Instagram |
| `footer.label` | About PuffinRide and our terms | Um PuffinRide og skilmálana okkar |
| `footer.tagline` | Carpooling across Iceland | Samakstur um allt Ísland |
| `footer.terms` | Terms | Skilmálar |
| `footer.contact` | Contact | Samband |
| `footer.facebook` | Facebook | Facebook |
| `footer.instagram` | Instagram | Instagram |
| `seo.aboutDescription` | Who runs PuffinRide, how to reach us, and PuffinRide's Terms of Service, Community Rules and Privacy Policy. | Hver rekur PuffinRide, hvernig þú nærð í okkur, og notendaskilmálar, samfélagsreglur og persónuverndarstefna PuffinRide. |

The footer's other links use the texts they have: `legal.terms`,
`legal.rules`, `legal.privacy`, `cookies.title`, `carpool.title`,
`meetingPoints.title`; About's link to Carpool in Iceland is
`home.howItWorks`. `profile.legal` goes; the documents keep
`seo.legalDescription`.

## 9. Testing

- Unit (i18n): every key in both languages; `pageText` for About; no money
  words in About's texts, as for Carpool in Iceland.
- Screen tests (`renderApp`): About shows the four documents and opens
  each; the email, Facebook and Instagram links; Profile's About row, signed in and
  out; `/legal` lands on `/about`; the footer is on Find, About, Carpool in
  Iceland and a legal document on the web and not on My rides, Profile or
  sign-in; it is not in the phone apps; its links are `<a href>`.
- Server: `/about` indexable with its own title and `<noscript>`; the
  sitemap lists `/about` and not `/legal`; `/legal?lang=en` answers 301 to
  `/about?lang=en`.
- Web journey (Playwright): open the front page, follow About in the
  footer, open the Privacy Policy.
- Look: screenshots of the end of the front page and About, at 1440 and
  390, light and dark, in both languages, for Martin
  ([pictures](images/about-page-and-footer/)).

## 10. Out of scope

- The company name and kennitala: when the ehf. is registered (a new
  version of the Terms, ADR 0043; A57).
- Instagram in the footer, until the profile exists.
- A footer in the phone apps, a language switch in the footer (the top bar
  and the front page have it), and press or careers pages.

## Decisions

Working choices, for Martin to change ("accept" keeps them all):

1. One page, **About**, holds the documents; "Terms, rules and privacy"
   goes, and `/legal` leads to About (3.2).
2. The footer is on the website's **public pages** only, not on forms,
   signed-in places or in the phone apps (3.3, item 1).
3. On a laptop, four groups under a line as wide as the page; on a
   phone's browser, a quiet list of small links (3.3, items 3 and 4).
4. The contact address is `admin@puffinride.is`, the one the Terms give
   (3.1, item 4).

Answered ([A57](../strategy/open-questions.md#answered)): the act asks for a
kennitala where there is one. Martin chose to leave his own out until the
ehf. is registered (decision card, 2026-11-26); the page gives the name,
address and email the Terms give.
