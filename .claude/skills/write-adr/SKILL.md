---
name: write-adr
description: Create or supersede an Architecture Decision Record in docs/decisions for ShareRide. Use when a change involves an architectural choice, a new external service or dependency category, a business-rule change (pricing, seats, cancellations), or a security, privacy or legal decision, or when asked to "record this decision" or "write an ADR".
---

# Write an ADR

ADRs live in `docs/decisions/`. The process is described in
`docs/decisions/README.md`; the format is `docs/decisions/template.md`.

## Steps

1. **Check for an existing decision.** Read `docs/decisions/README.md` and any
   ADR on the same topic. If one exists and is `Accepted`, you are writing a
   superseding ADR, not editing it.
2. **Gather context.** Read the docs the decision touches (strategy, product
   rules, architecture) and `docs/strategy/open-questions.md`. If the decision
   answers an open question, note its number.
3. **Pick the number.** Find the highest `NNNN-*.md` file in
   `docs/decisions/` and add one. Use four digits.
4. **Name the file** `NNNN-short-kebab-title.md`.
5. **Write the ADR** from the template:
   - Status `Proposed`, today's date, deciders `Martin`.
   - Context: the forces and constraints, including Iceland-specific ones.
   - At least two real options, each with honest pros and cons.
   - Decision: one clear statement starting "We will".
   - Consequences: good and bad, plus follow-up work.
   - Revisit when: concrete signals.
   - Keep it under about 80 lines. Link to detail docs instead of copying them.
6. **Update the index** table in `docs/decisions/README.md`.
7. **Update links.** If the ADR changes a doc (strategy table, architecture,
   product rules), update that doc in the same change. If it answers an open
   question, move the question to "Answered" in
   `docs/strategy/open-questions.md` only after the owner accepts.
8. **Superseding:** set the old ADR's status to `Superseded by ADR NNNN` (the
   only edit allowed to an accepted ADR) and link back from the new one.
9. **Ask the owner** to review. Only the owner changes status to `Accepted`.

## Style

Plain English, short sentences, no marketing language. Write for a reader
years from now who does not know today's conversation.
