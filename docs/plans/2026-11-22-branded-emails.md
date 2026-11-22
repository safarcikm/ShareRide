# Emails that look like PuffinRide: implementation plan

**Owner:** Martin · **Date:** 2026-11-22 · **Status:** Proposed

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** every email the API sends wears the PuffinRide layout of
[spec 24](../specs/2026-11-22-branded-emails.md): the puffin pin inside the
email, a card, one moss button, dark mode, and a better plain-text part, in
Icelandic and English, with the words unchanged. Martin's steps give
`hello@puffinride.is` the puffin as its Gmail picture.

**Shape:** one PR. All emails already go through `emailContent`
(`apps/api/src/modules/notifications/email-content.ts`), from the
notification worker and the address confirmation, so the layout changes in
one place. No migration, no new texts, no new dependency (the API starts
using the workspace package `@shareride/ui` for the tokens).

## Tasks

- [ ] **Test first:** `apps/api/assets/email-logo.test.ts`, the icon is a PNG
  of 120 by 120 pixels. Export it: `apps/mobile/scripts/export-icons.ts`
  also writes `favicon.svg` at 120 pixels to `apps/api/assets/email-logo.png`
  (the API's image holds no `apps/mobile`).
- [ ] **Test first:** `email-mailjet.test.ts`, a message's `images` go as
  `InlinedAttachments` (`ContentType`, `Filename`, `ContentID`,
  `Base64Content`); none, no field. Add `images` to `EmailMessage`
  (`platform/email.ts`) and the adapter.
- [ ] **Test first:** `email-content.test.ts`, spec 24's section 9: the plain
  text (3.5), the HTML layout (3.1), dark mode styles (3.2), the icon by
  `cid:` and in `images`, nothing loaded from elsewhere, escaping, the title
  not repeated. Then `email-layout.ts` (the HTML) and `emailContent`.
- [ ] `apps/api/scripts/email-previews.ts` (`pnpm --filter @shareride/api
  email-previews`): writes the key emails in both languages as HTML files
  with the icon as a data address, for a browser, and their plain text, to
  `apps/api/email-previews/` (ignored by git).
- [ ] Previews: screenshots of the key emails, light and dark, phone and
  computer, Outlook-like (no styles block) and pictures off, in the project
  files `branded-emails/`.
- [ ] Docs: spec 7 section 5 points to spec 24; spec 15 4.9 names the email
  icon; privacy register's Mailjet row (the icon, nothing loaded); staging
  runbook "Show the puffin beside our emails" (Martin's steps for `hello@`)
  and its two lines that say there is no `hello@` user; specs and plans
  indexes.
- [ ] `pnpm check`, `pnpm format:check`, markdownlint; code review; PR.

## Martin's steps (after merge)

1. The runbook's "Show the puffin beside our emails": the `hello@` user, its
   photo, the rule that refuses its mail, then the check from a personal
   Gmail.
2. Read one email in Gmail and one in Apple Mail, in light and dark mode.
