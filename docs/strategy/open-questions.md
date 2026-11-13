# Open questions

**Owner:** Martin · **Last reviewed:** 2026-11-13

Decisions the owner still needs to make. Each has a recommendation so work can
continue on that assumption. When a question is answered, record the answer
here, update or accept the linked ADR, and move the row to "Answered".

## Open

| #  | Question | Recommendation | Affects |
| -- | -------- | -------------- | ------- |
| Q5 | Business model after the beta: passenger service fee, driver fee, subscription, or free? | A small passenger service fee per booking, introduced with in-app payments. Free during the beta. | [ADR 0008](../decisions/0008-payments-phased.md) |
| Q6 | Which corridors open first? | Reykjavík–Hveragerði–Selfoss, Reykjavík–Reykjanesbær–Keflavík Airport, Reykjavík–Akranes–Borgarnes, Reykjavík–Akureyri, and Selfoss–Hvolsvöllur–Vík along the south coast. To be checked against waitlist demand. | [meeting points](../product/meeting-points.md) |
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
| A3 | Q1: Which stack? | Expo (React Native) for iOS, Android and web, with our own TypeScript API on PostgreSQL. ADRs 0002 to 0005 accepted. | 2026-11-13 |
| A4 | Q2: How do passengers pay in the beta? | They pay the driver directly (bank app or cash); the app shows the price. In-app payments come after launch. ADR 0008 accepted. | 2026-11-13 |
| A5 | Q3: Who sets segment prices? | The app suggests a cost-based price per segment; the driver can lower it or raise it up to a cost-sharing cap. ADR 0006 accepted; cap formula to be confirmed by the legal opinion. | 2026-11-13 |
| A6 | Q4: Default booking mode? | Driver chooses per trip; the default in the beta is request and approval. | 2026-11-13 |
| A7 | Q7: Minimum age? | 18. | 2026-11-13 |
| A8 | MVP feature list and its nine design questions | Accepted as recommended; see [features](../product/features.md#decisions). | 2026-11-13 |
| A9 | Spec 1 (sign-in and profiles) and its five questions | Accepted as recommended: browsing without an account, an age tick box, phone numbers from Iceland, the EEA, the UK, the US and Canada, photo required only for drivers, email optional. See [spec 1](../specs/2026-11-13-sign-in-and-profile.md#decisions). | 2026-11-13 |
