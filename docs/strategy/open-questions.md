# Open questions

**Owner:** Martin · **Last reviewed:** 2026-11-13

Decisions the owner still needs to make. Each has a recommendation so work can
continue on that assumption. When a question is answered, record the answer
here, update or accept the linked ADR, and move the row to "Answered".

## Open

None right now (2026-11-13). A new question goes in a table here with the
next free number (Q15 onwards), a recommendation and the docs it affects.

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
| A23 | Spec 8 (trip day, reviews and reliability) | Approved as recommended: weather and road-closure reasons are trusted in the beta and the operator can overrule them; a driver can mark a no-show 10 minutes after the planned time; reliability is one figure across both roles over 12 months, shown once 5 trips or bookings count, with an operator watch list below 80%. See [spec 8](../specs/2026-11-13-trip-day-reviews-and-reliability.md#decisions). | 2026-11-13 |
| A24 | Spec 9 (safety and moderation) | Approved as recommended: blocking offers to cancel a shared booking under the normal rules, with a full refund only after a safety report; a suspension leaves access to one's data only and cancels upcoming trips and bookings with full refunds to the others; no pre-moderation; every report answered within 24 hours, safety alerts by push and SMS from 07:00 to 23:00. See [spec 9](../specs/2026-11-13-safety-and-moderation.md#decisions). | 2026-11-13 |
| A25 | Spec 10 (operator settings and metrics) | Approved as recommended: suggested rate 15 kr per km per passenger and reference cost 150 kr per km (state mileage allowance from 1 June 2026), both to be confirmed by the legal opinion; the beta targets from the vision, over the last 4 weeks on the launch corridors; testers can turn off announcements with "Beta news". See [spec 10](../specs/2026-11-13-operator-settings-and-metrics.md#decisions). | 2026-11-13 |
| A26 | Spec 11 (privacy self-service) | Approved as recommended: account data is erased 7 days after deletion is asked for, with an undo until then; a suspended person's phone number is kept only as a one-way hash until the suspension ends, at most 3 years, so they cannot sign up again. See [spec 11](../specs/2026-11-13-privacy-self-service.md#decisions). | 2026-11-13 |
| A27 | Spec 12 (beta access and feedback) | Approved as recommended: anyone can browse and search on the website during the beta, only invited testers can book, post or chat; a corridor's drivers are invited two weeks before its passengers, then weekly waves of about 25 passengers per corridor, up to 150 testers; no usage analytics in the beta (J3 dropped). All MVP specs are approved. See [spec 12](../specs/2026-11-13-beta-access-and-feedback.md#decisions). | 2026-11-13 |
| A28 | Q5: business model after the beta | A small passenger service fee per booking, shown separately, from public launch; drivers keep their whole contribution. The beta has no fee. The amount is decided before launch from beta data ([ADR 0014](../decisions/0014-passenger-service-fee-from-launch.md)). | 2026-11-13 |
| A29 | Q8: identity checks | As recommended: phone verification for everyone; drivers declare a valid licence; Auðkenni later as an optional badge ([ADR 0010](../decisions/0010-authentication-and-identity.md) accepted). | 2026-11-13 |
| A30 | Q9: languages at launch | As recommended: Icelandic and English; Polish in Phase 5 ([ADR 0011](../decisions/0011-localization.md) accepted). | 2026-11-13 |
| A31 | Q10: licence for the code | Proprietary, all rights reserved; the repository stays private. | 2026-11-13 |
| A32 | Q11: brand and domain | Keep "ShareRide" as the name for now, with the option to change it later. The name lives in one place in the app's configuration and texts, so a rename stays cheap. | 2026-11-13 |
| A33 | Q13: legal and company work in Phase 1 | Yes, as a parallel track: the legal opinion, company, terms, privacy policy and insurance before the beta. | 2026-11-13 |
| A34 | Remaining proposed ADRs | ADRs 0007 (EEA hosting), 0009 (maps and routing), 0010 (authentication and identity) and 0011 (Icelandic and English) accepted as written. | 2026-11-13 |
| A35 | Q6: which corridors open first | As recommended: the beta opens with three commuter corridors, Reykjavík–Hveragerði–Selfoss, Reykjavík–Reykjanesbær–Keflavík Airport and Reykjavík–Akranes–Borgarnes, plus the capital area hubs. Reykjavík–Akureyri is added if the waitlist shows demand; Selfoss–Hvolsvöllur–Vík later ([meeting points](../product/meeting-points.md#launch-corridors)). | 2026-11-13 |
| A36 | Q12: women-only trips | Yes, in the MVP (changed by Martin from the recommendation to wait for the beta). For women only; everyone can see these trips, only women who have opted in can book them; a private self-declaration with no gender field. See [spec 14](../specs/2026-11-13-women-only-trips.md#decisions) (approved) and [ADR 0015](../decisions/0015-women-only-trips.md) (accepted); subject to the legal opinion. | 2026-11-13 |
| A37 | Q14: sign-in with the Better Auth library or our own module? | Our own small sign-in module in the API, so spec 1 is built as written: no placeholder emails, rotating refresh tokens with reuse detection, every rule tested. [ADR 0016](../decisions/0016-own-sign-in-module.md) accepted; it replaces only the implementation choice in [ADR 0010](../decisions/0010-authentication-and-identity.md). | 2026-11-13 |
