# 0044. The console password on production too

- **Status:** Accepted (2026-11-22, Martin in the project thread: "lets just
  use the passwod")
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Supersedes:** [ADR 0041](0041-console-password-for-now.md), whose
  refusal on production it lifts; the rest of 0041 stands as written there
- **Related:** [ADR 0028](0028-operator-console-web-app-and-passkeys.md),
  [ADR 0040](0040-console-recovery-by-text-code.md),
  [ADR 0042](0042-production-on-render-released-with-a-button.md),
  [security](../engineering/security.md#operator-console),
  [production runbook](../operations/production.md#set-it-up-once)

## Context

ADR 0041 let the operator sign in to the console with their phone number and
a password set in the API's environment (`ADMIN_PASSWORD`), as a stopgap
while passkeys failed for Martin on staging. It made the API refuse to start
with that password on production, so production would sign in with passkeys
only.

Production went live on `puffinride.is` on 2026-11-22 (ADR 0042). Martin is
its only operator. On his computer and his phone the browser offered him
only a security key or a phone's QR code, which he cannot use, so he could
not get in. The text-code recovery of ADR 0040 is not live yet. He chose the
password for production too.

## Options considered

1. **Allow the same password on production.** One line of code less, the
   same limits and audit as on staging, and Martin is in once he sets it in
   Render. Cost: production's console, which shows members' personal data,
   is guarded by one shared secret while it is set, and a password can be
   phished or leaked.
2. **Keep production passkeys only** and walk Martin through saving one
   (the operator command's link, on a device with a passkey provider).
   Stronger, but he stays locked out of the console meanwhile, and the
   launch needs the console (pay in person, meeting points).
3. **A second factor with the password**, such as a text code. Safer than a
   password alone, but new code and tests; it would delay the launch.

## Decision

We will let the API start with `ADMIN_PASSWORD` on production as on staging
(option 1). Everything else in ADR 0041 stays: 12 characters or more, set in
the Render dashboard only (never in the blueprint or the repository),
compared in constant time, the same per-address and overall limits, the same
session rules, and `operator.signed_in` with `{ "method": "password" }` in
the audit log for every sign-in.

## Consequences

- Martin can use the production console as soon as he sets the password in
  Render, from any browser.
- Anyone who learns the password and an operator's number can sign in to
  production's console. The password should be long and random, kept in a
  password manager and used nowhere else, staging's included.
- A session started with the password can add or remove passkeys for 5
  minutes, so the Passkeys page and the audit log are checked when it is
  turned off.
- Follow-up: once a passkey works for Martin, or ADR 0040's recovery is
  live on production, delete `ADMIN_PASSWORD` in Render.

## Revisit when

A passkey works for Martin on production, a second person gets the operator
role, or someone signs in with the password who should not have.
