# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [ADR index](README.md)

## Context

ShareRide is meant to run for many years, built largely with AI assistance and
reviewed by one owner. Without a written record, the reasons behind choices
are lost, and both people and AI agents re-open settled questions or break
assumptions they cannot see.

## Options considered

1. **No formal record.** Fast now, costly later.
2. **A wiki or external document.** Drifts away from the code and is not
   reviewed with it.
3. **ADRs in the repository.** Short Markdown files, versioned and reviewed in
   pull requests alongside the code they affect.

## Decision

We will record significant decisions as ADRs in `docs/decisions/`, using
[template.md](template.md), numbered sequentially and never rewritten once
accepted. Claude Code reads the relevant ADRs before changing an area (see
`CLAUDE.md`) and uses the `write-adr` project skill to create new ones.

## Consequences

- Every significant decision has a home and a review.
- Writing an ADR adds a few minutes to a change. That is the intended cost.
- The ADR index in `docs/decisions/README.md` must be kept current.

## Revisit when

The ADR count makes the index hard to navigate; then group ADRs by area.
