# Production on puffinride.is

**Status:** done (live 2026-11-22) · **Date:** 2026-11-22 · **Owner:** Martin

Martin asked on 2026-11-22 to go live for the public on `puffinride.is` once
the day's work is merged (milestone 12 in the
[roadmap](../strategy/roadmap.md)). Go-live plan for Martin, with what can
wait for the beta label: [Claude Doc](https://claude.ai/artifact/SYY8Coa8WyLpfBgfXDDs3T).

## Decisions

- Production releases with a button, after staging runs the commit (Martin,
  decision card 2026-11-22):
  [ADR 0042](../decisions/0042-production-on-render-released-with-a-button.md).
- Production shows our full drafts of the terms, community rules and privacy
  policy, in English and Icelandic, as the first real version; the lawyer's
  version follows as a new version that everyone accepts (Martin, decision
  card 2026-11-22).
  [ADR 0043](../decisions/0043-legal-documents-published-from-the-repository.md)
  records how they are published. Until the company is registered they
  name Martin Safarcik as the operator (decision card 2026-11-22).

## Pull requests

1. The production blueprint (`infra/render/production.yaml`), the "Release
   to production" action, the [production runbook](../operations/production.md)
   and ADR 0042.
2. Legal documents published from the repository on deploy, in every
   environment, and the first real texts in English and Icelandic, with the
   operator's name, address and contact email from Martin
   ([ADR 0043](../decisions/0043-legal-documents-published-from-the-repository.md)).
3. After Martin's setup steps: roadmap tick, privacy register (data
   agreements), and anything the first days show.

## Martin's steps

In the [production runbook](../operations/production.md#set-it-up-once),
after PRs 1 and 2 and the first release.

## What happened

- 2026-11-22, about 19:30 UTC: `https://puffinride.is` live for the public,
  after PRs 1 and 2 (#214, #217) and the first release.
- Martin could not save a passkey on production (his browsers offered only
  a security key or a phone's QR code), so the console takes the password
  there too: [ADR 0044](../decisions/0044-console-password-on-production.md)
  (#220). Delete `ADMIN_PASSWORD` once a passkey works.
- Google sign-in with its own production client, a Sentry uptime monitor,
  pay in person switched on, and photos in a Hetzner project of its own.
- Martin imported and activated the 104 settlement points and the 32
  sights; staging stays open to sign-ups (his choice, runbook step 9).
- Releases the same evening brought pull to refresh and Sign out, the
  console password, the branded emails, the cookie question with Google
  Analytics, search engines, the sights and the round yellow car.
- Still Martin's: the data processing agreements and Sentry's privacy
  settings (runbook step 10), and a first real ride (step 11).
