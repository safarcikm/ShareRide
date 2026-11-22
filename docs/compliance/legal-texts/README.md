# Legal texts (drafts for the lawyer)

**Owner:** Martin · **Last reviewed:** 2026-11-16

> **Status: first drafts, for the lawyer.** Claude wrote them on 2026-11-16 from
> the approved specs and rules, for an Icelandic lawyer to review. They are not
> legal advice. Version 2 of each, adapted from them to the open beta (paying
> the driver in person, no invite code, no women-only trips) and in Icelandic
> too, is what the app shows: it is published from
> `packages/db/src/legal/texts` ([ADR 0043](../../decisions/0043-legal-documents-published-from-the-repository.md)).
> The lawyer's changes become the next version of each. The Privacy Policy
> is at version 3 already: Google Analytics on the website, after consent
> ([spec 23](../../specs/2026-11-22-google-analytics-and-search.md)).

| Document | At sign-up | Draft |
| -------- | ---------- | ----- |
| Terms of Service | Accepted, with the age confirmation | [terms-of-service.md](terms-of-service.md) |
| Community Rules | Accepted | [community-rules.md](community-rules.md) |
| Privacy Policy | Shown and linked; information, not accepted | [privacy-policy.md](privacy-policy.md) |

## How they fit the app

- The app stores each version of each document in English and Icelandic,
  records who accepted which version, and asks everyone to accept again after
  a material change ([spec 1, 3.4](../../specs/2026-11-13-sign-in-and-profile.md#34-terms-and-age)).
- The drafts are in English. The Icelandic text is written once the lawyer's
  changes are in, so it is translated only once, and a native speaker checks
  it before the beta (roadmap, milestone 16).
- Placeholders are in square brackets, such as `[Company name] ehf.`. They
  are filled in once the company is registered and the payment provider is
  chosen. Until the company is registered, version 2 names Martin Safarcik
  as the operator and controller.

## Where each part comes from

Every promise in the drafts follows a rule that is already decided. If a rule
changes, the text changes in the same PR.

| Topic | Source |
| ----- | ------ |
| Cost sharing, the price cap, prices | [Pricing and seats](../../product/pricing-and-seats.md#prices), [ADR 0012](../../decisions/0012-trip-price-level.md) |
| Paying, refunds, payouts, chargebacks | [Pricing and seats](../../product/pricing-and-seats.md#payment-and-refunds), [spec 13](../../specs/2026-11-13-payments.md), [ADR 0013](../../decisions/0013-in-app-payments-only.md); paying the driver in person until then, [ADR 0038](../../decisions/0038-pay-the-driver-in-person-until-card-payments.md) |
| Booking modes and deadlines | [Pricing and seats](../../product/pricing-and-seats.md#booking-modes), [spec 5](../../specs/2026-11-13-booking-and-requests.md) |
| Changes and cancellations | [Pricing and seats](../../product/pricing-and-seats.md#trip-changes-after-bookings-exist), [spec 6](../../specs/2026-11-13-changes-and-cancellations.md) |
| Trip day, no-shows, reviews, reliability | [Spec 8](../../specs/2026-11-13-trip-day-reviews-and-reliability.md) |
| Chat and notifications | [Spec 7](../../specs/2026-11-13-chat-and-notifications.md) |
| Reports, blocks, moderation, appeals | [Spec 9](../../specs/2026-11-13-safety-and-moderation.md) |
| Women-only trips | [Spec 14](../../specs/2026-11-13-women-only-trips.md), [ADR 0015](../../decisions/0015-women-only-trips.md) |
| Account, age, sign-up | [Spec 1](../../specs/2026-11-13-sign-in-and-profile.md) |
| Drivers, cars, the licence declaration | [Spec 3](../../specs/2026-11-13-post-a-trip.md) |
| The closed beta | [Spec 12](../../specs/2026-11-13-beta-access-and-feedback.md) |
| Personal data, providers, retention | [Privacy and GDPR](../privacy-gdpr.md), [spec 11](../../specs/2026-11-13-privacy-self-service.md) |

## Choices in the drafts that no spec made

Ordinary terms for a service like this, which Martin and the lawyer should
confirm or strike:

- A change to the terms never affects a booking that is already confirmed
  (terms, 17.2).
- We may end the beta for everyone with reasonable notice (terms, 16.2).
- People give us a free licence to show what they add, and may not copy the
  service's data in bulk (terms, section 14).
- A cap on our total liability, left blank for the lawyer (terms, 15.4).
- We share data with the police or other authorities only when the law
  requires it, or to protect someone's life or safety (privacy policy,
  section 5).

## Questions for the lawyer about these drafts

These add to the brief in
[legal and regulatory](../legal-and-regulatory.md#9-questions-for-the-lawyer-phase-1-brief),
section 9, whose answers may change the drafts too.

1. **Our role.** The terms say PuffinRide is an intermediary, the ride is an
   agreement between the driver and the passenger, and the driver shares
   costs rather than selling a service. Is that wording right for the Taxi
   Act and for consumer law, and does collecting payment in the app change
   it?
2. **Payments.** The terms say a licensed provider holds the passenger's
   money and pays it out to the driver. How should our role in the payment be
   described (for example as the driver's agent for collecting payment), and
   what must the terms say about the provider?
3. **Cancellation terms.** A passenger who cancels less than 15 minutes
   before boarding, or doesn't turn up, gets no refund, and the driver is
   paid. Is that fair and enforceable under the Contracts Act No. 7/1936
   (article 36) and the consumer rules? Does any right of withdrawal apply,
   or is a dated passenger transport service exempt?
4. **Liability.** Section 15 of the terms limits our liability as far as the
   law allows. Is the wording enforceable against consumers in Iceland, and
   what must stay unlimited?
5. **Insurance.** The terms tell drivers that their compulsory motor
   insurance applies and that they must tell their insurer about cost
   sharing if it requires. Is that accurate, and what do the insurers say
   (roadmap, legal track)?
6. **Chargebacks.** A lost chargeback is taken from the driver's later
   payouts when the trip did not happen because of the driver (rule M5). Can
   the terms allow that?
7. **Moderation.** Do the statement of reasons, the 14-day appeal and the
   point of contact meet the Digital Services Act, if it applies in Iceland?
   Must our final answer to an appeal also point to other ways to seek
   redress, such as out-of-court dispute settlement or the courts?
8. **Disputes.** Which law, complaints body and court should the terms name
   for consumers, and is the Complaints Committee on Goods and Services
   (Kærunefnd vöru- og þjónustukaupa) the right body?
9. **Retention.** The privacy policy marks periods still to confirm (such as
   trips and bookings for 3 years, reports for 3 years after closure, and
   payment records for the bookkeeping period). What should they be?
10. **Transfers.** Vonage may process SMS outside the EEA and Expo sends
    pushes through the United States. Is the EU-US Data Privacy Framework
    enough, and must the policy name each country?
11. **Before the company exists.** The texts name `[Company name] ehf.` as
    the contracting party and the controller. The beta starts only after the
    company is registered; is anything else needed first?
12. **Women-only trips.** Question 9 of the brief. The terms and rules
    describe a self-declaration with no proof; is that wording right?
13. **Paying the driver in person.** Until payments in the app start,
    passengers may pay the driver the price the app shows, in cash or by
    bank transfer, when they get in (terms 6.9, 7.6 and 8.2;
    [ADR 0038](../../decisions/0038-pay-the-driver-in-person-until-card-payments.md)).
    PuffinRide takes no money and no fee, and has no record of what was
    paid. Does that change the Taxi Act answer (brief, questions 1 and 3)?
    Is the wording that we cannot refund or give a receipt for that money
    enough, and does a late canceller owing nothing need saying anywhere
    else?
