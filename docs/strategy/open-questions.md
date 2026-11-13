# Open questions

**Owner:** Martin · **Last reviewed:** 2026-11-13

Decisions the owner still needs to make. Each has a recommendation so work can
continue on that assumption. When a question is answered, record the answer
here, update or accept the linked ADR, and move the row to "Answered".

## Open

| #  | Question | Recommendation | Affects |
| -- | -------- | -------------- | ------- |
| Q5 | Business model after the beta: passenger service fee, driver fee, subscription, or free? | A small passenger service fee per booking, shown separately, from launch. The beta is free of fees, and ShareRide pays card fees (A19). | [ADR 0013](../decisions/0013-in-app-payments-only.md) |
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
| A10 | Can users suggest meeting points? | No. The operator curates every meeting point; users can report a problem with one. Feature B3 dropped. See [features](../product/features.md#decisions). | 2026-11-13 |
| A11 | Spec 2 (meeting points and place search) | Approved. The operator confirms every meeting point from local knowledge, without a required site visit; no street-address search in the beta. See [spec 2](../specs/2026-11-13-meeting-points.md#decisions). | 2026-11-13 |
| A12 | How do drivers adjust prices? (refines A5) | One price level for the whole trip, from free up to the cap; segment prices are computed from it. Stops along the route are added automatically. ADR 0012 supersedes ADR 0006. | 2026-11-13 |
| A13 | How is a driver's licence confirmed? (revises features decision 3) | A declaration tick box only; no expiry date and no spot checks. | 2026-11-13 |
| A14 | Which cars can drivers use? | Any car, including rental cars; ownership does not matter and being allowed to use the car is the driver's responsibility. Make, model and colour are required; the number plate can be added up to departure. | 2026-11-13 |
| A15 | Maximum number of stops per trip? (revises features decision 6) | No limit. | 2026-11-13 |
| A16 | Spec 3 (driver setup and posting a trip) | Approved with Martin's changes: one price level per trip (ADR 0012), stops added automatically with no limit, licence declaration only, any car, plate up to departure, make, model and colour public. See [spec 3](../specs/2026-11-13-post-a-trip.md#decisions). | 2026-11-13 |
| A17 | Spec 4 (search and trip details) | Approved as recommended: "Reykjavík" covers the whole capital area; the date is optional. See [spec 4](../specs/2026-11-13-search-and-trip-details.md#decisions). | 2026-11-13 |
| A18 | Q2 revisited: how do passengers pay? | Only through the app, from the beta. Pay when the booking is accepted; free cancellation with a full refund up to 15 minutes before departure. ADR 0013 supersedes ADR 0008 (A4). | 2026-11-13 |
| A19 | Payment details and spec 5 | Accepted as recommended: no refund for cancellations later than 15 minutes before boarding or for no-shows; ShareRide pays card fees in the beta (no service fee); drivers are paid 24 hours after the trip unless a problem is reported; no overlapping bookings per passenger; companions without accounts allowed. Spec 5 approved. | 2026-11-13 |
| A20 | Spec 13 (payments) | Approved as recommended: payouts must be set up before publishing a trip with a price; a lost chargeback is taken from the driver's payouts if the trip failed because of them, otherwise ShareRide carries it in the beta. See [spec 13](../specs/2026-11-13-payments.md#decisions). | 2026-11-13 |
| A21 | Spec 6 (changes and cancellations) | Approved as recommended: once people have booked, the departure can move by at most 2 hours; a passenger's cancellation counts on reliability only in the last 24 hours before boarding (plus no-shows), never for weather, road closures or after a move of more than 30 minutes. See [spec 6](../specs/2026-11-13-changes-and-cancellations.md#decisions). | 2026-11-13 |
| A22 | Spec 7 (chat, notifications and reminders) | Approved as recommended: SMS only to passengers within 24 hours of boarding, for a cancelled trip or booking, a move of more than 30 minutes or a changed meeting point; a chat becomes read-only 7 days after the trip; contact details may be sent in the chat once the booking is confirmed. See [spec 7](../specs/2026-11-13-chat-and-notifications.md#decisions). | 2026-11-13 |
