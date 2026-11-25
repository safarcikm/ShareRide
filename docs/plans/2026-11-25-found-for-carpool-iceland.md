# Plan: found when people search for carpooling in Iceland

**Spec:** [spec 23, 3.6 and 3.9](../specs/2026-11-22-google-analytics-and-search.md#39-found-when-people-search-for-carpooling-in-iceland)
· **Date:** 2026-11-25 · **Status:** In progress

Martin, 2026-11-25: "still cant find our web on google when i type carpool
iceland". Google has the site; it is on page 3 for that phrase. Two PRs fix
what holds it back on our side; links from other sites are Martin's part
(spec 23, 3.9, "Outside the code").

## PR 1: each page's own title, and links search engines follow

`fix(search)`, no new dependency, no migration.

1. `pageText(t, page)` in `@shareride/i18n`: the title and description of
   Find, the meeting points, a meeting point and a place. The screens' page
   heads use it. New text `seo.meetingPointTitle` ("{name}: carpool meeting
   point"), both languages. Test first: `seo.test.ts`.
2. API: `subjectFinder(db)` looks up the name a meeting point's or place's
   address is about, as the sitemap lists them, or says it is missing;
   `pageHead` takes it for the title and description (the link preview
   stays Find's, 3.6 item 4) and names no canonical address for a missing
   one; the web app adds `X-Robots-Tag: noindex, nofollow` for it. Tests:
   `search-engines.test.ts` (with a fake finder through `createApp`'s
   `findSubject`) and `search-engines.integration.test.ts` (the database).
3. App: `linkProps(href)` (`src/navigation/link-props.ts`) makes a
   `Pressable` an `<a href>` on the web that opens the screen within the
   app on a plain click and leaves modified clicks to the browser. Used by
   `TextLink`, a `Button` or `Card` given `href`, and `MeetingPointCard`
   without `onPress`. Find's and the map's "See the meeting points", the
   meeting point lists and a place's nearest points become links. Tests:
   `link-props.test.ts`; screen tests find them by the role `link`.
4. Check in a web build that the front page and a place page have the
   links, and that a click stays in the app.

## PR 2: the Carpool in Iceland page

`feat(search)`, no new dependency, no migration. Built on top of PR 1
(#240).

1. Texts in both languages: the page's title, description, line, sections
   and questions, and Find's "How carpooling works". Nothing about money.
2. The page's sections as one list in `@shareride/i18n`, which the screen
   and the server's `<noscript>` both read.
3. Screen `src/app/carpool-iceland.tsx`, open to everyone, in the narrow
   column; Find links to it beside "See the meeting points".
4. API: `/carpool-iceland` in the indexable list and the sitemap, its own
   title, and its text in the first answer's `<noscript>`.
5. Tests first: i18n, `search-engines` (head, noscript, sitemap), a screen
   test (the page, its links, both languages).

## After merging

Release to production needs Martin's go. Then in Search Console: inspect
`https://puffinride.is/carpool-iceland` and ask for indexing.
