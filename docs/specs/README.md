# Specs

One design spec per feature, written during brainstorming and approved by the
owner before planning starts. See the [workflow](../engineering/workflow.md#specs).

File name: `YYYY-MM-DD-<topic>.md`, for example `2026-12-01-post-a-trip.md`.

## Sections

1. **Problem and goal:** what we solve and for whom
2. **User stories:** "As a driver, I want … so that …"
3. **Behaviour:** the flow, including edge cases, errors and empty states
4. **Rules:** which rules from [pricing and seats](../product/pricing-and-seats.md)
   or other docs apply; any new rule
5. **Screens:** sketches or descriptions, phone and wide screen
6. **Data and API:** new or changed entities, endpoints, events
7. **Privacy and safety:** personal data touched, who sees it, retention
8. **Texts:** new user-facing strings, Icelandic and English
9. **Testing:** how we will know it works
10. **Out of scope:** what this spec deliberately leaves out

## Index

Specs follow the order in [features](../product/features.md#spec-order).

| # | Spec | Features | Status |
| - | ---- | -------- | ------ |
| 1 | [Sign in, profile, settings and legal acceptance](2026-11-13-sign-in-and-profile.md) | A1, A2, A4, A6 | Approved (2026-11-13) |
| 2 | [Meeting points, place search and their admin](2026-11-13-meeting-points.md) | B1, B2, H1 | Approved (2026-11-13) |
| 3 | [Driver setup and posting a trip with prices](2026-11-13-post-a-trip.md) | A3, C1, C2, C3, C4 | Draft for review |
