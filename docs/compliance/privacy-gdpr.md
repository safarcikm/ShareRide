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
| Account | Phone, email, first name, language | Sign-in, contact | Contract | User; operator | While the account exists |
| Public profile | First name, photo, bio, languages, badges | Trust between users | Contract | All users | While the account exists |
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
| Analytics | Usage events without names | Improve the product | Consent | Operator | 14 months |
| Search log | From and to place, date searched for, result count, time, platform; no user, device or network identifier | Beta metrics | Not personal data by design | Operator | 14 months |
| Technical logs | Request IDs, errors | Security and reliability | Legitimate interest | Operator | 30 days |
| Payments | Amounts, provider references, refunds, payouts | Payment, accounting | Contract; legal obligation | Participants; operator | As bookkeeping law requires (**verify**) |
| Payout set-up (drivers) | Identity check and bank account, held by the payment provider | Paying drivers | Contract; legal obligation (provider's checks) | Provider; operator sees status only | Per the provider's terms |

## Rights in the app

| Right | How |
| ----- | --- |
| Access and portability | "Download my data" produces a machine-readable file and a readable summary |
| Rectification | Edit profile; contact support for other data |
| Erasure | "Delete my account": removes the profile, anonymises trips, bookings and reviews, and deletes messages, after any open bookings are resolved |
| Objection and restriction | Contact form routed to the operator; answered within one month |
| Withdraw consent | Settings for analytics, marketing and optional verification |

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
