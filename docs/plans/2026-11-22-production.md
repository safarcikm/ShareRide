# Production on puffinride.is

**Status:** in progress · **Date:** 2026-11-22 · **Owner:** Martin

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
  card 2026-11-22). PR 2 writes its ADR.

## Pull requests

1. The production blueprint (`infra/render/production.yaml`), the "Release
   to production" action, the [production runbook](../operations/production.md)
   and ADR 0042.
2. Legal documents published from the repository on deploy, in every
   environment, and the first real texts in English and Icelandic, with the
   operator's name, address and contact email from Martin.
3. After Martin's setup steps: roadmap tick, privacy register (data
   agreements), and anything the first days show.

## Martin's steps

In the [production runbook](../operations/production.md#set-it-up-once),
after PRs 1 and 2 and the first release.
