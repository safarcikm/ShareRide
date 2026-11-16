# Privacy and GDPR

**Owner:** Martin · **Last reviewed:** 2026-11-15

> Working plan, not legal advice. The privacy policy and data protection
> impact assessment are reviewed by a lawyer before the beta.

## Framework

- The GDPR applies in Iceland through the EEA Agreement, together with the
  **Act on Data Protection and the Processing of Personal Data No. 90/2018**.
- The supervisory authority is **Persónuvernd** (the Icelandic Data
  Protection Authority).
- The ShareRide company is the **controller**. Hosting, SMS, email, push,
  analytics, error tracking, identity and payment providers are
  **processors** (or separate controllers, for some identity and payment
  providers) and each needs a data processing agreement.
- All personal data stays in the EEA
  ([ADR 0007](../decisions/0007-eea-hosting-and-data-residency.md)).

## Principles we apply

1. **Collect less.** Last name, kennitala, home address and exact location are
   not needed and not collected.
2. **Show less.** Public profiles show first name, photo, bio, languages,
   badges and ratings, and the car's make, model and colour on trips. The
   number plate and exact pickup details are shown only to booked passengers. Phone numbers are never shown; people talk in the
   in-app chat.
3. **Keep less.** Every category has a retention period, enforced by scheduled
   jobs.
4. **Explain.** Plain-language privacy policy in Icelandic and English, and
   short explanations at the point of collection.
5. **Give control.** Export, correct and delete from the app without contacting
   support.

## Data inventory (draft)

| Category | Examples | Purpose | Legal basis | Visible to | Retention |
| -------- | -------- | ------- | ----------- | ---------- | --------- |
| Account | Phone, email (only once verified, with when), first name, language, age confirmation (a yes and its date, no birth date) | Sign-in, contact | Contract | User; operator | While the account exists, plus a 7-day waiting period after deletion is asked for |
| Email links | An address the person entered to add, a hash of the link's token (never the token), when the link was asked for, opened or refused by the email provider | Check that the address is theirs before using it (plan 4.6) | Contract | System; the person sees the address waiting in Settings | A day: links are deleted by the hourly clean-up a day after they were sent, used or not. Only the newest works |
| Sign-in codes | Keyed hash of the phone number, keyed hash of the code, attempts, expiry; never the number or the code itself (the SMS provider keeps its own record of the text it sent, see [Providers](#providers)) | Check that the person has the phone | Contract | System | Deleted when used or replaced by a newer code; expired codes deleted by the hourly clean-up |
| Sessions | Device name, platform, app version, sign-in and last-active times; tokens only as hashes | Keep people signed in; let them see and end sessions | Contract | The user (own devices); operator | Until signed out or 60 days unused (then ended by the hourly clean-up); ended sessions deleted 30 days after ending |
| Operator console sessions | The operator's own: browser and system from the user agent, sign-in, last-use and end times, why it ended; the token only as a hash ([ADR 0028](../decisions/0028-operator-console-web-app-and-passkeys.md)) | Keep the operator signed in to the console, briefly | Legitimate interest (securing the service) | The operator | Ended 30 minutes after last use or 12 hours after sign-in; deleted 30 days after ending by the hourly clean-up |
| Audit log | Every operator action: who (the operator's ID), what, on which record (its ID), when, the operator's IP address and user agent, and the changed fields of operator-curated records; for a person's record only the IDs and the names of the fields changed, never their values ([spec 9, 3.8](../specs/2026-11-13-safety-and-moderation.md#38-audit-log-h3)) | Accountability for operator actions; answer complaints and appeals | Legitimate interest; legal obligation where a decision must be explained | Operator | 3 years (**verify**); the database refuses changes and earlier deletes |
| Sign-in limits | Keyed hashes of the phone number, IP address (of its /64 network for IPv6) and country calling code, with the time | Stop SMS fraud and number guessing | Legitimate interest | System | Needed for up to 24 hours (the daily cap per country); deleted after 24 hours by the hourly clean-up |
| Search limits | Keyed hash of the IP address (of its /64 network for IPv6), with the times of its searches and trip pages opened; never the searched places or trips | Stop scraping (spec 4, section 7) | Legitimate interest | System | In the API server's memory only, for at most an hour; never written to the database or logs, and gone when the server restarts |
| Legal acceptances | Document, version, time and language of each acceptance | Show what each person agreed to | Contract; legal obligation | The user; operator | While the account exists (**verify** how long after deletion) |
| Blocked phone numbers | One-way hash of a suspended person's phone number | Stop suspended people signing up again | Legitimate interest | System | Until the suspension ends, at most 3 years |
| Data exports | The user's own export file | Access and portability | Legal obligation | The user | 7 days |
| Privacy requests | Request text and answer | Answer rights requests | Legal obligation | Operator | 3 years after the answer (**verify**) |
| Public profile | First name, photo, bio, languages, badges | Trust between users | Contract | All users | While the account exists |
| Women-only trips | Date of opting in, date access was withdrawn; no gender field ([spec 14](../specs/2026-11-13-women-only-trips.md#7-privacy-and-safety)) | Let women offer and book women-only trips | Consent (given with the switch, withdrawn by turning it off) | The user; operator. Everyone sees a trip's "Women only" label | Until turned off or the account is deleted; a withdrawal stays with its report |
| Vehicle | Make, model, colour, number plate | Identify the car at pickup | Contract | Make, model and colour: all users; number plate: booked passengers | Until the driver removes the car or the account is deleted; a removed car that published trips used is kept with them |
| Driving licence declaration | The date the driver declared they hold a valid licence; no licence number, copy or kennitala ([spec 3](../specs/2026-11-13-post-a-trip.md#33-driving-licence-declaration)) | Let drivers publish trips; hold them to the declaration | Contract | The user; operator | While the account exists |
| Trips and bookings | Meeting points, times, seats, prices | Provide the service | Contract | Participants; operator. A trip's stops, times, prices, free seats, preferences and note, with the driver's first name and the car's make, model and colour: anyone who searches (published trips, and trips under way at their later stops, A45) or opens the front page, which lists the 50 soonest without a search ([spec 4, 3.8](../specs/2026-11-13-search-and-trip-details.md#38-rides-leaving-soon)) (published trips), or has its link (published, departed, completed or cancelled trips, until a week after the last stop, A40), never indexed by search engines ([spec 4](../specs/2026-11-13-search-and-trip-details.md#7-privacy-and-safety), R4.6) | 3 years after the trip, then anonymised (**verify** period) |
| Booking requests | The passenger's message to the driver with a request (no contact details, R5.6); the reason a driver declined, if they gave one; the passenger's first name and the month they joined, shown to the driver | Let the driver decide on a request | Contract | Message: the passenger and the trip's driver. Decline reason: operator only (R5.7). Number plate and where to stand: the passenger once the booking is confirmed (R5.12) | With the booking |
| Cancellations | Who cancelled a booking or a trip and when, the reason chosen from a fixed list, a note if a driver writes one (up to 500 characters, without contact details; a trip's note is kept on the trip and on each of its bookings and requests), the refund, and whether it counts on reliability ([spec 6](../specs/2026-11-13-changes-and-cancellations.md#7-privacy-and-safety), R6.7) | Refund by fixed rules (rule M2), tell the other side, reliability (spec 8) | Contract and legitimate interest | Reason, note and refund: the passenger and the trip's driver; whether it counts: only the person who cancelled; operator | With the booking |
| Trip changes | Each change the driver saves to a published trip: what changed (the departure, the seats, the price level, the car, a stop added or removed, how people book, or the preferences and note), the value before and after, and when. For the note, only whether it changed, never its text. For the car, its make, model and colour, never its number plate. For a stop added or removed, the meeting point and its planned time ([spec 6, 3.2](../specs/2026-11-13-changes-and-cancellations.md#32-changing-a-published-trip)) | Moves, new cars and stops added or removed: tell passengers what changed since they booked, and free cancellation after a move of more than 30 minutes (R6.3). Other changes: answer questions about what the trip offered and when it changed | Contract | Moves, new cars and stops added or removed: the trip's driver, and each passenger booked before the change (a move at their own stop). Other changes: operator only | With the trip |
| Trip drafts | Route, times, seats, price level, preferences and note of a trip not yet published | Let the driver finish posting later | Contract | The driver; operator | Deleted 30 days after the last change or once the departure has passed (R3.11), by the hourly clean-up |
| Messages | Chat between driver and passenger: text as written (phone numbers and links allowed, spec 7 decision 3), quick messages and lines about the booking, who sent each, when, and when it was read | Coordinate the trip | Contract | Participants; operator only when a report or a trip day dispute is filed | 12 months after the trip, unless part of a report |
| Trip day records | "I'm here": who said it at which stop and when, never a location (spec 8, R8.3); no-show and missing-driver reports, dispute notes | Tell the other side someone is at the meeting point; settle disagreements and payouts | Contract and legitimate interest | "I'm here": the passenger and the trip's driver, each the other's at the passenger's stop, and the driver each passenger's; operator. Reports: operator; the other side sees only the outcome | With the booking; on account deletion, linked to the former member |
| Reliability | Counts of trips and bookings kept and not kept | Trust between users | Legitimate interest | Figure and counts: all users; reasons: operator | Figure covers 12 months; records kept with the booking |
| Reviews and ratings | Rating, comment | Trust | Contract and legitimate interest | All users | While the subject's account exists |
| Reports and moderation | Report text, evidence, actions, statements of reasons, appeals | Safety | Legitimate interest; legal obligation where applicable | Operator; the reporter sees the outcome in general terms; the affected user sees the statement of reasons | 3 years after closure (**verify**) |
| Blocks | Who blocked whom | Keep people apart | Legitimate interest | The person who blocked | Until unblocked or either account is deleted |
| Audit log | Operator actions, record IDs, device and network address, before and after values | Accountability and security | Legitimate interest; legal obligation where applicable | Operator | 3 years (**verify**) |
| Verification | Phone verified, Auðkenni verified flag | Trust and safety | Consent (optional badges); contract (phone) | Badge public; details operator | While the account exists |
| Device and push tokens | The Expo push token of each signed-in phone, its platform (iOS or Android) and when it was registered; Expo's ticket for each push sent, until its receipt is checked | Send pushes to the right phone, and stop sending to dead tokens | Contract | System | The token: until the phone signs out, is signed out from another device, ends after being idle, registers the token for someone else, or Expo reports it dead. Tickets: until checked, at most 24 hours |
| Notification log | Recipient, kind of notification, the booking, trip or message it is about, channel, delivery status and attempts, the provider's reference, time; no text. The events that lead to it hold IDs only | Check that people were told | Contract and legitimate interest | Operator | 90 days; the events 7 days once processed. Both by the hourly clean-up |
| Notification settings | Whether trip reminders are on (and later beta news, spec 10); a row only once the person changes one | Respect what the person turned off (spec 7, R7.8) | Contract | The person, in Settings | While the account exists |
| Approximate location (on request) | Device location to find nearby meeting points | Convenience | Consent (device permission) | Not stored | Not stored |
| Analytics | None in the beta ([spec 12](../specs/2026-11-13-beta-access-and-feedback.md#34-usage-analytics-j3)); if added later, usage events without names | Improve the product | Consent | Operator | 14 months |
| Waitlist | Email, role, corridors, language, how they heard | Invite people to the beta | Consent (email confirmation) | Operator | Until they leave, 30 days after sign-up, or 12 months if never invited |
| Feedback | Message, optional screenshot, app version, platform, screen | Improve the product | Legitimate interest | Operator | 12 months after the beta ends, or until the account is deleted |
| Recent searches | The last five searches: from and to with their names, date and seats | One-tap repeat (spec 4, 3.1) | Kept only on the device; ShareRide never receives it. Functional storage the person asked for, so no consent banner (ePrivacy, strictly necessary) (**verify**) | The person using that device | Until newer searches replace it, the person taps "Clear recent searches", or the app's or site's data is cleared, or the app is deleted (they are kept in the app's own storage, not the secure storage that iOS can keep after the app is removed) |
| Booking chosen before signing up | The trip's ID, where to get in and out, and the seats chosen by someone without a finished account | Open the booking screen with the same choice once the account is ready (spec 5, 3.1, item 1) | Kept only on the device, in the app's own storage, which goes when the app is deleted (the browser's storage on the web); ShareRide never receives it from there. Functional storage for what the person asked for, so no consent banner (ePrivacy, strictly necessary) (**verify**) | The person using that device | Removed once the account is ready and the choice is used; a choice older than an hour is ignored. Otherwise until the app's or site's data is cleared |
| Offer to drive chosen before signing up | The time "Offer a ride" was pressed by someone without a finished account; nothing else | Open Offer, the first step of posting a trip, once the account is ready (spec 1, 3.1, item 3; spec 16, 3.6) | Kept only on the device, in the app's own storage, which goes when the app is deleted (the browser's storage on the web); ShareRide never receives it. Functional storage for what the person asked for, so no consent banner (ePrivacy, strictly necessary) (**verify**) | The person using that device | Removed once the account is ready and the offer is used, or when a booking is chosen after it; an offer older than an hour is ignored. Otherwise until the app's or site's data is cleared |
| Booking kept after a move | That "Keep my booking" was pressed: the booking's ID and when the trip last moved; nothing else | Stop offering to cancel a booking moved more than 30 minutes once the passenger chose to keep it, until the trip moves again ([spec 6, 3.2](../specs/2026-11-13-changes-and-cancellations.md#32-changing-a-published-trip)) | Kept only on the device, in the app's own storage, which goes when the app is deleted (the browser's storage on the web); ShareRide never receives it. Functional storage the person asked for, so no consent banner (ePrivacy, strictly necessary) (**verify**) | The person using that device | Until the app is deleted or its storage cleared |
| Notifications prompt answered | The IDs of the last 20 bookings and trips whose prompt to turn on notifications or add an email was answered, with no answer itself | Ask once per booking, trip posted or request accepted (spec 7, 3.6.2) | Kept only on the device, in the app's own storage, which goes when the app is deleted (the browser's storage on the web); ShareRide never receives it. Functional storage for what the person asked for, so no consent banner (ePrivacy, strictly necessary) (**verify**) | The person using that device | Until 20 newer ones replace it, or the app's or site's data is cleared |
| Search log | From and to place, date searched for, result count, time, platform; no user, device or network identifier | Beta metrics | Not personal data by design | Operator | 14 months |
| Technical logs | Request IDs, errors (logs, and Sentry error reports) | Security and reliability | Legitimate interest | Operator | 30 days |
| Payments | Amounts, status (pending, succeeded, failed, refund owed, refunded), provider references, refunds, payouts; never card details, which only the provider sees (R13.2). Until the provider is chosen, local and staging use a test provider: no card is asked for and no money moves | Payment, accounting | Contract; legal obligation | Participants; operator | As bookkeeping law requires (**verify**) |
| Payout set-up (drivers) | Identity check and bank account, held by the payment provider | Paying drivers | Contract; legal obligation (provider's checks) | Provider; operator sees status only | Per the provider's terms |

## Providers

Each provider that touches personal data, chosen in an ADR. "DPA" is a data
processing agreement; Martin signs each one when he opens the account.

| Provider | Role | Personal data | Where | Decision | DPA |
| -------- | ---- | ------------- | ----- | -------- | --- |
| Render | Processor | Everything the API stores: the database, logs. Requests reach Render through Cloudflare (United States company), which ends TLS at its nearest edge and so handles every request in transit | Frankfurt, Germany (United States company); Cloudflare's edge nearest the user | [ADR 0018](../decisions/0018-hosting-on-render-frankfurt.md) | To sign; check that Render's DPA lists Cloudflare as a sub-processor |
| Vonage | Processor | Phone number and the message text (the sign-in code, which works once and for ten minutes; or that the driver cancelled a booking or the trip, with its day and time and whether it is refunded, or that the departure moved, with its day and new time and whether a full refund is offered; no names or places): 13 months in its message records, 10 to 30 days in its server logs, unless redacted (its Redact API, free on request, removes the text from the records) | Stored in Dublin and Frankfurt; processing not limited to the EU (support, fraud checks and reporting from elsewhere) (United States company) | [ADR 0023](../decisions/0023-sms-with-vonage.md) | To sign |
| 46elks (fallback, used only if switched to) | Separate controller under telecom law | Phone number; the message text is not kept (`dontlog`) | Sweden | [ADR 0023](../decisions/0023-sms-with-vonage.md) | Not needed by its terms; ask for one if the lawyer advises |
| Sentry | Processor | Scrubbed error reports: the error with its stack and nearby source lines, release, route pattern, request ID, request method and path, user agent and language, server runtime and system versions, and the API's outgoing requests (method, address, status); from the app also the app version, the browser or phone model and system, and the API requests just before the error, and from the web app the screen's path and the screens visited before it; never taps, typing, console output, screenshots, replays or usage sessions. Crash reports from the phones' native code are not sent yet (phone builds have no DSN) and are checked against this row before they are (milestone 2 plan, PR 5b). Sentry sees the network address a report comes from and is set not to store it. No request bodies, cookies, query strings or query values; phone numbers, codes, tokens, email addresses and kennitölur are removed from all text | Frankfurt, Germany (United States company) | [ADR 0020](../decisions/0020-error-tracking-with-sentry-eu.md) | To sign |
| Hetzner | Processor | Profile photos | Helsinki, Finland | [ADR 0022](../decisions/0022-photo-storage-on-hetzner.md) | To sign |
| Expo (push) | Processor | Push tokens and each push: its title and text (first names, places, times, a chat message's text; never the details in R7.9) and the screen it opens. Expo keeps the contents only until it hands them to Apple (iPhones) or Google (Android phones), its sub-processors for push | United States (United States company), and Apple's and Google's push services; transfer under the EU-US Data Privacy Framework (**verify** the three listings) | [ADR 0026](../decisions/0026-push-through-expo.md) | To sign |
| Mailjet (email) | Processor | The verified email address and each email: its subject and text (first names, places, times and the screen's link; never a chat message's text or the details in R7.9), with our delivery ID. Open and click tracking off. Mailjet keeps sent messages and their events in its logs (**verify** for how long, and whether the contents can be removed). Its support sub-processors (Atlassian, Zendesk) are American (**verify** whether they can see contents) | Google Cloud in Germany and Belgium (French company, owned by Sinch, Swedish) | [ADR 0027](../decisions/0027-email-through-mailjet.md) | To sign |
| Apple and Google | Separate controllers, at the person's choice | Their account ID and email, when the person signs in with them | Their own terms | [Spec 1](../specs/2026-11-13-sign-in-and-profile.md) | Not applicable |
| Apple (TestFlight) | To confirm before testers outside the team join (the beta) | Testers' names and email addresses; each tester's installs, sessions, crash counts, phone model and system version; crash reports; and the feedback testers send, which can include a screenshot. Testers are the team until the beta | United States; the transfer basis (perhaps the EU-US Data Privacy Framework) to check before the beta | [ADR 0003](../decisions/0003-cross-platform-client-expo.md), [app builds](../operations/app-builds.md) | Apple Developer Program License Agreement; check it before the beta |

## Rights in the app

| Right | How |
| ----- | --- |
| Access and portability | "Download my data" produces a machine-readable file and a readable summary |
| Rectification | Edit profile; contact support for other data |
| Erasure | "Delete my account": after any open bookings are resolved and a 7-day waiting period, removes the profile, anonymises trips and bookings, and deletes messages; reviews written stay as by "a former member" ([spec 11](../specs/2026-11-13-privacy-self-service.md#35-what-is-erased-and-what-is-kept)) |
| Objection and restriction | Contact form routed to the operator; answered within one month |
| Withdraw consent | Settings for analytics, marketing, optional verification and women-only trips |

## Required documents before the beta

- [ ] Record of processing activities (from the inventory above)
- [ ] Data protection impact assessment: likely required, because we
      systematically process travel patterns and connect strangers
- [ ] Privacy policy (Icelandic and English); first English
      [draft](legal-texts/privacy-policy.md) for the lawyer (2026-11-16)
- [ ] Data processing agreements with every provider
- [ ] Cookie and consent banner for the web, if any non-essential cookies are
      used
- [ ] Breach response procedure (below)

## Breaches

1. Contain the breach and preserve evidence.
2. Record it in the breach log, even if no notification is needed.
3. Notify Persónuvernd within 72 hours if it is likely to risk people's rights
   and freedoms.
4. Tell affected users without undue delay if the risk is high, with what
   happened and what they should do.
5. Write a post-incident note and fix the cause.

## Privacy in engineering

- Every table is listed in `packages/db/src/personal-data.ts` with the kind
  of personal data it holds, the part of "Download my data" it feeds, the
  columns that hold a person's ID, and what erasing an account does to its
  rows, column by column for rows that are kept. A test fails for a table,
  a person's ID column (a UUID column with a key to `users` or with none)
  or a text column of a kept row that is not listed. IDs inside JSON values
  are not checked, so tables keep a person's ID in a column of its own.
  What deletion does to each kind of data is in the domain
  (`deletionEffects`, spec 11, 3.5).
- No personal data in logs, analytics events, error reports or URLs.
- Production data never copied to staging or development.
- Privacy impact is a checkbox in every PR template.
- Retention jobs are tested like any other feature.

## Retention

Retention periods in the inventory are proposals. Final values are set with the
lawyer, then implemented as scheduled jobs and listed in the privacy policy.

## Age

Accounts are for people aged 18 and over (decided 2026-11-13).
