# 0036. Store photos in Hetzner Object Storage in Nuremberg

- **Status:** Accepted (2026-11-22, by Martin: Helsinki was not available
  when he made the bucket)
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Related:** supersedes the location in
  [ADR 0022](0022-photo-storage-on-hetzner.md);
  [ADR 0007](0007-eea-hosting-and-data-residency.md),
  [ADR 0033](0033-profile-photos-made-in-the-app-and-checked-by-the-api.md),
  [staging runbook](../operations/staging.md#turn-on-photos)

## Context

ADR 0022 chose Hetzner Object Storage in Helsinki for meeting point and
profile photos. When Martin made the staging bucket, the Hetzner Console did
not offer Helsinki, so the bucket was made in Nuremberg (`nbg1`). The API
already works with any Hetzner location: it reads the location from the
endpoint it is given (`PHOTO_BUCKET_ENDPOINT`), so only settings and documents
name the place.

Photos are personal data and must stay in the EEA (ADR 0007). The privacy
policy draft and the privacy register name where they are kept.

## Options considered

1. **Nuremberg (`nbg1`).** Available now, and the bucket already exists. In
   Germany, with the same company, price and data processing agreement. Close
   to Render in Frankfurt, so uploads and links travel a short way. A little
   further from Iceland than Helsinki, which does not matter for photos of
   this size.
2. **Wait for Helsinki.** Keeps ADR 0022 as written, but photos stay off on
   staging until Hetzner offers it, with no date.
3. **Falkenstein (`fsn1`).** Also in Germany. No better than Nuremberg, and
   the bucket would have to be made again.

## Decision

We will keep photos in **Hetzner Object Storage in Nuremberg** (`nbg1`), in a
private bucket, as ADR 0022 and ADR 0033 describe in every other respect.
Staging sets `PHOTO_BUCKET_ENDPOINT` to `https://nbg1.your-objectstorage.com`.

## Consequences

- Photos stay in the EU, in Germany, with a German company. Nothing changes
  for members except the place named in the privacy policy.
- The privacy policy draft, the privacy register, the integrations list and
  the runbook say Nuremberg, Germany.
- Moving to another Hetzner location later means a new bucket, copying the
  files, and changing one setting. The keys stay random and the database
  does not change.

## Revisit when

Production gets its own bucket (pick the location again then), Hetzner
offers object storage closer to Iceland, or the hosting moves away from
Frankfurt.
