# 0053. A private limited company (ehf.), not a nonprofit

- **Status:** Accepted (2026-11-27, Martin on a decision card: "Ehf. early in
  2027")
- **Date:** 2026-11-27
- **Deciders:** Martin
- **Related:** open question Q32 (answered A58),
  [ways to make money](../strategy/2026-11-27-ways-to-make-money.md#3-would-a-nonprofit-work),
  [legal and regulatory](../compliance/legal-and-regulatory.md#3-company-and-operations),
  [ADR 0013](0013-in-app-payments-only.md) and
  [ADR 0014](0014-passenger-service-fee-from-launch.md) (payments and the
  fee need a company), [ADR 0051](0051-store-apps-in-martins-name-until-the-company.md)
  (store accounts move to the company)

## Context

Martin runs PuffinRide as an individual. Card payments, the store accounts,
the Innovation Fund (Nýsköpunarsjóður) contract and the R&D tax credit all
need a legal entity. The question was whether that entity should be a
company or a nonprofit, since PuffinRide is a cost-sharing service with a
public-good story (fewer cars, rural mobility). Facts checked 2026-11-27:

- An ehf. needs one founder, 500 000 kr share capital and a 140 500 kr
  registration fee, and pays 20% income tax (Income Tax Act 90/2003,
  article 71).
- A public benefit association (Act 110/2021) or a self-owning institution
  in business (ses., Act 33/1999) may run a business and pay its managing
  director a normal salary, but it pays 37.6% on taxable profit. It is
  exempt only if it runs no business, or if its profit goes only to the
  closed public-benefit list in article 4 of the Income Tax Act, which
  does not include transport, the environment or regional development.
- Tax-deductible gifts need a place on Skatturinn's public benefit register,
  which requires a volunteer-based organisation with no real business.
- The R&D tax credit (Act 152/2009, 35% of approved costs for small
  companies) is only for hf., ehf. and partnerships.
- A nonprofit needs at least three founders and a board of three or more,
  which sets the director's pay and can replace them. Nobody owns it.

## Options considered

1. **Ehf.** Martin owns it, 20% tax, R&D tax credit, all grants that fit,
   can bring in investors later. No tax-deductible gifts; the cost-sharing
   purpose is a promise, not a legal form.
2. **Nonprofit (public benefit association or ses.).** Built-in trust story,
   a few more public and civil-society grants. 37.6% tax on any surplus, no
   R&D credit, no ownership, board control, more administration, and the
   expected tax benefits do not apply to carpooling.
3. **Stay a sole trader.** Nothing to set up. No R&D credit, no Innovation
   Fund contract, personal liability, and card payments and the store
   accounts still wait for a company.

## Decision

We will run PuffinRide through a private limited company (ehf.) owned by
Martin, registered early in 2027. Its statutes state that its purpose is
cost-sharing travel and that it takes no cut from what drivers receive, and
it publishes a short yearly summary of rides and money.

## Consequences

- The company can sign the Innovation Fund contract, claim the R&D tax
  credit for 2027 costs (apply to Rannís by 1 October 2027), take over the
  store accounts (ADR 0051) and become the payment provider's merchant
  (milestone 15).
- The company becomes the data controller and the provider named in the
  terms, the privacy policy and the About page: new versions of the legal
  texts and the kennitala on About (A57) follow registration.
- Donations to PuffinRide are not tax-deductible, and nonprofit-only grants
  are out of reach.
- Follow-up: register the company and open a business bank account
  (roadmap, legal and company); an accountant on the fee's VAT rate and the
  R&D credit.

## Revisit when

- Martin decides PuffinRide should stay free for good and live on grants,
  sponsors and volunteers.
- A large grant or partner requires a nonprofit; then consider a separate
  public benefit association next to the ehf.
- The Income Tax Act's public-benefit list grows to include transport or the
  environment.
