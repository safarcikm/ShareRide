# 0043. Publish the legal documents from the repository

- **Status:** Proposed (the texts themselves are Martin's choice of
  2026-11-22, "Our full drafts now"; this records how they are published)
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Related:** [ADR 0042](0042-production-on-render-released-with-a-button.md),
  [spec 1, 3.4](../specs/2026-11-13-sign-in-and-profile.md#34-terms-and-age),
  [legal texts](../compliance/legal-texts/README.md),
  [production plan](../plans/2026-11-22-production.md)

## Context

The app shows the latest published version of the Terms of Service, the
Community Rules and the Privacy Policy, and asks everyone to accept again
after a material change (spec 1, 3.4). Each acceptance points at a version,
so a published text must never change. Until now only the draft seed put
documents in the database: version 1, a placeholder, in local development,
tests and staging. Production refuses that seed, and there is no console
page for legal documents, so production would start with none and sign-up
would ask nobody to accept anything.

On 2026-11-22 Martin chose to launch `puffinride.is` with our full drafts in
English and Icelandic as the first real version, naming him as the operator,
and to publish the lawyer's version later as a new material version.

## Options considered

1. **Files in the repository, published before each deploy.** Reviewed in a
   pull request like code, the same in every environment, with their history
   in git. A text change needs a pull request and a release.
2. **A console page to write and publish versions.** No deploy for a change,
   and Martin could do it alone. But it needs new screens, an editor for long
   texts in two languages and its own tests, a mistake goes live unreviewed,
   and it would delay the launch.
3. **An SQL insert in the Render Shell.** Nothing to build, but no review, no
   record in git, easy to get wrong and different in each environment.

## Decision

We will keep each published version as two Markdown files,
`packages/db/src/legal/texts/<type>-v<N>.<is|en>.md`, listed in
`packages/db/src/legal/published.ts` with its title, summary, whether it is
material, an optional date it takes effect, and the SHA-256 of each file.
The migration command publishes every listed version the database does not
have yet, in every environment, before a deploy takes traffic, and never
changes a version that is there. Versions start at 2 everywhere, as version
1 is the placeholder draft.

A unit test fails if a listed file changes, if a placeholder in square
brackets is left, or if the two languages have different sections. The texts
use only what the app's reader shows: `##` headings, paragraphs, lists and
bold.

## Consequences

- Production has its texts from the first deploy. Staging and local
  development move to version 2 too, so staging testers accept once more.
- A change is a new version in a pull request, then a release; a material
  one asks everyone to accept again. A change announced ahead waits for its
  date (`takesEffect`).
- `docs/compliance/legal-texts` stays the set of drafts for the lawyer; what
  people accepted is the published files.
- Version 2 names Martin Safarcik as the operator and controller, because
  the company is not registered yet. Once it is, a new material version
  names the company and its kennitala.
- Follow-up: the lawyer's review and a native speaker's check of the
  Icelandic become version 3.

## Revisit when

Texts change so often that a release for each hurts, someone who does not
work in the repository must publish them, or a third language is added.
