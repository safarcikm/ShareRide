# Privacy and GDPR

**Owner:** Martin · **Last reviewed:** 2026-11-13

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
| Account | Phone, email, first name, language, age confirmation (a yes and its date, no birth date) | Sign-in, contact | Contract | User; operator | While the account exists, plus a 7-day waiting period after deletion is asked for |
| Sign-in codes | Keyed hash of the phone number, keyed hash of the code, attempts, expiry; never the number or the code itself | Check that the person has the phone | Contract | System | Deleted when used or replaced by a newer code; expired codes deleted by the hourly clean-up |
| Sessions | Device name, platform, app version, sign-in and last-active times; tokens only as hashes | Keep people signed in; let them see and end sessions | Contract | The user (own devices); operator | Until signed out or 60 days unused (then ended by the hourly clean-up); ended sessions deleted 30 days after ending |
| Sign-in limits | Keyed hashes of the phone number, IP address and country calling code, with the time | Stop SMS fraud and number guessing | Legitimate interest | System | Needed for up to 24 hours (the daily cap per country); deleted after 24 hours by the hourly clean-up |
| Legal acceptances | Document, version, time and language of each acceptance | Show what each person agreed to | Contract; legal obligation | The user; operator | While the account exists (**verify** how long after deletion) |
| Blocked phone numbers | One-way hash of a suspended person's phone number | Stop suspended people signing up again | Legitimate interest | System | Until the suspension ends, at most 3 years |
| Data exports | The user's own export file | Access and portability | Legal obligation | The user | 7 days |
| Privacy requests | Request text and answer | Answer rights requests | Legal obligation | Operator | 3 years after the answer (**verify**) |
| Public profile | First name, photo, bio, languages, badges | Trust between users | Contract | All users | While the account exists |
| Women-only trips | Date of opting in, date access was withdrawn; no gender field ([spec 14](../specs/2026-11-13-women-only-trips.md#7-privacy-and-safety)) | Let women offer and book women-only trips | Consent (given with the switch, withdrawn by turning it off) | The user; operator. Everyone sees a trip's "Women only" label | Until turned off or the account is deleted; a withdrawal stays with its report |
| Vehicle | Make, model, colour, number plate | Identify the car at pickup | Contract | Make, model and colour: all users; number plate: booked passengers | While the account exists |
| Trips and bookings | Meeting points, times, seats, prices | Provide the service | Contract | Participants; operator | 3 years after the trip, then anonymised (**verify** period) |
| Messages | Chat between driver and passenger | Coordinate the trip | Contract | Participants; operator only when a report or a trip day dispute is filed | 12 months after the trip, unless part of a report |
| Trip day records | "I'm here" times (no location), no-show and missing-driver reports, dispute notes | Settle disagreements and payouts | Contract and legitimate interest | Operator; the other side sees only the outcome | With the booking |
| Reliability | Counts of trips and bookings kept and not kept | Trust between users | Legitimate interest | Figure and counts: all users; reasons: operator | Figure covers 12 months; records kept with the booking |
| Reviews and ratings | Rating, comment | Trust | Contract and legitimate interest | All users | While the subject's account exists |
| Reports and moderation | Report text, evidence, actions, statements of reasons, appeals | Safety | Legitimate interest; legal obligation where applicable | Operator; the reporter sees the outcome in general terms; the affected user sees the statement of reasons | 3 years after closure (**verify**) |
| Blocks | Who blocked whom | Keep people apart | Legitimate interest | The person who blocked | Until unblocked or either account is deleted |
| Audit log | Operator actions, record IDs, device and network address, before and after values | Accountability and security | Legitimate interest; legal obligation where applicable | Operator | 3 years (**verify**) |
| Verification | Phone verified, Auðkenni verified flag | Trust and safety | Consent (optional badges); contract (phone) | Badge public; details operator | While the account exists |
| Device and push tokens | Push token, app version | Notifications | Contract | System | Until sign-out or token expiry |
| Notification log | Recipient, kind of notification, channel, delivery status, time; no message text | Check that people were told | Contract and legitimate interest | Operator | 90 days |
| Approximate location (on request) | Device location to find nearby meeting points | Convenience | Consent (device permission) | Not stored | Not stored |
| Analytics | None in the beta ([spec 12](../specs/2026-11-13-beta-access-and-feedback.md#34-usage-analytics-j3)); if added later, usage events without names | Improve the product | Consent | Operator | 14 months |
| Waitlist | Email, role, corridors, language, how they heard | Invite people to the beta | Consent (email confirmation) | Operator | Until they leave, 30 days after sign-up, or 12 months if never invited |
| Feedback | Message, optional screenshot, app version, platform, screen | Improve the product | Legitimate interest | Operator | 12 months after the beta ends, or until the account is deleted |
| Search log | From and to place, date searched for, result count, time, platform; no user, device or network identifier | Beta metrics | Not personal data by design | Operator | 14 months |
| Technical logs | Request IDs, errors (logs, and Sentry error reports) | Security and reliability | Legitimate interest | Operator | 30 days |
| Payments | Amounts, provider references, refunds, payouts | Payment, accounting | Contract; legal obligation | Participants; operator | As bookkeeping law requires (**verify**) |
| Payout set-up (drivers) | Identity check and bank account, held by the payment provider | Paying drivers | Contract; legal obligation (provider's checks) | Provider; operator sees status only | Per the provider's terms |

## Providers

Each provider that touches personal data, chosen in an ADR. "DPA" is a data
processing agreement; Martin signs each one when he opens the account.

| Provider | Role | Personal data | Where | Decision | DPA |
| -------- | ---- | ------------- | ----- | -------- | --- |
| Render | Processor | Everything the API stores: the database, logs. Requests reach Render through Cloudflare (United States company), which ends TLS at its nearest edge and so handles every request in transit | Frankfurt, Germany (United States company); Cloudflare's edge nearest the user | [ADR 0018](../decisions/0018-hosting-on-render-frankfurt.md) | To sign; check that Render's DPA lists Cloudflare as a sub-processor |
| 46elks | Separate controller under telecom law | Phone number; the message text is not kept (`dontlog`) | Sweden | [ADR 0019](../decisions/0019-sms-with-46elks.md) | Not needed by its terms; ask for one if the lawyer advises |
| Sentry | Processor | Scrubbed error reports: the error with its stack and nearby source lines, release, route pattern, request ID, request method and path, user agent and language, server runtime and system versions, and the API's outgoing requests (method, address, status); from the app also the app version, the browser or phone model and system, and the API requests just before the error, and from the web app the screen's path and the screens visited before it; never taps, typing, console output, screenshots, replays or usage sessions. Crash reports from the phones' native code start with the phone builds and are checked against this row then. Sentry sees the network address a report comes from and is set not to store it. No request bodies, cookies, query strings or query values; phone numbers, codes, tokens, email addresses and kennitölur are removed from all text | Frankfurt, Germany (United States company) | [ADR 0020](../decisions/0020-error-tracking-with-sentry-eu.md) | To sign |
| MapTiler | Processor | Network address and the map area viewed, with each tile request | Switzerland (adequacy decision) | [ADR 0021](../decisions/0021-map-tiles-from-maptiler.md) | To sign |
| Hetzner | Processor | Profile photos | Helsinki, Finland | [ADR 0022](../decisions/0022-photo-storage-on-hetzner.md) | To sign |
| Apple and Google | Separate controllers, at the person's choice | Their account ID and email, when the person signs in with them | Their own terms | [Spec 1](../specs/2026-11-13-sign-in-and-profile.md) | Not applicable |

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
- [ ] Privacy policy (Icelandic and English)
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

- Personal data columns are tagged in the schema and listed in the record of
  processing activities.
- No personal data in logs, analytics events, error reports or URLs.
- Production data never copied to staging or development.
- Privacy impact is a checkbox in every PR template.
- Retention jobs are tested like any other feature.

## Retention

Retention periods in the inventory are proposals. Final values are set with the
lawyer, then implemented as scheduled jobs and listed in the privacy policy.

## Age

Accounts are for people aged 18 and over (decided 2026-11-13).
