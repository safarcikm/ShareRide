# 0007. EEA hosting and data residency

- **Status:** Proposed
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [privacy and GDPR](../compliance/privacy-gdpr.md),
  [ADR 0005](0005-postgresql-postgis.md)

## Context

ShareRide processes personal data: names, phone numbers, photos, travel
patterns, messages and later payment data. Iceland applies the GDPR through
the EEA Agreement and Act No. 90/2018. Keeping data in the EEA removes the
need for international transfer mechanisms and is simpler to explain to users.
The operator is one person, so hosting must need little maintenance.

## Options considered

1. **Managed container platform plus managed PostgreSQL, both in an EEA
   region.** Little operations work, portable (standard containers), moderate
   cost.
2. **A major cloud (AWS, Google Cloud, Azure) in an EEA region.** Most
   services and control, more configuration and cost management.
3. **Hosting in Iceland.** Lowest latency to users and a local story, but
   fewer managed options for PostgreSQL with PostGIS; worth re-checking.
4. **Own virtual servers.** Cheapest per month, most work and risk for one
   operator.

## Decision

- All personal data is **stored and processed in the EEA**. Every provider
  that touches personal data must offer an EEA region (or an adequacy
  decision applies) and sign a data processing agreement.
- The API and worker run as **standard containers** on a managed platform in
  an EEA region (Nordic or Western Europe preferred for latency). The provider
  is chosen at scaffolding against this checklist: EEA region, managed
  PostgreSQL with PostGIS, point-in-time recovery, private networking, secrets
  management, preview or staging environments, predictable pricing.
- Infrastructure is described in code (`infra/`) so it can be recreated with
  another provider.
- Staging and production are separate projects with separate data and
  credentials.

## Consequences

- Clear, simple privacy story for users and regulators.
- Some convenient global services are excluded or must be configured for
  their EU region (error tracking, analytics, email).
- Latency from Iceland to Nordic or Western European data centres is low
  enough for this app.

## Revisit when

A suitable Icelandic managed platform appears, costs change significantly, or
the legal basis for EEA transfers changes.
