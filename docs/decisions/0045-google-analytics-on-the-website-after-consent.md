# 0045. Google Analytics on the website, only after consent

- **Status:** Accepted (2026-11-22, by Martin on a decision card in the
  project thread)
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Related:** [spec 23](../specs/2026-11-22-google-analytics-and-search.md),
  changes [spec 12, 3.4](../specs/2026-11-13-beta-access-and-feedback.md#34-usage-analytics-j3),
  [ADR 0007](0007-eea-hosting-and-data-residency.md),
  [privacy and GDPR](../compliance/privacy-gdpr.md)

## Context

Spec 12 left the beta without usage analytics, and said that analytics, if
added, need opt-in consent, a fixed list of events without personal data,
no advertising IDs and an EEA provider. Since 2026-11-22 the beta is open to
the public on `puffinride.is`, and Martin asked for Google Analytics, to see
how many people visit and what they use.

Google Analytics sets cookies in the browser. Under the ePrivacy rules,
which Iceland applies through the Electronic Communications Act (**verify**),
storing them needs the visitor's consent first, and the processing then
rests on that consent under the GDPR. Google keeps Analytics data in the
United States. ADR 0007 keeps personal data in the EEA unless an adequacy
decision applies: the EU-US Data Privacy Framework is one, taken into the
EEA Agreement (**verify** for Iceland), and Google LLC is certified under
it. Expo, Apple and Google already process push this way. The published
Privacy Policy says we do not track how people use the app.

## Options considered

1. **Google Analytics, loaded only after consent.** Free, well known, and
   linked to Search Console. Needs a consent question on the website; only
   those who accept are counted; data in the United States under the
   framework; the Privacy Policy changes.
2. **A cookieless analytics service in the EEA,** such as Plausible.
   Counts every visit without personal data, so no consent question and the
   Privacy Policy keeps its promise; about 9 EUR a month; not Google, and
   fewer reports.
3. **No analytics,** as spec 12 decided. Nothing to ask or explain, but we
   keep guessing how the site is used beyond the search counts of spec 10.

## Decision

We will use Google Analytics 4 on the website only, loaded after the
visitor accepts, as spec 23 describes: a question that is as easy to
decline as to accept, nothing from Google before it, page views named by
the screen's pattern without IDs or queries, no user ID, advertising
features and enhanced measurement off, data kept 14 months and cookies 13,
and a Cookies page to withdraw. Martin chose this over a cookieless EEA
service on 2026-11-22. It is the exception to spec 12's EEA provider, under
the adequacy decision ADR 0007 allows.

## Consequences

- We see visits, where they come from and which screens are used, for the
  people who accept.
- The website gets a consent question on the first visit, and the numbers
  leave out everyone who declines.
- Google becomes a processor; Martin accepts Google's data processing terms
  in Analytics. The privacy register, the Privacy Policy (version 3, both
  languages) and the web app's Content Security Policy change.
- Follow-up: the measurement ID in production's settings; the lawyer checks
  the consent question and the transfer; product events, if wanted, are
  listed in a spec first.

## Revisit when

The EU-US Data Privacy Framework falls or a regulator objects to Google
Analytics, the share of visitors who accept is too small to learn from, or
the phone apps need analytics.
