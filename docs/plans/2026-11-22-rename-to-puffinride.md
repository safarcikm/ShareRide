# Rename to PuffinRide

- **Status:** In progress
- **Decision:** [ADR 0039](../decisions/0039-rename-to-puffinride.md)
- **Owner's steps:** [staging runbook, "Move to puffinride.is"](../operations/staging.md#move-to-puffinrideis)

ShareRide becomes PuffinRide on puffinride.is. Each pull request is small,
because other work merges in parallel. Names that people never see keep
"shareride" (ADR 0039 lists them). Tick a task when its pull request merges.

## Tasks

1. [x] **Decision and plan.** ADR 0039, this plan, answer A55.
2. [x] **What people see.** Every "ShareRide" in the Icelandic and English
   texts becomes PuffinRide, keeping the message keys. Also the app's name and
   permission texts in `apps/mobile/app.json`, the email sender name and SMS
   sender defaults (`EMAIL_FROM_NAME`, `SMS_SENDER`), the passkey name, the
   console's page title, API error texts, and the names of downloaded files
   (data export, metrics). Test first: `packages/i18n` fails while any text
   says ShareRide. Run `pnpm check`, and the web journeys on GitHub.
3. [x] **A second address for staging.** `staging.puffinride.is` beside
   staging.skinnar.is in `infra/render/render.yaml`; the runbook's
   "Move to puffinride.is" steps, including the mailbox for
   `admin@puffinride.is` and one SPF record for Zoho and Mailjet.
4. [ ] **Switch staging to puffinride.is,** once Render shows the new
   address as verified: `ADMIN_ORIGIN`, `WEB_APP_URL`, `API_ORIGIN`,
   `EMAIL_FROM` (`hello@puffinride.is`), and `EXPO_PUBLIC_API_URL` in
   `apps/mobile/eas.json`. Martin adds a new console passkey and updates
   Google's redirect URI and Apple's return URL.
5. [ ] **App IDs and the link scheme,** with the Google and Apple sign-in
   work: `is.puffinride.app`, `is.puffinride.app.preview`,
   `is.puffinride.preview.web`, `puffinride://`, slug `puffinride`.
6. [ ] **Living docs and legal drafts.** README, CLAUDE.md, glossary,
   product, architecture, compliance (with the legal texts), operations and
   strategy docs. ADRs, specs and plans written before 2026-11-22 keep the old
   name.
7. [ ] **The puffin logo.** Directions on the design canvas; Martin picks
   one; then the drawings in `apps/mobile/assets/logo`, the app icons, the
   splash and the logo lockup (spec 15, section 4.9).
8. [ ] **Remove staging.skinnar.is** from the blueprint once nobody uses it.
9. [ ] **Later, when no parallel work is open:** the `@shareride/` package
   scope, code comments and the repository's name (Martin chose this on
   2026-11-22).
