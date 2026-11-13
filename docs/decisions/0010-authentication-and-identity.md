# 0010. Phone-first authentication and layered identity verification

- **Status:** Proposed
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [security](../engineering/security.md),
  [privacy and GDPR](../compliance/privacy-gdpr.md), open question Q8

## Context

People share cars with strangers, so trust matters. At the same time the app
must work for visitors without an Icelandic electronic ID or kennitala, and
sign-up must be quick. Drivers and passengers need to reach each other, so a
working phone number is essential anyway.

## Options considered

Sign-in

1. **Email and password.** Familiar; weak passwords, resets, no proof of a
   reachable phone.
2. **Phone number with one-time code**, plus Sign in with Apple and Google.
   Fast, proves a reachable phone; SMS costs and SMS fraud need controls.
3. **Icelandic electronic ID (Auðkenni) only.** Strong identity, but excludes
   visitors and many foreign residents.

Auth implementation

1. **Managed identity provider** (Supabase Auth, Clerk, Auth0 and similar).
   Less code; per-user pricing at scale; user data in another system; region
   must be checked.
2. **Open-source auth library in our API** (for example Better Auth) storing
   users and sessions in our PostgreSQL. No per-user fees, data stays in our
   database, plugins for phone codes, passkeys, social sign-in and generic
   OpenID Connect.

## Decision

- **Sign-in:** phone number with a one-time code as the primary method; Sign
  in with Apple and Google as alternatives (Apple requires Sign in with Apple
  when other social sign-in is offered). Passkeys when the library and
  platforms make it smooth.
- **Implementation:** an **open-source auth library inside our API**, with
  users and sessions in our database. Better Auth is the default candidate,
  confirmed at scaffolding.
- **Sessions:** short-lived access tokens and rotating refresh tokens, stored
  in the device's secure storage; cookie sessions on the web.
- **Verification levels**, shown as badges:
  1. Phone verified (required for everyone)
  2. Email verified (optional)
  3. Driving licence declared (required to publish trips; a declaration only,
     not shown as a badge, see [spec 3](../specs/2026-11-13-post-a-trip.md))
  4. Auðkenni verified (optional, Phase 4; via OpenID Connect directly or a
     broker such as Signicat)
  5. Document verified for visitors (Phase 5, only if the beta shows a need)
- **Kennitala** is never required. If Auðkenni verification returns one, we
  store only the fact of verification unless a later feature needs the number,
  with a documented purpose.

## Consequences

- Quick sign-up for everyone, including visitors.
- We own sign-in security: rate limits, code expiry, SMS fraud protection,
  account recovery. These are covered in the security guide and tested.
- Strong identity is available to residents who want it, without excluding
  anyone else.

## Revisit when

SMS costs or fraud become significant, passkeys become universal, or a
regulator requires stronger identity checks for drivers.
