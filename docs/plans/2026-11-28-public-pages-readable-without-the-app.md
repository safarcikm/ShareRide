# Every public page readable without the app: build plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a reader that does not run the app (an AI answer's page reader,
Bing at times, a person with JavaScript off) reads each public page's own
text, not Expo's "You need to enable JavaScript to run this app."

**Architecture:** as Carpool in Iceland, About and Delete your account
already do (spec 23, 3.9 item 5): the API writes the page's text into the
first answer's `<noscript>`. `pageHead` gets a page's content, found by a
new `contentFinder` from the meeting point and legal services the API
already has, and writes it with the texts of `@shareride/i18n`. Every text
ends with the footer's links and one line on JavaScript, which takes the
place of Expo's sentence. One pull request.

**Spec:** [spec 23, 3.11](../specs/2026-11-22-google-analytics-and-search.md#311-every-public-page-readable-without-the-app),
R23.9, decisions 12 and 13.

## Global constraints

- The screen's own words only, never text written for search engines.
- No ride, driver, passenger or photo (R23.7, R23.9; decision 13, Martin).
- A meeting point or place the sitemap leaves out gets no text.
- Every text in both languages; a new key in `en.ts` and `is.ts`.

## Tasks

- [x] **Find, Cookies, the footer and the JavaScript line** (no data).
      Tests first in `search-engines.test.ts`: Find's text in both
      languages has the title, the three steps and the links, and no ride;
      Cookies says whether visits are counted; every page with a text ends
      with the footer's links and the line; Expo's sentence is gone.
- [x] **Meeting points, a meeting point and a place.** `PageContent`
      carries the service's list, details or nearest points; the texts
      follow the screens (regions in order, names sorted for the language,
      the details' parts, distances formatted as the app does). Tests for
      each, in both languages, with a paused and a sample point left out
      of the list.
- [x] **Legal documents.** The current version's title, version and body,
      Markdown to HTML for headings, paragraphs, lists and bold, escaped.
- [x] **Wiring.** `contentFinder` in `search-engines.ts`, given to
      `createWebApp` by `app.ts`; the integration test gets each kind from
      the database, and none for a missing point, place or document.
- [x] **Docs and checks.** CHANGELOG, `pnpm check` for i18n and api,
      the integration tests, markdownlint; PR, merge when green, release
      when Martin says go, and read each page with `curl` on
      puffinride.is.
