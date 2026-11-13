# Open questions

**Owner:** Martin · **Last reviewed:** 2026-11-13

Decisions the owner still needs to make. Each has a recommendation so work can
continue on that assumption. When a question is answered, record the answer
here, update or accept the linked ADR, and move the row to "Answered".

## Open

| #  | Question | Recommendation | Affects |
| -- | -------- | -------------- | ------- |
| Q1 | Which stack: Expo with our own TypeScript API, Expo with Supabase, or Flutter? | Expo with our own TypeScript API and PostgreSQL. Best ownership, testability and portability for a long-lived product. | [ADR 0003](../decisions/0003-cross-platform-client-expo.md), [0004](../decisions/0004-backend-modular-monolith.md), [0005](../decisions/0005-postgresql-postgis.md), [0010](../decisions/0010-authentication-and-identity.md) |
| Q2 | Payments in the beta: pay the driver directly, or in-app from day one? | Pay directly in the beta; in-app payments in Phase 5. Icelandic marketplace payments need a provider and licensing work that would delay the beta. | [ADR 0008](../decisions/0008-payments-phased.md) |
| Q3 | Who sets segment prices? | The platform suggests a cost-based price per segment; the driver can lower it or raise it up to a cap. Keeps the service on the cost-sharing side of the Taxi Act. | [ADR 0006](../decisions/0006-meeting-points-and-segment-pricing.md), [pricing](../product/pricing-and-seats.md) |
| Q4 | Default booking mode: instant booking or driver approval? | Driver chooses per trip; default is approval during the beta, instant once ratings exist. | [pricing and seats](../product/pricing-and-seats.md#booking-modes) |
| Q5 | Business model after the beta: passenger service fee, driver fee, subscription, or free? | A small passenger service fee per booking, introduced with in-app payments. Free during the beta. | [ADR 0008](../decisions/0008-payments-phased.md) |
| Q6 | Which corridors open first? | Reykjavík–Hveragerði–Selfoss, Reykjavík–Reykjanesbær–Keflavík Airport, Reykjavík–Akranes–Borgarnes, Reykjavík–Akureyri, and Selfoss–Hvolsvöllur–Vík along the south coast. To be checked against waitlist demand. | [meeting points](../product/meeting-points.md) |
| Q7 | Minimum age for accounts? | 18 for drivers and account holders. Minors travel only on a guardian's booking, later. | [privacy](../compliance/privacy-gdpr.md), [legal](../compliance/legal-and-regulatory.md) |
| Q8 | Which identity checks are required? | Phone verification for everyone. Drivers also confirm their driving licence. Auðkenni verification is optional and shown as a badge. | [ADR 0010](../decisions/0010-authentication-and-identity.md) |
| Q9 | Languages at launch? | Icelandic and English; Polish in Phase 5. | [ADR 0011](../decisions/0011-localization.md) |
| Q10 | Licence for the code? | Keep it proprietary (all rights reserved) and the repository private. | [README](../../README.md#licence) |
| Q11 | Brand and domain: is "ShareRide" the final name, and is shareride.com owned? | Run a trademark and domain check in Phase 1 before investing in branding. An Icelandic name (or .is domain) may help locally. | [roadmap](roadmap.md) |
| Q12 | Women-only trips option? | Not in the MVP; consider after the beta based on feedback. | [features](../product/features.md) |
| Q13 | Can legal and company work start in Phase 1 instead of after the beta? | Yes. Run it as a parallel track: the legal opinion shapes the pricing rules, and beta testers need terms, a privacy policy and a company as data controller. Marketing starts as driver recruitment during the build. | [roadmap](roadmap.md) |

## Answered

| #  | Question | Answer | Date |
| -- | -------- | ------ | ---- |
| A1 | Create a `main` branch so changes arrive as reviewable pull requests? | Yes | 2026-11-13 |
| A2 | What are the project phases? | 1 Design, 2 Build, 3 Beta, 4 Legal, company and marketing (Martin). See Q13 for the proposed adjustment. | 2026-11-13 |
