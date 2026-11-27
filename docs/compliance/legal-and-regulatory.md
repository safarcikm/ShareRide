# Legal and regulatory

**Owner:** Martin · **Last reviewed:** 2026-11-13

> This is a map of the legal questions, written to brief a lawyer. It is not
> legal advice. Items marked **verify** need confirmation by an Icelandic
> lawyer or accountant before we rely on them.

## 1. Ride-sharing versus taxi service (highest priority)

**The question:** may private drivers accept contributions from passengers
through PuffinRide without a taxi licence?

What we know:

- The **Taxi Act No. 120/2022** (lög um leigubifreiðaakstur) covers taxi
  service, defined as a passenger car being rented out with a driver *for a set
  fee* to carry passengers and their luggage. Taxi service requires a licence.
- The Act defines a **taxi dispatch station** (leigubifreiðastöð) as an entity
  that mediates taxi services commercially. If drivers on PuffinRide were seen
  as providing taxi service, the platform could be seen as a dispatch station.
- The Act does **not** contain an explicit exemption for carpooling or cost
  sharing. Licensed passenger transport is governed separately by the **Act on
  passenger and freight transport by land No. 28/2017**, whose scope we still
  need to check (**verify**).

How the product is designed to stay on the cost-sharing side:

- Drivers publish trips they are making anyway, with a date and time; no
  on-demand rides.
- Prices are capped so a full car covers no more than the cost of the trip
  ([rule P3](../product/pricing-and-seats.md#rule-p3-price-limits-cost-sharing-cap)),
  and a whole trip never brings the driver more, counting what passengers
  have already paid ([spec 17](../specs/2026-11-17-trip-earnings-limit.md)).
- Pickups and drop-offs only at published meeting points on the route; no
  door-to-door service.
- Drivers cannot use PuffinRide as a business: limits on trips per day are an
  option if the lawyer recommends them.
- Terms of service state the cost-sharing nature and forbid commercial use.

Actions:

- [ ] Written legal opinion on the model (Phase 1)
- [ ] Informal conversation with Samgöngustofa (Icelandic Transport Authority)
- [ ] Adjust the price cap formula and terms to the opinion

## 2. Insurance

- Motor vehicles in Iceland must carry compulsory liability insurance, which
  normally covers injury to passengers (Act on motor vehicle insurance,
  **verify** number and scope).
- Ask insurers whether accepting cost contributions through a platform
  affects cover, and whether a platform-level policy is available or needed.
- Terms must make clear that the driver's own insurance applies, that
  PuffinRide is not the carrier, and that the driver is responsible for being
  allowed to use the car, including rental or borrowed cars (decided
  2026-11-13, [spec 3](../specs/2026-11-13-post-a-trip.md#32-cars)).

## 3. Company and operations

- Choose the company form, most likely a private limited company (ehf.),
  registered with the Register of Enterprises at Skatturinn: at least
  500 000 kr share capital, paid in at registration, and a 140 500 kr fee
  (checked 2026-11-27). The nonprofit forms and why they fit less well are
  in [ways to make money](../strategy/2026-11-27-ways-to-make-money.md#3-would-a-nonprofit-work)
  (open question Q32).
- The company is the **data controller**, the contracting party in the terms,
  the publisher in the app stores and, later, the payment provider's merchant.
  It should exist before the beta.
- Business bank account, accounting, and VAT registration when turnover
  requires it.
- Trademark search and registration with the Icelandic Intellectual Property
  Office (Hugverkastofan); domain names (.is through ISNIC, .com).

## 4. Tax

- **Drivers:** whether cost contributions are taxable income when they do not
  exceed the cost of the trip (**verify** with Skatturinn's guidance or an
  accountant). Explain the answer in the help centre.
- **Platform:** VAT on any passenger service fee (Iceland's
  standard rate applies unless an exemption fits, **verify**), and income tax
  on profits. Passenger transport that is not public transport carries the
  11% rate, and so does a travel agent's help in selling it; whether the fee
  counts as that or as an ordinary 24% service is for the accountant.
  Registration for VAT is needed once taxable sales pass 2 000 000 kr in 12
  months ([ways to make money](../strategy/2026-11-27-ways-to-make-money.md#21-passenger-service-fee-adr-0014)).
- Receipts for passengers and annual statements for drivers, since payments
  run through the app from the beta.

## 5. Payments

- Payments go through the app
  ([ADR 0013](../decisions/0013-in-app-payments-only.md)), so the company,
  the provider contract and this legal work come before them. Until then,
  passengers pay the driver in person, in cash or by bank transfer, the
  price the app shows
  ([ADR 0038](../decisions/0038-pay-the-driver-in-person-until-card-payments.md),
  rule M6): PuffinRide takes no money and no fee, so no payment licence
  question arises for that time, but it has no record of what was paid.

- Holding passengers' money and paying it to drivers may be a regulated
  payment service under the Icelandic payment services law implementing the
  EU payment services directive (**verify** act and exemptions, such as the
  commercial agent exclusion). The supervisor is the Central Bank of Iceland
  (Seðlabanki Íslands).
- The simplest compliant structure is usually a licensed provider's
  marketplace product that holds funds and verifies drivers' identity.
- Refunds, chargebacks and the cancellation rules must be stated in the terms
  ([pricing and seats](../product/pricing-and-seats.md#payment-and-refunds)).
- Accounting records must be kept for the statutory period (**verify**, likely
  seven years).

## 6. Consumer protection and terms

- Terms of service, privacy policy and community rules in Icelandic and
  English, accepted at sign-up, versioned, with acceptance recorded. First
  English [drafts](legal-texts/README.md) for the lawyer: 2026-11-16.
- Clear pre-booking information: price, cancellation rules, who the driver is,
  and that PuffinRide is an intermediary.
- Distance-selling and consumer rules for payments, refunds and any service
  fee; the Consumer Agency (Neytendastofa) is the regulator.
- Marketing messages (email, SMS, push) only with opt-in consent under the
  electronic communications rules (**verify** current act).

## 7. Platform regulation

- The EU **Digital Services Act** sets duties for online platforms: notice and
  action for illegal content, reasons for moderation decisions, a point of
  contact, transparency about recommender systems. Check whether and when it
  applies in Iceland through the EEA Agreement (**verify**); build these
  features regardless, because they are good practice for a safety-sensitive
  marketplace.
- **Accessibility:** the European Accessibility Act covers some e-commerce and
  passenger transport services in the EU; check its EEA status (**verify**).
  We target WCAG 2.2 AA anyway.

## 8. App store requirements

- In-app account deletion (Apple and Google).
- Privacy labels (Apple) and data safety form (Google) that match the record
  of processing activities.
- Sign in with Apple, because we offer Google sign-in.
- Content moderation and reporting for user-generated content (profiles,
  reviews, chat).

## 9. Questions for the lawyer (Phase 1 brief)

1. Does a cost-capped ride-sharing model as described fall outside the Taxi Act
   and Act No. 28/2017? What conditions make it safe?
2. What price cap, if any, should we use, and what evidence of cost? The
   cap is checked per stretch between stops and rounded to the nearest
   100 kr, so on a stretch of a few kilometres a full car can earn slightly
   more than its cost, such as 8 seats × 100 kr on 4 km costing 600 kr
   (open questions, A39). Is that acceptable, or must the cap hold for
   every stretch? Should the cap hold for the whole trip, counting money a
   driver keeps after a no-show or late cancellation
   (the trip limit in [spec 17](../specs/2026-11-17-trip-earnings-limit.md), accepted 2026-11-17)? Does
   the passenger service fee count towards the cost of the ride?
3. Is PuffinRide at risk of being a taxi dispatch station under the Taxi Act?
4. What must the terms of service say about liability, insurance and the
   intermediary role?
5. Which payment structure avoids needing our own payment licence?
   Does taking payments in the app change the answer to question 1? And
   until then, does passengers paying the driver in person, in cash or by
   bank transfer, the capped price the app shows, with no fee to PuffinRide
   ([ADR 0038](../decisions/0038-pay-the-driver-in-person-until-card-payments.md)),
   change the answers to questions 1 and 3?
6. What do drivers need to know about tax on contributions?
7. Which company form and set-up do you recommend for a solo operator?
8. Do the Digital Services Act and the European Accessibility Act apply in
   Iceland today?
9. Are women-only trips ([spec 14](../specs/2026-11-13-women-only-trips.md))
   allowed under article 17 of the Act on Equal Status and Equal Rights
   Irrespective of Gender (No. 150/2020), as a difference in treatment
   justified by safety? Must people registered as neutral be included, and
   do we need to offer men-only trips too?
10. If PuffinRide earns from employers, regions, events or sponsors instead
    of a fee on each ride, does that change the answers to questions 1 and
    3? Would a nonprofit form change them
    ([ways to make money](../strategy/2026-11-27-ways-to-make-money.md#35-does-a-nonprofit-help-with-the-taxi-law))?
