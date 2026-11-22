# 0039. Rename the product to PuffinRide, on puffinride.is

- **Status:** Accepted (2026-11-22, by Martin: the name and the domain, and
  this list of what keeps the old internal name, as written)
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Related:** [open questions](../strategy/open-questions.md) A32 and A56,
  [ADR 0017](0017-visual-design-system.md) (the logo),
  [ADR 0018](0018-hosting-on-render-frankfurt.md),
  [ADR 0027](0027-email-through-mailjet.md),
  [ADR 0028](0028-operator-console-web-app-and-passkeys.md),
  [ADR 0034](0034-google-and-apple-sign-in-through-our-api.md),
  [plan](../plans/2026-11-22-rename-to-puffinride.md)

## Context

The product has been called ShareRide since the start, with the rename kept
cheap on purpose (A32). shareride.com belongs to someone else, and Martin's
rule is that the exact name must be free on both .com and .is. Staging runs
at staging.skinnar.is, a domain Martin owns, "for now".

On 2026-11-22 Martin chose PuffinRide and registered puffinride.is. A name
check that day found puffinride.com free, a 2022 US filing for PUFFNRIDE in
class 39 (carpooling, status not confirmed), and that "puffin" reads as a
tourist word in Iceland. Martin knew this and chose the name anyway.

Nothing is in the app stores yet, so app and bundle IDs can still change.
Some internal names cannot change cheaply: Render matches blueprint services
by name, so a new name makes a new service and an empty database; bucket
names are fixed; the export key is derived from `shareride-data-export-v1`;
stored values such as `booking_cancelled_by_shareride` would need migrations.
Four threads are merging work in parallel, and `@shareride/` appears on over
1 300 lines.

## Options considered

1. **Rename everything at once, internal names included.** One name
   everywhere. But it recreates the staging services and database, needs
   migrations for stored values, breaks exports in progress, and conflicts
   with every open pull request.
2. **Rename what people see now; internal names later or never.** Members,
   operators and Apple, Google and email providers see PuffinRide at once.
   Internal names stay, so nothing is recreated or migrated. The codebase
   reads two names for a while.
3. **Keep ShareRide.** No work, but Martin has decided against it.

## Decision

We will call the product PuffinRide and use puffinride.is, renaming what
people see now (option 2):

- **Now:** every text in Icelandic and English, the email sender name, the
  SMS sender (`PuffinRide`), the passkey name, page titles, the names of
  downloaded files, the legal drafts, the logo, and the living docs.
- **Addresses:** staging moves to `staging.puffinride.is`, with
  staging.skinnar.is kept until the new address answers. Production will use
  `puffinride.is`. Email is sent as `hello@puffinride.is`. `admin@puffinride.is`
  is a mailbox in Google Workspace (Martin's choice) for the operator's own
  accounts (Google, Apple, providers), with two-step sign-in; it holds no
  member data. Martin also holds `puffinride.com`, at Cloudflare, which leads
  to puffinride.is.
- **App IDs:** `is.puffinride.app` (Android and the store app),
  `is.puffinride.app.preview` (iOS preview), Services ID
  `is.puffinride.preview.web`, link scheme `puffinride://`, Expo slug
  `puffinride`.
- **Later, when no parallel work is open:** the `@shareride/` package scope,
  code comments, and the repository's name.
- **Kept:** Render service and database names, the photo bucket, Sentry's
  organisation and projects, the export key's purpose, stored values, and
  message keys such as `notify.cancelledByShareRide`.

## Consequences

- Members see one name from the next deploy. A test keeps "ShareRide" out of
  the app's texts, so new texts from other work cannot bring it back.
- Console passkeys belong to the old host, so each operator makes a new one on
  staging.puffinride.is (`operator add`). Members sign in again there.
- Google and Apple sign-in, Mailjet's sender domain and Sentry's uptime
  monitor need the new addresses; Martin's steps are in the
  [staging runbook](../operations/staging.md).
- Readers of the code meet "shareride" in names and comments until the later
  clean-up. Older ADRs, specs and plans keep the name they were written with.
- The trademark question stays open until launch: search Hugverkastofan, EUIPO
  and USPTO, and check PUFFNRIDE's status, before any money goes on the brand.

## Revisit when

- A trademark search finds a conflicting mark in Iceland, the EU or the US.
- The app goes into a store, after which its IDs can no longer change.
- The parallel threads are quiet, for the internal clean-up.
