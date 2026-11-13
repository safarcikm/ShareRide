# 0022. Store photos in Hetzner Object Storage in Helsinki

- **Status:** Accepted (2026-11-13, by Martin, with the milestone 2 plan)
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [ADR 0007](0007-eea-hosting-and-data-residency.md),
  [spec 1](../specs/2026-11-13-sign-in-and-profile.md),
  [milestone 2 plan](../plans/2026-11-13-milestone-2-hosted-and-connected.md)

## Context

Profile photos (spec 1) and later meeting point photos (spec 2) need object
storage in the EEA. The hosting provider (ADR 0018) has no object storage.
Photos are personal data: they are stored without metadata and must be
deleted with the account.

## Options considered

1. **Hetzner Object Storage, Helsinki.** A German company, S3-compatible,
   about €5 a month including 1 TB of storage and traffic, in the EU region
   closest to Iceland.
2. **Scaleway Object Storage, Paris.** A French company, S3-compatible,
   priced per use.
3. **Cloudflare R2 with EU jurisdiction.** No traffic fees and a free tier,
   but a United States company.

## Decision

We will store photos in **Hetzner Object Storage in Helsinki**, in a private
bucket, behind a storage port. The API re-encodes each photo, stores it
under a random key and hands out signed links that expire after an hour.

## Consequences

- Photos stay in the EU with a European company.
- A second provider account and data processing agreement next to Render.
- The S3 interface keeps the provider replaceable by configuration.
- Traffic from Helsinki to the app crosses the internet, not Render's private
  network; fine at our size.

## Revisit when

Storage needs a CDN for speed, prices change, or the hosting provider offers
object storage in the same region.
