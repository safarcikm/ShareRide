# 0042. Production on Render, released with a button

- **Status:** Accepted (2026-11-22, by Martin: "Release button" on a decision
  card)
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Related:** [ADR 0018](0018-hosting-on-render-frankfurt.md) (hosting, no
  change), [ADR 0039](0039-rename-to-puffinride.md) (the domain),
  [production runbook](../operations/production.md),
  [conventions](../engineering/conventions.md#database)

## Context

ADR 0018 puts staging and production on Render in Frankfurt. Staging has run
since 2026-11-18; production did not exist. On 2026-11-22 Martin asked to go
live for the public on `puffinride.is`.

Staging deploys every merge to `main` once its checks pass. Claude merges its
own pull requests once green (Martin, 2026-11-16), often ten a day. If
production deployed the same way, every merge would reach the public within
minutes, at the same moment as staging, so staging would never catch a bad
change first. Production holds real people's data, so from now on the
two-deploy rule in the conventions applies to it.

Render's free Hobby workspace allows two environments per project, but
isolated environments (no private network traffic across them) need its Pro
plan.

## Options considered

1. **Every merge, like staging.** Nothing to press. No early warning; a bad
   migration reaches real data at once.
2. **A release button that moves a `production` branch.** Render's
   production services follow the branch; a GitHub action moves it to a
   commit on `main` whose CI passed. Git shows what is live, and no secret is
   needed. Someone has to press it.
3. **A deploy hook called from a GitHub action.** The same, with automatic
   deploys off and Render's deploy hook URLs as GitHub secrets. Two secrets to
   keep, and what is live is only visible in Render.
4. **Manual Deploy in Render's dashboard.** Deploys the newest commit, not
   one that staging has run, and only Martin can do it.

## Decision

We will run production as its own Blueprint, `infra/render/production.yaml`,
in a Render project "PuffinRide", environment "production": the API with the
web app and console at `https://puffinride.is`, the hourly clean-up job and
its own database, with secrets of its own. Its services follow the
`production` branch, which only the "Release to production" action moves, to
a commit on `main` whose CI passed after merging (by default the newest one,
which staging runs). Claude releases after checking that staging runs the
commit well and tells Martin; Martin can release too. A release that moves
production back needs the "older" box ticked.

## Consequences

- A bad change shows on staging first; production lags `main` until the next
  release.
- Each release is a deploy in the sense of the two-deploy rule: code that
  reads a new kind of data goes out in one release, the code that saves it in
  a later one. The action lists the commits and migrations a release brings.
- Rolling back: Render's Rollback for the moment, then releasing an older
  commit so the branch says what runs.
- The `production` branch must exist before the Blueprint is first applied:
  the first release comes first.
- On Hobby, staging's services could reach production's database over the
  private network; they have no credentials for it. On Pro, turn on the
  environment's isolation, and the 7-day recovery window ADR 0018 recommends.

## Revisit when

Releases lag far behind `main`, more than one person deploys, or an outage
shows that releasing must wait longer on staging (then add a waiting time or
checks of staging's health to the action).
