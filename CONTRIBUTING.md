# Contributing

This project is built to last and to be reviewable at any time. Every change
should leave a trail: an issue or spec that explains *why*, a PR that shows
*what*, and an ADR when the change is a decision others will need to know about.

The full workflow, including how Claude Code fits in, is in
[docs/engineering/workflow.md](docs/engineering/workflow.md). This page is the
short version.

## From idea to merged change

1. **Issue.** Open an issue using a template (feature, bug, or decision).
2. **Spec** (for features). Brainstorm the design and save it in
   `docs/specs/YYYY-MM-DD-<topic>.md`. Get the owner's approval.
3. **Decision** (if needed). Write an ADR in `docs/decisions/` for any
   architectural or business-rule decision. See
   [docs/decisions/README.md](docs/decisions/README.md).
4. **Plan.** Break the spec into small, testable tasks in
   `docs/plans/YYYY-MM-DD-<topic>.md`.
5. **Build.** Branch from `main`, write a failing test, make it pass, refactor.
6. **Pull request.** Fill in the template. CI must be green.
7. **Review and merge.** The owner reviews. Squash-merge into `main`.

## Branches

`main` is always releasable and protected. Work happens on short-lived branches:

| Prefix      | Use for                                  |
| ----------- | ---------------------------------------- |
| `feat/`     | New user-facing behaviour                |
| `fix/`      | Bug fixes                                |
| `docs/`     | Documentation only                       |
| `refactor/` | Code changes with no behaviour change    |
| `test/`     | Tests only                               |
| `chore/`    | Tooling, dependencies, CI                |

## Commit messages and PR titles

We use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <summary in imperative mood>

feat(booking): allow passengers to book a partial route
fix(pricing): round segment prices to the nearest 100 ISK
docs(adr): add ADR 0012 for push notifications
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`,
`build`, `revert`. Scopes follow the domain modules (`trips`, `booking`,
`pricing`, `meeting-points`, `users`, `payments`, `notifications`, `admin`) or
the tooling area (`ci`, `deps`, `adr`).

## Pull requests

- Keep PRs small and focused: one concern per PR.
- Link the issue, spec, plan and ADRs the PR implements.
- Include screenshots or recordings for UI changes, on both a phone and a
  wide screen.
- Update docs in the same PR.
- Note any new dependency and why it is needed.

## Code review checklist

Reviewers (human or AI) check, in order:

1. Does it do what the spec says, and nothing else?
2. Are the business rules in the domain layer and covered by tests?
3. Are edge cases handled: capacity, cancellations, time zones, rounding?
4. Is personal data handled per the privacy guide?
5. Is user-facing text translated and accessible?
6. Are docs and ADRs current?

## Language

Code, comments, commit messages and docs are written in English. User-facing
text is written in Icelandic and English (see
[ADR 0011](docs/decisions/0011-localization.md)).
