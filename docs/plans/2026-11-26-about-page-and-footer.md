# Plan: An About page, and a footer on the website

Spec: [spec 30](../specs/2026-11-26-about-page-and-footer.md). Two pull
requests, one after the other, each with its tests first.

## PR 1: the About page (`feat(about)`)

- [ ] **Texts.** `packages/i18n/src/messages/en.ts` and `is.ts`: the keys of
  spec 30, section 8; remove `profile.legal` and `seo.legalDescription`.
  Test first: `seo.test.ts` (About's `pageText`, no money words in About).
- [ ] **One page's words.** `packages/i18n/src/seo.ts`: `PublicPage` kind
  `about`, and `aboutPage` (path, title, sections) for the screen and the
  server's `<noscript>`, as `carpoolPage` is.
- [ ] **The contact address.** `apps/mobile/src/about/contact.ts`:
  `contactEmail`; and the Facebook Page's address from
  `apps/mobile/src/sharing/links.ts` (spec 28), added there if that file is
  not on `main` yet.
- [ ] **The screen.** `apps/mobile/src/app/about.tsx`, in the root stack.
  Test first: `apps/mobile/src/__tests__/about.test.tsx` (the documents open,
  the email and Facebook links, Back to Profile).
- [ ] **In place of "Terms, rules and privacy".** Profile's two rows open
  `/about` (`about.title`); `app/legal/index.tsx` redirects to `/about`;
  Cookies' and the documents' Back fall back to `/about`. Tests: `menu.test.tsx`
  and `profile-safety.test.tsx` as they are, changed to About.
- [ ] **The server.** `apps/api/src/search-engines.ts`: `/about` indexable
  and in the sitemap in place of `/legal`; its title and `<noscript>`.
  `apps/api/src/web-app.ts`: `/legal` answers 301 to `/about`, query kept.
  Tests first in `search-engines.test.ts` and `web-app.test.ts`.
- [ ] **Docs.** Spec 16, 3.4 item 2 and spec 23, 3.4 point at spec 30; the
  glossary if a word is new; CHANGELOG.

## PR 2: the footer (`feat(about)`)

- [ ] **The part.** `apps/mobile/src/components/site-footer.tsx`: the wide
  band of four groups and the phone's quiet links (spec 30, 3.3), the
  `contentinfo` landmark, real links. Test first:
  `apps/mobile/src/components/site-footer.test.tsx`.
- [ ] **On the public pages.** `Screen` gets `siteFooter`, shown on the web
  only, after the content and across the window. Set on Find, About,
  Carpool in Iceland, the meeting points, a meeting point, a place, All
  rides, search results, a trip, the documents and Cookies. Test:
  `apps/mobile/src/__tests__/site-footer.test.tsx` (on those pages on the
  web, not on My rides, Profile or sign-in, not in the apps).
- [ ] **Journey.** `apps/mobile/e2e/about.spec.ts`: the front page's footer
  to About, then the Privacy Policy.
- [ ] **Look.** Screenshots at 1440 and 390, light and dark, IS and EN, in
  `docs/specs/images/about-page-and-footer/` and the project files.
- [ ] **Docs.** Spec 18, 3.2 notes the footer under public pages; plans index.
