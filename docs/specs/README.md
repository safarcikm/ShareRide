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
| 3 | [Driver setup and posting a trip with prices](2026-11-13-post-a-trip.md) | A3, C1, C2, C3, C4 | Approved (2026-11-13) |
| 4 | [Search and trip details](2026-11-13-search-and-trip-details.md) | D1, D2, D6 | Approved (2026-11-13) |
| 5 | [Booking and requests](2026-11-13-booking-and-requests.md) | D3, D4, C7 | Approved (2026-11-13) |
| 6 | [Changes and cancellations](2026-11-13-changes-and-cancellations.md) | C5, C6, D5 | Approved (2026-11-13) |
| 7 | [Chat, notifications and reminders](2026-11-13-chat-and-notifications.md) | F1, F2, E1 | Approved (2026-11-13) |
| 8 | [Trip day, reviews and reliability](2026-11-13-trip-day-reviews-and-reliability.md) | E2, E3, E4, G1, G3 | Approved (2026-11-13) |
| 9 | [Safety and moderation](2026-11-13-safety-and-moderation.md) | G2, G4, H2, H3 | Draft for review |
| 13 | [Payments, refunds, payouts and receipts](2026-11-13-payments.md) | D7, D8, C8, H7 | Approved (2026-11-13) |
