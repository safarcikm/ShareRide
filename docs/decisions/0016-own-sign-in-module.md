# 0016. Our own sign-in module instead of an auth library

- **Status:** Accepted (2026-11-13, by Martin on a decision card)
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [ADR 0010](0010-authentication-and-identity.md) (this ADR
  replaces only its "Implementation" choice),
  [spec 1](../specs/2026-11-13-sign-in-and-profile.md),
  [security](../engineering/security.md), open question Q14 (answered as A37),
  [milestone 1 plan](../plans/2026-11-13-milestone-1-phone-sign-in.md)

## Context

ADR 0010 chose phone sign-in with a one-time code and named Better Auth, an
open-source library running inside our API, as the default candidate, "confirmed
at scaffolding". Spec 1 then fixed the exact behaviour: 6-digit codes valid 10
minutes with 5 attempts, a 30-second resend timer, limits per number, per IP
and per country prefix, identical answers for known and unknown numbers, no
email required, short-lived access tokens and refresh tokens that rotate on
every use, where reusing an old refresh token signs out that device.

Checked against Better Auth 1.7 (the current release on 2026-11-13):

- A phone-only sign-up needs a made-up email address for every user
  (`getTempEmail`), because the library's user table expects one.
- Sessions are server-side session tokens with a sliding expiry. There are no
  rotating refresh tokens and no reuse detection, so spec 1, section 3.7,
  would have to change.
- There is no resend timer and no per-country-prefix limit; we would add both
  around the library.

Sign-in is the most security-sensitive code in the app, so the choice is
between fitting our rules around a library and owning a small amount of code.

## Options considered

1. **Better Auth, adapting the spec.** Less code to write now; a widely used
   library with plugins for Apple, Google and passkeys. Costs: a fake email
   column on every user, spec 1 changed to revocable server sessions, our own
   code for the resend timer and prefix limits anyway, and auth behaviour that
   moves when the library's major versions do.
2. **Our own sign-in module, built on standard primitives.** Implements spec 1
   exactly: users without email, codes and tokens stored only as hashes,
   rotation with reuse detection, every rule unit-tested. Uses Node's built-in
   crypto for random tokens and hashing, and a small vetted library for Apple
   and Google token checks later (for example `jose`). Costs: roughly a
   thousand lines of code and tests that we maintain and must get right.
3. **A managed identity provider** (Clerk, Auth0, Supabase Auth). Already
   rejected in ADR 0010: per-user pricing and user data in another system.

## Decision

We will build sign-in as our own `auth` module in the API (option 2), with the
rules as pure functions in `packages/domain`, instead of using an auth library.

- Codes are stored as an HMAC-SHA-256 hash with a server secret and compared
  in constant time.
- Access and refresh tokens are random 256-bit values stored only as SHA-256
  hashes. Access tokens live 15 minutes. Refresh tokens rotate on every use
  and expire after 60 days without use.
- Reusing a rotated refresh token ends that device's session. The one
  exception is a retry of the immediately previous token within 30 seconds,
  which rotates again instead, so a reply lost on a weak mobile connection
  does not sign the person out.
- On the web the refresh token is an HTTP-only cookie and the access token is
  kept in memory. On iOS and Android it is kept in the device's secure storage.
- Apple and Google sign-in, and passkeys later, verify provider tokens with a
  small, widely used library; we never write cryptography ourselves.

Everything else in ADR 0010 stands: phone first, Apple and Google as
alternatives, verification levels and no kennitala.

## Consequences

- Spec 1 is implemented as written, and the data model has no placeholder
  emails.
- Opaque tokens can be revoked at once, and there are no signing keys to
  manage or rotate.
- We own every line: each rule gets a test, every sign-in change gets a
  security review, and the external penetration test before the beta covers
  this module.
- Apple and Google sign-in (milestone 2) and passkeys need their own small
  pieces of work instead of a plugin switch.
- ADR 0010's status line notes that its implementation choice is replaced by
  this ADR.

## Revisit when

A security review or the penetration test finds a design weakness, passkeys
become the main sign-in method, or maintaining the module takes more time than
a library upgrade would.
